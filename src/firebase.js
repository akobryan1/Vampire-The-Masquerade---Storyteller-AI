import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, runTransaction, setDoc } from 'firebase/firestore';
import {
  DEFAULT_BATTERY_CAP_UNITS,
  DEFAULT_FREE_MODEL_DAILY_LIMIT,
  DEFAULT_STARTING_BATTERY_UNITS,
  getModelCostUnits,
} from './model-catalog.js';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const DEFAULT_BANK_SETTINGS = {
  balanceUnits: DEFAULT_STARTING_BATTERY_UNITS,
  capUnits: DEFAULT_BATTERY_CAP_UNITS,
  accrualIntervalMinutes: 720,
  unitsPerInterval: 80,
  freeUseDailyLimit: DEFAULT_FREE_MODEL_DAILY_LIMIT,
};

const REQUIRED_CONFIG_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let persistencePromise = null;

export function isFirebaseConfigured() {
  return REQUIRED_CONFIG_KEYS.every((key) => Boolean(firebaseConfig[key]));
}

export async function startFirebaseAuthObserver(onSnapshot) {
  if (!isFirebaseConfigured()) {
    onSnapshot({
      configured: false,
      ready: true,
      user: null,
      bank: null,
      error: '',
    });
    return () => {};
  }

  const { auth } = await ensureFirebase();
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onSnapshot({
        configured: true,
        ready: true,
        user: null,
        bank: null,
        error: '',
      });
      return;
    }

    try {
      const bank = await ensureUserBank(user);
      onSnapshot({
        configured: true,
        ready: true,
        user: serializeUser(user),
        bank,
        error: '',
      });
    } catch (error) {
      onSnapshot({
        configured: true,
        ready: true,
        user: serializeUser(user),
        bank: null,
        error: error.message,
      });
    }
  });
}

export async function signInWithGoogle() {
  const { auth } = await ensureFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return serializeUser(result.user);
}

export async function signOutCloudUser() {
  const { auth } = await ensureFirebase();
  await signOut(auth);
}

export async function refreshUserBank(user) {
  return ensureUserBank(user);
}

export async function spendStoryCredit(user, chronicleId = '', model = '', customModelCostUnits = null) {
  const { db } = await ensureFirebase();
  const uid = typeof user === 'string' ? user : user?.uid;
  if (!uid) {
    throw new Error('Sign in with Google before spending Storyteller credits.');
  }

  const bankRef = doc(db, 'users', uid, 'bank', 'main');
  const nowMs = Date.now();
  const spendUnits = getModelCostUnits(model, customModelCostUnits);

  return runTransaction(db, async (transaction) => {
    const bankSnapshot = await transaction.get(bankRef);
    if (!bankSnapshot.exists()) {
      throw new Error('No cloud credit bank was found for this account yet.');
    }

    const accruedBank = accrueBank(bankSnapshot.data(), nowMs);
    if (spendUnits <= 0) {
      if (accruedBank.freeUseRemaining <= 0) {
        throw new Error(getFreeModelLimitMessage(accruedBank));
      }

      const nextBank = {
        ...accruedBank,
        freeUseCount: accruedBank.freeUseCount + 1,
        lastActivityAtMs: nowMs,
        updatedAtMs: nowMs,
        lastChronicleId: chronicleId || accruedBank.lastChronicleId || '',
      };

      transaction.set(bankRef, nextBank, { merge: true });
      return normalizeBank(nextBank, nowMs);
    }

    if (accruedBank.balanceUnits < spendUnits) {
      throw new Error(getInsufficientBatteryMessage(accruedBank, spendUnits));
    }

    const nextBank = {
      ...accruedBank,
      balanceUnits: accruedBank.balanceUnits - spendUnits,
      lastActivityAtMs: nowMs,
      updatedAtMs: nowMs,
      lastChronicleId: chronicleId || accruedBank.lastChronicleId || '',
    };

    transaction.set(bankRef, nextBank, { merge: true });
    return normalizeBank(nextBank, nowMs);
  });
}

function getInsufficientBatteryMessage(bank, spendUnits) {
  if (bank.balanceUnits >= spendUnits) {
    return '';
  }

  if (!bank.nextAccrualAtMs) {
    return 'No Storyteller battery is available right now.';
  }

  return `Not enough Storyteller battery is available right now. Next recharge completes at ${new Date(bank.nextAccrualAtMs).toLocaleString()}.`;
}

function getFreeModelLimitMessage(bank) {
  if (bank.freeUseRemaining > 0) {
    return '';
  }

  return `The free-model daily limit has been reached. Free usage resets at ${new Date(bank.nextFreeUseResetAtMs).toLocaleString()}.`;
}

async function ensureFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured yet. Add the VITE_FIREBASE_* environment variables first.');
  }

  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp);
    firebaseDb = getFirestore(firebaseApp);
  }

  if (!persistencePromise) {
    persistencePromise = setPersistence(firebaseAuth, browserLocalPersistence).catch(() => {});
  }
  await persistencePromise;

  return {
    app: firebaseApp,
    auth: firebaseAuth,
    db: firebaseDb,
  };
}

async function ensureUserBank(user) {
  const { db } = await ensureFirebase();
  const uid = typeof user === 'string' ? user : user?.uid;
  if (!uid) {
    throw new Error('No authenticated Firebase user is available.');
  }

  const userRef = doc(db, 'users', uid);
  const bankRef = doc(db, 'users', uid, 'bank', 'main');
  const nowMs = Date.now();

  return runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const bankSnapshot = await transaction.get(bankRef);

    if (!userSnapshot.exists()) {
      transaction.set(userRef, {
        email: typeof user === 'string' ? '' : user.email || '',
        displayName: typeof user === 'string' ? '' : user.displayName || '',
        provider: typeof user === 'string' ? 'unknown' : user.providerData?.[0]?.providerId || 'google.com',
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      });
    } else {
      transaction.set(
        userRef,
        {
          email: typeof user === 'string' ? userSnapshot.data().email || '' : user.email || userSnapshot.data().email || '',
          displayName: typeof user === 'string' ? userSnapshot.data().displayName || '' : user.displayName || userSnapshot.data().displayName || '',
          provider: typeof user === 'string' ? userSnapshot.data().provider || 'unknown' : user.providerData?.[0]?.providerId || userSnapshot.data().provider || 'google.com',
          updatedAtMs: nowMs,
        },
        { merge: true },
      );
    }

    if (!bankSnapshot.exists()) {
      const initialBank = {
        ...DEFAULT_BANK_SETTINGS,
        lastActivityAtMs: nowMs,
        lastAccrualAtMs: nowMs,
        updatedAtMs: nowMs,
        lastChronicleId: '',
      };
      transaction.set(bankRef, initialBank);
      return normalizeBank(initialBank, nowMs);
    }

    const nextBank = accrueBank(bankSnapshot.data(), nowMs);
    if (didBankChange(bankSnapshot.data(), nextBank)) {
      transaction.set(bankRef, nextBank, { merge: true });
    }
    return normalizeBank(nextBank, nowMs);
  });
}

function didBankChange(previous, next) {
  return (
    Number(previous.balanceUnits) !== Number(next.balanceUnits) ||
    Number(previous.lastAccrualAtMs) !== Number(next.lastAccrualAtMs) ||
    Number(previous.updatedAtMs) !== Number(next.updatedAtMs) ||
    Number(previous.lastActivityAtMs) !== Number(next.lastActivityAtMs) ||
    Number(previous.freeUseCount) !== Number(next.freeUseCount) ||
    Number(previous.freeUseWindowStartedAtMs) !== Number(next.freeUseWindowStartedAtMs)
  );
}

function accrueBank(rawBank, nowMs) {
  const bank = normalizeBank(rawBank, nowMs);
  const accrualStartMs = Math.max(bank.lastAccrualAtMs, bank.lastActivityAtMs);
  const intervalMs = Math.max(1, bank.accrualIntervalMinutes) * 60 * 1000;
  const elapsedMs = Math.max(0, nowMs - accrualStartMs);
  const earnedIntervals = Math.floor(elapsedMs / intervalMs);

  if (earnedIntervals <= 0 || bank.balanceUnits >= bank.capUnits) {
    return {
      ...bank,
      updatedAtMs: nowMs,
    };
  }

  const earnedUnits = earnedIntervals * bank.unitsPerInterval;
  const nextBalance = Math.min(bank.capUnits, bank.balanceUnits + earnedUnits);

  return {
    ...bank,
    balanceUnits: nextBalance,
    lastAccrualAtMs: bank.lastAccrualAtMs + earnedIntervals * intervalMs,
    updatedAtMs: nowMs,
  };
}

function normalizeBank(rawBank, nowMs = Date.now()) {
  const capUnits = normalizeCapUnits(rawBank);
  const balanceUnits = normalizeBalanceUnits(rawBank, capUnits);
  const unitsPerInterval = Math.max(1, Number(rawBank?.unitsPerInterval) || DEFAULT_BANK_SETTINGS.unitsPerInterval);
  const accrualIntervalMinutes = Math.max(1, Number(rawBank?.accrualIntervalMinutes) || DEFAULT_BANK_SETTINGS.accrualIntervalMinutes);
  const freeUseDailyLimit = Math.max(1, Number(rawBank?.freeUseDailyLimit) || DEFAULT_BANK_SETTINGS.freeUseDailyLimit);
  const lastActivityAtMs = Math.max(0, Number(rawBank?.lastActivityAtMs) || nowMs);
  const lastAccrualAtMs = Math.max(0, Number(rawBank?.lastAccrualAtMs) || nowMs);
  const intervalMs = accrualIntervalMinutes * 60 * 1000;
  const accrualAnchorMs = Math.max(lastAccrualAtMs, lastActivityAtMs);
  const freeUseWindow = normalizeFreeUseWindow(rawBank, freeUseDailyLimit, nowMs);

  return {
    balanceUnits,
    capUnits,
    unitsPerInterval,
    accrualIntervalMinutes,
    freeUseDailyLimit,
    freeUseCount: freeUseWindow.freeUseCount,
    freeUseWindowStartedAtMs: freeUseWindow.freeUseWindowStartedAtMs,
    freeUseRemaining: freeUseWindow.freeUseRemaining,
    lastActivityAtMs,
    lastAccrualAtMs,
    updatedAtMs: Math.max(0, Number(rawBank?.updatedAtMs) || nowMs),
    lastChronicleId: rawBank?.lastChronicleId || '',
    nextAccrualAtMs: balanceUnits >= capUnits ? null : accrualAnchorMs + intervalMs,
    nextFreeUseResetAtMs: freeUseWindow.freeUseWindowStartedAtMs + 24 * 60 * 60 * 1000,
  };
}

function normalizeCapUnits(rawBank) {
  if (Number.isFinite(Number(rawBank?.capUnits))) {
    return Math.max(1, Math.round(Number(rawBank.capUnits)));
  }

  if (Number.isFinite(Number(rawBank?.cap))) {
    return DEFAULT_BANK_SETTINGS.capUnits;
  }

  return DEFAULT_BANK_SETTINGS.capUnits;
}

function normalizeBalanceUnits(rawBank, capUnits) {
  if (Number.isFinite(Number(rawBank?.balanceUnits))) {
    return Math.max(0, Math.min(capUnits, Math.round(Number(rawBank.balanceUnits))));
  }

  if (Number.isFinite(Number(rawBank?.balance))) {
    const legacyBalance = Math.max(0, Number(rawBank.balance));
    const legacyCap = Math.max(1, Number(rawBank?.cap) || 12);
    return Math.max(0, Math.min(capUnits, Math.round((legacyBalance / legacyCap) * capUnits)));
  }

  return DEFAULT_BANK_SETTINGS.balanceUnits;
}

function normalizeFreeUseWindow(rawBank, freeUseDailyLimit, nowMs) {
  const oneDayMs = 24 * 60 * 60 * 1000;
  let freeUseWindowStartedAtMs = Math.max(0, Number(rawBank?.freeUseWindowStartedAtMs) || nowMs);
  let freeUseCount = Math.max(0, Math.round(Number(rawBank?.freeUseCount) || 0));

  if (nowMs - freeUseWindowStartedAtMs >= oneDayMs) {
    freeUseWindowStartedAtMs = nowMs;
    freeUseCount = 0;
  }

  freeUseCount = Math.min(freeUseDailyLimit, freeUseCount);

  return {
    freeUseCount,
    freeUseWindowStartedAtMs,
    freeUseRemaining: Math.max(0, freeUseDailyLimit - freeUseCount),
  };
}

function serializeUser(user) {
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
  };
}