import schema from '../mechanics/character-sheet-schema.json';
import diceRules from '../mechanics/dice-rules.json';
import disciplinesData from '../mechanics/disciplines.json';
import backgroundsData from '../mechanics/backgrounds.json';
import specialtiesData from '../mechanics/specialties.json';
import natureDemeanorData from '../mechanics/nature-demeanor.json';
import clansData from '../mechanics/clans.json';
import meritsFlawsData from '../mechanics/merits-flaws.json';
import clanMeritsFlawsData from '../mechanics/clan-merits-flaws.json';
import pathsData from '../mechanics/paths-of-enlightenment.json';
import cities from '../settings/cities.json';
import guardrails from '../mechanics/guardrails.txt?raw';
import {
  isFirebaseConfigured,
  refreshUserBank,
  signInWithGoogle,
  signOutCloudUser,
  spendStoryCredit,
  startFirebaseAuthObserver,
} from './firebase.js';
import {
  CUSTOM_CHRONICLE_PACK,
  getChronicleHookSummaries,
  getChroniclePack,
  getDefaultHookIdsForCity,
} from './chronicle-packs.js';
import {
  DEFAULT_BATTERY_CAP_UNITS,
  DEFAULT_CUSTOM_MODEL_COST_UNITS,
  CUSTOM_MODEL_SENTINEL,
  clampBatteryUnits,
  formatBatteryUnits,
  formatModelUnitCost,
  getFallbackModelChain,
  getModelCostUnits,
  getStoryModelEntry,
  isKnownStoryModel,
  STORYTELLER_MODEL_OPTIONS,
} from './model-catalog.js';
import { formatNpcReferenceSheetsForPrompt, getNpcConversionWorkflow } from './npc-conversion.js';
import { buildSystemPrompt, sendChatCompletion } from './openrouter.js';
import {
  DEFAULT_MODEL,
  DIFFICULTY_LEVELS,
  ensureActiveChronicle,
  formatTimestamp,
  getDefaultCharacter,
  getDefaultChronicle,
  getCityById,
  loadState,
  rollDice,
  saveState,
  startCase,
  uid,
} from './vtm.js';

const ALWAYS_EDITABLE_FIELDS = ['name', 'age', 'sire', 'pronouns', 'ambition', 'desire'];
const DIFFICULTY_MAP = Object.fromEntries(DIFFICULTY_LEVELS.map((item) => [item.id, item]));
const ATTRIBUTE_FIELDS = schema.attributes.flatMap((group) => group.fields);
const ABILITY_FIELDS = schema.abilities.flatMap((group) => group.fields);
const DEBUG_PREFIX = '[VTM Debug]';
const RATE_LIMIT_BASE_COOLDOWN_MS = 30 * 1000;
const RATE_LIMIT_MAX_COOLDOWN_MS = 10 * 60 * 1000;
const ADDITIONAL_DISCIPLINE_MERIT_NAMES = new Set(['Additional Discipline', 'Additional Clan Discipline']);
const BACKGROUND_NAME_LOOKUP = new Map((backgroundsData ?? []).map((item) => [item.name.trim().toLowerCase(), item.name]));
const NPC_MUTABLE_FIELDS = ['summary', 'status', 'ambition', 'desire', 'notes', 'secrets'];
const TEMPORARY_WILLPOWER_RECOVERY = 1;
const TEMPORARY_RESOURCES_RECOVERY = 1;
const AGE_CATEGORY_OPTIONS = ['Fledgling', 'Neonate', 'Ancilla'];
const READY_CHARACTER_TEMPLATES = Object.freeze([
  {
    id: 'brujah-enforcer',
    label: 'Brujah Enforcer',
    pitch: 'Combat-forward and aggressive, built for intimidation, pursuit, and close violence.',
    clan: 'Brujah',
    name: 'Mara Voss',
    concept: 'Anarch street enforcer',
    nature: 'Rebel',
    demeanor: 'Bravo',
    sire: 'Lucien Vale',
    age: 12,
    ageCategory: 'Neonate',
    pronouns: 'she/her',
    ambition: 'Break the Prince\'s grip on the waterfront and carve out space for the local Anarchs.',
    desire: 'Make tonight\'s bully back down in front of witnesses.',
    physicalDescription: 'A hard-eyed brawler in a worn leather jacket, scarred knuckles, steel-toed boots, and a gaze that dares people to test her.',
    backstory: 'Mara was a dockworker organizer who learned that every promise from City Hall hid a baton behind it. When a labor action turned into a midnight bloodbath, Lucien Vale Embraced her instead of letting the sheriff bury her in the river. She now works the line where agitation, protection rackets, and Anarch politics overlap, and she meets courtly cruelty with open contempt.',
    attributes: {
      strength: 4,
      dexterity: 3,
      stamina: 4,
      charisma: 2,
      manipulation: 2,
      appearance: 2,
      perception: 3,
      intelligence: 2,
      wits: 3,
    },
    abilities: {
      alertness: 3,
      athletics: 3,
      brawl: 4,
      dodge: 3,
      intimidation: 4,
      leadership: 2,
      streetwise: 3,
      subterfuge: 1,
      drive: 1,
      firearms: 2,
      melee: 3,
      survival: 2,
      investigation: 1,
      politics: 1,
    },
    disciplines: [
      { name: 'Celerity', dots: 2 },
      { name: 'Potence', dots: 2 },
      { name: 'Presence', dots: 1 },
    ],
    backgrounds: [
      { name: 'Allies', dots: 2 },
      { name: 'Contacts', dots: 1 },
      { name: 'Resources', dots: 2 },
      { name: 'Retainers', dots: 1 },
      { name: 'Status', dots: 1 },
      { name: 'Generation', dots: 1 },
    ],
    merits: ['Bruiser', 'Iron Will'],
    flaws: ['Short Fuse', 'Enemy'],
    clanMerits: ['Fury\'s Focus'],
    clanFlaws: ['Obvious Predator'],
    specialties: [
      { ability: 'brawl', name: 'Grappling' },
      { ability: 'intimidation', name: 'Face-to-face threats' },
      { ability: 'melee', name: 'Batons' },
    ],
    equipment: [
      { name: 'Heavy flashlight', details: 'A metal torch weighted like a club.' },
      { name: 'Motorcycle leathers', details: 'Road armor disguised as style.' },
      { name: 'Burner phone', details: 'Rotated often for street contacts.' },
    ],
    items: [
      { name: 'Union ring', details: 'A reminder of the life she lost and the people she still claims.' },
      { name: 'Haven keys', details: 'Keys to a reinforced room above a closed machine shop.' },
    ],
    virtues: {
      conscience: 2,
      selfControl: 3,
      courage: 4,
    },
    humanity: 5,
    willpower: 6,
  },
  {
    id: 'ventrue-fixer',
    label: 'Ventrue Fixer',
    pitch: 'Social and political, built for court play, leverage, and controlled intimidation.',
    clan: 'Ventrue',
    name: 'Julian Mercer',
    concept: 'Corporate political fixer',
    nature: 'Autocrat',
    demeanor: 'Traditionalist',
    sire: 'Genevieve Harrow',
    age: 23,
    ageCategory: 'Ancilla',
    pronouns: 'he/him',
    ambition: 'Become indispensable to the city\'s court until no major boon exchange happens without his approval.',
    desire: 'Turn tonight\'s confrontation into a debt someone powerful owes him.',
    physicalDescription: 'An immaculate Ventrue in charcoal tailoring, pale gloves, a controlled smile, and the kind of posture that assumes the room already belongs to him.',
    backstory: 'Julian handled crises for a private equity syndicate before his sire decided that mortal boardrooms were a proper apprenticeship for undead power. He was Embraced into a Ventrue lineage that treats prestige as a weapon, and he now lives in the overlap between city contracts, Elysium etiquette, and quiet blackmail. He prefers to ruin enemies with a conversation they think they are winning.',
    attributes: {
      strength: 2,
      dexterity: 2,
      stamina: 2,
      charisma: 4,
      manipulation: 4,
      appearance: 3,
      perception: 3,
      intelligence: 3,
      wits: 3,
    },
    abilities: {
      empathy: 3,
      expression: 2,
      intimidation: 2,
      leadership: 4,
      streetwise: 1,
      subterfuge: 3,
      etiquette: 4,
      finance: 3,
      investigation: 2,
      law: 2,
      politics: 4,
      academics: 2,
      drive: 1,
      firearms: 1,
      melee: 1,
    },
    disciplines: [
      { name: 'Dominate', dots: 2 },
      { name: 'Presence', dots: 2 },
      { name: 'Fortitude', dots: 1 },
    ],
    backgrounds: [
      { name: 'Resources', dots: 4 },
      { name: 'Status', dots: 2 },
      { name: 'Contacts', dots: 2 },
      { name: 'Influence', dots: 2 },
      { name: 'Mentor', dots: 2 },
      { name: 'Generation', dots: 1 },
    ],
    merits: ['Elysium Regular', 'Prestigious Sire', 'Sanctity'],
    flaws: ['Dark Secret'],
    clanMerits: ['Connoisseur'],
    clanFlaws: ['Uncommon Vitae Preference'],
    specialties: [
      { ability: 'etiquette', name: 'Court protocol' },
      { ability: 'finance', name: 'Hostile takeovers' },
      { ability: 'subterfuge', name: 'Polite lies' },
    ],
    equipment: [
      { name: 'Tailored evening wear', details: 'Formal clothing suited to Elysium and closed-door negotiations.' },
      { name: 'Town car access', details: 'A hired driver on call through corporate channels.' },
      { name: 'Encrypted phone', details: 'Used for sensitive conversations and deniable instructions.' },
    ],
    items: [
      { name: 'Boon ledger', details: 'A private notebook encoded in innocuous shorthand.' },
      { name: 'Signet cufflinks', details: 'A gift from his sire and a quiet badge of status.' },
    ],
    virtues: {
      conscience: 3,
      selfControl: 4,
      courage: 3,
    },
    humanity: 7,
    willpower: 5,
  },
  {
    id: 'tremere-occultist',
    label: 'Tremere Occultist',
    pitch: 'Mental and occult, built for investigation, ritual work, and disciplined supernatural control.',
    clan: 'Tremere',
    name: 'Sabine Thorne',
    concept: 'Occult researcher and chantry analyst',
    nature: 'Scientist',
    demeanor: 'Pedagogue',
    sire: 'Magister Corvin Hale',
    age: 16,
    ageCategory: 'Neonate',
    pronouns: 'she/her',
    ambition: 'Uncover the occult architecture underneath the city before another chantry claims it first.',
    desire: 'Prove that tonight\'s anomaly fits a ritual pattern only she has recognized.',
    physicalDescription: 'A severe scholar in dark wool, silver rings etched with sigils, and a gaze that seems to catalogue every object before she speaks.',
    backstory: 'Sabine was a graduate researcher in comparative religion whose thesis work kept intersecting with places the Tremere preferred unexamined. Her sire recruited rather than silenced her, then bound her to a chantry culture built on paranoia, ritual obligation, and carefully rationed secrets. She approaches mysteries like dissections, but every answer she finds seems to demand a cost in blood, favors, or conscience.',
    attributes: {
      strength: 1,
      dexterity: 2,
      stamina: 2,
      charisma: 2,
      manipulation: 3,
      appearance: 2,
      perception: 4,
      intelligence: 4,
      wits: 3,
    },
    abilities: {
      academics: 3,
      computer: 2,
      empathy: 1,
      expression: 1,
      etiquette: 2,
      investigation: 3,
      linguistics: 2,
      medicine: 2,
      occult: 4,
      politics: 2,
      science: 3,
      subterfuge: 2,
      finance: 1,
      intimidation: 1,
    },
    disciplines: [
      { name: 'Auspex', dots: 2 },
      { name: 'Thaumaturgy', dots: 2 },
      { name: 'Dominate', dots: 1 },
    ],
    backgrounds: [
      { name: 'Mentor', dots: 2 },
      { name: 'Resources', dots: 2 },
      { name: 'Contacts', dots: 1 },
      { name: 'Status', dots: 1 },
      { name: 'Allies', dots: 1 },
      { name: 'Generation', dots: 1 },
    ],
    merits: ['Eidetic Memory', 'Magic Resistance'],
    flaws: ['Prey Exclusion'],
    clanMerits: ['Keys to the Library', 'Quartermaster'],
    clanFlaws: ['Arcane Curse'],
    specialties: [
      { ability: 'occult', name: 'Blood sorcery' },
      { ability: 'investigation', name: 'Occult crime scenes' },
      { ability: 'science', name: 'Hematology' },
    ],
    equipment: [
      { name: 'Ritual case', details: 'Candles, chalk, silver dust, and carefully labeled implements.' },
      { name: 'Research satchel', details: 'Notebook, scanner, and warded storage for recovered texts.' },
      { name: 'Compact pistol', details: 'A last resort kept out of sight.' },
    ],
    items: [
      { name: 'Chantry cipherbook', details: 'A pocket reference for codes, signs, and minor correspondences.' },
      { name: 'Blood-stained thesis notes', details: 'Her mortal work, expanded with Kindred annotations.' },
    ],
    virtues: {
      conscience: 4,
      selfControl: 4,
      courage: 3,
    },
    humanity: 8,
    willpower: 5,
  },
]);
const VIRTUE_OPTIONS = [
  { id: 'conscience', label: 'Conscience' },
  { id: 'selfControl', label: 'Self-Control' },
  { id: 'courage', label: 'Courage' },
];
const CREATION_UI_STEPS = [
  {
    id: 'identity',
    label: '1. Identity',
    title: 'Identity And Chronicle Fit',
    note: 'Who the vampire is, how they present, and what drives them.',
  },
  {
    id: 'core',
    label: '2. Core Stats',
    title: 'Attributes, Abilities, And Core Resources',
    note: 'Build the numbers that define how the character acts in play.',
  },
  {
    id: 'traits',
    label: '3. Traits',
    title: 'Disciplines, Backgrounds, Merits, And Flaws',
    note: 'Handle clan powers, advantages, drawbacks, and support structure.',
  },
  {
    id: 'finishing',
    label: '4. Finishing',
    title: 'Specialties, Gear, And Starting XP',
    note: 'Finalize the parts that round the sheet out before play starts.',
  },
  {
    id: 'review',
    label: '5. Review',
    title: 'Review And Launch',
    note: 'Check the whole sheet, resolve issues, and begin the chronicle.',
  },
];
const STAT_HELP = Object.freeze({
  strength: 'Raw physical power. Often matters for lifting, forcing things open, grappling, and melee damage.',
  dexterity: 'Coordination and precision. Often matters for stealth, firearms, dodging, driving, and fine physical actions.',
  stamina: 'Endurance and toughness. Often matters for resisting harm, staying active, and some soak-related situations.',
  charisma: 'Personal magnetism. Often matters when you win people over with presence, warmth, or force of personality.',
  manipulation: 'Social leverage and controlled influence. Often matters for lying, bargaining, seduction, or steering reactions.',
  appearance: 'Immediate visual impact. Often matters for first impressions, allure, and some social pools.',
  perception: 'What the character notices. Often matters for spotting danger, reading scenes, and catching small details.',
  intelligence: 'Reasoning and learned analysis. Often matters for problem-solving, research, and structured knowledge.',
  wits: 'Fast thinking and instinctive judgment. Often matters for initiative, snap decisions, and reading shifting situations.',
  alertness: 'Awareness of nearby details, danger, and change around the character.',
  athletics: 'Running, climbing, jumping, throwing, and general physical movement.',
  brawl: 'Unarmed fighting, grappling, and rough close-quarters violence.',
  dodge: 'Actively avoiding incoming attacks or danger when speed and timing matter.',
  empathy: 'Reading emotions, motives, and social tone in other people.',
  expression: 'Communicating clearly through speech, writing, performance, or presentation.',
  intimidation: 'Applying pressure through threat, menace, or forceful presence.',
  leadership: 'Directing people, keeping control, and getting others to follow.',
  streetwise: 'Knowing underworld habits, rumors, hustles, and informal power.',
  subterfuge: 'Lying, bluffing, misdirection, and concealment in social situations.',
  animalKen: 'Handling, calming, reading, or controlling animal behavior.',
  crafts: 'Making, repairing, or understanding practical built things and handiwork.',
  drive: 'Operating vehicles under routine or stressful conditions.',
  etiquette: 'Knowing formal social expectations, status behavior, and proper conduct.',
  firearms: 'Using guns accurately and safely under pressure.',
  melee: 'Using handheld weapons in close combat.',
  performance: 'Entertaining or captivating an audience through practiced presentation.',
  security: 'Bypassing or setting mundane security, locks, and alarms.',
  stealth: 'Moving quietly, hiding, and avoiding notice.',
  survival: 'Enduring hostile conditions, tracking needs, and staying functional in the field.',
  academics: 'Scholarly knowledge, formal study, and educated reference points.',
  computer: 'Using digital systems, networks, and common computer tasks.',
  finance: 'Understanding money, assets, debt, and practical economic leverage.',
  investigation: 'Following clues, piecing evidence together, and digging into hidden facts.',
  law: 'Knowing legal systems, procedure, and institutional rules.',
  linguistics: 'Languages, translation, and nuanced verbal understanding.',
  medicine: 'Treating injury and understanding bodies, health, and medical procedure.',
  occult: 'Supernatural lore, hidden traditions, and mystical reference knowledge.',
  politics: 'Institutions, factions, power blocs, and how authority actually moves.',
  science: 'Scientific method, technical reasoning, and structured empirical knowledge.',
  disciplines: 'Supernatural vampire powers. In creation they are tightly limited by clan and phase rules.',
  backgrounds: 'External assets and support such as contacts, herd, allies, or resources. They describe what the character can rely on.',
  specialties: 'A narrow edge inside an Ability. They help define what the character is notably good at.',
  merits: 'Creation-time advantages that broaden options or sharpen strengths. They usually cost freebie points.',
  flaws: 'Creation-time drawbacks that create pressure or limitations. They usually grant extra freebie points.',
  virtues: 'The moral and instinctive backbone of the character. Virtues feed Humanity or Path rating and Willpower baselines.',
  conscience: 'For Humanity characters, this reflects guilt and moral restraint. It helps anchor the character to human ethics.',
  selfControl: 'For Humanity characters, this reflects restraint over impulse and appetite. It matters when resisting excess or frenzy-related pressure.',
  courage: 'Resolve in the face of fear, danger, and supernatural pressure. It also sets the base Willpower rating in creation.',
  humanity: 'The character\'s remaining connection to human morality. Lower values usually mean harsher behavior and social alienation.',
  willpower: 'The character\'s reserve of resolve. Permanent dots set the cap; temporary Willpower is the spendable current pool.',
  currentWillpower: 'Temporary Willpower is the current spendable reserve of resolve. It can recover in play without changing the permanent rating.',
  generation: 'How far the vampire is from Caine. Lower generation usually means stronger blood and a larger maximum blood pool.',
  bloodPool: 'The blood available to fuel healing, certain disciplines, and physical boosts. Current blood is temporary and Storyteller-managed.',
  health: 'The wound track shows how injured the character currently is. Deeper injury states carry harsher penalties and risk.',
  temporaryResources: 'A spendable snapshot of current cash or liquid means. It can drop temporarily without changing the permanent Resources background.',
  ageCategory: 'A social shorthand such as Fledgling, Neonate, or Ancilla. It helps frame status expectations and how older Kindred react.',
  physicalDescription: 'How the character reads at a glance: appearance, posture, style, and other immediately noticeable cues.',
  ambition: 'A larger long-term drive. It helps the Storyteller pressure and reward the character over the chronicle.',
  desire: 'A shorter-term hunger or want. It helps create immediate temptations and smaller reward moments.',
});

function debugLog(event, payload = null) {
  if (payload === null) {
    console.log(DEBUG_PREFIX, event);
    return;
  }
  console.log(DEBUG_PREFIX, event, payload);
}

function createTemplateTraitEntries(items, prefix) {
  return items.map((item) => ({
    id: uid(prefix),
    name: item.name,
    dots: item.dots,
  }));
}

function createTemplatePointEntries(kind, names, clanName) {
  return names.map((name) => {
    const definition = getPointTraitDefinition(kind, name, clanName);
    return {
      id: uid(kind),
      name: definition.name,
      points: definition.points,
      details: definition.summary,
    };
  });
}

function createTemplateInventoryEntries(items, prefix) {
  return items.map((item) => ({
    id: uid(prefix),
    name: item.name,
    details: item.details,
  }));
}

function createReadyCharacterFromTemplate(templateId) {
  const template = READY_CHARACTER_TEMPLATES.find((item) => item.id === templateId);
  if (!template) {
    return null;
  }

  const character = getDefaultCharacter(schema);
  character.created = true;
  character.name = template.name;
  character.concept = template.concept;
  character.clan = template.clan;
  character.path = 'Humanity';
  character.sire = template.sire;
  character.nature = template.nature;
  character.demeanor = template.demeanor;
  character.age = template.age;
  character.ageCategory = template.ageCategory;
  character.pronouns = template.pronouns;
  character.ambition = template.ambition;
  character.desire = template.desire;
  character.physicalDescription = template.physicalDescription;
  character.backstory = template.backstory;
  character.attributes = { ...character.attributes, ...template.attributes };
  character.abilities = { ...character.abilities, ...template.abilities };
  character.disciplines = createTemplateTraitEntries(template.disciplines, 'discipline');
  character.backgrounds = createTemplateTraitEntries(template.backgrounds, 'background');
  character.merits = createTemplatePointEntries('merit', template.merits, template.clan);
  character.flaws = createTemplatePointEntries('flaw', template.flaws, template.clan);
  character.clanMerits = createTemplatePointEntries('clan-merit', template.clanMerits, template.clan);
  character.clanFlaws = createTemplatePointEntries('clan-flaw', template.clanFlaws, template.clan);
  character.specialties = template.specialties.map((item) => ({
    id: uid('specialty'),
    ability: item.ability,
    name: item.name,
    isAuto: false,
  }));
  character.equipment = createTemplateInventoryEntries(template.equipment, 'equipment');
  character.items = createTemplateInventoryEntries(template.items, 'item');
  character.virtues = { ...character.virtues, ...template.virtues };
  character.humanity = template.humanity;
  character.willpower = template.willpower;
  character.currentWillpower = template.willpower;
  character.creation = {
    ...getDefaultCreationState(),
    phase: 'experience',
    uiStep: 'review',
    startingExperience: 15,
  };
  character.experience = {
    unspent: 0,
    spent: 0,
    log: [],
  };
  syncCharacterDerivedStats(character);
  character.currentBloodPool = character.bloodPool;
  character.currentHealthLevel = 0;
  character.currentResources = getBackgroundDotsByName(character, 'Resources');
  return character;
}

function renderReadyCharacterTemplates() {
  return `
    <div class="list-card">
      ${renderCardHeading('Ready-To-Play Templates')}
      <p class="helper-text">Load a complete, ready-to-play sheet instantly. Applying a template replaces the unfinished sheet and locks the character as created.</p>
      <div class="template-grid">
        ${READY_CHARACTER_TEMPLATES.map((template) => `
          <button class="template-card" type="button" data-action="apply-ready-template" data-template-id="${template.id}">
            <strong>${escapeHtml(template.label)}</strong>
            <span class="meta-text">${escapeHtml(template.clan)}</span>
            <span>${escapeHtml(template.pitch)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function getCanonicalBackgroundName(name) {
  if (typeof name !== 'string') {
    return '';
  }

  return BACKGROUND_NAME_LOOKUP.get(name.trim().toLowerCase()) || '';
}

function sanitizeStructuredBackgrounds(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const sanitized = [];
  const seen = new Set();

  for (const item of items) {
    const canonicalName = getCanonicalBackgroundName(item?.name);
    if (!canonicalName) {
      debugLog('Rejected invalid background update', item);
      continue;
    }

    const normalizedKey = canonicalName.toLowerCase();
    if (seen.has(normalizedKey)) {
      debugLog('Rejected duplicate background update', item);
      continue;
    }

    seen.add(normalizedKey);
    sanitized.push({
      id: uid('background'),
      name: canonicalName,
      dots: Math.max(0, Math.min(5, Number(item?.dots) || 0)),
    });
  }

  return sanitized;
}

function sanitizeNpcFieldValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function applyStructuredNpcUpdate(existingNpc, incomingNpc) {
  for (const field of NPC_MUTABLE_FIELDS) {
    const nextValue = sanitizeNpcFieldValue(incomingNpc?.[field]);
    if (nextValue) {
      existingNpc[field] = nextValue;
    }
  }
}

function createStructuredNpcRecord(incomingNpc) {
  return {
    id: uid('npc'),
    name: sanitizeNpcFieldValue(incomingNpc?.name) || 'Unnamed NPC',
    clan: sanitizeNpcFieldValue(incomingNpc?.clan),
    ageCategory: sanitizeNpcFieldValue(incomingNpc?.ageCategory),
    role: sanitizeNpcFieldValue(incomingNpc?.role),
    summary: sanitizeNpcFieldValue(incomingNpc?.summary),
    status: sanitizeNpcFieldValue(incomingNpc?.status),
    ambition: sanitizeNpcFieldValue(incomingNpc?.ambition),
    desire: sanitizeNpcFieldValue(incomingNpc?.desire),
    notes: sanitizeNpcFieldValue(incomingNpc?.notes),
    secrets: sanitizeNpcFieldValue(incomingNpc?.secrets),
  };
}

function getCreationStep(stepId) {
  return CREATION_UI_STEPS.find((item) => item.id === stepId) ?? CREATION_UI_STEPS[0];
}

function getCharacterCreationUiStep(character) {
  const creation = ensureCharacterCreationState(character);
  if (!CREATION_UI_STEPS.some((item) => item.id === creation.uiStep)) {
    creation.uiStep = CREATION_UI_STEPS[0].id;
  }
  return creation.uiStep;
}

function setCharacterCreationUiStep(character, stepId) {
  const creation = ensureCharacterCreationState(character);
  creation.uiStep = getCreationStep(stepId).id;
}

function getCharacterCreationUiStepIndex(character) {
  return CREATION_UI_STEPS.findIndex((item) => item.id === getCharacterCreationUiStep(character));
}

function getStatHelpText(helpKey) {
  return typeof helpKey === 'string' ? STAT_HELP[helpKey] || '' : '';
}

function renderHelpTrigger(label, helpKey) {
  const helpText = getStatHelpText(helpKey);
  if (!helpText) {
    return '';
  }

  return `
    <button class="info-chip" type="button" aria-label="Explain ${escapeHtml(label)}">
      <span aria-hidden="true">?</span>
      <span class="tooltip-bubble" role="tooltip">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(helpText)}</span>
      </span>
    </button>
  `;
}

function renderFieldLabel(label, helpKey = '') {
  return `<span class="helper-text field-label"><span>${escapeHtml(label)}</span>${renderHelpTrigger(label, helpKey)}</span>`;
}

function renderCardHeading(title, helpKey = '') {
  return `
    <div class="card-heading-row">
      <h4>${escapeHtml(title)}</h4>
      ${renderHelpTrigger(title, helpKey)}
    </div>
  `;
}

function renderLockedCard(label, value, helpKey = '', meta = '') {
  return `
    <div class="locked-card">
      ${renderFieldLabel(label, helpKey)}
      <strong>${escapeHtml(String(value))}</strong>
      ${meta ? `<div class="meta-text">${escapeHtml(meta)}</div>` : ''}
    </div>
  `;
}

function renderReadonlyFieldSummary(label, value, helpKey = '') {
  return `
    <div class="summary-row with-help">
      <span class="summary-label">${escapeHtml(label)}</span>
      ${renderHelpTrigger(label, helpKey)}
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

export function createApp(root) {
  const state = loadState(schema, cities, CUSTOM_CHRONICLE_PACK.hooks);
  state.chronicles.forEach((chronicle) => {
    ensureCharacterCreationState(chronicle.character);
    syncCharacterDerivedStats(chronicle.character);
  });
  ensureActiveChronicle(state);

  const runtime = {
    archiveRootHandle: null,
    archiveLabel: '',
    xpDraft: null,
    cloud: {
      configured: isFirebaseConfigured(),
      ready: !isFirebaseConfigured(),
      user: state.cloudCache?.user ?? null,
      bank: state.cloudCache?.bank ?? null,
      error: state.cloudCache?.error ?? '',
      busy: false,
      unsubscribe: null,
    },
    modelCooldowns: {},
  };

  const ui = {
    stage: null,
    playShell: null,
    chatLog: null,
    chronicleList: null,
    overlayHost: null,
    messageInput: null,
    composer: null,
    regenerateButton: null,
    topbarControls: null,
    rollLog: null,
    cloudAuth: null,
    cloudBank: null,
  };

  renderShell();
  void initCloudSync();
  render();

  function renderShell() {
    root.innerHTML = `
      <div class="app-shell">
        <aside class="sidebar">
          <section class="brand-block">
            <div class="brand-eyebrow">V20 Storyteller</div>
            <h1 class="brand-title">Midnight Domain</h1>
            <p class="brand-copy">Build your vampire, tune the chronicle, and let the city answer back.</p>
          </section>

          <section class="sidebar-section">
            <h2 class="section-heading">Pages</h2>
            <div class="tab-row three-tabs">
              <button class="tab-button" data-view="creation">Sessions</button>
              <button class="tab-button" data-view="settings">Settings</button>
              <button class="tab-button" data-view="play">Chronicle</button>
            </div>
          </section>

          <section class="sidebar-section">
            <h2 class="section-heading">Drawers</h2>
            <div class="tab-row four-tabs">
              <button class="tab-button" data-panel="notes">Notes</button>
              <button class="tab-button" data-panel="sheet">Character Sheet</button>
              <button class="tab-button" data-panel="npcs">NPC Directory</button>
              <button class="tab-button" data-panel="downtime">Downtime</button>
            </div>
          </section>

          <section class="sidebar-section">
            <button class="primary" data-action="new-chronicle">+ New Chronicle</button>
            <button class="ghost-button" data-action="delete-chronicle">Delete Active Chronicle</button>
          </section>

          <section class="sidebar-section">
            <h2 class="section-heading">Chronicles</h2>
            <div class="chronicle-list" data-role="chronicle-list"></div>
            <p class="footer-note">Chronicles auto-save in this browser via local storage. Closing the page keeps your current chronicle, notes, sheet, and chat history on this device.</p>
          </section>

          <section class="sidebar-section">
            <h2 class="section-heading">V20 Dice</h2>
            <div class="dice-grid">
              <label>
                <span class="helper-text">Pool</span>
                <input type="number" min="1" max="20" value="6" data-role="dice-pool" />
              </label>
              <label>
                <span class="helper-text">Difficulty</span>
                <input type="number" min="2" max="10" value="6" data-role="dice-difficulty" />
              </label>
              <button class="dice-button" data-action="roll-dice">Roll</button>
              <button class="ghost-button" data-action="inject-last-roll">Send Last Roll</button>
            </div>
            <p class="footer-note">${diceRules.summary}</p>
            <div class="roll-log" data-role="roll-log"></div>
          </section>

          <section class="sidebar-section">
            <h2 class="section-heading">Cloud Account</h2>
            <div data-role="cloud-auth"></div>
            <div data-role="cloud-bank"></div>
          </section>

          <section class="sidebar-section">
            <h2 class="section-heading">OpenRouter</h2>
            <label>
              <span class="helper-text">API Key Value For VTM_CHATBOT</span>
              <input type="password" placeholder="Paste the actual OpenRouter secret key here" data-role="api-key" />
            </label>
            <label>
              <span class="helper-text">Preset Model</span>
              <select data-role="model-select"></select>
            </label>
            <label data-role="custom-model-row" style="display: none;">
              <span class="helper-text">Custom Model</span>
              <input type="text" data-role="model" placeholder="provider/model-name" />
            </label>
            <label>
              <span class="helper-text">Battery Cost</span>
              <input type="number" min="0" max="1000" step="10" data-role="model-cost" />
            </label>
            <div class="api-actions">
              <button class="secondary-button" data-action="save-api-config">Save AI Settings</button>
            </div>
            <p class="footer-note" data-role="model-help"></p>
            <p class="footer-note">Paste the real secret key value, not the key name. Authentication uses a Bearer token in the Authorization header. App title and referer headers are optional.</p>
          </section>
        </aside>

        <main class="main-panel">
          <header class="topbar">
            <div>
              <div class="brand-eyebrow">Current Domain</div>
              <h1 data-role="top-title"></h1>
              <div class="topbar-copy" data-role="top-copy"></div>
            </div>
            <div class="topbar-actions" data-role="topbar-controls"></div>
          </header>

          <div class="notice-bar" data-role="status-bar">Ready for the next scene.</div>
          <section class="stage-panel" data-role="stage"></section>
          <section class="play-shell" data-role="play-shell" style="display: none;">
            <section class="chat-log" data-role="chat-log"></section>

            <form class="composer" data-role="composer">
              <textarea data-role="message-input" placeholder="Describe your action, ask for a scene, or tell the Storyteller how your vampire responds."></textarea>
              <div class="composer-actions">
                <button class="ghost-button" type="button" data-action="regenerate-response">Regenerate Response</button>
                <button class="send-button" type="submit">Send To Storyteller</button>
              </div>
            </form>
          </section>

          <div class="overlay-host" data-role="overlay-host"></div>
        </main>
      </div>
    `;

    ui.stage = root.querySelector('[data-role="stage"]');
    ui.playShell = root.querySelector('[data-role="play-shell"]');
    ui.chatLog = root.querySelector('[data-role="chat-log"]');
    ui.chronicleList = root.querySelector('[data-role="chronicle-list"]');
    ui.overlayHost = root.querySelector('[data-role="overlay-host"]');
    ui.messageInput = root.querySelector('[data-role="message-input"]');
    ui.composer = root.querySelector('[data-role="composer"]');
    ui.regenerateButton = root.querySelector('[data-action="regenerate-response"]');
    ui.topbarControls = root.querySelector('[data-role="topbar-controls"]');
    ui.rollLog = root.querySelector('[data-role="roll-log"]');
    ui.cloudAuth = root.querySelector('[data-role="cloud-auth"]');
    ui.cloudBank = root.querySelector('[data-role="cloud-bank"]');

    root.querySelector('[data-role="composer"]').addEventListener('submit', onSendMessage);
    ui.regenerateButton?.addEventListener('click', onRegenerateResponse);
    ui.messageInput?.addEventListener('input', syncComposerHeight);
    root.querySelector('[data-action="new-chronicle"]').addEventListener('click', onNewChronicle);
    root.querySelector('[data-action="delete-chronicle"]').addEventListener('click', onDeleteChronicle);
    root.querySelector('[data-action="roll-dice"]').addEventListener('click', onRollDice);
    root.querySelector('[data-action="inject-last-roll"]').addEventListener('click', onInjectLastRoll);
    root.querySelector('[data-action="save-api-config"]').addEventListener('click', onSaveApiConfig);
    root.querySelector('[data-role="model-select"]')?.addEventListener('change', syncModelPricingUi);
    root.querySelector('[data-role="model"]')?.addEventListener('input', syncModelPricingUi);
    root.querySelector('[data-role="model-cost"]')?.addEventListener('input', syncModelPricingUi);

    for (const button of root.querySelectorAll('[data-view]')) {
      button.addEventListener('click', () => {
        state.activeView = button.dataset.view;
        persist();
        render();
      });
    }

    for (const button of root.querySelectorAll('[data-panel]')) {
      button.addEventListener('click', () => {
        state.activePanel = button.dataset.panel;
        if (state.activePanel === 'xp') {
          runtime.xpDraft = getDefaultXpDraft(getActiveChronicle().character);
        }
        persist();
        render();
      });
    }

    syncComposerHeight();
  }

  function syncComposerHeight() {
    if (!ui.messageInput) {
      return;
    }

    ui.messageInput.style.height = 'auto';
    const maxHeight = Math.round(window.innerHeight * 0.28);
    const nextHeight = Math.min(ui.messageInput.scrollHeight, maxHeight);
    ui.messageInput.style.height = `${Math.max(52, nextHeight)}px`;
    ui.messageInput.style.overflowY = ui.messageInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function getActiveChronicle() {
    return ensureActiveChronicle(state);
  }

  function persist() {
    saveState(state);
  }

  function ensurePromptSyncState(chronicle) {
    if (!chronicle.promptSync || typeof chronicle.promptSync !== 'object') {
      chronicle.promptSync = {
        forceFullSheetRefresh: true,
        turnsSinceFullSheet: 0,
      };
      return chronicle.promptSync;
    }

    chronicle.promptSync.forceFullSheetRefresh = Boolean(chronicle.promptSync.forceFullSheetRefresh);
    chronicle.promptSync.turnsSinceFullSheet = Math.max(0, Number(chronicle.promptSync.turnsSinceFullSheet) || 0);
    return chronicle.promptSync;
  }

  function markCharacterSummaryDirty(chronicle) {
    const promptSync = ensurePromptSyncState(chronicle);
    promptSync.forceFullSheetRefresh = true;
    promptSync.turnsSinceFullSheet = Math.max(0, promptSync.turnsSinceFullSheet);
  }

  function isMechanicsRequest(message) {
    if (typeof message !== 'string') {
      return false;
    }

    const trimmed = message.trim();
    if (!trimmed) {
      return false;
    }

    if ((trimmed.startsWith('(') && trimmed.endsWith(')')) || /\b(roll|dice pool|difficulty|mechanic|mechanics|rules?|botch|success(?:es)?|how many dice|what is my pool)\b/i.test(trimmed)) {
      return true;
    }

    return false;
  }

  function shouldUseFullCharacterSummary(chronicle, { openingScene = false, userMessage = '' } = {}) {
    const promptSync = ensurePromptSyncState(chronicle);
    if (openingScene || promptSync.forceFullSheetRefresh || isMechanicsRequest(userMessage)) {
      return true;
    }

    return promptSync.turnsSinceFullSheet >= 4;
  }

  function noteCharacterSummarySent(chronicle, summaryMode) {
    const promptSync = ensurePromptSyncState(chronicle);
    if (summaryMode === 'full') {
      promptSync.forceFullSheetRefresh = false;
      promptSync.turnsSinceFullSheet = 0;
      return;
    }

    promptSync.turnsSinceFullSheet += 1;
  }

  function renderSidebarConfig() {
    const apiKeyInput = root.querySelector('[data-role="api-key"]');
    const modelInput = root.querySelector('[data-role="model"]');
    const modelSelect = root.querySelector('[data-role="model-select"]');

    if (apiKeyInput && apiKeyInput.value !== (state.apiKey || '')) {
      apiKeyInput.value = state.apiKey || '';
    }

    if (modelSelect) {
      const model = state.model || DEFAULT_MODEL;
      modelSelect.innerHTML = STORYTELLER_MODEL_OPTIONS.map((option) => `
        <option value="${option.id}">${escapeHtml(option.label)} | ${escapeHtml(option.id)} | ${formatModelUnitCost(option.costUnits)}</option>
      `).join('') + `<option value="${CUSTOM_MODEL_SENTINEL}">Custom model</option>`;
      modelSelect.value = isKnownStoryModel(model) ? model : CUSTOM_MODEL_SENTINEL;
    }

    if (modelInput) {
      modelInput.value = isKnownStoryModel(state.model || DEFAULT_MODEL) ? '' : state.model || '';
    }

    syncModelPricingUi();

    renderCloudPanels();
  }

  function syncModelPricingUi() {
    const modelSelect = root.querySelector('[data-role="model-select"]');
    const modelInput = root.querySelector('[data-role="model"]');
    const modelCostInput = root.querySelector('[data-role="model-cost"]');
    const modelHelp = root.querySelector('[data-role="model-help"]');
    const customModelRow = root.querySelector('[data-role="custom-model-row"]');
    const selectedValue = modelSelect?.value || (isKnownStoryModel(state.model || DEFAULT_MODEL) ? state.model || DEFAULT_MODEL : CUSTOM_MODEL_SENTINEL);
    const model = selectedValue === CUSTOM_MODEL_SENTINEL
      ? modelInput?.value.trim() || state.model || DEFAULT_MODEL
      : selectedValue;
    const preset = getStoryModelEntry(model);
    const fallbackUnits = Number.isFinite(Number(state.customModelCostUnits))
      ? Number(state.customModelCostUnits)
      : DEFAULT_CUSTOM_MODEL_COST_UNITS;

    if (customModelRow) {
      customModelRow.style.display = selectedValue === CUSTOM_MODEL_SENTINEL ? 'grid' : 'none';
    }

    if (modelCostInput) {
      modelCostInput.disabled = Boolean(preset);
      if (preset) {
        modelCostInput.value = String(preset.costUnits);
      } else if (!modelCostInput.value) {
        modelCostInput.value = String(fallbackUnits);
      }
    }

    if (!modelHelp) {
      return;
    }

    if (preset) {
      const fallbackChain = getFallbackModelChain(model);
      const fallbackText = fallbackChain.length ? ` If this model is rate-limited, the app will retry with ${fallbackChain.map((candidate) => getStoryModelEntry(candidate)?.label || candidate).join(', ')}.` : '';
      modelHelp.textContent = `${preset.label}: ${preset.description}${fallbackText}`;
      return;
    }

    const customUnits = clampBatteryUnits(modelCostInput?.value || fallbackUnits, DEFAULT_BATTERY_CAP_UNITS);
    modelHelp.textContent = `Custom models use your manual battery cost. Current custom cost: ${formatModelUnitCost(customUnits)}. Custom entries do not auto-fallback because there is no guaranteed equivalent preset.`;
  }

  async function initCloudSync() {
    if (!runtime.cloud.configured) {
      updateCloudState({ configured: false, ready: true, error: '' });
      return;
    }

    try {
      runtime.cloud.unsubscribe = await startFirebaseAuthObserver((snapshot) => {
        updateCloudState(snapshot);
      });
    } catch (error) {
      updateCloudState({
        configured: true,
        ready: true,
        user: null,
        bank: null,
        error: error.message,
      });
    }
  }

  function updateCloudState(nextState) {
    runtime.cloud = {
      ...runtime.cloud,
      ...nextState,
    };
    state.cloudCache = {
      configured: runtime.cloud.configured,
      ready: runtime.cloud.ready,
      user: runtime.cloud.user,
      bank: runtime.cloud.bank,
      error: runtime.cloud.error,
    };
    persist();
    renderSidebarConfig();
  }

  function renderCloudPanels() {
    if (!ui.cloudAuth || !ui.cloudBank) {
      return;
    }

    const user = runtime.cloud.user;
    const bank = runtime.cloud.bank;

    if (!runtime.cloud.configured) {
      ui.cloudAuth.innerHTML = `
        <div class="list-card compact-panel">
          <h4>Setup Pending</h4>
          <p class="helper-text">Add the Firebase web config through the VITE_FIREBASE_* environment variables to enable Google sign-in and cloud credit banking.</p>
        </div>
      `;
      ui.cloudBank.innerHTML = `
        <div class="list-card compact-panel">
          <h4>Storyteller Battery</h4>
          <p class="helper-text">Cloud battery will appear here once Firebase Auth and Firestore are configured.</p>
        </div>
      `;
      return;
    }

    if (!runtime.cloud.ready) {
      ui.cloudAuth.innerHTML = `
        <div class="list-card compact-panel">
          <h4>Cloud Account</h4>
          <p class="helper-text">Checking Firebase session...</p>
        </div>
      `;
      ui.cloudBank.innerHTML = `
        <div class="list-card compact-panel">
          <h4>Storyteller Battery</h4>
          <p class="helper-text">Loading your banked battery...</p>
        </div>
      `;
      return;
    }

    const selectedModel = state.model || DEFAULT_MODEL;
    const selectedModelEntry = getStoryModelEntry(selectedModel);
    const selectedModelCostUnits = getModelCostUnits(selectedModel, state.customModelCostUnits);
    const batteryPercent = bank ? Math.max(0, Math.min(100, Math.round((bank.balanceUnits / Math.max(1, bank.capUnits)) * 100))) : 0;

    ui.cloudAuth.innerHTML = user
      ? `
        <div class="list-card compact-panel">
          <h4>Signed In</h4>
          <div class="summary-list">
            <div><strong>${escapeHtml(user.displayName || 'Google user')}</strong></div>
            <div>${escapeHtml(user.email || 'No email returned')}</div>
          </div>
          <div class="inline-actions">
            <button class="secondary-button" type="button" data-action="refresh-cloud-bank" ${runtime.cloud.busy ? 'disabled' : ''}>Refresh Credits</button>
            <button class="ghost-button" type="button" data-action="sign-out-google" ${runtime.cloud.busy ? 'disabled' : ''}>Sign Out</button>
          </div>
          ${runtime.cloud.error ? `<p class="footer-note">${escapeHtml(runtime.cloud.error)}</p>` : ''}
        </div>
      `
      : `
        <div class="list-card compact-panel">
          <h4>Google Login</h4>
          <p class="helper-text">Sign in with your Google account so the app can seed your Firestore user bank automatically.</p>
          <div class="inline-actions">
            <button class="primary" type="button" data-action="sign-in-google" ${runtime.cloud.busy ? 'disabled' : ''}>Sign In With Google</button>
          </div>
          ${runtime.cloud.error ? `<p class="footer-note">${escapeHtml(runtime.cloud.error)}</p>` : ''}
        </div>
      `;

    if (!user) {
      ui.cloudBank.innerHTML = `
        <div class="list-card compact-panel">
          <h4>Storyteller Battery</h4>
          <p class="helper-text">Your Firestore bank is created automatically on first Google sign-in. No manual user ID or collection setup is needed in the console.</p>
        </div>
      `;
    } else if (!bank) {
      ui.cloudBank.innerHTML = `
        <div class="list-card compact-panel">
          <h4>Storyteller Battery</h4>
          <p class="helper-text">Your cloud bank is being prepared.</p>
        </div>
      `;
    } else {
      ui.cloudBank.innerHTML = `
        <div class="list-card compact-panel">
          <div class="npc-header-row">
            <h4>Storyteller Battery</h4>
            <span class="status-pill">${formatBatteryUnits(bank.balanceUnits)} / ${formatBatteryUnits(bank.capUnits)}</span>
          </div>
          <div class="summary-list validation-list">
            <div>Current model: ${escapeHtml(selectedModelEntry?.label || selectedModel)}</div>
            <div>Current request cost: ${formatModelUnitCost(selectedModelCostUnits, bank.capUnits)} battery (${formatBatteryUnits(selectedModelCostUnits)} units)</div>
            <div>Recharge: +${formatBatteryUnits(bank.unitsPerInterval)} every ${formatAccrualInterval(bank.accrualIntervalMinutes)}</div>
            <div>Free-model uses remaining today: ${bank.freeUseRemaining} / ${bank.freeUseDailyLimit}</div>
            <div>${describeNextAccrual(bank)}</div>
          </div>
          <div class="battery-meter" aria-label="Storyteller battery level">
            <div class="battery-meter-fill" style="width: ${batteryPercent}%;"></div>
            <div class="battery-meter-label">${batteryPercent}%</div>
          </div>
          <div class="inline-actions">
            <button class="ghost-button" type="button" data-action="sign-out-google" ${runtime.cloud.busy ? 'disabled' : ''}>Log Out Of Google</button>
          </div>
          <p class="footer-note">This bank is stored in Firestore and survives browser restarts, device changes, and your PC being turned off.</p>
        </div>
      `;
    }

    ui.cloudAuth.querySelector('[data-action="sign-in-google"]')?.addEventListener('click', onSignInWithGoogle);
    ui.cloudAuth.querySelector('[data-action="sign-out-google"]')?.addEventListener('click', onSignOutCloudUser);
    ui.cloudAuth.querySelector('[data-action="refresh-cloud-bank"]')?.addEventListener('click', onRefreshCloudBank);
    ui.cloudBank.querySelector('[data-action="sign-out-google"]')?.addEventListener('click', onSignOutCloudUser);
  }

  async function onSignInWithGoogle() {
    runtime.cloud.busy = true;
    renderSidebarConfig();
    try {
      await signInWithGoogle();
      setStatus('Signed in with Google. Your Firestore bank will be checked automatically.');
    } catch (error) {
      updateCloudState({ error: error.message });
      setStatus(`Google sign-in failed: ${error.message}`, true);
    } finally {
      runtime.cloud.busy = false;
      renderSidebarConfig();
    }
  }

  async function onSignOutCloudUser() {
    runtime.cloud.busy = true;
    renderSidebarConfig();
    try {
      await signOutCloudUser();
      setStatus('Signed out of the cloud account.');
    } catch (error) {
      updateCloudState({ error: error.message });
      setStatus(`Cloud sign-out failed: ${error.message}`, true);
    } finally {
      runtime.cloud.busy = false;
      renderSidebarConfig();
    }
  }

  async function onRefreshCloudBank() {
    if (!runtime.cloud.user) {
      setStatus('Sign in with Google before refreshing your Firestore bank.', true);
      return;
    }

    runtime.cloud.busy = true;
    renderSidebarConfig();
    try {
      const bank = await refreshUserBank(runtime.cloud.user.uid);
      updateCloudState({ bank, error: '' });
      setStatus('Cloud Storyteller battery refreshed from Firestore.');
    } catch (error) {
      updateCloudState({ error: error.message });
      setStatus(`Could not refresh cloud battery: ${error.message}`, true);
    } finally {
      runtime.cloud.busy = false;
      renderSidebarConfig();
    }
  }

  async function ensureStorytellerCreditAvailable() {
    if (!runtime.cloud.configured) {
      return true;
    }

    if (!runtime.cloud.ready) {
      setStatus('Cloud battery is still syncing. Wait a moment and try again.', true);
      return false;
    }

    if (!runtime.cloud.user) {
      setStatus('Sign in with Google before using your cloud Storyteller battery.', true);
      return false;
    }

    try {
      const bank = await refreshUserBank(runtime.cloud.user.uid);
      const spendUnits = getModelCostUnits(state.model || DEFAULT_MODEL, state.customModelCostUnits);
      updateCloudState({ bank, error: '' });
      if (spendUnits <= 0) {
        if (bank.freeUseRemaining <= 0) {
          setStatus(getCloudCreditFailureMessage(bank, spendUnits), true);
          return false;
        }
        return true;
      }

      if (bank.balanceUnits < spendUnits) {
        setStatus(getCloudCreditFailureMessage(bank, spendUnits), true);
        return false;
      }
      return true;
    } catch (error) {
      updateCloudState({ error: error.message });
      setStatus(`Could not sync cloud battery: ${error.message}`, true);
      return false;
    }
  }

  function getCloudCreditFailureMessage(bank, spendUnits) {
    if (spendUnits <= 0) {
      const remainingMs = Math.max(0, (bank.nextFreeUseResetAtMs || Date.now()) - Date.now());
      return `The daily free-model limit is exhausted. Next free reset in ${formatDuration(remainingMs)}.`;
    }

    return `Not enough Storyteller battery is available. ${describeNextAccrual(bank)}`;
  }

  function describeNextAccrual(bank) {
    if (!bank?.nextAccrualAtMs) {
      return 'Your battery is full. No further recharge will accrue until you spend some.';
    }

    const remainingMs = Math.max(0, bank.nextAccrualAtMs - Date.now());
    return `Next recharge in ${formatDuration(remainingMs)}.`;
  }

  function formatAccrualInterval(minutes) {
    if (minutes % (60 * 24) === 0) {
      const days = minutes / (60 * 24);
      return `${days} day${days === 1 ? '' : 's'}`;
    }
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  function formatDuration(milliseconds) {
    const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000));
    if (totalMinutes >= 60 * 24) {
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      return hours ? `${days}d ${hours}h` : `${days}d`;
    }
    if (totalMinutes >= 60) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${totalMinutes}m`;
  }

  function getModelCooldown(model) {
    const entry = runtime.modelCooldowns[model];
    return {
      consecutive429s: Math.max(0, Number(entry?.consecutive429s) || 0),
      cooldownUntilMs: Math.max(0, Number(entry?.cooldownUntilMs) || 0),
    };
  }

  function isModelCoolingDown(model) {
    return getModelCooldown(model).cooldownUntilMs > Date.now();
  }

  function clearModelCooldown(model) {
    if (!model) {
      return;
    }

    runtime.modelCooldowns[model] = {
      consecutive429s: 0,
      cooldownUntilMs: 0,
    };
  }

  function registerModelRateLimit(model) {
    if (!model) {
      return getModelCooldown('');
    }

    const previous = getModelCooldown(model);
    const consecutive429s = Math.min(previous.consecutive429s + 1, 8);
    const cooldownMs = Math.min(RATE_LIMIT_MAX_COOLDOWN_MS, RATE_LIMIT_BASE_COOLDOWN_MS * 2 ** (consecutive429s - 1));
    const next = {
      consecutive429s,
      cooldownUntilMs: Date.now() + cooldownMs,
    };

    runtime.modelCooldowns[model] = next;
    return next;
  }

  function getModelCooldownMessage(model) {
    if (!model || !isModelCoolingDown(model)) {
      return '';
    }

    const remainingMs = Math.max(0, getModelCooldown(model).cooldownUntilMs - Date.now());
    return `${model} is cooling down for ${formatDuration(remainingMs)} after repeated rate limits.`;
  }

  function getRateLimitStatusMessage(primaryModel, attemptedFallbacks = []) {
    const cooldownMessages = [primaryModel, ...attemptedFallbacks]
      .filter(Boolean)
      .filter((model, index, values) => values.indexOf(model) === index)
      .map((model) => getModelCooldownMessage(model))
      .filter(Boolean);

    if (!cooldownMessages.length) {
      return 'OpenRouter rate limit or quota hit (429). Wait a moment and try again.';
    }

    return `All available models are cooling down after rate limits. ${cooldownMessages.join(' ')}`;
  }

  function syncApiConfigFromInputs() {
    const apiKeyInput = root.querySelector('[data-role="api-key"]');
    const modelSelect = root.querySelector('[data-role="model-select"]');
    const modelInput = root.querySelector('[data-role="model"]');
    const modelCostInput = root.querySelector('[data-role="model-cost"]');

    if (apiKeyInput) {
      state.apiKey = apiKeyInput.value.trim();
    }

    if (modelSelect?.value === CUSTOM_MODEL_SENTINEL) {
      state.model = modelInput?.value.trim() || DEFAULT_MODEL;
    } else if (modelSelect) {
      state.model = modelSelect.value || DEFAULT_MODEL;
    } else if (modelInput) {
      state.model = modelInput.value.trim() || DEFAULT_MODEL;
    }

    if (modelCostInput) {
      state.customModelCostUnits = isKnownStoryModel(state.model)
        ? null
        : clampBatteryUnits(modelCostInput.value || DEFAULT_CUSTOM_MODEL_COST_UNITS, DEFAULT_BATTERY_CAP_UNITS);
    }
  }

  function setStatus(message, isError = false) {
    const bar = root.querySelector('[data-role="status-bar"]');
    bar.textContent = message;
    bar.style.background = isError ? 'rgba(108, 24, 28, 0.55)' : 'rgba(82, 22, 24, 0.35)';
  }

  function ensureValidView(chronicle) {
    if (!chronicle.setupComplete && state.activeView !== 'settings') {
      state.activeView = 'settings';
      return;
    }
    if (chronicle.setupComplete && !chronicle.character.created && state.activeView === 'play') {
      state.activeView = 'creation';
      return;
    }
    if (state.activeView === 'settings' && chronicle.setupComplete) {
      state.activeView = chronicle.character.created ? 'play' : 'creation';
      return;
    }
    if (state.activeView === 'creation' && chronicle.character.created) {
      state.activeView = 'play';
    }
  }

  function render() {
    const chronicle = getActiveChronicle();
    renderChronicleList();
    renderSidebarConfig();
    renderViewButtons();
    renderPanelButtons();

    root.querySelector('[data-action="delete-chronicle"]').disabled = !chronicle;

    if (!chronicle) {
      renderEmptyState();
      renderDiceLog([]);
      return;
    }

    const city = getChronicleCity(chronicle);
    const selectedHooks = getChronicleHookSummaries(chronicle.cityId, chronicle.plotHookIds);

    ensureValidView(chronicle);
    renderHeader(chronicle, city);
    renderDiceLog(chronicle.diceLog);
    renderMainContent(chronicle, city, selectedHooks);
    renderOverlay(chronicle, city, selectedHooks);
  }

  function renderEmptyState() {
    const title = root.querySelector('[data-role="top-title"]');
    const copy = root.querySelector('[data-role="top-copy"]');

    title.textContent = 'No Chronicle Loaded';
    copy.textContent = 'Create a new chronicle to choose its chronicle foundation first, then build the vampire who enters it.';
    ui.topbarControls.innerHTML = '<div class="pill-row"><span class="status-pill">Waiting for a new chronicle</span></div>';
    ui.stage.style.display = 'block';
    ui.playShell.style.display = 'none';
    ui.stage.innerHTML = `
      <div class="stage-card">
        <div class="stage-copy">
          <div class="brand-eyebrow">Start Here</div>
          <h2>Create A New Chronicle</h2>
          <p class="helper-text">Your setup flow is: choose the chronicle foundation, build the character for that chronicle, then let the Storyteller begin play.</p>
        </div>
        <div class="stage-actions">
          <button class="primary" type="button" data-action="empty-new-chronicle">+ New Chronicle</button>
        </div>
      </div>
    `;
    ui.stage.querySelector('[data-action="empty-new-chronicle"]')?.addEventListener('click', onNewChronicle);
    ui.overlayHost.innerHTML = '';
  }

  function renderViewButtons() {
    const chronicle = getActiveChronicle();
    const hasChronicle = Boolean(chronicle);
    root.querySelectorAll('[data-view]').forEach((button) => {
      const view = button.dataset.view;
      button.classList.toggle('active', state.activeView === view);
      if (!hasChronicle) {
        button.disabled = view !== 'settings';
        return;
      }
      button.disabled =
        (view === 'creation' && !chronicle.setupComplete) ||
        (view === 'play' && (!chronicle.setupComplete || !chronicle.character.created));
    });
  }

  function renderPanelButtons() {
    const hasChronicle = Boolean(getActiveChronicle());
    root.querySelectorAll('[data-panel]').forEach((button) => {
      const panel = button.dataset.panel;
      button.classList.toggle('active', state.activePanel === panel);
      button.disabled = !hasChronicle;
    });
  }

  function renderDiceLog(diceLog) {
    if (!ui.rollLog) {
      return;
    }

    if (!diceLog.length) {
      ui.rollLog.innerHTML = '<p class="helper-text">No dice rolled yet.</p>';
      return;
    }

    ui.rollLog.innerHTML = diceLog
      .slice(-6)
      .reverse()
      .map(
        (result) => `
          <div class="roll-card">
            <div class="roll-summary"><strong>${escapeHtml(result.outcome)}</strong> · ${result.pool}d10 at difficulty ${result.difficulty}</div>
            <div class="meta-text">Dice: ${escapeHtml(result.dice.join(', '))}</div>
            <div class="meta-text">Net successes: ${result.totalSuccesses}</div>
          </div>
        `,
      )
      .join('');
  }

  function renderChronicleList() {
    ui.chronicleList.innerHTML = '';
    for (const chronicle of state.chronicles) {
      const city = getChronicleCity(chronicle);
      const status = !chronicle.setupComplete ? 'Chronicle settings' : !chronicle.character.created ? 'Character creation' : 'Ready to continue';
      const button = document.createElement('button');
      button.className = `chronicle-item ${chronicle.id === state.activeChronicleId ? 'active' : ''}`;
      button.innerHTML = `
        <span class="chronicle-title">${escapeHtml(chronicle.title)}</span>
        <span class="chronicle-meta">${escapeHtml(city?.name ?? 'Unknown domain')} · ${chronicle.year} · ${escapeHtml(DIFFICULTY_MAP[chronicle.difficulty]?.label ?? 'Balanced')}</span>
        <span class="meta-text">${escapeHtml(status)}</span>
      `;
      button.addEventListener('click', () => {
        state.activeChronicleId = chronicle.id;
        runtime.xpDraft = null;
        debugLog('Selected chronicle', { chronicleId: chronicle.id, title: chronicle.title });
        persist();
        render();
      });
      ui.chronicleList.appendChild(button);
    }
  }

  function renderHeader(chronicle, city) {
    const title = root.querySelector('[data-role="top-title"]');
    const copy = root.querySelector('[data-role="top-copy"]');

    if (state.activeView === 'creation') {
      if (chronicle.character.created) {
        title.textContent = 'Chronicle Sessions';
        copy.textContent = 'Review active chronicles, reopen a saved chat session, or start a new chronicle from the sidebar.';
        ui.topbarControls.innerHTML = `<div class="pill-row"><span class="status-pill">${state.chronicles.length} chronicle${state.chronicles.length === 1 ? '' : 's'} tracked</span></div>`;
        return;
      }

      title.textContent = 'Character Creation';
      copy.textContent = `Build the vampire for ${city.name}. Once the sheet is locked in, spend experience through confirmed purchases only.`;
      ui.topbarControls.innerHTML = '<div class="pill-row"><span class="status-pill">Page 2 of 3</span></div>';
      return;
    }

    if (state.activeView === 'settings') {
      title.textContent = 'Chronicle Settings';
      copy.textContent = 'Choose the chronicle foundation, city frame, and Storyteller brief before character creation begins.';
      ui.topbarControls.innerHTML = '<div class="pill-row"><span class="status-pill">Page 1 of 3</span></div>';
      return;
    }

    title.textContent = chronicle.title;
    copy.textContent = `${city.name} · ${city.region} · ${chronicle.year} · ${city.mood}`;
    ui.topbarControls.innerHTML = renderPlayControls(chronicle);
    bindPlayControls(chronicle);
  }

  function renderPlayControls(chronicle) {
    const city = getChronicleCity(chronicle);
    const progression = ensureChronicleProgressionState(chronicle);
    return `
      <div class="topbar-row play-topbar-row">
        <div class="topbar-card">
          <span class="helper-text">Chronicle</span>
          <strong>${escapeHtml(city.chronicleBook || city.name)}</strong>
        </div>
        <div class="topbar-card">
          <span class="helper-text">City</span>
          <strong>${escapeHtml(city.name)}</strong>
        </div>
        <div class="topbar-card">
          <span class="helper-text">Year</span>
          <strong>${chronicle.year}</strong>
        </div>
        <div class="topbar-card">
          <span class="helper-text">Difficulty</span>
          <strong>${escapeHtml(DIFFICULTY_MAP[chronicle.difficulty]?.label ?? 'Balanced')}</strong>
        </div>
        <div class="topbar-card">
          <span class="helper-text">Phase</span>
          <strong>${progression.phase === 'downtime' ? 'Downtime' : 'Active Scene'}</strong>
        </div>
        <div class="topbar-card">
          <span class="helper-text">Session</span>
          <strong>${progression.sessionNumber}</strong>
        </div>
        <div class="topbar-card">
          <span class="helper-text">Willpower</span>
          <strong>${chronicle.character.currentWillpower}/${chronicle.character.willpower}</strong>
        </div>
      </div>
      <div class="play-topbar-actions">
        ${progression.downtimeReason ? `<span class="status-pill compact">${escapeHtml(progression.downtimeReason)}</span>` : ''}
        <button class="secondary-button" type="button" data-action="toggle-downtime">${progression.phase === 'downtime' ? 'Resume Scenes' : 'Enter Downtime'}</button>
      </div>
    `;
  }

  function bindPlayControls(chronicle) {
    ui.topbarControls.querySelector('[data-action="toggle-downtime"]')?.addEventListener('click', () => {
      if (isDowntimeActive(chronicle)) {
        const recovery = resumeScenesFromDowntime(chronicle);
        if (state.activePanel === 'downtime') {
          state.activePanel = null;
        }
        persist();
        const recoveryParts = [];
        if (recovery.willpowerRecovered > 0) {
          recoveryParts.push(`Temporary Willpower +${recovery.willpowerRecovered}`);
        }
        if (recovery.resourcesRecovered > 0) {
          recoveryParts.push(`temporary Resources +${recovery.resourcesRecovered}`);
        }
        setStatus(
          recoveryParts.length
            ? `Downtime ended. Session ${chronicle.progression.sessionNumber} is now active. ${recoveryParts.join('; ')}.`
            : `Downtime ended. Session ${chronicle.progression.sessionNumber} is now active.`,
        );
      } else {
        beginDowntime(chronicle, 'Player-entered downtime');
        state.activePanel = 'downtime';
        runtime.xpDraft = null;
        persist();
        setStatus('Downtime is now active. XP spending and long-form advancement actions are available.');
      }
      render();
    });
  }

  function renderMainContent(chronicle, city, selectedHooks) {
    const isPlay = state.activeView === 'play';
    
    // Show/hide sections based on view
    ui.stage.style.display = isPlay ? 'none' : 'block';
    ui.playShell.style.display = isPlay ? 'grid' : 'none';

    if (isPlay) {
      if (ui.regenerateButton) {
        ui.regenerateButton.disabled = !canRegenerateStorytellerResponse(chronicle);
      }
      syncComposerHeight();
      renderChat(chronicle.messages);
      return;
    }

    if (state.activeView === 'creation') {
      if (chronicle.character.created) {
        ui.stage.innerHTML = renderChronicleSessionsStage();
        bindChronicleSessionEvents(ui.stage);
      } else {
        ui.stage.innerHTML = renderCreationStage(chronicle);
        bindCreationEvents(ui.stage, chronicle);
      }
      return;
    }

    ui.stage.innerHTML = renderSettingsStage(chronicle, city, selectedHooks);
    bindSettingsEvents(ui.stage, chronicle);
  }

  function renderChronicleSessionsStage() {
    return `
      <div class="stage-card">
        <div class="stage-copy">
          <div class="brand-eyebrow">Sessions</div>
          <h2>Active Chronicles</h2>
          <p class="helper-text">Each chronicle keeps its own chat history, notes, NPC directory, and sheet state in this browser. Resume one here or start a new chronicle from the sidebar.</p>
        </div>

        <div class="chronicle-session-grid">
          ${state.chronicles
            .map((item) => {
                  const city = getChronicleCity(item);
              const lastMessage = item.messages.at(-1);
                  const status = !item.setupComplete ? 'Chronicle settings in progress' : !item.character.created ? 'Character draft in progress' : 'Ready to continue';
                  const actionLabel = !item.setupComplete ? 'Finish Settings' : !item.character.created ? 'Continue Creation' : 'Resume Chronicle';

              return `
                <article class="session-card ${item.id === state.activeChronicleId ? 'active' : ''}">
                  <div class="npc-header-row">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span class="meta-text">${escapeHtml(status)}</span>
                  </div>
                  <div class="meta-text">${escapeHtml(city?.name ?? 'Unknown domain')} · ${item.year} · ${escapeHtml(DIFFICULTY_MAP[item.difficulty]?.label ?? 'Balanced')}</div>
                  <div class="meta-text">Messages: ${item.messages.length} · NPCs: ${item.npcs.length}</div>
                  <div>${escapeHtml(lastMessage?.content?.slice(0, 180) || 'No chat yet.')}${lastMessage?.content?.length > 180 ? '…' : ''}</div>
                  <div class="session-actions">
                    <button class="secondary-button" type="button" data-session-open="${item.id}">${escapeHtml(actionLabel)}</button>
                  </div>
                </article>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  function renderCreationStage(chronicle) {
    const character = chronicle.character;
    ensureCharacterCreationState(character);
    const clanOptions = getClanSpecificOptions(character.clan);
    const validation = getCharacterCreationValidation(character);
    const creationBudget = getCharacterCreationBudget(character);
    const clanMeritTitle = character.clan === 'Caitiff' ? 'Clan-Exclusive Merits' : `${character.clan} Merits`;
    const clanFlawTitle = character.clan === 'Caitiff' ? 'Clan-Exclusive Flaws' : `${character.clan} Flaws`;
    const morality = getMoralityConfig(character.path);
    const phase = getCharacterCreationPhase(character);
    const currentStepId = getCharacterCreationUiStep(character);
    const currentStep = getCreationStep(currentStepId);
    return `
      <div class="stage-card creation-stage">
        <div class="stage-copy">
          <div class="brand-eyebrow">Page 2</div>
          <h2>Create Your Vampire</h2>
          <p class="helper-text">Build the vampire who belongs in this chronicle. After creation, only Name, Age as a Vampire, Sire, Pronouns, Ambition, and Desire stay freely editable. Other progression must be confirmed as an XP purchase. Backgrounds, items, and equipment become Storyteller-managed from play onward.</p>
          ${renderCreationStepTabs(currentStepId)}
        </div>

        <div class="creation-layout">
          <div class="creation-main">
            <div class="list-card creation-section-header">
              <div class="npc-header-row">
                <div>
                  <div class="brand-eyebrow">${escapeHtml(currentStep.label)}</div>
                  <h3>${escapeHtml(currentStep.title)}</h3>
                </div>
                <span class="status-pill">${escapeHtml(validation.statusLabel)}</span>
              </div>
              <p class="helper-text">${escapeHtml(currentStep.note)}</p>
            </div>

            ${renderCreationStepContent({
              character,
              validation,
              creationBudget,
              clanOptions,
              clanMeritTitle,
              clanFlawTitle,
              morality,
              phase,
              currentStepId,
            })}

            ${renderCreationFooter(character, validation)}
          </div>

          <aside class="creation-rail">
            ${renderCreationRail(character, validation, creationBudget, morality, currentStepId)}
          </aside>
        </div>
      </div>
    `;
  }

  function renderCreationStepTabs(currentStepId) {
    return `
      <div class="creation-step-strip">
        ${CREATION_UI_STEPS.map((step) => `
          <button class="step-tab ${step.id === currentStepId ? 'active' : ''}" type="button" data-action="goto-creation-step" data-step="${step.id}">
            <span>${escapeHtml(step.label)}</span>
            <small>${escapeHtml(step.title)}</small>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderCreationStepContent({ character, validation, creationBudget, clanOptions, clanMeritTitle, clanFlawTitle, morality, phase, currentStepId }) {
    if (currentStepId === 'identity') {
      return renderCreationIdentitySection(character, creationBudget, morality);
    }
    if (currentStepId === 'core') {
      return `
        ${phase === 'experience' ? renderReadOnlyStats(character) : renderNumericCards(character, false)}
        ${phase === 'experience' ? renderReadOnlyResources(character) : renderResourceCards(character, false)}
      `;
    }
    if (currentStepId === 'traits') {
      return `
        ${phase === 'experience' ? renderSimpleCreationTraitCard('Disciplines', character.disciplines, 'Disciplines are locked after the freebie phase and advance only through XP.') : renderDisciplineCard(character, false)}
        ${renderAdditionalDisciplineMeritCard(character, false)}
        ${phase === 'experience' ? renderSimpleCreationTraitCard('Backgrounds', character.backgrounds, 'Backgrounds are locked after the freebie phase and advance only through play or Storyteller updates.') : renderBackgroundCard(character, false)}
        ${phase === 'allocation' ? renderCreationLockedCard('Freebie Purchases', 'Merits, flaws, and above-baseline increases unlock after you confirm the allocation phase.') : phase === 'experience' ? renderPointSummaryCard('Merits', character.merits, 'Creation-only merits confirmed during the freebie phase.') : renderPointTraitCard('merit', 'Merits', character.merits, meritsFlawsData.merits)}
        ${phase === 'allocation' ? '' : phase === 'experience' ? renderPointSummaryCard('Flaws', character.flaws, 'Creation-only flaws confirmed during the freebie phase.') : renderPointTraitCard('flaw', 'Flaws', character.flaws, meritsFlawsData.flaws)}
        ${phase === 'allocation' ? '' : phase === 'experience' ? renderPointSummaryCard(clanMeritTitle, character.clanMerits, 'Clan-specific merits confirmed during the freebie phase.') : renderPointTraitCard('clan-merit', clanMeritTitle, character.clanMerits, clanOptions.merits)}
        ${phase === 'allocation' ? '' : phase === 'experience' ? renderPointSummaryCard(clanFlawTitle, character.clanFlaws, 'Clan-specific flaws confirmed during the freebie phase.') : renderPointTraitCard('clan-flaw', clanFlawTitle, character.clanFlaws, clanOptions.flaws)}
      `;
    }
    if (currentStepId === 'finishing') {
      return `
        ${renderSpecialtyCard(character, false)}
        ${renderInventoryCard('equipment', 'Equipment', character.equipment, false)}
        ${renderInventoryCard('items', 'Items', character.items, false)}
        ${phase === 'experience' ? renderCreationExperienceCard(character) : renderCreationLockedCard('Starting Experience', 'Starting XP unlocks only after you confirm the freebie phase.')}
      `;
    }

    return renderCreationReviewSection(character, validation, morality);
  }

  function renderCreationIdentitySection(character, creationBudget, morality) {
    return `
      ${renderReadyCharacterTemplates()}

      <div class="list-card">
        ${renderCardHeading('Identity', 'ageCategory')}
        <div class="form-grid">
          <div class="inline-grid three">
            <label>${renderFieldLabel('Name')}<input data-field="name" value="${escapeHtml(character.name)}" /></label>
            <label>${renderFieldLabel('Concept')}<input data-field="concept" value="${escapeHtml(character.concept)}" /></label>
            <label>${renderFieldLabel('Clan')} ${renderSelect('clan', clansData.map((item) => item.name), character.clan)}</label>
          </div>
          <div class="inline-grid three">
            <label>${renderFieldLabel('Nature')} ${renderSelect('nature', natureDemeanorData.natures.map((item) => item.name), character.nature)}</label>
            <label>${renderFieldLabel('Demeanor')} ${renderSelect('demeanor', natureDemeanorData.demeanors.map((item) => item.name), character.demeanor)}</label>
            ${renderLockedCard('Generation', formatGenerationLabel(character.generation), 'generation', `Driven by ${creationBudget.generation.backgroundDots} dot${creationBudget.generation.backgroundDots === 1 ? '' : 's'} in the Generation Background.`)}
          </div>
          <div class="inline-grid two">
            <label>${renderFieldLabel('Morality')} ${renderSelect('path', pathsData.map((item) => item.name), character.path)}</label>
            ${renderLockedCard('Virtue Pattern', `${morality.primaryLabel} / ${morality.secondaryLabel} / Courage`, 'virtues')}
          </div>
          <div class="inline-grid three">
            <label>${renderFieldLabel('Age as a Vampire')}<input type="number" min="0" max="1000" data-field="age" value="${character.age}" /></label>
            <label>${renderFieldLabel('Age Category', 'ageCategory')} ${renderSelect('ageCategory', AGE_CATEGORY_OPTIONS, character.ageCategory)}</label>
            ${renderLockedCard('Why NPCs Care', 'Fledgling, Neonate, or Ancilla', 'ageCategory', 'This helps the Storyteller frame status, etiquette, and how elders react to the PC.')}
          </div>
        </div>
      </div>

      <div class="list-card">
        ${renderCardHeading('Story Presence', 'physicalDescription')}
        <div class="form-grid">
          <div class="inline-grid two">
            <label>${renderFieldLabel('Sire')}<input data-field="sire" value="${escapeHtml(character.sire)}" /></label>
            <label>${renderFieldLabel('Pronouns')}<input data-field="pronouns" value="${escapeHtml(character.pronouns)}" /></label>
          </div>
          <label>${renderFieldLabel('Physical Description', 'physicalDescription')}
            <textarea rows="4" data-field="physicalDescription" placeholder="Describe the PC's appearance, style, posture, voice, and any details NPCs would notice at a glance.">${escapeHtml(character.physicalDescription || '')}</textarea>
          </label>
          <div class="inline-grid two">
            <label>${renderFieldLabel('Ambition', 'ambition')}<input data-field="ambition" value="${escapeHtml(character.ambition)}" /></label>
            <label>${renderFieldLabel('Desire', 'desire')}<input data-field="desire" value="${escapeHtml(character.desire)}" /></label>
          </div>
          <label>
            ${renderFieldLabel('Backstory')}
            <textarea rows="7" data-field="backstory">${escapeHtml(character.backstory)}</textarea>
          </label>
        </div>
      </div>
    `;
  }

  function renderCreationReviewSection(character, validation, morality) {
    return `
      <div class="list-card">
        ${renderCardHeading('Launch Review')}
        <p class="helper-text">Use this final pass to check identity, core numbers, and locked-in traits before beginning the chronicle.</p>
        <div class="locked-grid">
          ${renderLockedCard('Name', character.name || 'Unnamed')}
          ${renderLockedCard('Clan', character.clan)}
          ${renderLockedCard('Nature / Demeanor', `${character.nature} / ${character.demeanor}`)}
          ${renderLockedCard(morality.ratingLabel, character.humanity, 'humanity')}
          ${renderLockedCard('Willpower', `${character.currentWillpower}/${character.willpower}`, 'willpower')}
          ${renderLockedCard('Blood Pool', `${character.currentBloodPool}/${character.bloodPool}`, 'bloodPool')}
        </div>
      </div>
      ${renderReadOnlyStats(character)}
      <div class="inline-grid two">
        <div class="list-card">
          ${renderCardHeading('Backgrounds', 'backgrounds')}
          ${renderSimpleList(character.backgrounds, 'Storyteller updates backgrounds through play once creation is complete.')}
        </div>
        <div class="list-card">
          ${renderCardHeading('Equipment')}
          ${renderSimpleInventory(character.equipment, 'Equipment and items become Storyteller-managed once the chronicle begins.')}
        </div>
      </div>
      <div class="inline-grid two">
        <div class="list-card">
          ${renderCardHeading('Merits', 'merits')}
          ${renderPointSummary(character.merits, 'Creation-only advantages confirmed during build.')}
        </div>
        <div class="list-card">
          ${renderCardHeading('Flaws', 'flaws')}
          ${renderPointSummary(character.flaws, 'Creation-only drawbacks confirmed during build.')}
        </div>
      </div>
      ${validation.issues.length ? `<p class="footer-note">Outstanding issue: ${escapeHtml(validation.issues[0])}</p>` : '<p class="footer-note">The sheet currently satisfies the active creation rules phase.</p>'}
    `;
  }

  function renderCreationRail(character, validation, budget, morality, currentStepId) {
    const currentStep = getCreationStep(currentStepId);
    return `
      <div class="creation-rail-stack">
        <div class="list-card compact-panel">
          ${renderCardHeading('Current Step')}
          <div class="meta-text">${escapeHtml(currentStep.label)}</div>
          <strong>${escapeHtml(currentStep.title)}</strong>
          <div class="helper-text">${escapeHtml(currentStep.note)}</div>
        </div>
        ${renderCreationPhaseTracker(validation, budget)}
        ${renderCreationValidation(validation)}
        ${renderCreationBudget(budget, morality)}
        <div class="list-card compact-panel">
          ${renderCardHeading('Quick Sheet Summary')}
          ${renderReadonlyFieldSummary('Generation', formatGenerationLabel(character.generation), 'generation')}
          ${renderReadonlyFieldSummary('Blood Pool', `${character.currentBloodPool}/${character.bloodPool}`, 'bloodPool')}
          ${renderReadonlyFieldSummary('Current Willpower', `${character.currentWillpower}/${character.willpower}`, 'currentWillpower')}
          ${renderReadonlyFieldSummary('Temporary Resources', `${character.currentResources}/${getBackgroundDotsByName(character, 'Resources')}`, 'temporaryResources')}
        </div>
      </div>
    `;
  }

  function renderCreationFooter(character, validation) {
    if (state.activePanel) {
      return '';
    }

    const currentIndex = getCharacterCreationUiStepIndex(character);
    const previousStep = CREATION_UI_STEPS[currentIndex - 1];
    const nextStep = CREATION_UI_STEPS[currentIndex + 1];
    const phase = getCharacterCreationPhase(character);
    const phaseAction =
      phase === 'allocation'
        ? `<button class="primary" type="button" data-action="confirm-allocation">Confirm Allocation Phase</button>`
        : phase === 'freebies'
          ? `<button class="primary" type="button" data-action="confirm-freebies" ${validation.valid ? '' : 'disabled'}>Confirm Freebie Phase</button>`
          : `<button class="primary" type="button" data-action="finalize-character" ${validation.valid ? '' : 'disabled'}>Finalize Character And Begin Chronicle</button>`;

    return `
      <div class="creation-footer-bar">
        <div class="stage-actions">
          ${previousStep ? `<button class="secondary-button" type="button" data-action="prev-creation-step">Back</button>` : ''}
          ${nextStep ? `<button class="secondary-button" type="button" data-action="next-creation-step">Next</button>` : ''}
        </div>
        <div class="creation-phase-action">
          ${phaseAction}
        </div>
      </div>
    `;
  }

  function renderSettingsStage(chronicle, city, selectedHooks) {
    const pack = getChroniclePack(chronicle.cityId);
    const leadMainPlot = pack.mainPlots[0];
    const leadSubplot = pack.subplots[0];
    return `
      <div class="stage-card">
        <div class="stage-copy">
          <div class="brand-eyebrow">Page 1</div>
          <h2>Select The Chronicle</h2>
          <p class="helper-text">Choose the chronicle foundation first. This decides whether the Storyteller uses a V5 book's metaplot or builds an original city on V5 foundations before character creation starts.</p>
        </div>

        <div class="settings-layout">
          <section class="list-card">
            <h3>Prepared Chronicles</h3>
            <div class="chronicle-stack">
              ${state.chronicles
                .map((item) => {
                  const itemCity = getChronicleCity(item);
                  return `
                    <button class="chronicle-card ${item.id === state.activeChronicleId ? 'active' : ''}" type="button" data-select-chronicle="${item.id}">
                      <strong>${escapeHtml(item.title)}</strong>
                      <span class="helper-text">${escapeHtml(itemCity.name)} · ${item.year} · ${escapeHtml(DIFFICULTY_MAP[item.difficulty]?.label ?? 'Balanced')}</span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </section>

          <section class="form-grid">
            <div class="inline-grid three">
              <label>
                <span class="helper-text">Chronicle Foundation</span>
                <select data-setting="cityId">${cities
                  .map((item) => `<option value="${item.id}" ${item.id === chronicle.cityId ? 'selected' : ''}>${escapeHtml(item.chronicleBook || item.name)} · ${escapeHtml(item.name)}</option>`)
                  .join('')}</select>
              </label>
              <div class="locked-card">
                <span class="helper-text">Year</span>
                <strong>${chronicle.year}</strong>
              </div>
              <label>
                <span class="helper-text">Difficulty</span>
                <select data-setting="difficulty">${DIFFICULTY_LEVELS.map(
                  (item) => `<option value="${item.id}" ${item.id === chronicle.difficulty ? 'selected' : ''}>${escapeHtml(item.label)}</option>`,
                ).join('')}</select>
              </label>
            </div>

            ${city.id === 'custom-us-city' ? `
              <div class="inline-grid two">
                <label>
                  <span class="helper-text">Custom City</span>
                  <input data-setting="customCityName" value="${escapeHtml(chronicle.customCityName || '')}" placeholder="Los Angeles, New Orleans, Houston..." />
                </label>
                <div class="locked-card">
                  <span class="helper-text">Chronicle Mode</span>
                  <strong>Original V5 Foundation</strong>
                  <div class="meta-text">The Storyteller will create the main plot, factions, NPCs, and political landscape.</div>
                </div>
              </div>
            ` : ''}

            <label>
              <span class="helper-text">Storyteller Brief</span>
              <textarea rows="4" data-setting="storytellerBrief" placeholder="Optional direction for the Storyteller: themes, factions, desired tone, or a starting premise.">${escapeHtml(chronicle.storytellerBrief || '')}</textarea>
            </label>

            <div class="city-card">
              <h4>${escapeHtml(city.name)}</h4>
              <div class="meta-text">Chronicle Source: ${escapeHtml(city.chronicleBook || city.name)}</div>
              <div class="meta-text">Metaplot: ${escapeHtml(city.metaplotSource || city.source || 'Chronicle foundation')}</div>
              <div class="helper-text">${escapeHtml(city.summary)}</div>
              <div class="meta-text">Power Map: ${escapeHtml(city.powerMap)}</div>
              <div class="meta-text">Threats: ${escapeHtml(city.activeThreats.join(', '))}</div>
              ${Array.isArray(city.supportingBooks) && city.supportingBooks.length ? `<div class="meta-text">Supporting books: ${escapeHtml(city.supportingBooks.join(', '))}</div>` : ''}
              ${city.storytellerDirective ? `<div class="meta-text">Storyteller directive: ${escapeHtml(city.storytellerDirective)}</div>` : ''}
              ${city.npcConversionGuidance ? `<div class="meta-text">NPC conversion: ${escapeHtml(city.npcConversionGuidance)}</div>` : ''}
              <div class="meta-text">Difficulty mood: ${escapeHtml(DIFFICULTY_MAP[chronicle.difficulty]?.prompt ?? '')}</div>
            </div>

            <div class="list-card">
              <h4>Curated Chronicle Spine</h4>
              <div class="summary-list">
                <div><strong>Main plot:</strong> ${escapeHtml(leadMainPlot?.title ?? 'Unassigned')}</div>
                <div>${escapeHtml(leadMainPlot?.summary ?? 'No city-specific main plot is loaded yet.')}</div>
                <div><strong>Subplot pressure:</strong> ${escapeHtml(leadSubplot?.title ?? selectedHooks[0]?.title ?? 'Unassigned')}</div>
                <div>${escapeHtml(leadSubplot?.summary ?? selectedHooks[0]?.summary ?? 'The Storyteller will choose subplot pressure as the chronicle develops.')}</div>
              </div>
              <p class="footer-note">Players do not choose hooks directly. The Storyteller uses these curated city pressures as the chronicle backbone.</p>
            </div>

            <div class="list-card">
              <h4>NPC Seed Pack</h4>
              <div class="summary-list">
                ${pack.npcSeeds.map((seed) => `<div><strong>${escapeHtml(seed.name)}</strong> · ${escapeHtml(seed.clan)} · ${escapeHtml(seed.role)}<br />${escapeHtml(seed.summary)}</div>`).join('')}
              </div>
              <p class="footer-note">These seeds are Storyteller-side reference material. They do not appear in the player-facing NPC directory until revealed in play.</p>
            </div>

            <div class="stage-actions split">
              <button class="secondary-button" type="button" data-action="save-settings">Save Chronicle Setup</button>
              <button class="primary" type="button" data-action="enter-chronicle">${chronicle.character.created ? 'Enter Chronicle' : 'Continue To Character Creation'}</button>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderOverlay(chronicle, city, selectedHooks) {
    ui.overlayHost.innerHTML = '';
    if (!state.activePanel) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'overlay-backdrop';
    overlay.innerHTML = `
      <div class="overlay-window">
        <button class="overlay-close" type="button" data-action="close-overlay">Close</button>
        ${
          state.activePanel === 'notes'
            ? renderNotesOverlay(chronicle, city, selectedHooks)
            : state.activePanel === 'sheet'
              ? renderSheetOverlay(chronicle)
              : state.activePanel === 'npcs'
                ? renderNpcOverlay(chronicle)
                : state.activePanel === 'downtime'
                  ? renderDowntimeOverlay(chronicle)
                : renderXpOverlay(chronicle)
        }
      </div>
    `;

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeOverlay();
      }
    });
    overlay.querySelector('[data-action="close-overlay"]').addEventListener('click', closeOverlay);

    ui.overlayHost.appendChild(overlay);

    if (state.activePanel === 'notes') {
      bindNotesEvents(overlay, chronicle);
    } else if (state.activePanel === 'sheet') {
      bindSheetEvents(overlay, chronicle);
    } else if (state.activePanel === 'npcs') {
      return;
    } else if (state.activePanel === 'downtime') {
      bindDowntimeEvents(overlay, chronicle);
    } else if (state.activePanel === 'xp') {
      bindXpEvents(overlay, chronicle);
    }
  }

  function renderNotesOverlay(chronicle, city, selectedHooks) {
    const campaignMemory = chronicle.campaignMemory || getDefaultCampaignMemoryState();
    return `
      <div class="drawer-card overlay-card">
        <h2>Chronicle Notes</h2>
        <p class="helper-text">Keep personal notes, plot threads, and AI-maintained recurring cast material outside the main chat column.</p>
        <label>
          <span class="helper-text">Chronicle Summary</span>
          <textarea rows="8" data-role="chronicle-summary">${escapeHtml(chronicle.summary || '')}</textarea>
        </label>
        <div class="inline-actions">
          <button class="secondary-button" type="button" data-action="summarize-chronicle">Generate Storyteller Memory</button>
        </div>
        <div class="inline-grid two">
          <label>
            <span class="helper-text">Established Facts</span>
            <textarea rows="6" data-role="memory-established-facts">${escapeHtml(campaignMemory.establishedFacts || '')}</textarea>
          </label>
          <label>
            <span class="helper-text">Unresolved Threads</span>
            <textarea rows="6" data-role="memory-unresolved-threads">${escapeHtml(campaignMemory.unresolvedThreads || '')}</textarea>
          </label>
        </div>
        <div class="inline-grid two">
          <label>
            <span class="helper-text">Faction Positions</span>
            <textarea rows="6" data-role="memory-faction-positions">${escapeHtml(campaignMemory.factionPositions || '')}</textarea>
          </label>
          <label>
            <span class="helper-text">Boons And Debts</span>
            <textarea rows="6" data-role="memory-boons-and-debts">${escapeHtml(campaignMemory.boonsAndDebts || '')}</textarea>
          </label>
        </div>
        <div class="inline-grid two">
          <label>
            <span class="helper-text">Relationship Shifts</span>
            <textarea rows="6" data-role="memory-relationship-shifts">${escapeHtml(campaignMemory.relationshipShifts || '')}</textarea>
          </label>
          <label>
            <span class="helper-text">Timeline</span>
            <textarea rows="6" data-role="memory-timeline">${escapeHtml(campaignMemory.timeline || '')}</textarea>
          </label>
        </div>
        <label>
          <span class="helper-text">Session Notes</span>
          <textarea rows="8" data-role="chronicle-notes">${escapeHtml(chronicle.notes)}</textarea>
        </label>
        <label>
          <span class="helper-text">Plot Points</span>
          <textarea rows="6" data-role="plot-points">${escapeHtml(chronicle.plotPoints || '')}</textarea>
        </label>
        <div class="city-card">
          <h4>${escapeHtml(city.name)}</h4>
          <div class="helper-text">${escapeHtml(city.summary)}</div>
          <div class="meta-text">Hook: ${escapeHtml(selectedHooks[0]?.title ?? 'None')}</div>
        </div>
        <div class="list-card">
          <h4>Tracked NPCs</h4>
          <div class="npc-list">
            ${chronicle.npcs.length ? chronicle.npcs.map(renderNpcSummary).join('') : '<p class="helper-text">No recurring NPC files or cards yet.</p>'}
          </div>
        </div>
      </div>
    `;
  }

  function renderSheetOverlay(chronicle) {
    const character = chronicle.character;
    const xpSpendAllowed = canSpendExperience(chronicle);
    const lockedFields = [
      ['Concept', character.concept || 'Unwritten'],
      ['Clan', character.clan],
      ['Nature', character.nature],
      ['Demeanor', character.demeanor],
      ['Age Category', character.ageCategory || 'Unwritten'],
      ['Generation', character.generation],
      ['Physical Description', character.physicalDescription || 'No physical description recorded.'],
      ['Backstory', character.backstory || 'No backstory recorded.'],
    ];

    return `
      <div class="drawer-card overlay-card">
        <h2>Character Sheet</h2>
        <p class="helper-text">Only identity and motivation details stay editable here. All other progression must be confirmed through a one-way XP purchase. Backgrounds, equipment, and items are Storyteller-managed once play begins.</p>

        <div class="inline-grid three sheet-summary-strip">
          ${renderLockedCard('Clan', character.clan)}
          ${renderLockedCard('Generation', formatGenerationLabel(character.generation), 'generation')}
          ${renderLockedCard('Current Willpower', `${character.currentWillpower}/${character.willpower}`, 'currentWillpower')}
        </div>

        <div class="list-card">
          ${renderCardHeading('Editable Identity')}
          <div class="inline-grid three">
            ${ALWAYS_EDITABLE_FIELDS.map((field) => {
              const label = startCase(field);
              const type = field === 'age' ? 'number' : 'text';
              const helpKey = field === 'age' ? 'ageCategory' : field.toLowerCase();
              return `<label>${renderFieldLabel(label, helpKey)}<input type="${type}" data-sheet-field="${field}" value="${escapeHtml(character[field])}" /></label>`;
            }).join('')}
          </div>
        </div>

        <div class="list-card">
          ${renderCardHeading('Locked After Creation')}
          <div class="locked-grid">
            ${lockedFields.map(([label, value]) => renderLockedCard(label, value, label === 'Generation' ? 'generation' : label === 'Age Category' ? 'ageCategory' : label === 'Physical Description' ? 'physicalDescription' : '')).join('')}
          </div>
        </div>

        <div class="list-card">
          ${renderCardHeading('Core Sheet')}
          ${renderReadOnlyStats(character)}
        </div>

        <div class="inline-grid two">
          <div class="list-card">
            ${renderCardHeading('Backgrounds', 'backgrounds')}
            ${renderSimpleList(character.backgrounds, 'Background dots can only change through roleplay and Storyteller updates.')}
          </div>
          <div class="list-card">
            ${renderCardHeading('Experience')}
            <div class="locked-card compact">${renderFieldLabel('Unspent XP')}<strong>${character.experience.unspent}</strong></div>
            <div class="meta-text">Spent XP: ${character.experience.spent}</div>
            <div class="meta-text">Confirmed purchases cannot be refunded.</div>
            <div class="meta-text">${escapeHtml(xpSpendAllowed ? 'XP spending is currently available.' : getXpGateMessage(chronicle))}</div>
            <button class="primary" type="button" data-action="open-xp" ${xpSpendAllowed ? '' : 'disabled'}>Spend Experience</button>
          </div>
        </div>

        <div class="list-card">
          ${renderCardHeading('Temporary Willpower', 'currentWillpower')}
          <div class="locked-card compact">${renderFieldLabel('Current / Max', 'currentWillpower')}<strong>${character.currentWillpower}/${character.willpower}</strong></div>
          <div class="meta-text">Restore 1 after downtime ends. The Storyteller may also restore 1 for strong Nature or Demeanor roleplay.</div>
          <div class="inline-actions">
            <button class="secondary-button" type="button" data-action="spend-temp-willpower" ${character.currentWillpower > 0 ? '' : 'disabled'}>Spend 1</button>
            <button class="secondary-button" type="button" data-action="recover-temp-willpower" ${character.currentWillpower < character.willpower ? '' : 'disabled'}>Recover 1</button>
          </div>
        </div>

        <div class="list-card">
          ${renderCardHeading('Storyteller-Managed Temporary State')}
          <div class="locked-grid">
            ${renderLockedCard('Blood Pool', `${character.currentBloodPool}/${character.bloodPool}`, 'bloodPool')}
            ${renderLockedCard('Health Status', character.health[character.currentHealthLevel] || 'Healthy', 'health')}
            ${renderLockedCard('Temporary Resources', `${character.currentResources}/${getBackgroundDotsByName(character, 'Resources')}`, 'temporaryResources')}
          </div>
          <div class="meta-text">Only the Storyteller updates current blood points, temporary Resources, health status, and hidden temporary effect tracking.</div>
        </div>

        <div class="inline-grid two">
          <div class="list-card">
            ${renderCardHeading('Merits', 'merits')}
            ${renderPointSummary(character.merits, 'Creation-only advantages chosen during character build.')}
          </div>
          <div class="list-card">
            ${renderCardHeading('Flaws', 'flaws')}
            ${renderPointSummary(character.flaws, 'Creation-only drawbacks chosen during character build.')}
          </div>
        </div>

        <div class="inline-grid two">
          <div class="list-card">
            ${renderCardHeading(`${character.clan} Merits`, 'merits')}
            ${renderPointSummary(character.clanMerits, 'Curated clan-appropriate options chosen during character build.')}
          </div>
          <div class="list-card">
            ${renderCardHeading(`${character.clan} Flaws`, 'flaws')}
            ${renderPointSummary(character.clanFlaws, 'Curated clan-appropriate drawbacks chosen during character build.')}
          </div>
        </div>

        ${renderAdditionalDisciplineMeritCard(character, true)}

        <div class="inline-grid two">
          <div class="list-card">
            ${renderCardHeading('Equipment')}
            ${renderSimpleInventory(character.equipment, 'Equipment changes come from scenes or Storyteller updates.')}
          </div>
          <div class="list-card">
            ${renderCardHeading('Items')}
            ${renderSimpleInventory(character.items, 'Inventory changes come from play, not direct edits.')}
          </div>
        </div>

        <div class="list-card">
          ${renderCardHeading('Confirmed XP Log')}
          <div class="xp-log">${renderXpLog(character.experience.log)}</div>
        </div>
      </div>
    `;
  }

  function renderNpcOverlay(chronicle) {
    return `
      <div class="drawer-card overlay-card">
        <h2>NPC Directory</h2>
        <p class="helper-text">Only discovered information appears here. NPC character sheets remain hidden to preserve uncertainty and intrigue.</p>
        <div class="npc-directory-grid">
          ${chronicle.npcs.length ? chronicle.npcs.map(renderNpcDossier).join('') : '<p class="helper-text">No NPC dossiers recorded yet. As the Storyteller reveals information, this directory will fill in.</p>'}
        </div>
      </div>
    `;
  }

  function renderDowntimeOverlay(chronicle) {
    const progression = ensureChronicleProgressionState(chronicle);
    const downtimeActive = progression.phase === 'downtime';
    const xpSpendAllowed = canSpendExperience(chronicle);
    return `
      <div class="drawer-card overlay-card">
        <h2>Downtime</h2>
        <p class="helper-text">Downtime covers training, long-form projects, feeding routines, influence work, and XP spending between active scene runs.</p>

        <div class="inline-grid three">
          <div class="locked-card compact"><span class="helper-text">Current Phase</span><strong>${downtimeActive ? 'Downtime' : 'Active Scene'}</strong></div>
          <div class="locked-card compact"><span class="helper-text">Session</span><strong>${progression.sessionNumber}</strong></div>
          <div class="locked-card compact"><span class="helper-text">Unspent XP</span><strong>${chronicle.character.experience.unspent}</strong></div>
        </div>

        <div class="list-card">
          <h4>Downtime Summary</h4>
          <div class="summary-list">
            <div><strong>Status:</strong> ${downtimeActive ? 'The chronicle is currently in downtime.' : 'The chronicle is currently in active scene play.'}</div>
            <div><strong>Reason:</strong> ${escapeHtml(progression.downtimeReason || (downtimeActive ? 'No specific reason recorded.' : 'No downtime is active.'))}</div>
            <div><strong>XP Spending:</strong> ${escapeHtml(xpSpendAllowed ? 'Available now.' : getXpGateMessage(chronicle))}</div>
          </div>
        </div>

        <div class="inline-grid two">
          <div class="list-card">
            <h4>Session Reward Caps</h4>
            <div class="summary-list">
              <div><strong>Desire Progress XP:</strong> ${progression.rewardCaps.desireGranted ? 'Already granted this session' : 'Still available this session'}</div>
              <div><strong>Ambition Progress XP:</strong> ${progression.rewardCaps.ambitionGranted ? 'Already granted this session' : 'Still available this session'}</div>
            </div>
          </div>
          <div class="list-card">
            <h4>Suggested Downtime Uses</h4>
            <div class="summary-list">
              <div>Spend XP on growth already earned in play.</div>
              <div>Handle feeding, recovery, travel, and quiet cover-up work.</div>
              <div>Work contacts, influence, boons, research, or haven projects.</div>
              <div>Ask the Storyteller for a time skip if the fiction is ready for one.</div>
            </div>
          </div>
        </div>

        <div class="stage-actions split">
          <button class="secondary-button" type="button" data-action="toggle-downtime-panel">${downtimeActive ? 'Resume Scenes' : 'Enter Downtime'}</button>
          <button class="primary" type="button" data-action="open-downtime-xp" ${xpSpendAllowed ? '' : 'disabled'}>Spend Experience</button>
        </div>
      </div>
    `;
  }

  function renderXpOverlay(chronicle) {
    if (!canSpendExperience(chronicle)) {
      return `
        <div class="drawer-card overlay-card">
          <h2>Spend Experience</h2>
          <p class="helper-text">${escapeHtml(getXpGateMessage(chronicle))}</p>
        </div>
      `;
    }

    const draft = runtime.xpDraft;
    if (!draft) {
      return `
        <div class="drawer-card overlay-card">
          <h2>Spend Experience</h2>
          <p class="helper-text">No XP draft is active. Reopen the panel from the character sheet.</p>
        </div>
      `;
    }

    const purchase = getXpPurchasePreview(chronicle.character, draft);
    const morality = getMoralityConfig(chronicle.character.path);

    return `
      <div class="drawer-card overlay-card">
        <h2>Spend Experience</h2>
        <p class="helper-text">Use the V20 advancement table to buy one change at a time. The cost is calculated automatically and confirmed purchases cannot be refunded.</p>

        <div class="inline-grid three">
          <label>
            <span class="helper-text">Category</span>
            <select data-xp-meta="category">
              ${renderOptions(
                [
                  { value: 'attribute', label: 'Attribute' },
                  { value: 'ability', label: 'Ability' },
                  { value: 'discipline', label: 'Discipline' },
                  { value: 'virtue', label: 'Virtue' },
                  { value: 'humanity', label: morality.ratingLabel },
                  { value: 'willpower', label: 'Willpower' },
                ],
                draft.category,
              )}
            </select>
          </label>
          <label>
            <span class="helper-text">Target</span>
            <select data-xp-meta="target">
              ${renderOptions(getXpTargetOptions(chronicle.character, draft.category), draft.target)}
            </select>
          </label>
          <label>
            <span class="helper-text">Reason</span>
            <input data-xp-meta="reason" value="${escapeHtml(draft.reason || '')}" placeholder="What changed in the story?" />
          </label>
        </div>

        <div class="xp-preview-card ${purchase.valid ? '' : 'invalid'}">
          <div class="inline-grid three">
            <div class="locked-card"><span class="helper-text">Current Rating</span><strong>${purchase.currentRatingText}</strong></div>
            <div class="locked-card"><span class="helper-text">New Rating</span><strong>${purchase.newRatingText}</strong></div>
            <div class="locked-card"><span class="helper-text">XP Cost</span><strong>${purchase.valid ? purchase.cost : 'Unavailable'}</strong></div>
          </div>
          <div class="meta-text">Formula: ${escapeHtml(purchase.formula)}</div>
          <div class="meta-text">${escapeHtml(purchase.summary)}</div>
          <div class="meta-text">Unspent XP: ${chronicle.character.experience.unspent}</div>
          ${purchase.note ? `<div class="footer-note">${escapeHtml(purchase.note)}</div>` : ''}
        </div>

        <div class="list-card">
          <h4>V20 Reference</h4>
          <div class="summary-list">
            <div>New Ability: 3 XP</div>
            <div>Ability: current rating x 2</div>
            <div>Attribute: current rating x 4</div>
            <div>New Discipline: 10 XP</div>
            <div>Clan Discipline: current rating x 5</div>
            <div>Other Discipline: current rating x 7</div>
            <div>Virtue: current rating x 2</div>
            <div>${escapeHtml(morality.ratingLabel)}: current rating x 2</div>
            <div>Willpower: current rating</div>
          </div>
        </div>

        <div class="stage-actions split">
          <button class="secondary-button" type="button" data-action="cancel-xp">Cancel</button>
          <button class="primary" type="button" data-action="confirm-xp" ${purchase.valid ? '' : 'disabled'}>Confirm Purchase</button>
        </div>
      </div>
    `;
  }

  function bindCreationEvents(container, chronicle) {
    ensureCharacterCreationState(chronicle.character);
    bindSharedCharacterInputs(container, chronicle.character);
    bindAdditionalDisciplineMeritSelector(container, chronicle.character, persist, render);
    bindTraitList(container, chronicle.character, 'discipline', disciplinesData.map((item) => item.name));
    bindTraitList(container, chronicle.character, 'background', backgroundsData.map((item) => item.name));
    bindPointTraitList(container, chronicle.character, 'merit');
    bindPointTraitList(container, chronicle.character, 'flaw');
    bindPointTraitList(container, chronicle.character, 'clan-merit');
    bindPointTraitList(container, chronicle.character, 'clan-flaw');
    bindSpecialties(container, chronicle.character, false);
    bindInventory(container, chronicle.character, 'equipment');
    bindInventory(container, chronicle.character, 'items');

    container.querySelectorAll('[data-action="apply-ready-template"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const templateId = button.getAttribute('data-template-id') || '';
        const template = READY_CHARACTER_TEMPLATES.find((item) => item.id === templateId);
        if (!template) {
          setStatus('That template could not be loaded.', true);
          return;
        }

        const confirmed = window.confirm(`Replace the unfinished sheet with the ready-to-play template "${template.label}"?`);
        if (!confirmed) {
          return;
        }

        const nextCharacter = createReadyCharacterFromTemplate(templateId);
        if (!nextCharacter) {
          setStatus('That template could not be created.', true);
          return;
        }

        chronicle.character = nextCharacter;
        state.activePanel = null;
        runtime.xpDraft = null;
        markCharacterSummaryDirty(chronicle);
        updateChronicleTitle(chronicle);
        persist();

        if (chronicle.setupComplete) {
          state.activeView = 'play';
          render();
          setStatus(`${template.label} loaded. The chronicle is ready to play.`);
          if (!chronicle.openingSceneDelivered) {
            await startOpeningScene(chronicle);
          }
          return;
        }

        state.activeView = 'settings';
        render();
        setStatus(`${template.label} loaded. Chronicle settings are next before the night begins.`);
      });
    });

    container.querySelectorAll('[data-action="goto-creation-step"]').forEach((button) => {
      button.addEventListener('click', () => {
        setCharacterCreationUiStep(chronicle.character, button.getAttribute('data-step') || 'identity');
        persist();
        render();
      });
    });

    container.querySelector('[data-action="prev-creation-step"]')?.addEventListener('click', () => {
      const currentIndex = getCharacterCreationUiStepIndex(chronicle.character);
      const previousStep = CREATION_UI_STEPS[Math.max(0, currentIndex - 1)];
      setCharacterCreationUiStep(chronicle.character, previousStep.id);
      persist();
      render();
    });

    container.querySelector('[data-action="next-creation-step"]')?.addEventListener('click', () => {
      const currentIndex = getCharacterCreationUiStepIndex(chronicle.character);
      const nextStep = CREATION_UI_STEPS[Math.min(CREATION_UI_STEPS.length - 1, currentIndex + 1)];
      setCharacterCreationUiStep(chronicle.character, nextStep.id);
      persist();
      render();
    });

    container.querySelector('[data-action="add-discipline"]')?.addEventListener('click', () => {
      chronicle.character.disciplines.push({ id: uid('discipline'), name: disciplinesData[0].name, dots: 1 });
      persist();
      render();
    });

    container.querySelector('[data-action="add-background"]')?.addEventListener('click', () => {
      chronicle.character.backgrounds.push({ id: uid('background'), name: backgroundsData[0].name, dots: 1 });
      syncCharacterDerivedStats(chronicle.character);
      persist();
      render();
    });

    container.querySelector('[data-action="add-merit"]')?.addEventListener('click', () => {
      const entry = meritsFlawsData.merits[0];
      chronicle.character.merits.push({ id: uid('merit'), name: entry.name, points: entry.points, details: entry.summary });
      persist();
      render();
    });

    container.querySelector('[data-action="add-flaw"]')?.addEventListener('click', () => {
      const entry = meritsFlawsData.flaws[0];
      chronicle.character.flaws.push({ id: uid('flaw'), name: entry.name, points: entry.points, details: entry.summary });
      persist();
      render();
    });

    container.querySelector('[data-action="add-clan-merit"]')?.addEventListener('click', () => {
      const entry = getClanSpecificOptions(chronicle.character.clan).merits[0];
      if (!entry) {
        setStatus('No clan-exclusive merits are available for this clan.', true);
        return;
      }
      chronicle.character.clanMerits.push({ id: uid('clan-merit'), name: entry.name, points: entry.points, details: entry.summary });
      persist();
      render();
    });

    container.querySelector('[data-action="add-clan-flaw"]')?.addEventListener('click', () => {
      const entry = getClanSpecificOptions(chronicle.character.clan).flaws[0];
      if (!entry) {
        setStatus('No clan-exclusive flaws are available for this clan.', true);
        return;
      }
      chronicle.character.clanFlaws.push({ id: uid('clan-flaw'), name: entry.name, points: entry.points, details: entry.summary });
      persist();
      render();
    });

    container.querySelector('[data-action="add-specialty"]')?.addEventListener('click', () => {
      chronicle.character.specialties.push({
        id: uid('specialty'),
        ability: specialtiesData[0].ability,
        name: specialtiesData[0].examples[0],
      });
      persist();
      render();
    });

    container.querySelector('[data-action="add-equipment"]')?.addEventListener('click', () => {
      chronicle.character.equipment.push({ id: uid('equipment'), name: '', details: '' });
      persist();
      render();
    });

    container.querySelector('[data-action="add-items"]')?.addEventListener('click', () => {
      chronicle.character.items.push({ id: uid('item'), name: '', details: '' });
      persist();
      render();
    });

    container.querySelector('[data-action="confirm-allocation"]')?.addEventListener('click', () => {
      ensureCharacterCreationState(chronicle.character);
      syncCharacterDerivedStats(chronicle.character);
      const validation = getCharacterCreationValidation(chronicle.character);
      debugLog('Attempted allocation phase confirmation', {
        chronicleId: chronicle.id,
        valid: validation.valid,
        issues: validation.issues,
        summary: validation.summary,
      });
      if (!validation.valid) {
        setStatus(validation.issues[0] || 'Finish the allocation phase before moving on.', true);
        render();
        return;
      }
      chronicle.character.creation.allocationSnapshot = captureCharacterCreationSnapshot(chronicle.character);
      chronicle.character.creation.phase = 'freebies';
      setCharacterCreationUiStep(chronicle.character, 'traits');
      persist();
      setStatus('Allocation phase confirmed. Freebie spending is now unlocked.');
      render();
    });

    container.querySelector('[data-action="confirm-freebies"]')?.addEventListener('click', () => {
      ensureCharacterCreationState(chronicle.character);
      syncCharacterDerivedStats(chronicle.character);
      const validation = getCharacterCreationValidation(chronicle.character);
      if (!validation.valid) {
        setStatus(validation.issues[0] || 'Finish the freebie phase before moving on.', true);
        render();
        return;
      }
      chronicle.character.creation.freebieSnapshot = captureCharacterCreationSnapshot(chronicle.character);
      chronicle.character.creation.phase = 'experience';
      chronicle.character.experience.unspent = Math.max(
        0,
        (Number(chronicle.character.creation.startingExperience) || 15) - (Number(chronicle.character.experience.spent) || 0),
      );
      runtime.xpDraft = getDefaultXpDraft(chronicle.character);
      state.activePanel = 'xp';
      setCharacterCreationUiStep(chronicle.character, 'finishing');
      persist();
      setStatus('Freebie phase confirmed. Starting experience is now available. Any unspent creation XP will be lost once the chronicle begins.');
      render();
    });

    container.querySelector('[data-action="open-creation-xp"]')?.addEventListener('click', () => {
      runtime.xpDraft = getDefaultXpDraft(chronicle.character);
      state.activePanel = 'xp';
      persist();
      render();
    });

    container.querySelector('[data-action="finalize-character"]')?.addEventListener('click', () => {
      syncCharacterDerivedStats(chronicle.character);
      const validation = getCharacterCreationValidation(chronicle.character);
      if (!chronicle.character.name.trim()) {
        setStatus('Give the vampire a name before leaving character creation.', true);
        return;
      }
      if (!validation.valid) {
        setStatus(validation.issues[0] || 'The character does not satisfy V20 creation rules yet.', true);
        render();
        return;
      }
      const discardedCreationXp = Math.max(0, Number(chronicle.character.experience.unspent) || 0);
      chronicle.character.created = true;
      markCharacterSummaryDirty(chronicle);
      chronicle.character.experience.unspent = 0;
      updateChronicleTitle(chronicle);
      state.activePanel = null;
      debugLog('Finalized character', {
        chronicleId: chronicle.id,
        name: chronicle.character.name,
        clan: chronicle.character.clan,
        path: chronicle.character.path,
        discardedCreationXp,
      });
      persist();
      if (chronicle.setupComplete) {
        state.activeView = 'play';
        setStatus(
          discardedCreationXp > 0
            ? `Character locked in. The chronicle is ready. ${discardedCreationXp} unspent creation XP was discarded.`
            : 'Character locked in. The chronicle is ready.',
        );
        render();
        if (!chronicle.openingSceneDelivered) {
          void startOpeningScene(chronicle);
        }
        return;
      }

      state.activeView = 'settings';
      setStatus(
        discardedCreationXp > 0
          ? `Character locked in. Chronicle settings are next. ${discardedCreationXp} unspent creation XP was discarded.`
          : 'Character locked in. Chronicle settings are next.',
      );
      render();
    });
  }

  function bindSettingsEvents(container, chronicle) {
    container.querySelectorAll('[data-select-chronicle]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeChronicleId = button.dataset.selectChronicle;
        persist();
        render();
      });
    });

    container.querySelector('[data-setting="cityId"]').addEventListener('change', (event) => {
      chronicle.cityId = event.target.value;
      chronicle.plotHookIds = getDefaultHookIdsForCity(chronicle.cityId);
      updateChronicleTitle(chronicle);
      persist();
      render();
    });

    container.querySelector('[data-setting="customCityName"]')?.addEventListener('input', (event) => {
      chronicle.customCityName = event.target.value;
      updateChronicleTitle(chronicle);
      persist();
      render();
    });

    container.querySelector('[data-setting="storytellerBrief"]')?.addEventListener('input', (event) => {
      chronicle.storytellerBrief = event.target.value;
      persist();
    });

    container.querySelector('[data-setting="difficulty"]').addEventListener('change', (event) => {
      chronicle.difficulty = event.target.value;
      debugLog('Changed difficulty', { chronicleId: chronicle.id, difficulty: chronicle.difficulty });
      persist();
      render();
    });

    container.querySelector('[data-action="save-settings"]').addEventListener('click', () => {
      chronicle.setupComplete = true;
      debugLog('Saved settings', { chronicleId: chronicle.id, cityId: chronicle.cityId, year: chronicle.year, difficulty: chronicle.difficulty });
      persist();
      setStatus(chronicle.character.created ? 'Chronicle settings saved.' : 'Chronicle settings saved. Character creation is next.');
      render();
    });

    container.querySelector('[data-action="enter-chronicle"]').addEventListener('click', async () => {
      chronicle.setupComplete = true;
      state.activeView = chronicle.character.created ? 'play' : 'creation';
      debugLog('Entered chronicle', { chronicleId: chronicle.id, title: chronicle.title });
      persist();
      setStatus(chronicle.character.created ? 'The chronicle is live. The night begins.' : 'Chronicle foundation confirmed. Character creation is next.');
      render();

      if (chronicle.character.created && !chronicle.openingSceneDelivered) {
        await startOpeningScene(chronicle);
      }
    });
  }

  function bindNotesEvents(container, chronicle) {
    if (!chronicle.campaignMemory) {
      chronicle.campaignMemory = getDefaultCampaignMemoryState();
    }

    container.querySelector('[data-role="chronicle-summary"]').addEventListener('input', (event) => {
      chronicle.summary = event.target.value;
      persist();
    });
    container.querySelector('[data-role="memory-established-facts"]').addEventListener('input', (event) => {
      chronicle.campaignMemory.establishedFacts = event.target.value;
      persist();
    });
    container.querySelector('[data-role="memory-unresolved-threads"]').addEventListener('input', (event) => {
      chronicle.campaignMemory.unresolvedThreads = event.target.value;
      persist();
    });
    container.querySelector('[data-role="memory-faction-positions"]').addEventListener('input', (event) => {
      chronicle.campaignMemory.factionPositions = event.target.value;
      persist();
    });
    container.querySelector('[data-role="memory-boons-and-debts"]').addEventListener('input', (event) => {
      chronicle.campaignMemory.boonsAndDebts = event.target.value;
      persist();
    });
    container.querySelector('[data-role="memory-relationship-shifts"]').addEventListener('input', (event) => {
      chronicle.campaignMemory.relationshipShifts = event.target.value;
      persist();
    });
    container.querySelector('[data-role="memory-timeline"]').addEventListener('input', (event) => {
      chronicle.campaignMemory.timeline = event.target.value;
      persist();
    });
    container.querySelector('[data-role="chronicle-notes"]').addEventListener('input', (event) => {
      chronicle.notes = event.target.value;
      persist();
    });
    container.querySelector('[data-role="plot-points"]').addEventListener('input', (event) => {
      chronicle.plotPoints = event.target.value;
      persist();
    });
    container.querySelector('[data-action="summarize-chronicle"]')?.addEventListener('click', () => {
      onSummarizeChronicle(chronicle);
    });
  }

  function bindSheetEvents(container, chronicle) {
    bindAdditionalDisciplineMeritSelector(container, chronicle.character, persist, null);
    container.querySelectorAll('[data-sheet-field]').forEach((input) => {
      input.addEventListener('input', (event) => {
        const field = event.target.dataset.sheetField;
        chronicle.character[field] = input.type === 'number' ? Number(event.target.value) : event.target.value;
        markCharacterSummaryDirty(chronicle);
        updateChronicleTitle(chronicle);
        persist();
        renderHeader(chronicle, getChronicleCity(chronicle));
      });
    });

    container.querySelector('[data-action="open-xp"]').addEventListener('click', () => {
      if (!canSpendExperience(chronicle)) {
        setStatus(getXpGateMessage(chronicle), true);
        return;
      }
      runtime.xpDraft = getDefaultXpDraft(chronicle.character);
      state.activePanel = 'xp';
      persist();
      render();
    });

    container.querySelector('[data-action="spend-temp-willpower"]')?.addEventListener('click', () => {
      const current = Math.max(0, Number(chronicle.character.currentWillpower) || 0);
      if (!current) {
        return;
      }
      chronicle.character.currentWillpower = current - 1;
      persist();
      setStatus(`Temporary Willpower reduced to ${chronicle.character.currentWillpower}/${chronicle.character.willpower}.`);
      render();
    });

    container.querySelector('[data-action="recover-temp-willpower"]')?.addEventListener('click', () => {
      const recovered = recoverTemporaryWillpower(chronicle.character, TEMPORARY_WILLPOWER_RECOVERY);
      persist();
      setStatus(
        recovered > 0
          ? `Temporary Willpower recovered to ${chronicle.character.currentWillpower}/${chronicle.character.willpower}.`
          : 'Temporary Willpower is already full.',
      );
      render();
    });
  }

  function bindXpEvents(container, chronicle) {
    if (!runtime.xpDraft) {
      runtime.xpDraft = getDefaultXpDraft(chronicle.character);
    }

    const inCreationExperiencePhase = !chronicle.character.created && getCharacterCreationPhase(chronicle.character) === 'experience';
    const exitPanel = inCreationExperiencePhase ? null : 'sheet';

    container.querySelector('[data-action="cancel-xp"]').addEventListener('click', () => {
      runtime.xpDraft = null;
      state.activePanel = exitPanel;
      persist();
      render();
    });

    container.querySelector('[data-xp-meta="category"]').addEventListener('change', (event) => {
      runtime.xpDraft.category = event.target.value;
      const nextOptions = getXpTargetOptions(chronicle.character, runtime.xpDraft.category);
      runtime.xpDraft.target = nextOptions[0]?.value ?? '';
      render();
    });

    container.querySelector('[data-xp-meta="target"]').addEventListener('change', (event) => {
      runtime.xpDraft.target = event.target.value;
      render();
    });

    container.querySelector('[data-xp-meta="reason"]').addEventListener('input', (event) => {
      runtime.xpDraft.reason = event.target.value;
    });

    container.querySelector('[data-action="confirm-xp"]').addEventListener('click', () => {
      if (!canSpendExperience(chronicle)) {
        setStatus(getXpGateMessage(chronicle), true);
        return;
      }
      const purchase = getXpPurchasePreview(chronicle.character, runtime.xpDraft);
      const reason = container.querySelector('[data-xp-meta="reason"]').value.trim() || purchase.summary;
      if (!purchase.valid) {
        setStatus(purchase.summary, true);
        return;
      }

      if (purchase.cost > chronicle.character.experience.unspent) {
        setStatus('Not enough unspent XP for that purchase.', true);
        return;
      }

      applyXpPurchase(chronicle.character, runtime.xpDraft, purchase);
      chronicle.character.experience.unspent -= purchase.cost;
      chronicle.character.experience.spent += purchase.cost;
      markCharacterSummaryDirty(chronicle);
      chronicle.character.experience.log.unshift({
        id: uid('xp'),
        category: runtime.xpDraft.category,
        target: runtime.xpDraft.target,
        cost: purchase.cost,
        reason,
        formula: purchase.formula,
        summary: purchase.summary,
        timestamp: new Date().toISOString(),
      });

      runtime.xpDraft = null;
      state.activePanel = exitPanel;
      persist();
      setStatus(`Confirmed XP purchase for ${purchase.cost} XP.`);
      render();
    });
  }

  function bindDowntimeEvents(container, chronicle) {
    container.querySelector('[data-action="toggle-downtime-panel"]')?.addEventListener('click', () => {
      if (isDowntimeActive(chronicle)) {
        const recovery = resumeScenesFromDowntime(chronicle);
        state.activePanel = null;
        persist();
        const recoveryParts = [];
        if (recovery.willpowerRecovered > 0) {
          recoveryParts.push(`Temporary Willpower +${recovery.willpowerRecovered}`);
        }
        if (recovery.resourcesRecovered > 0) {
          recoveryParts.push(`temporary Resources +${recovery.resourcesRecovered}`);
        }
        setStatus(
          recoveryParts.length
            ? `Downtime ended. Session ${chronicle.progression.sessionNumber} is now active. ${recoveryParts.join('; ')}.`
            : `Downtime ended. Session ${chronicle.progression.sessionNumber} is now active.`,
        );
      } else {
        beginDowntime(chronicle, 'Player-entered downtime');
        state.activePanel = 'downtime';
        runtime.xpDraft = null;
        persist();
        setStatus('Downtime is now active. XP spending and long-form advancement actions are available.');
      }
      render();
    });

    container.querySelector('[data-action="open-downtime-xp"]')?.addEventListener('click', () => {
      if (!canSpendExperience(chronicle)) {
        setStatus(getXpGateMessage(chronicle), true);
        return;
      }
      runtime.xpDraft = getDefaultXpDraft(chronicle.character);
      state.activePanel = 'xp';
      persist();
      render();
    });
  }

  function bindSharedCharacterInputs(container, target, namespace = 'base') {
    const fieldAttr = namespace === 'xp' ? 'data-xp-field' : 'data-field';
    const selectAttr = namespace === 'xp' ? 'data-xp-select' : 'data-select-field';
    const attrAttr = namespace === 'xp' ? 'data-xp-attr' : 'data-attr';
    const abilityAttr = namespace === 'xp' ? 'data-xp-ability' : 'data-ability';
    const virtueAttr = namespace === 'xp' ? 'data-xp-virtue' : 'data-virtue';

    container.querySelectorAll(`[${fieldAttr}]`).forEach((input) => {
      input.addEventListener('input', (event) => {
        const key = event.target.getAttribute(fieldAttr);
        const nextValue = input.type === 'number' ? Number(event.target.value) : event.target.value;
        target[key] = namespace === 'xp' ? nextValue : sanitizeCreationFieldValue(target, key, nextValue);
        if (namespace !== 'xp') {
          persist();
          if (!target.created && shouldRefreshCreationField(key, input.type)) {
            render();
          }
        }
      });
    });

    container.querySelectorAll(`[${selectAttr}]`).forEach((select) => {
      select.addEventListener('change', (event) => {
        const key = event.target.getAttribute(selectAttr);
        target[key] = event.target.value;
        if (namespace !== 'xp' && key === 'clan') {
          resetClanSpecificSelections(target);
          applyClanDisciplineDefaults(target);
          debugLog('Changed clan during creation', { clan: target.clan, disciplines: target.disciplines.map((item) => `${item.name} ${item.dots}`) });
          persist();
          render();
          return;
        }
        if (namespace !== 'xp' && key === 'path') {
          debugLog('Changed morality path', { path: target.path });
          persist();
          render();
          return;
        }
        if (namespace !== 'xp') {
          persist();
          if (!target.created) {
            render();
          }
        }
      });
    });

    container.querySelectorAll(`[${attrAttr}]`).forEach((input) => {
      input.addEventListener('input', (event) => {
        const fieldId = event.target.getAttribute(attrAttr);
        target.attributes[fieldId] = sanitizeCreationAttributeValue(target, fieldId, Number(event.target.value));
        if (namespace !== 'xp') {
          syncCharacterDerivedStats(target);
          persist();
          if (!target.created) {
            render();
          }
        }
      });
    });

    container.querySelectorAll(`[${abilityAttr}]`).forEach((input) => {
      input.addEventListener('input', (event) => {
        const fieldId = event.target.getAttribute(abilityAttr);
        target.abilities[fieldId] = sanitizeCreationAbilityValue(target, fieldId, Number(event.target.value));
        if (namespace !== 'xp') {
          syncCreationAutoSpecialties(target);
          persist();
          if (!target.created) {
            render();
          }
        }
      });
    });

    container.querySelectorAll(`[${virtueAttr}]`).forEach((input) => {
      input.addEventListener('input', (event) => {
        const fieldId = event.target.getAttribute(virtueAttr);
        target.virtues[fieldId] = sanitizeCreationVirtueValue(target, fieldId, Number(event.target.value));
        if (namespace !== 'xp') {
          syncCharacterDerivedStats(target);
          persist();
          if (!target.created) {
            render();
          }
        }
      });
    });
  }

  function bindTraitList(container, target, type, options, namespace = 'base') {
    const idAttr = namespace === 'xp' ? `data-xp-${type}-id` : `data-${type}-id`;
    const nameAttr = namespace === 'xp' ? `data-xp-${type}-name` : `data-${type}-name`;
    const dotsAttr = namespace === 'xp' ? `data-xp-${type}-dots` : `data-${type}-dots`;

    container.querySelectorAll(`[${idAttr}]`).forEach((row) => {
      const id = row.getAttribute(idAttr);
      row.querySelector(`[${nameAttr}]`).addEventListener('change', (event) => {
        const item = target[`${type}s`].find((entry) => entry.id === id);
        if (!item) {
          return;
        }
        if (namespace !== 'xp' && isCreationPhaseLockedEntry(target, type, id)) {
          render();
          return;
        }
        item.name = event.target.value;
        if (namespace !== 'xp') {
          if (type === 'background') {
            syncCharacterDerivedStats(target);
            persist();
            render();
            return;
          }
          persist();
        }
      });
      row.querySelector(`[${dotsAttr}]`).addEventListener('input', (event) => {
        const item = target[`${type}s`].find((entry) => entry.id === id);
        if (!item) {
          return;
        }
        item.dots = namespace === 'xp' ? Number(event.target.value) : sanitizeCreationTraitDots(target, type, id, Number(event.target.value));
        if (namespace !== 'xp') {
          if (type === 'background') {
            syncCharacterDerivedStats(target);
            persist();
            render();
            return;
          }
          persist();
        }
      });
      row.querySelector('[data-remove-entry]').addEventListener('click', () => {
        if (namespace !== 'xp' && isCreationPhaseLockedEntry(target, type, id)) {
          setStatus('Confirmed allocation dots cannot be removed in later creation phases.', true);
          render();
          return;
        }
        target[`${type}s`] = target[`${type}s`].filter((entry) => entry.id !== id);
        if (namespace !== 'xp') {
          if (type === 'background') {
            syncCharacterDerivedStats(target);
          }
          persist();
        }
        render();
      });
    });
  }

  function bindSpecialties(container, target, xpMode) {
    const idAttr = xpMode ? 'data-xp-specialty-id' : 'data-specialty-id';
    const abilityAttr = xpMode ? 'data-xp-specialty-ability' : 'data-specialty-ability';
    const nameAttr = xpMode ? 'data-xp-specialty-name' : 'data-specialty-name';

    container.querySelectorAll(`[${idAttr}]`).forEach((row) => {
      const id = row.getAttribute(idAttr);
      row.querySelector(`[${abilityAttr}]`).addEventListener('change', (event) => {
        const item = target.specialties.find((entry) => entry.id === id);
        item.ability = event.target.value;
        item.isAuto = false;
        if (!xpMode) {
          persist();
          render();
        }
      });
      row.querySelector(`[${nameAttr}]`).addEventListener('input', (event) => {
        const item = target.specialties.find((entry) => entry.id === id);
        item.name = event.target.value;
        item.isAuto = false;
        if (!xpMode) {
          persist();
        }
      });
      row.querySelector('[data-remove-entry]').addEventListener('click', () => {
        target.specialties = target.specialties.filter((entry) => entry.id !== id);
        if (!xpMode) {
          persist();
        }
        render();
      });
    });
  }

  function bindInventory(container, target, key) {
    container.querySelectorAll(`[data-${key}-id]`).forEach((row) => {
      const id = row.getAttribute(`data-${key}-id`);
      row.querySelector(`[data-${key}-name]`).addEventListener('input', (event) => {
        const item = target[key].find((entry) => entry.id === id);
        item.name = event.target.value;
        persist();
      });
      row.querySelector(`[data-${key}-details]`).addEventListener('input', (event) => {
        const item = target[key].find((entry) => entry.id === id);
        item.details = event.target.value;
        persist();
      });
      row.querySelector('[data-remove-entry]').addEventListener('click', () => {
        target[key] = target[key].filter((entry) => entry.id !== id);
        persist();
        render();
      });
    });
  }

  function bindPointTraitList(container, target, kind) {
    const collectionKey = getPointTraitCollectionKey(kind);
    container.querySelectorAll(`[data-${kind}-id]`).forEach((row) => {
      const id = row.getAttribute(`data-${kind}-id`);
      row.querySelector(`[data-${kind}-name]`).addEventListener('change', (event) => {
        const selected = getPointTraitDefinition(kind, event.target.value, target.clan);
        const item = target[collectionKey].find((entry) => entry.id === id);
        item.name = selected.name;
        item.points = selected.points;
        item.details = selected.summary;
        persist();
        render();
      });
      row.querySelector('[data-remove-entry]').addEventListener('click', () => {
        target[collectionKey] = target[collectionKey].filter((entry) => entry.id !== id);
        persist();
        render();
      });
    });
  }

  function renderChat(messages) {
    ui.chatLog.innerHTML = '';
    for (const message of messages) {
      const card = document.createElement('article');
      card.className = `message-card ${message.role}`;
      card.innerHTML = `
        <div class="message-header">
          <span>${message.role === 'assistant' ? 'Storyteller' : 'Player'}</span>
          <span class="meta-text">${formatTimestamp(message.timestamp)}</span>
        </div>
        <div class="message-body">${formatMessageContent(message.content)}</div>
      `;
      ui.chatLog.appendChild(card);
    }
    ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
  }

  function renderNumericCards(character, xpMode) {
    return `
      <div class="stat-grid">
        ${schema.attributes
          .map(
            (group) => `
              <div class="stat-card">
                ${renderCardHeading(group.label)}
                ${group.fields
                  .map(
                    (field) => `
                      <label>
                        ${renderFieldLabel(field.label, field.id)}
                        <input type="number" min="1" max="5" ${xpMode ? `data-xp-attr="${field.id}"` : `data-attr="${field.id}"`} value="${character.attributes[field.id]}" />
                      </label>
                    `,
                  )
                  .join('')}
              </div>
            `,
          )
          .join('')}
      </div>

      <div class="stat-grid">
        ${schema.abilities
          .map(
            (group) => `
              <div class="stat-card">
                ${renderCardHeading(group.label)}
                ${group.fields
                  .map(
                    (field) => `
                      <label>
                        ${renderFieldLabel(field.label, field.id)}
                        <input type="number" min="0" max="5" ${xpMode ? `data-xp-ability="${field.id}"` : `data-ability="${field.id}"`} value="${character.abilities[field.id]}" />
                      </label>
                    `,
                  )
                  .join('')}
              </div>
            `,
          )
          .join('')}
      </div>
    `;
  }

  function renderDisciplineCard(character, xpMode) {
    return `
      <div class="list-card">
        ${renderCardHeading('Disciplines', 'disciplines')}
        <div data-role="discipline-list">${renderTraitRows(character.disciplines, disciplinesData.map((item) => item.name), 'discipline', xpMode)}</div>
        <button class="secondary-button" type="button" data-action="add-discipline">Add Discipline</button>
      </div>
    `;
  }

  function renderBackgroundCard(character, xpMode) {
    return `
      <div class="list-card">
        ${renderCardHeading('Backgrounds', 'backgrounds')}
        <div data-role="background-list">${renderTraitRows(character.backgrounds, backgroundsData.map((item) => item.name), 'background', xpMode)}</div>
        <button class="secondary-button" type="button" data-action="add-background">Add Background</button>
      </div>
    `;
  }

  function renderPointTraitCard(kind, title, items, definitions) {
    return `
      <div class="list-card">
        ${renderCardHeading(title, kind.includes('flaw') ? 'flaws' : 'merits')}
        ${definitions.length ? '' : '<p class="helper-text">No sourced options are available for this category yet.</p>'}
        <div class="inventory-list">${renderPointRows(kind, items, definitions)}</div>
        ${definitions.length ? `<button class="secondary-button" type="button" data-action="add-${kind}">Add ${escapeHtml(title.slice(0, -1) || title)}</button>` : ''}
      </div>
    `;
  }

  function renderCreationValidation(validation) {
    return `
      <div class="list-card validation-card ${validation.valid ? 'valid' : 'invalid'}">
        <div class="npc-header-row">
            <h4>${escapeHtml(validation.title)}</h4>
            <span class="status-pill">${escapeHtml(validation.statusLabel)}</span>
        </div>
        <div class="summary-list validation-list">
          ${validation.summary.map((item) => `<div>${escapeHtml(item)}</div>`).join('')}
        </div>
        ${validation.issues.length ? `<p class="footer-note">${validation.issues.map((item) => escapeHtml(item)).join(' ')}</p>` : ''}
      </div>
    `;
  }

  function renderSpecialtyCard(character, xpMode) {
    return `
      <div class="list-card">
        ${renderCardHeading('Specialties', 'specialties')}
        <div data-role="specialty-list">${renderSpecialtyRows(character.specialties, xpMode)}</div>
        <button class="secondary-button" type="button" data-action="add-specialty">Add Specialty</button>
      </div>
    `;
  }

  function renderInventoryCard(key, title, items, readOnly) {
    return `
      <div class="list-card">
        ${renderCardHeading(title)}
        <div class="inventory-list">${renderInventoryRows(key, items, readOnly)}</div>
        ${readOnly ? '<p class="footer-note">Story events and the Storyteller update this list after creation.</p>' : `<button class="secondary-button" type="button" data-action="add-${key}">Add ${escapeHtml(title.slice(0, -1) || title)}</button>`}
      </div>
    `;
  }

  function renderCreationLockedCard(title, copy) {
    return `
      <div class="list-card">
        <h4>${escapeHtml(title)}</h4>
        <p class="helper-text">${escapeHtml(copy)}</p>
      </div>
    `;
  }

  function renderSimpleCreationTraitCard(title, items, note) {
    return `
      <div class="list-card">
        ${renderCardHeading(title, title === 'Disciplines' ? 'disciplines' : title === 'Backgrounds' ? 'backgrounds' : '')}
        ${renderSimpleList(items, note)}
      </div>
    `;
  }

  function renderPointSummaryCard(title, items, note) {
    return `
      <div class="list-card">
        ${renderCardHeading(title, title.includes('Flaw') ? 'flaws' : 'merits')}
        ${renderPointSummary(items, note)}
      </div>
    `;
  }

  function renderHealthTrack(character) {
    return `
      <div class="health-grid">
        ${character.health
          .map((item, index) => {
            const classes = ['health-chip'];
            if (index < character.currentHealthLevel) {
              classes.push('filled');
            }
            if (index === character.currentHealthLevel) {
              classes.push('current');
            }
            return `<div class="${classes.join(' ')}">${escapeHtml(item)}</div>`;
          })
          .join('')}
      </div>
    `;
  }

  function renderResourceCards(character, xpMode) {
    const morality = getMoralityConfig(character.path);
    const generation = syncCharacterDerivedStats(character);
    const maxResources = getBackgroundDotsByName(character, 'Resources');
    const phase = getCharacterCreationPhase(character);
    return `
      <div class="inline-grid three">
        <label>${renderFieldLabel(morality.primaryLabel, 'conscience')}<input type="number" min="1" max="5" ${xpMode ? 'data-xp-virtue="conscience"' : 'data-virtue="conscience"'} value="${character.virtues.conscience}" /></label>
        <label>${renderFieldLabel(morality.secondaryLabel, 'selfControl')}<input type="number" min="1" max="5" ${xpMode ? 'data-xp-virtue="selfControl"' : 'data-virtue="selfControl"'} value="${character.virtues.selfControl}" /></label>
        <label>${renderFieldLabel('Courage', 'courage')}<input type="number" min="1" max="5" ${xpMode ? 'data-xp-virtue="courage"' : 'data-virtue="courage"'} value="${character.virtues.courage}" /></label>
      </div>

      <div class="inline-grid three">
        ${renderLockedCard('Generation', formatGenerationLabel(generation.generation), 'generation')}
        ${renderLockedCard('Blood Pool', `${character.currentBloodPool}/${generation.bloodPool}`, 'bloodPool')}
        <label>${renderFieldLabel(morality.ratingLabel, 'humanity')}<input type="number" min="0" max="10" ${xpMode ? 'data-xp-field="humanity"' : 'data-field="humanity"'} value="${character.humanity}" /></label>
      </div>

      <div class="inline-grid two">
        ${!xpMode && phase === 'allocation'
          ? renderLockedCard('Willpower', character.willpower, 'willpower', 'During allocation, Willpower stays equal to Courage.')
          : `<label>${renderFieldLabel('Willpower', 'willpower')}<input type="number" min="0" max="10" ${xpMode ? 'data-xp-field="willpower"' : 'data-field="willpower"'} value="${character.willpower}" /></label>`}
        ${renderLockedCard('Current Willpower', `${character.currentWillpower}/${character.willpower}`, 'currentWillpower')}
      </div>

      <div class="inline-grid two">
        ${renderLockedCard('Generation Background', `${generation.backgroundDots} dot${generation.backgroundDots === 1 ? '' : 's'}`)}
        ${renderLockedCard('Temporary Resources', `${character.currentResources}/${maxResources}`, 'temporaryResources')}
      </div>

      <div class="list-card">
        ${renderCardHeading('Health Track', 'health')}
        ${renderHealthTrack(character)}
      </div>
    `;
  }

  function renderReadOnlyStats(character) {
    const morality = getMoralityConfig(character.path);
    return `
      <div class="inline-grid two">
        <div class="list-card">
          ${renderCardHeading('Disciplines', 'disciplines')}
          ${renderSimpleList(character.disciplines.map((item) => `${item.name} ${item.dots}`), 'Raise or learn disciplines through XP purchases only.')}
        </div>
        <div class="list-card">
          ${renderCardHeading('Specialties', 'specialties')}
          ${renderSimpleList(character.specialties.map((item) => `${startCase(item.ability)}: ${item.name}`), 'New specialties should be confirmed through XP purchases.')}
        </div>
      </div>

      <div class="stat-grid compact">
        ${schema.attributes.map((group) => `
          <div class="stat-card">
            ${renderCardHeading(group.label)}
            <div class="summary-list">
              ${group.fields.map((field) => renderReadonlyFieldSummary(field.label, character.attributes[field.id], field.id)).join('')}
            </div>
          </div>
        `).join('')}
        ${schema.abilities.map((group) => `
          <div class="stat-card">
            ${renderCardHeading(group.label)}
            <div class="summary-list">
              ${(group.fields.filter((field) => character.abilities[field.id] > 0).length ? group.fields.filter((field) => character.abilities[field.id] > 0).map((field) => renderReadonlyFieldSummary(field.label, character.abilities[field.id], field.id)).join('') : '<div class="helper-text">No trained dots.</div>')}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="inline-grid three">
        ${renderLockedCard(morality.ratingLabel, character.humanity, 'humanity')}
        ${renderLockedCard('Willpower', `${character.currentWillpower}/${character.willpower}`, 'willpower')}
        ${renderLockedCard('Blood Pool', `${character.currentBloodPool}/${character.bloodPool}`, 'bloodPool')}
      </div>

      <div class="inline-grid two">
        ${renderLockedCard('Health Status', character.health[character.currentHealthLevel] || 'Healthy', 'health')}
        ${renderLockedCard('Temporary Resources', `${character.currentResources}/${getBackgroundDotsByName(character, 'Resources')}`, 'temporaryResources')}
      </div>
    `;
  }

  function renderReadOnlyResources(character) {
    const morality = getMoralityConfig(character.path);
    const generation = syncCharacterDerivedStats(character);
    return `
      <div class="inline-grid three">
        ${renderLockedCard(morality.primaryLabel, character.virtues.conscience, 'conscience')}
        ${renderLockedCard(morality.secondaryLabel, character.virtues.selfControl, 'selfControl')}
        ${renderLockedCard('Courage', character.virtues.courage, 'courage')}
      </div>

      <div class="inline-grid three">
        ${renderLockedCard('Generation', formatGenerationLabel(generation.generation), 'generation')}
        ${renderLockedCard('Blood Pool', `${character.currentBloodPool}/${generation.bloodPool}`, 'bloodPool')}
        ${renderLockedCard(morality.ratingLabel, character.humanity, 'humanity')}
      </div>

      <div class="inline-grid two">
        ${renderLockedCard('Willpower', `${character.currentWillpower}/${character.willpower}`, 'willpower')}
        ${renderLockedCard('Generation Background', `${generation.backgroundDots} dot${generation.backgroundDots === 1 ? '' : 's'}`)}
      </div>

      <div class="inline-grid two">
        ${renderLockedCard('Health Status', character.health[character.currentHealthLevel] || 'Healthy', 'health')}
        ${renderLockedCard('Temporary Resources', `${character.currentResources}/${getBackgroundDotsByName(character, 'Resources')}`, 'temporaryResources')}
      </div>

      <div class="list-card">
        ${renderCardHeading('Health Track', 'health')}
        ${renderHealthTrack(character)}
      </div>
    `;
  }

  function renderCreationExperienceCard(character) {
    const startingExperience = Number(character.creation?.startingExperience) || 15;
    return `
      <div class="list-card validation-card valid">
        <div class="npc-header-row">
          <h4>Starting Experience</h4>
          <span class="status-pill">${character.experience.spent} spent / ${startingExperience} total</span>
        </div>
        <div class="summary-list validation-list">
          <div>Confirmed purchases use the normal V20 XP costs.</div>
          <div>Unspent starting XP: ${character.experience.unspent}</div>
          <div>Spent starting XP: ${character.experience.spent}</div>
        </div>
        <div class="inline-actions">
          <button class="secondary-button" type="button" data-action="open-creation-xp">Spend Starting Experience</button>
        </div>
        <p class="footer-note">You may leave character creation with unspent starting XP, but any remaining creation XP is discarded when the chronicle starts and does not carry into play.</p>
      </div>
    `;
  }

  function renderCreationPhaseTracker(validation, budget) {
    const phases = [
      { id: 'allocation', label: '1. Allocation', note: 'Spend only base creation dots.' },
      { id: 'freebies', label: '2. Freebies', note: `Spend ${budget.freebiesAvailable} freebie point${budget.freebiesAvailable === 1 ? '' : 's'} after confirmation.` },
      { id: 'experience', label: '3. Experience', note: `Spend up to ${budget.startingExperience} starting XP before settings.` },
    ];
    const currentIndex = phases.findIndex((item) => item.id === validation.phase);

    return `
      <div class="list-card">
        <h4>Creation Phases</h4>
        <div class="phase-strip">
          ${phases
            .map((item, index) => {
              const status = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'pending';
              return `
                <div class="phase-chip ${status}">
                  <strong>${escapeHtml(item.label)}</strong>
                  <span class="helper-text">${escapeHtml(item.note)}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  function renderSummaryCard(title, items) {
    return `
      <div class="stat-card">
        <h4>${escapeHtml(title)}</h4>
        <div class="summary-list">${(items.length ? items : ['None']).map((item) => `<div>${escapeHtml(item)}</div>`).join('')}</div>
      </div>
    `;
  }

  function renderPointRows(kind, items, definitions) {
    if (!items.length) {
      return '<p class="helper-text">Nothing selected.</p>';
    }

    return items
      .map(
        (item) => {
          const selected = definitions.find((entry) => entry.name === item.name) ?? definitions[0] ?? { summary: '' };
          return `
          <div class="entry-row inventory" data-${kind}-id="${item.id}">
            <label><span class="helper-text">Name</span>${renderSelect(`${kind}-name`, definitions.map((entry) => entry.name), item.name, `data-${kind}-name`)}</label>
            <div class="locked-card compact"><span class="helper-text">Points</span><strong>${item.points}</strong></div>
            <button class="remove-button" type="button" data-remove-entry>Remove</button>
          </div>
          <div class="footer-note">${escapeHtml(item.details || selected.summary)}</div>
        `;
        },
      )
      .join('');
  }

  function renderTraitRows(items, options, type, xpMode) {
    const idAttr = xpMode ? `data-xp-${type}-id` : `data-${type}-id`;
    const nameAttr = xpMode ? `data-xp-${type}-name` : `data-${type}-name`;
    const dotsAttr = xpMode ? `data-xp-${type}-dots` : `data-${type}-dots`;
    return items
      .map(
        (item) => `
          <div class="entry-row" ${idAttr}="${item.id}">
            ${renderSelect(`${type}-name`, options, item.name, nameAttr)}
            <label><span class="helper-text">Dots</span><input type="number" min="1" max="5" value="${item.dots}" ${dotsAttr} /></label>
            <button class="remove-button" type="button" data-remove-entry>Remove</button>
          </div>
        `,
      )
      .join('');
  }

  function renderAdditionalDisciplineMeritCard(character, editableAfterCreation) {
    if (!hasAdditionalDisciplineMerit(character)) {
      return '';
    }

    const currentValue = getAdditionalDisciplineMeritSelection(character);
    const optionValues = getAdditionalDisciplineMeritOptions(character);
    const helperText = editableAfterCreation
      ? 'Choose which discipline this merit treats as in-clan for future XP pricing. Existing characters can set or correct it here.'
      : 'Choose the out-of-clan discipline affected by this merit. During creation, that chosen discipline should receive dots through freebie spending.';

    return `
      <div class="list-card">
        <h4>Additional Discipline Merit</h4>
        <label>
          <span class="helper-text">Merit-Affected Discipline</span>
          ${renderSelect('additional-discipline-merit', ['Select a discipline', ...optionValues], currentValue, 'data-role', ['', ...optionValues])}
        </label>
        <p class="footer-note">${escapeHtml(helperText)}</p>
      </div>
    `;
  }

  function renderSpecialtyRows(items, xpMode) {
    const options = schema.abilities.flatMap((group) => group.fields.map((field) => field.id));
    return items
      .map(
        (item) => `
          <div class="entry-row specialty" ${xpMode ? 'data-xp-specialty-id' : 'data-specialty-id'}="${item.id}">
            ${renderSelect('specialty-ability', options.map((option) => startCase(option)), startCase(item.ability), xpMode ? 'data-xp-specialty-ability' : 'data-specialty-ability', options)}
            <label><span class="helper-text">Focus</span><input value="${escapeHtml(item.name)}" ${xpMode ? 'data-xp-specialty-name' : 'data-specialty-name'} /></label>
            <button class="remove-button" type="button" data-remove-entry>Remove</button>
          </div>
        `,
      )
      .join('');
  }

  function renderInventoryRows(key, items, readOnly) {
    if (!items.length) {
      return '<p class="helper-text">Nothing recorded.</p>';
    }

    return items
      .map(
        (item) => `
          <div class="entry-row inventory ${readOnly ? 'readonly' : ''}" data-${key}-id="${item.id}">
            <label><span class="helper-text">Name</span><input ${readOnly ? 'disabled' : ''} data-${key}-name value="${escapeHtml(item.name)}" /></label>
            <label><span class="helper-text">Details</span><input ${readOnly ? 'disabled' : ''} data-${key}-details value="${escapeHtml(item.details || '')}" /></label>
            ${readOnly ? '' : '<button class="remove-button" type="button" data-remove-entry>Remove</button>'}
          </div>
        `,
      )
      .join('');
  }

  function renderSimpleList(items, note) {
    const values = Array.isArray(items)
      ? items.map((item) => (typeof item === 'string' ? item : `${item.name} ${item.dots}`))
      : [];
    return `
      <div class="summary-list">${(values.length ? values : ['None recorded']).map((item) => `<div>${escapeHtml(item)}</div>`).join('')}</div>
      <p class="footer-note">${escapeHtml(note)}</p>
    `;
  }

  function renderSimpleInventory(items, note) {
    return `
      <div class="summary-list">${(items.length ? items : [{ name: 'Nothing recorded', details: '' }])
        .map((item) => `<div><strong>${escapeHtml(item.name)}</strong>${item.details ? ` · ${escapeHtml(item.details)}` : ''}</div>`)
        .join('')}</div>
      <p class="footer-note">${escapeHtml(note)}</p>
    `;
  }

  function renderPointSummary(items, note) {
    return `
      <div class="summary-list">${(items.length ? items : [{ name: 'None selected', points: '' }])
        .map((item) => `<div><strong>${escapeHtml(item.name)}</strong>${item.points ? ` · ${item.points} point${item.points === 1 ? '' : 's'}` : ''}</div>`)
        .join('')}</div>
      <p class="footer-note">${escapeHtml(note)}</p>
    `;
  }

  function renderXpLog(log) {
    if (!log.length) {
      return '<p class="helper-text">No confirmed XP purchases yet.</p>';
    }
    return log
      .map(
        (entry) => `
          <div class="xp-entry">
            <strong>${entry.award ? `+${entry.award} XP` : `${entry.cost} XP`}</strong>
            <div>${escapeHtml(entry.reason)}</div>
            ${entry.formula ? `<div class="meta-text">${escapeHtml(entry.formula)}</div>` : ''}
            <div class="meta-text">${formatTimestamp(entry.timestamp)}</div>
          </div>
        `,
      )
      .join('');
  }

  function renderNpcSummary(npc) {
    return `
      <div class="npc-card">
        <strong>${escapeHtml(npc.name)}</strong>
        <div class="meta-text">${escapeHtml(npc.role || 'No role recorded')}</div>
        <div>${escapeHtml(npc.summary || 'No summary recorded.')}</div>
      </div>
    `;
  }

  function renderNpcDossier(npc) {
    return `
      <article class="npc-card npc-dossier">
        <div class="npc-header-row">
          <strong>${escapeHtml(npc.name)}</strong>
          <span class="meta-text">${escapeHtml(npc.status || 'Status unknown')}</span>
        </div>
        <div class="tag-row">
          <span class="health-chip">${escapeHtml(npc.clan || 'Clan unknown')}</span>
          <span class="health-chip">${escapeHtml(npc.ageCategory || 'Age unknown')}</span>
          <span class="health-chip">${escapeHtml(npc.role || 'Role unclear')}</span>
        </div>
        <div><strong>Summary:</strong> ${escapeHtml(npc.summary || 'Nothing solid is known yet.')}</div>
        <div><strong>Ambition:</strong> ${escapeHtml(npc.ambition || 'Not yet discovered.')}</div>
        <div><strong>Desire:</strong> ${escapeHtml(npc.desire || 'Not yet discovered.')}</div>
        <div><strong>NPC Notes:</strong> ${escapeHtml(npc.notes || 'No additional notes recorded.')}</div>
      </article>
    `;
  }

  function renderSelect(field, options, selected, extraAttr = 'data-select-field', rawValues = null) {
    const values = rawValues ?? options;
    return `<select ${extraAttr}="${field}">${options
      .map((option, index) => {
        const value = values[index];
        return `<option value="${escapeHtml(value)}" ${value === selected || option === selected ? 'selected' : ''}>${escapeHtml(option)}</option>`;
      })
      .join('')}</select>`;
  }

  function onNewChronicle() {
    const newChronicle = getDefaultChronicle(schema, cities, CUSTOM_CHRONICLE_PACK.hooks);
    newChronicle.plotHookIds = getDefaultHookIdsForCity(newChronicle.cityId);
    state.chronicles.push(newChronicle);
    state.activeChronicleId = newChronicle.id;
    state.activeView = 'settings';
    state.activePanel = null;
    runtime.xpDraft = null;
    debugLog('Created new chronicle', { chronicleId: newChronicle.id, title: newChronicle.title });
    persist();
    setStatus(`Created new chronicle: ${newChronicle.title}.`);
    render();
  }

  function onDeleteChronicle() {
    const active = getActiveChronicle();
    if (!active) {
      setStatus('There is no active chronicle to delete.', true);
      return;
    }

    const confirmed = window.confirm(`Delete chronicle "${active.title}"? This removes its chat log, notes, and character from local storage.`);
    if (!confirmed) {
      return;
    }

    state.chronicles = state.chronicles.filter((chronicle) => chronicle.id !== active.id);
    if (state.chronicles.length === 0) {
      state.activeChronicleId = null;
      state.activeView = 'settings';
    } else {
      state.activeChronicleId = state.chronicles[0].id;
      state.activeView = state.chronicles[0].setupComplete ? (state.chronicles[0].character.created ? 'play' : 'creation') : 'settings';
    }
    state.activePanel = null;
    runtime.xpDraft = null;
    debugLog('Deleted chronicle', { chronicleId: active.id, title: active.title, remaining: state.chronicles.length });
    persist();
    setStatus(`Deleted ${active.title}.`);
    render();
  }

  function bindChronicleSessionEvents(container) {
    container.querySelectorAll('[data-session-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const chronicle = state.chronicles.find((item) => item.id === button.dataset.sessionOpen);
        if (!chronicle) {
          return;
        }

        state.activeChronicleId = chronicle.id;
        state.activeView = !chronicle.setupComplete ? 'settings' : !chronicle.character.created ? 'creation' : 'play';
        state.activePanel = null;
        persist();
        render();
      });
    });
  }

  function onCityChange(event) {
    const chronicle = getActiveChronicle();
    chronicle.cityId = event.target.value;
    updateChronicleTitle(chronicle);
    persist();
    render();
  }

  function getChronicleCity(chronicle) {
    const baseCity = getCityById(cities, chronicle.cityId);
    if (!baseCity) {
      return cities[0];
    }

    if (baseCity.id !== 'custom-us-city') {
      return baseCity;
    }

    const customName = chronicle.customCityName?.trim() || 'Custom U.S. City';
    const storytellerBrief = chronicle.storytellerBrief?.trim();

    return {
      ...baseCity,
      name: customName,
      summary: storytellerBrief ? `${baseCity.summary} Storyteller brief: ${storytellerBrief}` : baseCity.summary,
    };
  }

  async function startOpeningScene(chronicle) {
    await requestStorytellerTurn(chronicle, {
      userMessage:
        'Begin the chronicle immediately. First check whether the PC backstory ends on a concrete scene endpoint with direct pressure, such as named NPC involvement, discovery by authority, a confrontation, an arrest, a court presentation, or another immediate first-night crisis. If so, start there or moments after it and let the active hook apply pressure inside that situation. If the backstory is broad or aspirational instead of scene-based, create the first scene yourself from the active hook. Establish the time, a modern Gregorian 2025 date in the format "Monday, January 6, 2025", the current weather, the location, and the immediate conflict so the player enters an already moving scene.',
      appendUserMessage: false,
      replaceIntroMessage: true,
      openingScene: true,
      pendingStatus: 'The Storyteller is opening the chronicle.',
    });
  }

  function updateChronicleTitle(chronicle) {
    const city = getChronicleCity(chronicle);
    const name = chronicle.character?.name?.trim();

    if (name && city?.name) {
      chronicle.title = `${name} in ${city.name}`;
      return;
    }

    if (name) {
      chronicle.title = `${name}'s Chronicle`;
      return;
    }

    if (city?.name) {
      chronicle.title = `${city.name} Nights`;
      return;
    }

    chronicle.title = 'New Chronicle';
  }

  function onYearChange(event) {
    const chronicle = getActiveChronicle();
    chronicle.year = Number(event.target.value);
    persist();
    render();
  }

  function onRollDice() {
    const chronicle = getActiveChronicle();
    const pool = root.querySelector('[data-role="dice-pool"]').value;
    const difficulty = root.querySelector('[data-role="dice-difficulty"]').value;
    const result = rollDice(pool, difficulty);
    chronicle.diceLog.push(result);
    chronicle.notes = `${chronicle.notes}\n[${new Date().toLocaleTimeString()}] ${result.outcome}: ${result.dice.join(', ')} at difficulty ${result.difficulty}.`.trim();
    persist();
    setStatus(`Rolled ${result.pool}d10 at difficulty ${result.difficulty}: ${result.outcome}.`);
    render();
  }

  function onInjectLastRoll() {
    const chronicle = getActiveChronicle();
    const last = chronicle.diceLog.at(-1);
    if (!last) {
      setStatus('Roll first, then inject the result into chat.', true);
      return;
    }
    ui.messageInput.value = `Dice result: ${last.outcome}. Pool ${last.pool}, difficulty ${last.difficulty}, dice ${last.dice.join(', ')}, net successes ${last.totalSuccesses}. Narrate the consequence in-scene.`;
    syncComposerHeight();
    ui.messageInput.focus();
  }

  function onSaveApiConfig() {
    syncApiConfigFromInputs();
    persist();
    renderSidebarConfig();
    setStatus('OpenRouter settings and battery pricing saved locally for this browser.');
  }

  async function onConnectArchive() {
    if (typeof window.showDirectoryPicker !== 'function') {
      setStatus('This browser does not support directory access for NPC archive files.', true);
      return;
    }

    try {
      runtime.archiveRootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      runtime.archiveLabel = runtime.archiveRootHandle.name;
      setStatus(`Archive folder connected: ${runtime.archiveLabel}.`);
      render();
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setStatus(`Could not connect archive folder: ${error.message}`, true);
      }
    }
  }

  async function syncArchiveFiles(chronicle, reportSuccess = false) {
    if (!runtime.archiveRootHandle) {
      if (reportSuccess) {
        setStatus('Connect an archive folder first.', true);
      }
      return;
    }

    try {
      const npcRoot = await runtime.archiveRootHandle.getDirectoryHandle('npc', { create: true });
      const chronicleFolder = await npcRoot.getDirectoryHandle(getChronicleFolderName(chronicle), { create: true });

      await writeTextFile(chronicleFolder, 'campaign-memory.txt', formatCampaignMemoryForExport(chronicle));
      await writeTextFile(chronicleFolder, 'chronicle-summary.txt', chronicle.summary || 'No chronicle summary recorded yet.');
      await writeTextFile(chronicleFolder, 'chronicle-notes.txt', chronicle.notes || 'No notes recorded yet.');
      await writeTextFile(chronicleFolder, 'plot-points.txt', chronicle.plotPoints || 'No plot points recorded yet.');

      for (const npc of chronicle.npcs) {
        const body = [
          `Name: ${npc.name}`,
          `Clan: ${npc.clan || 'Unrecorded'}`,
          `Age Category: ${npc.ageCategory || 'Unrecorded'}`,
          `Role: ${npc.role || 'Unrecorded'}`,
          `Status: ${npc.status || 'Unrecorded'}`,
          `Ambition: ${npc.ambition || 'Unrecorded'}`,
          `Desire: ${npc.desire || 'Unrecorded'}`,
          `Summary: ${npc.summary || 'Unrecorded'}`,
          `Notes: ${npc.notes || 'Unrecorded'}`,
          `Secrets: ${npc.secrets || 'Unrecorded'}`,
        ].join('\n');
        await writeTextFile(chronicleFolder, `${safeSegment(npc.name)}.txt`, body);
      }

      if (reportSuccess) {
        setStatus(`Archive synced to npc/${getChronicleFolderName(chronicle)}.`);
      }
    } catch (error) {
      setStatus(`Archive sync failed: ${error.message}`, true);
    }
  }

  async function onSendMessage(event) {
    event.preventDefault();
    syncApiConfigFromInputs();

    const chronicle = getActiveChronicle();
    if (!chronicle.character.created) {
      setStatus('Finish character creation before entering the chronicle.', true);
      return;
    }
    if (!chronicle.setupComplete) {
      setStatus('Finish the chronicle settings before chatting with the Storyteller.', true);
      return;
    }

    const value = ui.messageInput.value.trim();
    if (!value) {
      setStatus('Write a message before sending it to the Storyteller.', true);
      return;
    }

    const sent = await requestStorytellerTurn(chronicle, {
      userMessage: value,
      appendUserMessage: true,
      pendingStatus: 'The Storyteller is considering the night.',
    });
    if (sent) {
      ui.messageInput.value = '';
      syncComposerHeight();
    }
  }

  function getLastStorytellerRequest(chronicle) {
    return chronicle.lastStorytellerRequest && typeof chronicle.lastStorytellerRequest === 'object'
      ? chronicle.lastStorytellerRequest
      : null;
  }

  function canRegenerateStorytellerResponse(chronicle) {
    const lastRequest = getLastStorytellerRequest(chronicle);
    return Boolean(lastRequest && chronicle.messages.at(-1)?.role === 'assistant');
  }

  async function onRegenerateResponse() {
    const chronicle = getActiveChronicle();
    const lastRequest = getLastStorytellerRequest(chronicle);
    if (!lastRequest) {
      setStatus('There is no Storyteller response to regenerate yet.', true);
      return;
    }

    if (chronicle.messages.at(-1)?.role !== 'assistant') {
      setStatus('Regeneration is only available after a Storyteller response.', true);
      return;
    }

    await requestStorytellerTurn(chronicle, {
      ...lastRequest,
      appendUserMessage: Boolean(lastRequest.appendUserMessage),
      pendingStatus: 'The Storyteller is reconsidering the scene.',
      reuseTrailingUserMessage: Boolean(lastRequest.appendUserMessage),
      replaceLastAssistant: true,
    });
  }

  async function requestStorytellerTurn(chronicle, options) {
    const {
      userMessage,
      appendUserMessage,
      pendingStatus,
      replaceIntroMessage = false,
      openingScene = false,
      reuseTrailingUserMessage = false,
      replaceLastAssistant = false,
    } = options;

    const selectedModel = state.model || DEFAULT_MODEL;

    if (!(await ensureStorytellerCreditAvailable())) {
      return false;
    }

    if (isModelCoolingDown(selectedModel)) {
      const fallbackResult = await tryRateLimitFallback({ chronicle, userMessage, appendUserMessage, reuseTrailingUserMessage, sourceModel: selectedModel });
      if (fallbackResult) {
        return finalizeFallbackResponse(chronicle, fallbackResult, replaceIntroMessage, openingScene, replaceLastAssistant);
      }

      setStatus(getRateLimitStatusMessage(selectedModel, getFallbackModelChain(selectedModel)), true);
      return false;
    }

    if (appendUserMessage && !reuseTrailingUserMessage) {
      chronicle.messages.push({
        id: uid('msg'),
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
      });
      persist();
      renderChat(chronicle.messages);
    }

    setStatus(pendingStatus);
    debugLog(openingScene ? 'Requesting opening scene' : 'Sending chat message', {
      chronicleId: chronicle.id,
      model: selectedModel,
      messageLength: userMessage.length,
      hookIds: chronicle.plotHookIds,
    });

    try {
      chronicle.lastStorytellerRequest = {
        userMessage,
        appendUserMessage: Boolean(appendUserMessage),
        replaceIntroMessage: Boolean(replaceIntroMessage),
        openingScene: Boolean(openingScene),
      };
      const city = getChronicleCity(chronicle);
      const selectedHooks = getChronicleHookSummaries(chronicle.cityId, chronicle.plotHookIds);
      const pack = getChroniclePack(chronicle.cityId);
      const history = appendUserMessage || reuseTrailingUserMessage ? chronicle.messages.slice(0, -1).slice(-8) : chronicle.messages.slice(-8);
      const characterSummaryMode = shouldUseFullCharacterSummary(chronicle, { openingScene, userMessage }) ? 'full' : 'compact';
      const systemPrompt = buildSystemPrompt({
        guardrails,
        city,
        hooks: selectedHooks,
        subplotSeeds: pack.subplots,
        mainPlotSeeds: pack.mainPlots,
        npcSeeds: pack.npcSeeds,
        npcReferenceSheets: formatNpcReferenceSheetsForPrompt(chronicle.cityId),
        npcConversionWorkflow: getNpcConversionWorkflow(),
        chronicle,
        character: chronicle.character,
        characterSummaryMode,
      });
      noteCharacterSummarySent(chronicle, characterSummaryMode);
      const result = await sendChatCompletion({
        apiKey: state.apiKey,
        model: selectedModel,
        systemPrompt,
        history,
        userMessage,
      });
      let resolvedResult = result;

      if (!resolvedResult?.model) {
        resolvedResult = {
          ...result,
          model: selectedModel,
        };
      }

      clearModelCooldown(selectedModel);
      clearModelCooldown(resolvedResult.model);

      const parsed = parseAssistantStatePayload(resolvedResult.content);
      applyStructuredUpdates(chronicle, parsed.updates);
      debugLog('Received storyteller response', {
        chronicleId: chronicle.id,
        model: resolvedResult.model,
        hasStateUpdates: Boolean(parsed.updates),
        openingScene,
      });

      if (replaceIntroMessage && chronicle.messages.length === 1 && chronicle.messages[0].role === 'assistant') {
        chronicle.messages = [];
      }
      if (replaceLastAssistant && chronicle.messages.at(-1)?.role === 'assistant') {
        chronicle.messages.pop();
      }

      chronicle.messages.push({
        id: uid('msg'),
        role: 'assistant',
        content: parsed.text || resolvedResult.content,
        timestamp: new Date().toISOString(),
      });

      if (openingScene) {
        chronicle.openingSceneDelivered = true;
      }

      let responseStatus = `Response received from ${resolvedResult.model}.`;
      if (runtime.cloud.configured && runtime.cloud.user) {
        try {
          const spendUnits = getModelCostUnits(resolvedResult.model || state.model || DEFAULT_MODEL, state.customModelCostUnits);
          const bank = await spendStoryCredit(runtime.cloud.user.uid, chronicle.id, resolvedResult.model || state.model || DEFAULT_MODEL, state.customModelCostUnits);
          updateCloudState({ bank, error: '' });
          responseStatus = spendUnits <= 0
            ? `${responseStatus} Free-model use consumed. ${bank.freeUseRemaining} free use${bank.freeUseRemaining === 1 ? '' : 's'} remain today.`
            : `${responseStatus} ${formatBatteryUnits(bank.balanceUnits)} battery units remain.`;
        } catch (creditError) {
          debugLog('Cloud credit sync failed after response', {
            chronicleId: chronicle.id,
            message: creditError.message,
          });
          updateCloudState({ error: creditError.message });
          responseStatus = `${responseStatus} Credit sync warning: ${creditError.message}`;
        }
      }

      persist();
      render();
      await syncArchiveFiles(chronicle, false);
      setStatus(responseStatus, responseStatus.includes('warning'));
      return true;
    } catch (error) {
      if (error?.isRateLimit) {
        registerModelRateLimit(selectedModel);
        const fallbackResult = await tryRateLimitFallback({ chronicle, userMessage, appendUserMessage, reuseTrailingUserMessage, sourceModel: selectedModel });
        if (fallbackResult) {
          return finalizeFallbackResponse(chronicle, fallbackResult, replaceIntroMessage, openingScene, replaceLastAssistant);
        }
        error.message = getRateLimitStatusMessage(selectedModel, getFallbackModelChain(selectedModel));
      }
      debugLog('Storyteller request failed', { chronicleId: chronicle.id, message: error.message, openingScene });
      chronicle.messages.push({
        id: uid('msg'),
        role: 'assistant',
        content: `Storyteller connection error: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
      persist();
      renderChat(chronicle.messages);
      setStatus(error.message, true);
      return false;
    }
  }

  async function tryRateLimitFallback({ chronicle, userMessage, appendUserMessage, reuseTrailingUserMessage = false, sourceModel }) {
    const currentModel = sourceModel || state.model || DEFAULT_MODEL;
    const fallbackModels = isKnownStoryModel(currentModel) ? getFallbackModelChain(currentModel) : [];
    if (!fallbackModels.length) {
      return null;
    }

    const city = getChronicleCity(chronicle);
    const selectedHooks = getChronicleHookSummaries(chronicle.cityId, chronicle.plotHookIds);
    const pack = getChroniclePack(chronicle.cityId);
    const history = appendUserMessage || reuseTrailingUserMessage ? chronicle.messages.slice(0, -1).slice(-8) : chronicle.messages.slice(-8);
    const characterSummaryMode = shouldUseFullCharacterSummary(chronicle, { userMessage }) ? 'full' : 'compact';
    const systemPrompt = buildSystemPrompt({
      guardrails,
      city,
      hooks: selectedHooks,
      subplotSeeds: pack.subplots,
      mainPlotSeeds: pack.mainPlots,
      npcSeeds: pack.npcSeeds,
      npcReferenceSheets: formatNpcReferenceSheetsForPrompt(chronicle.cityId),
      npcConversionWorkflow: getNpcConversionWorkflow(),
      chronicle,
      character: chronicle.character,
      characterSummaryMode,
    });
    noteCharacterSummarySent(chronicle, characterSummaryMode);

    for (const fallbackModel of fallbackModels) {
      if (isModelCoolingDown(fallbackModel)) {
        continue;
      }

      try {
        setStatus(`Primary model was rate-limited. Retrying with ${fallbackModel}.`);
        const result = await sendChatCompletion({
          apiKey: state.apiKey,
          model: fallbackModel,
          systemPrompt,
          history,
          userMessage,
        });
        clearModelCooldown(fallbackModel);
        return {
          ...result,
          model: result.model || fallbackModel,
          fallbackFrom: currentModel,
        };
      } catch (fallbackError) {
        if (fallbackError?.isRateLimit) {
          registerModelRateLimit(fallbackModel);
        }
        if (!fallbackError?.isRateLimit) {
          throw fallbackError;
        }
      }
    }

    return null;
  }

  async function finalizeFallbackResponse(chronicle, result, replaceIntroMessage, openingScene, replaceLastAssistant = false) {
    const parsed = parseAssistantStatePayload(result.content);
    applyStructuredUpdates(chronicle, parsed.updates);
    debugLog('Received storyteller response via fallback model', {
      chronicleId: chronicle.id,
      model: result.model,
      fallbackFrom: result.fallbackFrom,
      hasStateUpdates: Boolean(parsed.updates),
      openingScene,
    });

    if (replaceIntroMessage && chronicle.messages.length === 1 && chronicle.messages[0].role === 'assistant') {
      chronicle.messages = [];
    }
    if (replaceLastAssistant && chronicle.messages.at(-1)?.role === 'assistant') {
      chronicle.messages.pop();
    }

    chronicle.messages.push({
      id: uid('msg'),
      role: 'assistant',
      content: parsed.text || result.content,
      timestamp: new Date().toISOString(),
    });

    if (openingScene) {
      chronicle.openingSceneDelivered = true;
    }

    let responseStatus = `Primary model hit a rate limit. Response delivered by fallback model ${result.model}.`;
    if (runtime.cloud.configured && runtime.cloud.user) {
      const spendUnits = getModelCostUnits(result.model || DEFAULT_MODEL, state.customModelCostUnits);
      try {
        const bank = await spendStoryCredit(runtime.cloud.user.uid, chronicle.id, result.model || DEFAULT_MODEL, state.customModelCostUnits);
        updateCloudState({ bank, error: '' });
        responseStatus = spendUnits <= 0
          ? `${responseStatus} Free-model use consumed. ${bank.freeUseRemaining} free use${bank.freeUseRemaining === 1 ? '' : 's'} remain today.`
          : `${responseStatus} ${formatBatteryUnits(bank.balanceUnits)} battery units remain.`;
      } catch (creditError) {
        updateCloudState({ error: creditError.message });
        responseStatus = `${responseStatus} Battery sync warning: ${creditError.message}`;
      }
    }

    persist();
    render();
    await syncArchiveFiles(chronicle, false);
    setStatus(responseStatus, responseStatus.includes('warning'));
    return true;
  }

  async function onSummarizeChronicle(chronicle) {
    syncApiConfigFromInputs();

    if (!state.apiKey) {
      setStatus('Add an OpenRouter API key before generating a chronicle summary.', true);
      return;
    }

    const city = getChronicleCity(chronicle);
    const campaignMemory = chronicle.campaignMemory || getDefaultCampaignMemoryState();
    const recentMessages = chronicle.messages.slice(-40).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const systemPrompt = [
      'You are a Vampire: The Masquerade V20 chronicle archivist.',
      'Update the campaign memory for long-running Storyteller context retention.',
      'Preserve only durable context: established facts, NPC motives, faction positions, unresolved threats, boon/debt obligations, relationship changes, player commitments, earned consequences, and major turning points.',
      'Do not write purple prose. Keep each field concise and operational.',
      'Return exactly one fenced ```vtm_memory JSON block and nothing else.',
      'The JSON must include these string keys: summary, establishedFacts, unresolvedThreads, factionPositions, boonsAndDebts, relationshipShifts, timeline.',
      `City: ${city?.name || 'Unknown'}`,
      `Existing summary: ${chronicle.summary || 'None yet.'}`,
      `Existing established facts: ${campaignMemory.establishedFacts || 'None yet.'}`,
      `Existing unresolved threads: ${campaignMemory.unresolvedThreads || 'None yet.'}`,
      `Existing faction positions: ${campaignMemory.factionPositions || 'None yet.'}`,
      `Existing boons and debts: ${campaignMemory.boonsAndDebts || 'None yet.'}`,
      `Existing relationship shifts: ${campaignMemory.relationshipShifts || 'None yet.'}`,
      `Existing timeline: ${campaignMemory.timeline || 'None yet.'}`,
      `Current notes: ${chronicle.notes || 'No notes yet.'}`,
      `Current plot points: ${chronicle.plotPoints || 'No plot points yet.'}`,
    ].join('\n');

    setStatus('The Storyteller is condensing the chronicle into persistent campaign memory.');

    try {
      const result = await sendChatCompletion({
        apiKey: state.apiKey,
        model: state.model || DEFAULT_MODEL,
        systemPrompt,
        history: recentMessages,
        userMessage: 'Produce the updated chronicle memory now.',
      });

      const parsed = parseCampaignMemoryPayload(result.content);
      chronicle.summary = parsed.summary || chronicle.summary;
      chronicle.campaignMemory = {
        ...getDefaultCampaignMemoryState(),
        ...chronicle.campaignMemory,
        ...parsed.campaignMemory,
      };
      persist();
      render();
      await syncArchiveFiles(chronicle, false);
      setStatus(`Chronicle memory updated from ${result.model}.`);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function applyStructuredUpdates(chronicle, updates) {
    if (!updates || typeof updates !== 'object') {
      return;
    }

    debugLog('Applying structured updates', { chronicleId: chronicle.id, keys: Object.keys(updates) });

    if (Array.isArray(updates.backgrounds)) {
      chronicle.character.backgrounds = sanitizeStructuredBackgrounds(updates.backgrounds);
      syncCharacterDerivedStats(chronicle.character);
      markCharacterSummaryDirty(chronicle);
    }

    if (Array.isArray(updates.equipment)) {
      chronicle.character.equipment = updates.equipment.map((item) => ({
        id: uid('equipment'),
        name: item.name || 'Equipment',
        details: item.details || '',
      }));
      markCharacterSummaryDirty(chronicle);
    }

    if (Array.isArray(updates.items)) {
      chronicle.character.items = updates.items.map((item) => ({
        id: uid('item'),
        name: item.name || 'Item',
        details: item.details || '',
      }));
      markCharacterSummaryDirty(chronicle);
    }

    if (typeof updates.notesAppend === 'string' && updates.notesAppend.trim()) {
      chronicle.notes = [chronicle.notes, updates.notesAppend.trim()].filter(Boolean).join('\n\n');
    }

    if (typeof updates.plotPoint === 'string' && updates.plotPoint.trim()) {
      chronicle.plotPoints = [chronicle.plotPoints, updates.plotPoint.trim()].filter(Boolean).join('\n\n');
    }

    if (typeof updates.summaryReplace === 'string' && updates.summaryReplace.trim()) {
      chronicle.summary = updates.summaryReplace.trim();
    }

    if (updates.campaignMemory && typeof updates.campaignMemory === 'object') {
      chronicle.campaignMemory = {
        ...getDefaultCampaignMemoryState(),
        ...(chronicle.campaignMemory ?? {}),
        ...Object.fromEntries(
          Object.entries(updates.campaignMemory)
            .filter(([, value]) => typeof value === 'string' && value.trim())
            .map(([key, value]) => [key, value.trim()]),
        ),
      };
    }

    if (updates.downtime && typeof updates.downtime === 'object') {
      applyDowntimeUpdate(chronicle, updates.downtime);
      if (updates.downtime.active === true) {
        state.activePanel = 'downtime';
        runtime.xpDraft = null;
      } else if (updates.downtime.active === false && state.activePanel === 'downtime') {
        state.activePanel = null;
      }
    }

    if (updates.willpowerRecovery && typeof updates.willpowerRecovery === 'object') {
      recoverTemporaryWillpower(chronicle.character, updates.willpowerRecovery.amount);
      markCharacterSummaryDirty(chronicle);
    }

    if (updates.currentBloodPool && typeof updates.currentBloodPool === 'object') {
      setCurrentBloodPool(chronicle.character, updates.currentBloodPool.current);
      markCharacterSummaryDirty(chronicle);
    }

    if (updates.healthStatus && typeof updates.healthStatus === 'object') {
      setCurrentHealthLevel(chronicle.character, updates.healthStatus.level);
      markCharacterSummaryDirty(chronicle);
    }

    if (updates.temporaryResources && typeof updates.temporaryResources === 'object') {
      setCurrentTemporaryResources(chronicle.character, updates.temporaryResources.current);
      markCharacterSummaryDirty(chronicle);
    }

    if (Array.isArray(updates.temporaryEffects)) {
      chronicle.temporaryEffects = updates.temporaryEffects.map((item) => ({
        id: uid('temporary-effect'),
        name: item?.name || 'Temporary effect',
        details: item?.details || '',
      }));
      markCharacterSummaryDirty(chronicle);
    }

    if (Array.isArray(updates.xpAwards)) {
      for (const award of updates.xpAwards) {
        awardStorytellerXp(chronicle, award);
      }
    }

    if (Array.isArray(updates.npcs)) {
      for (const incoming of updates.npcs) {
        if (!incoming?.name) {
          continue;
        }
        const existing = chronicle.npcs.find((npc) => npc.name.toLowerCase() === incoming.name.toLowerCase());
        if (existing) {
          applyStructuredNpcUpdate(existing, incoming);
        } else {
          chronicle.npcs.push(createStructuredNpcRecord(incoming));
        }
      }
    }
  }

  function closeOverlay() {
    state.activePanel = null;
    runtime.xpDraft = null;
    persist();
    render();
  }
}

function writeTextFile(directoryHandle, fileName, content) {
  return directoryHandle.getFileHandle(fileName, { create: true }).then(async (fileHandle) => {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  });
}

function getDefaultXpDraft(character) {
  const initialOptions = getXpTargetOptions(character, 'attribute');
  return {
    category: 'attribute',
    target: initialOptions[0]?.value ?? '',
    reason: '',
  };
}

function getXpTargetOptions(character, category) {
  const morality = getMoralityConfig(character.path);
  if (category === 'attribute') {
    return ATTRIBUTE_FIELDS.map((field) => ({ value: field.id, label: field.label }));
  }
  if (category === 'ability') {
    return ABILITY_FIELDS.map((field) => ({ value: field.id, label: field.label }));
  }
  if (category === 'discipline') {
    const existing = character.disciplines
      .filter((item) => item.dots < 5)
      .map((item) => ({ value: `existing:${item.name}`, label: `Raise ${item.name} (${item.dots} -> ${item.dots + 1})` }));
    const known = new Set(character.disciplines.map((item) => item.name));
    const learnable = disciplinesData
      .filter((item) => !known.has(item.name))
      .map((item) => ({ value: `new:${item.name}`, label: `Learn ${item.name}` }));
    return [...existing, ...learnable];
  }
  if (category === 'virtue') {
    return VIRTUE_OPTIONS.map((item) => ({
      value: item.id,
      label:
        item.id === 'conscience'
          ? morality.primaryLabel
          : item.id === 'selfControl'
            ? morality.secondaryLabel
            : item.label,
    }));
  }
  if (category === 'humanity') {
    return [{ value: 'humanity', label: morality.ratingLabel }];
  }
  return [{ value: 'willpower', label: 'Willpower' }];
}

function getXpPurchasePreview(character, draft) {
  const invalid = (summary) => ({
    valid: false,
    cost: 0,
    formula: 'Unavailable',
    summary,
    note: '',
    currentRatingText: '-',
    newRatingText: '-',
  });

  if (!draft?.target) {
    return invalid('No valid purchase target is available.');
  }

  if (draft.category === 'attribute') {
    const current = character.attributes[draft.target] ?? 0;
    const field = ATTRIBUTE_FIELDS.find((item) => item.id === draft.target);
    if (current >= 5) {
      return invalid(`${field?.label ?? 'This attribute'} is already at the normal V20 maximum.`);
    }
    return {
      valid: true,
      cost: current * 4,
      formula: 'Attribute: current rating x 4',
      summary: `Raise ${field?.label ?? draft.target} from ${current} to ${current + 1}.`,
      note: '',
      currentRatingText: String(current),
      newRatingText: String(current + 1),
    };
  }

  if (draft.category === 'ability') {
    const current = character.abilities[draft.target] ?? 0;
    const field = ABILITY_FIELDS.find((item) => item.id === draft.target);
    if (current >= 5) {
      return invalid(`${field?.label ?? 'This ability'} is already at the normal V20 maximum.`);
    }
    return {
      valid: true,
      cost: current === 0 ? 3 : current * 2,
      formula: current === 0 ? 'New Ability: 3' : 'Ability: current rating x 2',
      summary: `${current === 0 ? 'Learn' : 'Raise'} ${field?.label ?? draft.target} ${current === 0 ? 'to 1' : `from ${current} to ${current + 1}`}.`,
      note: current === 0 ? '' : '',
      currentRatingText: String(current),
      newRatingText: String(current + 1),
    };
  }

  if (draft.category === 'discipline') {
    const [mode, name] = draft.target.split(':');
    if (!name) {
      return invalid('Choose a discipline to learn or raise.');
    }
    if (mode === 'new') {
      return {
        valid: true,
        cost: 10,
        formula: 'New Discipline: 10',
        summary: `Learn ${name} at 1 dot.`,
        note: 'This uses the V20 base cost for learning a new discipline.',
        currentRatingText: '0',
        newRatingText: '1',
      };
    }
    const existing = character.disciplines.find((item) => item.name === name);
    if (!existing) {
      return invalid('That discipline is not on the current sheet.');
    }
    if (existing.dots >= 5) {
      return invalid(`${name} is already at the normal V20 maximum.`);
    }
    const clanDisciplines = getClanDisciplineNames(character.clan);
    const effectiveClanDisciplines = getEffectiveClanDisciplineNames(character);
    const hasMeritOverride = !clanDisciplines.includes(name) && getAdditionalDisciplineMeritSelection(character) === name;
    const factor = effectiveClanDisciplines.length === 0 ? 6 : effectiveClanDisciplines.includes(name) ? 5 : 7;
    const formula = effectiveClanDisciplines.length === 0
      ? 'Discipline: current rating x 6 (clanless fallback)'
      : hasMeritOverride
        ? 'Additional Discipline merit: current rating x 5'
        : effectiveClanDisciplines.includes(name)
          ? 'Clan Discipline: current rating x 5'
          : 'Other Discipline: current rating x 7';
    return {
      valid: true,
      cost: existing.dots * factor,
      formula,
      summary: `Raise ${name} from ${existing.dots} to ${existing.dots + 1}.`,
      note: effectiveClanDisciplines.length === 0
        ? 'No clan discipline list was found for this character, so the clanless fallback is being used.'
        : hasMeritOverride
          ? 'This discipline is marked by Additional Discipline and advances at the in-clan XP rate.'
          : '',
      currentRatingText: String(existing.dots),
      newRatingText: String(existing.dots + 1),
    };
  }

  if (draft.category === 'virtue') {
    const current = character.virtues[draft.target] ?? 0;
    const morality = getMoralityConfig(character.path);
    const label =
      draft.target === 'conscience'
        ? morality.primaryLabel
        : draft.target === 'selfControl'
          ? morality.secondaryLabel
          : VIRTUE_OPTIONS.find((item) => item.id === draft.target)?.label ?? startCase(draft.target);
    if (current >= 5) {
      return invalid(`${label} is already at the normal V20 maximum.`);
    }
    return {
      valid: true,
      cost: current * 2,
      formula: 'Virtue: current rating x 2',
      summary: `Raise ${label} from ${current} to ${current + 1}.`,
      note: `Increasing a Virtue does not automatically raise ${morality.ratingLabel} or Willpower.`,
      currentRatingText: String(current),
      newRatingText: String(current + 1),
    };
  }

  if (draft.category === 'humanity') {
    const morality = getMoralityConfig(character.path);
    const current = character.humanity ?? 0;
    if (current >= 10) {
      return invalid(`${morality.ratingLabel} is already at the normal V20 maximum.`);
    }
    return {
      valid: true,
      cost: current * 2,
      formula: `${morality.ratingLabel}: current rating x 2`,
      summary: `Raise ${morality.ratingLabel} from ${current} to ${current + 1}.`,
      note: '',
      currentRatingText: String(current),
      newRatingText: String(current + 1),
    };
  }

  const current = character.willpower ?? 0;
  if (current >= 10) {
    return invalid('Willpower is already at the normal V20 maximum.');
  }
  return {
    valid: true,
    cost: current,
    formula: 'Willpower: current rating',
    summary: `Raise Willpower from ${current} to ${current + 1}.`,
    note: '',
    currentRatingText: String(current),
    newRatingText: String(current + 1),
  };
}

function applyXpPurchase(character, draft, purchase) {
  if (draft.category === 'attribute') {
    character.attributes[draft.target] += 1;
    return;
  }
  if (draft.category === 'ability') {
    character.abilities[draft.target] += 1;
    return;
  }
  if (draft.category === 'discipline') {
    const [mode, name] = draft.target.split(':');
    if (mode === 'new') {
      character.disciplines.push({ id: uid('discipline'), name, dots: 1 });
      return;
    }
    const discipline = character.disciplines.find((item) => item.name === name);
    if (discipline) {
      discipline.dots += 1;
    }
    return;
  }
  if (draft.category === 'virtue') {
    character.virtues[draft.target] += 1;
    return;
  }
  if (draft.category === 'humanity') {
    character.humanity += 1;
    return;
  }
  if (draft.category === 'willpower') {
    character.willpower += 1;
  }
}

function getClanDisciplineNames(clanName) {
  return clansData.find((clan) => clan.name === clanName)?.disciplines ?? [];
}

function ensureChronicleProgressionState(chronicle) {
  if (!chronicle.progression || typeof chronicle.progression !== 'object') {
    chronicle.progression = {
      phase: 'scene',
      sessionNumber: 1,
      downtimeReason: '',
      rewardCaps: {
        desireGranted: false,
        ambitionGranted: false,
      },
    };
    return chronicle.progression;
  }

  chronicle.progression.phase = chronicle.progression.phase === 'downtime' ? 'downtime' : 'scene';
  chronicle.progression.sessionNumber = Math.max(1, Number(chronicle.progression.sessionNumber) || 1);
  chronicle.progression.downtimeReason = chronicle.progression.downtimeReason || '';
  chronicle.progression.rewardCaps = {
    desireGranted: Boolean(chronicle.progression.rewardCaps?.desireGranted),
    ambitionGranted: Boolean(chronicle.progression.rewardCaps?.ambitionGranted),
  };
  return chronicle.progression;
}

function isDowntimeActive(chronicle) {
  return ensureChronicleProgressionState(chronicle).phase === 'downtime';
}

function canSpendExperience(chronicle) {
  return !chronicle.character.created || isDowntimeActive(chronicle);
}

function beginDowntime(chronicle, reason = '') {
  const progression = ensureChronicleProgressionState(chronicle);
  progression.phase = 'downtime';
  progression.downtimeReason = reason.trim();
  chronicle.temporaryEffects = [];
  markCharacterSummaryDirty(chronicle);
}

function resumeScenesFromDowntime(chronicle) {
  const progression = ensureChronicleProgressionState(chronicle);
  const wasDowntime = progression.phase === 'downtime';
  progression.phase = 'scene';
  progression.downtimeReason = '';
  let willpowerRecovered = 0;
  let resourcesRecovered = 0;
  if (wasDowntime) {
    willpowerRecovered = recoverTemporaryWillpower(chronicle.character, TEMPORARY_WILLPOWER_RECOVERY);
    resourcesRecovered = recoverTemporaryResources(chronicle.character, TEMPORARY_RESOURCES_RECOVERY);
    progression.sessionNumber += 1;
    progression.rewardCaps = {
      desireGranted: false,
      ambitionGranted: false,
    };
  }
  if (wasDowntime) {
    markCharacterSummaryDirty(chronicle);
  }
  return { willpowerRecovered, resourcesRecovered };
}

function getXpGateMessage(chronicle) {
  return isDowntimeActive(chronicle)
    ? ''
    : 'XP spending is locked during active scenes. Enter downtime before making purchases.';
}

function awardStorytellerXp(chronicle, award) {
  const amount = Math.max(0, Number(award?.amount) || 0);
  const reason = typeof award?.reason === 'string' ? award.reason.trim() : '';
  const category = typeof award?.category === 'string' && award.category.trim() ? award.category.trim() : 'reward';
  if (!amount || !reason) {
    return false;
  }

  const progression = ensureChronicleProgressionState(chronicle);
  if (category === 'desire' && progression.rewardCaps.desireGranted) {
    return false;
  }
  if (category === 'ambition' && progression.rewardCaps.ambitionGranted) {
    return false;
  }

  chronicle.character.experience.unspent += amount;
  chronicle.character.experience.log.unshift({
    id: uid('xp-award'),
    category,
    award: amount,
    cost: 0,
    reason,
    formula: `Storyteller award (${category})`,
    summary: reason,
    timestamp: new Date().toISOString(),
  });

  if (category === 'desire') {
    progression.rewardCaps.desireGranted = true;
  }
  if (category === 'ambition') {
    progression.rewardCaps.ambitionGranted = true;
  }
  return true;
}

function applyDowntimeUpdate(chronicle, downtimeUpdate) {
  if (!downtimeUpdate || typeof downtimeUpdate !== 'object') {
    return;
  }

  if (downtimeUpdate.active === true) {
    beginDowntime(chronicle, typeof downtimeUpdate.reason === 'string' ? downtimeUpdate.reason : 'Storyteller-triggered downtime');
    return;
  }

  if (downtimeUpdate.active === false) {
    resumeScenesFromDowntime(chronicle);
  }
}

function recoverTemporaryWillpower(character, amount = TEMPORARY_WILLPOWER_RECOVERY) {
  const maximum = Math.max(0, Number(character.willpower) || 0);
  const current = Math.max(0, Math.min(maximum, Number(character.currentWillpower ?? maximum) || 0));
  const requested = Math.max(0, Number(amount) || 0);
  const recovered = Math.max(0, Math.min(requested, maximum - current));
  character.currentWillpower = current + recovered;
  return recovered;
}

function setCurrentBloodPool(character, current) {
  const maximum = Math.max(0, Number(character.bloodPool) || 0);
  character.currentBloodPool = Math.max(0, Math.min(maximum, Number(current) || 0));
}

function setCurrentHealthLevel(character, level) {
  const maximum = Math.max(0, (character.health?.length ?? 1) - 1);
  character.currentHealthLevel = Math.max(0, Math.min(maximum, Number(level) || 0));
}

function setCurrentTemporaryResources(character, current) {
  const maximum = Math.max(0, getBackgroundDotsByName(character, 'Resources'));
  character.currentResources = Math.max(0, Math.min(maximum, Number(current) || 0));
}

function recoverTemporaryResources(character, amount = TEMPORARY_RESOURCES_RECOVERY) {
  const maximum = Math.max(0, getBackgroundDotsByName(character, 'Resources'));
  const current = Math.max(0, Math.min(maximum, Number(character.currentResources ?? maximum) || 0));
  const requested = Math.max(0, Number(amount) || 0);
  const recovered = Math.max(0, Math.min(requested, maximum - current));
  character.currentResources = current + recovered;
  return recovered;
}

function hasAdditionalDisciplineMerit(character) {
  return [...(character.merits ?? []), ...(character.clanMerits ?? [])].some((item) => ADDITIONAL_DISCIPLINE_MERIT_NAMES.has(item.name));
}

function getAdditionalDisciplineMeritSelection(character) {
  return Array.isArray(character.additionalClanDisciplines) && character.additionalClanDisciplines.length
    ? character.additionalClanDisciplines[0]
    : '';
}

function getAdditionalDisciplineMeritOptions(character) {
  const clanDisciplines = new Set(getClanDisciplineNames(character.clan));
  const sheetDisciplines = character.disciplines.map((item) => item.name).filter(Boolean);
  const outOfClanOptions = disciplinesData
    .map((item) => item.name)
    .filter((name) => !clanDisciplines.has(name));
  return [...new Set([...sheetDisciplines.filter((name) => !clanDisciplines.has(name)), ...outOfClanOptions])];
}

function getEffectiveClanDisciplineNames(character) {
  return [...new Set([...getClanDisciplineNames(character.clan), ...((character.additionalClanDisciplines ?? []).filter(Boolean))])];
}

function bindAdditionalDisciplineMeritSelector(container, character, persistCharacter, rerenderView) {
  const select = container.querySelector('[data-role="additional-discipline-merit"]');
  if (!select) {
    return;
  }

  select.addEventListener('change', (event) => {
    const value = event.target.value.trim();
    character.additionalClanDisciplines = value ? [value] : [];
    persistCharacter();
    if (typeof rerenderView === 'function') {
      rerenderView();
    }
  });
}

function getMoralityConfig(pathName) {
  const selectedPath = pathsData.find((item) => item.name === pathName) ?? pathsData[0];
  if (!selectedPath || selectedPath.name === 'Humanity') {
    return {
      primaryLabel: 'Conscience',
      secondaryLabel: 'Self-Control',
      ratingLabel: 'Humanity',
    };
  }

  return {
    primaryLabel: selectedPath.virtues?.[0] || 'Conviction',
    secondaryLabel: selectedPath.virtues?.[1] || 'Instinct',
    ratingLabel: 'Path Rating',
  };
}

function applyClanDisciplineDefaults(character) {
  if (character.clan === 'Caitiff') {
    return;
  }

  const clanDisciplines = getClanDisciplineNames(character.clan);
  if (!clanDisciplines.length) {
    return;
  }

  character.disciplines = clanDisciplines.map((name) => ({
    id: uid('discipline'),
    name,
    dots: 1,
  }));
}

function getMeritOrFlawDefinition(kind, name) {
  const definitions = kind === 'merit' ? meritsFlawsData.merits : meritsFlawsData.flaws;
  return definitions.find((item) => item.name === name) ?? definitions[0] ?? { name, points: 1, summary: '' };
}

function getClanSpecificOptions(clanName) {
  if (clanName === 'Caitiff') {
    return getAllClanSpecificOptions();
  }
  return clanMeritsFlawsData[clanName] ?? { merits: [], flaws: [] };
}

function getPointTraitDefinition(kind, name, clanName = 'Brujah') {
  if (kind === 'merit' || kind === 'flaw') {
    return getMeritOrFlawDefinition(kind, name);
  }
  const options = getClanSpecificOptions(clanName);
  const definitions = kind === 'clan-merit' ? options.merits : options.flaws;
  return definitions.find((item) => item.name === name) ?? definitions[0] ?? { name, points: 1, summary: '' };
}

function getPointTraitCollectionKey(kind) {
  if (kind === 'clan-merit') {
    return 'clanMerits';
  }
  if (kind === 'clan-flaw') {
    return 'clanFlaws';
  }
  return `${kind}s`;
}

function getAllClanSpecificOptions() {
  const merits = [];
  const flaws = [];

  for (const [clanName, options] of Object.entries(clanMeritsFlawsData)) {
    for (const entry of options.merits ?? []) {
      merits.push({
        ...entry,
        name: `${clanName}: ${entry.name}`,
      });
    }

    for (const entry of options.flaws ?? []) {
      flaws.push({
        ...entry,
        name: `${clanName}: ${entry.name}`,
      });
    }
  }

  return { merits, flaws };
}

function resetClanSpecificSelections(character) {
  character.clanMerits = [];
  character.clanFlaws = [];
}

function getBackgroundDotsByName(character, backgroundName) {
  return character.backgrounds
    .filter((item) => item.name === backgroundName)
    .reduce((sum, item) => sum + Math.max(0, Number(item.dots) || 0), 0);
}

function syncCharacterDerivedStats(character) {
  const creation = ensureCharacterCreationState(character);
  const generationDots = Math.max(0, Math.min(5, getBackgroundDotsByName(character, 'Generation')));
  const resourceDots = Math.max(0, getBackgroundDotsByName(character, 'Resources'));
  character.generation = 13 - generationDots;
  character.bloodPool = 10 + generationDots;
  if (!character.created && creation.phase === 'allocation') {
    character.willpower = Math.max(0, Math.min(10, Number(character.virtues?.courage) || 0));
  }
  const maximumWillpower = Math.max(0, Number(character.willpower) || 0);
  if (!character.created) {
    character.currentWillpower = maximumWillpower;
    character.currentBloodPool = character.bloodPool;
    character.currentResources = resourceDots;
    character.currentHealthLevel = 0;
    syncCreationAutoSpecialties(character);
  } else {
    character.currentWillpower = Math.max(0, Math.min(maximumWillpower, Number(character.currentWillpower ?? maximumWillpower) || 0));
    character.currentBloodPool = Math.max(0, Math.min(character.bloodPool, Number(character.currentBloodPool ?? character.bloodPool) || 0));
    character.currentResources = Math.max(0, Math.min(resourceDots, Number(character.currentResources ?? resourceDots) || 0));
    character.currentHealthLevel = Math.max(0, Math.min((character.health?.length ?? 1) - 1, Number(character.currentHealthLevel) || 0));
  }
  return {
    backgroundDots: generationDots,
    generation: character.generation,
    bloodPool: character.bloodPool,
  };
}

function getDefaultCreationState() {
  return {
    phase: 'allocation',
    uiStep: 'identity',
    allocationSnapshot: null,
    freebieSnapshot: null,
    startingExperience: 15,
  };
}

function getSpecialtyDefinitionForAbility(abilityId) {
  return specialtiesData.find((entry) => entry.ability === abilityId) ?? null;
}

function getDefaultSpecialtyNameForAbility(abilityId) {
  const definition = getSpecialtyDefinitionForAbility(abilityId);
  if (definition?.examples?.length) {
    return definition.examples[0];
  }
  const label = ABILITY_FIELDS.find((field) => field.id === abilityId)?.label ?? startCase(abilityId);
  return `${label} Expertise`;
}

function syncCreationAutoSpecialties(character) {
  if (character.created) {
    return;
  }

  const eligibleAbilities = new Set(
    Object.entries(character.abilities ?? {})
      .filter(([, value]) => (Number(value) || 0) >= 4)
      .map(([abilityId]) => abilityId),
  );

  character.specialties = (Array.isArray(character.specialties) ? character.specialties : []).filter((item) => {
    if (!item?.isAuto) {
      return true;
    }
    return eligibleAbilities.has(item.ability);
  });

  eligibleAbilities.forEach((abilityId) => {
    const existing = character.specialties.find((item) => item.ability === abilityId);
    if (existing) {
      return;
    }
    character.specialties.push({
      id: uid('specialty'),
      ability: abilityId,
      name: getDefaultSpecialtyNameForAbility(abilityId),
      isAuto: true,
    });
  });
}

function ensureCharacterCreationState(character) {
  if (!character.creation || typeof character.creation !== 'object') {
    character.creation = getDefaultCreationState();
    return character.creation;
  }

  character.creation = {
    ...getDefaultCreationState(),
    ...character.creation,
  };
  return character.creation;
}

function getCharacterCreationPhase(character) {
  ensureCharacterCreationState(character);
  return character.creation?.phase || 'allocation';
}

function captureCharacterCreationSnapshot(character) {
  return {
    attributes: { ...character.attributes },
    abilities: { ...character.abilities },
    disciplines: character.disciplines.map((item) => ({ id: item.id, name: item.name, dots: Number(item.dots) || 0 })),
    backgrounds: character.backgrounds.map((item) => ({ id: item.id, name: item.name, dots: Number(item.dots) || 0 })),
    virtues: { ...character.virtues },
    humanity: Number(character.humanity) || 0,
    willpower: Number(character.willpower) || 0,
    merits: character.merits.map((item) => ({ id: item.id, name: item.name, points: Number(item.points) || 0 })),
    flaws: character.flaws.map((item) => ({ id: item.id, name: item.name, points: Number(item.points) || 0 })),
    clanMerits: character.clanMerits.map((item) => ({ id: item.id, name: item.name, points: Number(item.points) || 0 })),
    clanFlaws: character.clanFlaws.map((item) => ({ id: item.id, name: item.name, points: Number(item.points) || 0 })),
  };
}

function getAttributeExtraDots(attributes) {
  return Object.values(attributes).reduce((sum, value) => sum + Math.max(0, (Number(value) || 0) - 1), 0);
}

function getAbilityDots(abilities) {
  return Object.values(abilities).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

function getVirtueDots(virtues) {
  return Object.values(virtues).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

function getTraitDots(items) {
  return items.reduce((sum, item) => sum + Math.max(0, Number(item.dots) || 0), 0);
}

function getPointTotal(items) {
  return items.reduce((sum, item) => sum + (Number(item.points) || 0), 0);
}

function getCreationSnapshotTotals(snapshot) {
  if (!snapshot) {
    return null;
  }

  return {
    attributeDots: getAttributeExtraDots(snapshot.attributes ?? {}),
    abilityDots: getAbilityDots(snapshot.abilities ?? {}),
    disciplineDots: getTraitDots(snapshot.disciplines ?? []),
    backgroundDots: getTraitDots(snapshot.backgrounds ?? []),
    virtueDots: getVirtueDots(snapshot.virtues ?? {}),
    humanity: Number(snapshot.humanity) || 0,
    willpower: Number(snapshot.willpower) || 0,
    meritsCost: getPointTotal([...(snapshot.merits ?? []), ...(snapshot.clanMerits ?? [])]),
    flawPoints: getPointTotal([...(snapshot.flaws ?? []), ...(snapshot.clanFlaws ?? [])]),
  };
}

function getCreationSnapshotMinimum(snapshot, collectionKey, id, fallback = 1) {
  const entry = snapshot?.[collectionKey]?.find((item) => item.id === id);
  if (!entry) {
    return fallback;
  }
  return Math.max(fallback, Number(entry.dots) || fallback);
}

function isCreationPhaseLockedEntry(character, type, id) {
  if (getCharacterCreationPhase(character) !== 'freebies') {
    return false;
  }

  const snapshotKey = `${type}s`;
  return Boolean(character.creation?.allocationSnapshot?.[snapshotKey]?.some((item) => item.id === id));
}

function shouldRefreshCreationField(key, inputType) {
  return inputType === 'number' || ['humanity', 'willpower'].includes(key);
}

function sanitizeCreationFieldValue(character, key, value) {
  if (typeof value !== 'number') {
    return value;
  }

  const phase = getCharacterCreationPhase(character);
  if (key === 'humanity') {
    const minimum = phase === 'freebies'
      ? Number(character.creation?.allocationSnapshot?.humanity) || 0
      : (Number(character.virtues.conscience) || 0) + (Number(character.virtues.selfControl) || 0);
    return Math.max(minimum, Math.min(10, value || 0));
  }

  if (key === 'willpower') {
    const minimum = phase === 'freebies'
      ? Number(character.creation?.allocationSnapshot?.willpower) || 0
      : Number(character.virtues.courage) || 0;
    return Math.max(minimum, Math.min(10, value || 0));
  }

  return value;
}

function sanitizeCreationAttributeValue(character, fieldId, value) {
  const minimum = getCharacterCreationPhase(character) === 'freebies'
    ? Number(character.creation?.allocationSnapshot?.attributes?.[fieldId]) || 1
    : 1;
  return Math.max(minimum, Math.min(5, value || 0));
}

function sanitizeCreationAbilityValue(character, fieldId, value) {
  const minimum = getCharacterCreationPhase(character) === 'freebies'
    ? Number(character.creation?.allocationSnapshot?.abilities?.[fieldId]) || 0
    : 0;
  return Math.max(minimum, Math.min(5, value || 0));
}

function sanitizeCreationVirtueValue(character, fieldId, value) {
  const minimum = getCharacterCreationPhase(character) === 'freebies'
    ? Number(character.creation?.allocationSnapshot?.virtues?.[fieldId]) || 1
    : 1;
  return Math.max(minimum, Math.min(5, value || 0));
}

function sanitizeCreationTraitDots(character, type, id, value) {
  const minimum = getCharacterCreationPhase(character) === 'freebies'
    ? getCreationSnapshotMinimum(character.creation?.allocationSnapshot, `${type}s`, id, 1)
    : 1;
  return Math.max(minimum, Math.min(5, value || 0));
}

function getCharacterCreationBudget(character) {
  const morality = getMoralityConfig(character.path);
  const generation = syncCharacterDerivedStats(character);
  const allocationSnapshotTotals = getCreationSnapshotTotals(character.creation?.allocationSnapshot);
  const attributeExtraDots = getAttributeExtraDots(character.attributes);
  const attributeForcedFreebies = Object.values(character.attributes).reduce((sum, value) => sum + Math.max(0, (Number(value) || 0) - 4), 0);
  const abilityDots = getAbilityDots(character.abilities);
  const abilityForcedFreebies = Object.values(character.abilities).reduce((sum, value) => sum + Math.max(0, (Number(value) || 0) - 3), 0);
  const disciplineDots = getTraitDots(character.disciplines);
  const backgroundDots = getTraitDots(character.backgrounds);
  const virtueDots = getVirtueDots(character.virtues);
  const humanityBase = allocationSnapshotTotals?.humanity ?? (Number(character.virtues.conscience) || 0) + (Number(character.virtues.selfControl) || 0);
  const willpowerBase = allocationSnapshotTotals?.willpower ?? (Number(character.virtues.courage) || 0);
  const meritsCost = [...character.merits, ...character.clanMerits].reduce((sum, item) => sum + (Number(item.points) || 0), 0);
  const flawPoints = [...character.flaws, ...character.clanFlaws].reduce((sum, item) => sum + (Number(item.points) || 0), 0);
  const baseAttributeDots = allocationSnapshotTotals?.attributeDots ?? Math.min(attributeExtraDots, 15);
  const baseAbilityDots = allocationSnapshotTotals?.abilityDots ?? Math.min(abilityDots, 27);
  const baseDisciplineDots = allocationSnapshotTotals?.disciplineDots ?? Math.min(disciplineDots, 3);
  const baseBackgroundDots = allocationSnapshotTotals?.backgroundDots ?? Math.min(backgroundDots, 5);
  const baseVirtueDots = allocationSnapshotTotals?.virtueDots ?? Math.min(virtueDots, 10);
  const baseMeritsCost = allocationSnapshotTotals?.meritsCost ?? 0;
  const baseFlawPoints = allocationSnapshotTotals?.flawPoints ?? 0;
  const attributeFreebieDots = allocationSnapshotTotals ? Math.max(0, attributeExtraDots - baseAttributeDots) : Math.max(0, attributeExtraDots - 15, attributeForcedFreebies);
  const abilityFreebieDots = allocationSnapshotTotals ? Math.max(0, abilityDots - baseAbilityDots) : Math.max(0, abilityDots - 27, abilityForcedFreebies);
  const freebiesAvailable = 15 + flawPoints;
  const freebiesSpent =
    attributeFreebieDots * 5 +
    abilityFreebieDots * 2 +
    Math.max(0, disciplineDots - baseDisciplineDots) * 7 +
    Math.max(0, backgroundDots - baseBackgroundDots) +
    Math.max(0, virtueDots - baseVirtueDots) * 2 +
    Math.max(0, (Number(character.humanity) || 0) - humanityBase) * 2 +
    Math.max(0, (Number(character.willpower) || 0) - willpowerBase) +
    Math.max(0, meritsCost - baseMeritsCost);

  return {
    morality,
    generation,
    phase: getCharacterCreationPhase(character),
    attributeDots: { base: baseAttributeDots, freebies: attributeFreebieDots, total: attributeExtraDots },
    abilityDots: { base: baseAbilityDots, freebies: abilityFreebieDots, total: abilityDots },
    disciplineDots: { base: baseDisciplineDots, freebies: Math.max(0, disciplineDots - baseDisciplineDots), total: disciplineDots },
    backgroundDots: { base: baseBackgroundDots, freebies: Math.max(0, backgroundDots - baseBackgroundDots), total: backgroundDots },
    virtueDots: { base: baseVirtueDots, freebies: Math.max(0, virtueDots - baseVirtueDots), total: virtueDots },
    humanityDots: { base: humanityBase, freebies: Math.max(0, (Number(character.humanity) || 0) - humanityBase), total: Number(character.humanity) || 0 },
    willpowerDots: { base: willpowerBase, freebies: Math.max(0, (Number(character.willpower) || 0) - willpowerBase), total: Number(character.willpower) || 0 },
    meritsCost,
    flawPoints,
    flawPointsFromFreebies: Math.max(0, flawPoints - baseFlawPoints),
    freebiesAvailable,
    freebiesSpent,
    freebiesRemaining: freebiesAvailable - freebiesSpent,
    startingExperience: Number(character.creation?.startingExperience) || 15,
    experienceSpent: Number(character.experience.spent) || 0,
    experienceRemaining: Math.max(0, Number(character.experience.unspent) || 0),
  };
}

function getCharacterCreationValidation(character) {
  const issues = [];
  const budget = getCharacterCreationBudget(character);
  const morality = budget.morality;
  const phase = getCharacterCreationPhase(character);

  const attributeGroupTotals = schema.attributes
    .map((group) => group.fields.reduce((sum, field) => sum + Math.max(0, (Number(character.attributes[field.id]) || 0) - 1), 0))
    .sort((left, right) => left - right);
  const abilityGroupTotals = schema.abilities
    .map((group) => group.fields.reduce((sum, field) => sum + Math.max(0, Number(character.abilities[field.id]) || 0), 0))
    .sort((left, right) => left - right);

  const clanDisciplineNames = getClanDisciplineNames(character.clan);
  const additionalDisciplineSelection = getAdditionalDisciplineMeritSelection(character);
  const disciplineDots = character.disciplines.reduce((sum, item) => sum + Math.max(0, Number(item.dots) || 0), 0);
  const clanDisciplineDots = character.disciplines
    .filter((item) => clanDisciplineNames.includes(item.name))
    .reduce((sum, item) => sum + Math.max(0, Number(item.dots) || 0), 0);
  const backgroundDots = character.backgrounds.reduce((sum, item) => sum + Math.max(0, Number(item.dots) || 0), 0);
  const virtueDots = Object.values(character.virtues).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const humanityBase = (Number(character.virtues.conscience) || 0) + (Number(character.virtues.selfControl) || 0);
  const willpowerBase = Number(character.virtues.courage) || 0;
  const flawPoints = [...character.flaws, ...character.clanFlaws].reduce((sum, item) => sum + (Number(item.points) || 0), 0);

  if (!character.name.trim()) {
    issues.push('Name is required.');
  }
  if (!character.concept.trim()) {
    issues.push('Concept is required.');
  }
  if (!character.nature || !character.demeanor) {
    issues.push('Nature and Demeanor are required.');
  }
  if (hasAdditionalDisciplineMerit(character)) {
    if (!additionalDisciplineSelection) {
      issues.push('Additional Discipline requires you to choose the discipline it treats as in-clan.');
    } else if (clanDisciplineNames.includes(additionalDisciplineSelection)) {
      issues.push('Additional Discipline must point to an out-of-clan discipline, not one already in-clan.');
    } else if (phase !== 'allocation' && !character.disciplines.some((item) => item.name === additionalDisciplineSelection && (Number(item.dots) || 0) > 0)) {
      issues.push('Additional Discipline must be represented on the sheet by at least one purchased dot before you leave creation.');
    }
  }
  if (phase === 'allocation') {
    if (attributeGroupTotals[0] !== 3 || attributeGroupTotals[1] !== 5 || attributeGroupTotals[2] !== 7) {
      issues.push('Allocation phase requires the exact V20 7/5/3 attribute distribution before freebies.');
    }
    if (abilityGroupTotals[0] !== 5 || abilityGroupTotals[1] !== 9 || abilityGroupTotals[2] !== 13) {
      issues.push('Allocation phase requires the exact V20 13/9/5 ability distribution before freebies.');
    }
    if (disciplineDots !== 3) {
      issues.push('Allocation phase requires exactly 3 discipline dots.');
    }
    if (character.clan !== 'Caitiff' && clanDisciplineDots < 3) {
      issues.push('Allocation-phase discipline dots must be in-clan for non-Caitiff characters.');
    }
    if (backgroundDots !== 5) {
      issues.push('Allocation phase requires exactly 5 background dots.');
    }
    if (virtueDots !== 10) {
      issues.push('Allocation phase requires exactly 10 virtue dots including the starting 1/1/1.');
    }
    if ((Number(character.humanity) || 0) !== humanityBase) {
      issues.push(`${morality.ratingLabel} stays at its base value until the freebie phase.`);
    }
    if ((Number(character.willpower) || 0) !== willpowerBase) {
      issues.push('Willpower stays at Courage until the freebie phase.');
    }
    if (flawPoints > 0 || budget.meritsCost > 0) {
      issues.push('Merits and flaws belong to the freebie phase, not the allocation phase.');
    }
    if (budget.freebiesSpent > 0) {
      issues.push('Allocation phase cannot spend freebie points yet.');
    }
  } else if (phase === 'freebies') {
    if (!character.creation?.allocationSnapshot) {
      issues.push('The allocation phase must be confirmed before spending freebies.');
    }
    if ((Number(character.humanity) || 0) < humanityBase) {
      issues.push(`${morality.ratingLabel} cannot be lower than the confirmed allocation value.`);
    }
    if ((Number(character.willpower) || 0) < willpowerBase) {
      issues.push('Willpower cannot be lower than the confirmed allocation value.');
    }
    if (flawPoints > 7) {
      issues.push('Flaw points cannot exceed 7 during character creation.');
    }
    if (character.clan === 'Caitiff' && character.clanMerits.length > 2) {
      issues.push('Caitiff may take at most 2 clan-exclusive merits.');
    }
    if (character.clan === 'Caitiff' && character.clanFlaws.length > 2) {
      issues.push('Caitiff may take at most 2 clan-exclusive flaws.');
    }
    if (budget.freebiesSpent > budget.freebiesAvailable) {
      issues.push(`Freebie overspend: ${budget.freebiesSpent} spent for ${budget.freebiesAvailable} available.`);
    }
    if (budget.freebiesRemaining > 0) {
      issues.push(`Spend the remaining ${budget.freebiesRemaining} freebie point${budget.freebiesRemaining === 1 ? '' : 's'} before confirming this phase.`);
    }
  } else {
    if (!character.creation?.freebieSnapshot) {
      issues.push('The freebie phase must be confirmed before spending starting experience.');
    }
    if ((Number(character.experience.unspent) || 0) < 0) {
      issues.push('Unspent experience cannot be negative.');
    }
  }

  const title =
    phase === 'allocation'
      ? 'Allocation Phase Validation'
      : phase === 'freebies'
        ? 'Freebie Phase Validation'
        : 'Experience Phase Validation';
  const statusLabel = issues.length === 0 ? (phase === 'allocation' ? 'Ready for freebies' : phase === 'freebies' ? 'Ready for starting XP' : 'Ready for chronicle settings') : 'Needs fixes';
  const summary =
    phase === 'allocation'
      ? [
          'Phase: Allocation dots only',
          `Attributes: ${attributeGroupTotals.join('/')} across the three categories`,
          `Abilities: ${abilityGroupTotals.join('/')} across the three categories`,
          `Disciplines: ${disciplineDots} total dot${disciplineDots === 1 ? '' : 's'}${character.clan === 'Caitiff' ? '' : `, ${clanDisciplineDots} in-clan`}`,
          `Backgrounds: ${backgroundDots} total dots`,
          `Virtues: ${virtueDots} total dots`,
          `${morality.ratingLabel} / Willpower: ${character.humanity} / ${character.willpower}`,
        ]
      : phase === 'freebies'
        ? [
            'Phase: Freebie purchases',
            `Generation: ${formatGenerationLabel(character.generation)} from ${budget.generation.backgroundDots} Generation Background dot${budget.generation.backgroundDots === 1 ? '' : 's'}`,
            `Freebies: ${budget.freebiesSpent} spent of ${budget.freebiesAvailable} available`,
          `Additional Discipline: ${additionalDisciplineSelection || 'Not chosen yet'}`,
            `Attributes above allocation: ${budget.attributeDots.freebies} dot${budget.attributeDots.freebies === 1 ? '' : 's'}`,
            `Abilities above allocation: ${budget.abilityDots.freebies} dot${budget.abilityDots.freebies === 1 ? '' : 's'}`,
            `Disciplines/Backgrounds/Virtues above allocation: ${budget.disciplineDots.freebies} / ${budget.backgroundDots.freebies} / ${budget.virtueDots.freebies}`,
            `${morality.ratingLabel} / Willpower above allocation: ${budget.humanityDots.freebies} / ${budget.willpowerDots.freebies}`,
            `Merits: ${budget.meritsCost} spent, Flaws: ${budget.flawPoints} bonus freebies granted`,
          ]
        : [
            'Phase: Starting experience',
            `Starting XP: ${budget.experienceSpent} spent, ${budget.experienceRemaining} remaining of ${budget.startingExperience}`,
            `Freebie phase locked: ${budget.freebiesSpent} freebie points spent`,
            `Additional Discipline: ${additionalDisciplineSelection || 'None'}`,
            `Generation: ${formatGenerationLabel(character.generation)} with Blood Pool ${budget.generation.bloodPool}`,
            `Confirmed merits/flaws: ${character.merits.length + character.clanMerits.length} merit pick${character.merits.length + character.clanMerits.length === 1 ? '' : 's'}, ${character.flaws.length + character.clanFlaws.length} flaw pick${character.flaws.length + character.clanFlaws.length === 1 ? '' : 's'}`,
          ];

  return {
    phase,
    title,
    statusLabel,
    valid: issues.length === 0,
    issues,
    summary,
  };
}

function renderCreationBudget(budget, morality) {
  return `
    <div class="list-card validation-card ${budget.freebiesRemaining === 0 ? 'valid' : 'invalid'}">
      <div class="npc-header-row">
        <h4>Creation Budget</h4>
        <span class="status-pill">${budget.freebiesSpent} / ${budget.freebiesAvailable} freebies</span>
      </div>
      <div class="summary-list validation-list">
        <div>Generation Background: ${budget.generation.backgroundDots} dot${budget.generation.backgroundDots === 1 ? '' : 's'} -> ${escapeHtml(formatGenerationLabel(budget.generation.generation))}, Blood Pool ${budget.generation.bloodPool}</div>
        <div>Attributes: ${budget.attributeDots.base} allocated dots, ${budget.attributeDots.freebies} freebie dot${budget.attributeDots.freebies === 1 ? '' : 's'} (${budget.attributeDots.freebies * 5} freebies)</div>
        <div>Abilities: ${budget.abilityDots.base} allocated dots, ${budget.abilityDots.freebies} freebie dot${budget.abilityDots.freebies === 1 ? '' : 's'} (${budget.abilityDots.freebies * 2} freebies)</div>
        <div>Disciplines: ${budget.disciplineDots.base} allocated dots, ${budget.disciplineDots.freebies} freebie dot${budget.disciplineDots.freebies === 1 ? '' : 's'} (${budget.disciplineDots.freebies * 7} freebies)</div>
        <div>Backgrounds: ${budget.backgroundDots.base} allocated dots, ${budget.backgroundDots.freebies} freebie dot${budget.backgroundDots.freebies === 1 ? '' : 's'} (${budget.backgroundDots.freebies} freebies)</div>
        <div>Virtues: ${budget.virtueDots.base} allocated dots, ${budget.virtueDots.freebies} freebie dot${budget.virtueDots.freebies === 1 ? '' : 's'} (${budget.virtueDots.freebies * 2} freebies)</div>
        <div>${escapeHtml(morality.ratingLabel)}: ${budget.humanityDots.base} base, ${budget.humanityDots.freebies} freebie dot${budget.humanityDots.freebies === 1 ? '' : 's'} (${budget.humanityDots.freebies * 2} freebies)</div>
        <div>Willpower: ${budget.willpowerDots.base} base, ${budget.willpowerDots.freebies} freebie dot${budget.willpowerDots.freebies === 1 ? '' : 's'} (${budget.willpowerDots.freebies} freebies)</div>
        <div>Merits: ${budget.meritsCost} freebie point${budget.meritsCost === 1 ? '' : 's'} spent; Flaws: ${budget.flawPoints} bonus freebie point${budget.flawPoints === 1 ? '' : 's'} granted</div>
        <div>Starting XP: ${budget.experienceSpent} spent, ${budget.experienceRemaining} remaining of ${budget.startingExperience}</div>
      </div>
      <p class="footer-note">This tracker separates allocation dots, freebie spending, and starting XP so each pool stays attributable throughout creation.</p>
    </div>
  `;
}

function formatGenerationLabel(generation) {
  const remainder = generation % 10;
  const suffix = generation === 11 || generation === 12 || generation === 13 ? 'th' : remainder === 1 ? 'st' : remainder === 2 ? 'nd' : remainder === 3 ? 'rd' : 'th';
  return `${generation}${suffix} Generation`;
}

function renderOptions(options, selectedValue) {
  return options
    .map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
    .join('');
}

function getChronicleFolderName(chronicle) {
  return safeSegment(`${chronicle.character.name || 'Unnamed vampire'} and ${chronicle.title}`);
}

function parseAssistantStatePayload(content) {
  const match = content.match(/```vtm_state\s*([\s\S]*?)```/i);
  if (!match) {
    return { text: content.trim(), updates: null };
  }

  try {
    return {
      text: content.replace(match[0], '').trim(),
      updates: JSON.parse(match[1]),
    };
  } catch {
    return { text: content.trim(), updates: null };
  }
}

function parseCampaignMemoryPayload(content) {
  const match = content.match(/```vtm_memory\s*([\s\S]*?)```/i);
  if (!match) {
    return {
      summary: content.trim(),
      campaignMemory: getDefaultCampaignMemoryState(),
    };
  }

  try {
    const parsed = JSON.parse(match[1]);
    return {
      summary: parsed.summary || '',
      campaignMemory: {
        ...getDefaultCampaignMemoryState(),
        establishedFacts: parsed.establishedFacts || '',
        unresolvedThreads: parsed.unresolvedThreads || '',
        factionPositions: parsed.factionPositions || '',
        boonsAndDebts: parsed.boonsAndDebts || '',
        relationshipShifts: parsed.relationshipShifts || '',
        timeline: parsed.timeline || '',
      },
    };
  } catch {
    return {
      summary: content.trim(),
      campaignMemory: getDefaultCampaignMemoryState(),
    };
  }
}

function getDefaultCampaignMemoryState() {
  return {
    establishedFacts: '',
    unresolvedThreads: '',
    factionPositions: '',
    boonsAndDebts: '',
    relationshipShifts: '',
    timeline: '',
  };
}

function formatCampaignMemoryForExport(chronicle) {
  const memory = chronicle.campaignMemory || getDefaultCampaignMemoryState();
  return [
    `Chronicle Summary: ${chronicle.summary || 'No chronicle summary recorded yet.'}`,
    '',
    `Established Facts: ${memory.establishedFacts || 'None recorded.'}`,
    '',
    `Unresolved Threads: ${memory.unresolvedThreads || 'None recorded.'}`,
    '',
    `Faction Positions: ${memory.factionPositions || 'None recorded.'}`,
    '',
    `Boons and Debts: ${memory.boonsAndDebts || 'None recorded.'}`,
    '',
    `Relationship Shifts: ${memory.relationshipShifts || 'None recorded.'}`,
    '',
    `Timeline: ${memory.timeline || 'None recorded.'}`,
  ].join('\n');
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeSegment(value) {
  return String(value ?? 'untitled')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'untitled';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatMessageContent(value) {
  const escaped = escapeHtml(value);
  const withBold = escaped.replace(/\*\*([^*][\s\S]*?)\*\*/g, '<strong>$1</strong>');
  return withBold.replace(/(^|[^*])\*([^\s*][^*]*?[^\s*]|[^\s*])\*(?!\*)/g, '$1<em>$2</em>');
}
