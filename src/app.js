import schema from '../mechanics/character-sheet-schema.json';
import disciplinesData from '../mechanics/disciplines.json';
import disciplineMechanicsData from '../mechanics/discipline-mechanics.json';
import ritualsData from '../mechanics/rituals.json';
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
  CUSTOM_CHRONICLE_PACK,
  getChronicleHookSummaries,
  getChroniclePack,
  getDefaultHookIdsForCity,
} from './chronicle-packs.js';
import {
  CUSTOM_MODEL_SENTINEL,
  getFallbackModelChain,
  getStoryModelEntry,
  isKnownStoryModel,
  STORYTELLER_MODEL_OPTIONS,
} from './model-catalog.js';
import { formatNpcReferenceSheetsForPrompt, getNpcConversionWorkflow } from './npc-conversion.js';
import { buildCreationAssistantPrompt, buildSystemPrompt, sendChatCompletion } from './openrouter.js';
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
const OUTPUT_COMPLIANCE_RETRY_LIMIT = 1;
const ADDITIONAL_DISCIPLINE_MERIT_NAMES = new Set(['Additional Discipline', 'Additional Clan Discipline']);
const BACKGROUND_NAME_LOOKUP = new Map((backgroundsData ?? []).map((item) => [item.name.trim().toLowerCase(), item.name]));
const NPC_MUTABLE_FIELDS = ['summary', 'status', 'ambition', 'desire', 'notes', 'secrets'];
const TEMPORARY_WILLPOWER_RECOVERY = 1;
const TEMPORARY_RESOURCES_RECOVERY = 1;
const AGE_CATEGORY_OPTIONS = ['Fledgling', 'Neonate', 'Ancilla'];
const ARCHIVE_PANEL_ID = 'archives';
const ARCHIVE_MESSAGE_BATCH_SIZE = 10;
const CREATION_ASSISTANT_PANEL_ID = 'creation-assistant';
const WALLPAPER_INTERVAL_MS = 10 * 60 * 1000;
const WALLPAPER_FADE_MS = 1800;
const WALLPAPER_URLS = Object.freeze([
  new URL('../resources/wallpapers/johannes-bohm-bh-scr-act2-batch3-action04-4k.jpg', import.meta.url).href,
  new URL('../resources/wallpapers/johannes-bohm-bh-scr-annouce-batch1-environment03-3840x2160px-copy.jpg', import.meta.url).href,
  new URL('../resources/wallpapers/johannes-bohm-bh-scr-annouce-batch1-environment04-3840x2160px-copy.jpg', import.meta.url).href,
  new URL('../resources/wallpapers/johannes-bohm-bh-scr-annouce-batch1-redlight-3840x2160px-copy.jpg', import.meta.url).href,
  new URL('../resources/wallpapers/johannes-bohm-bh-scr-batch2-brujahareas02-3840x2160px-copy.jpg', import.meta.url).href,
  new URL('../resources/wallpapers/johannes-bohm-bh-scr-batch2-brujahareas03-3840x2160px-copy.jpg', import.meta.url).href,
  new URL('../resources/wallpapers/johannes-bohm-bh-scr-batch2-nosferatuareas03-3840x2160px-copy.jpg', import.meta.url).href,
  new URL('../resources/wallpapers/johannes-bohm-bh-scr-batch2-toreadorareas01-3840x2160px-copy.jpg', import.meta.url).href,
  new URL('../resources/wallpapers/johannes-bohm-bh-scr-batch2-toreadorareas08-3840x2160px.jpg', import.meta.url).href,
]);
const CLAN_SYMBOLS = Object.freeze({
  'Banu Haqim': { src: new URL('../resources/Symbols/Banu Haqim/BanuHaqim_Geometric.png', import.meta.url).href, invert: true },
  Brujah: { src: new URL('../resources/Symbols/Brujah/VTM_Brujah_icon_white.png', import.meta.url).href, invert: false },
  Caitiff: { src: new URL('../resources/Symbols/Caitiff/Caitiff_Symbol.png', import.meta.url).href, invert: true },
  Gangrel: { src: new URL('../resources/Symbols/Gangrel/Gangrel_New1_white.png', import.meta.url).href, invert: false },
  Hecata: { src: new URL('../resources/Symbols/Hecata/Hecata_Symbol_Modern.png', import.meta.url).href, invert: true },
  Lasombra: { src: new URL('../resources/Symbols/Lasombra/Lasombra_symbol.png', import.meta.url).href, invert: true },
  Malkavian: { src: new URL('../resources/Symbols/Malkavian/VTM_Malkavian_icon_black.png', import.meta.url).href, invert: true },
  Nosferatu: { src: new URL('../resources/Symbols/Nosferatu/Nosferatu.png', import.meta.url).href, invert: true },
  'The Ministry': { src: new URL('../resources/Symbols/The Ministry/MinistrySymbol.png', import.meta.url).href, invert: true },
  Thinblood: { src: new URL('../resources/Symbols/Thinblood/Thinblood1.png', import.meta.url).href, invert: true },
  Toreador: { src: new URL('../resources/Symbols/Toreador/Toreador_New1.png', import.meta.url).href, invert: true },
  Tremere: { src: new URL('../resources/Symbols/Tremere/VTM_Tremere_icon_black.jpg', import.meta.url).href, invert: true },
  Tzimisce: { src: new URL('../resources/Symbols/Tzimisce/Tzimisce_Symbol.png', import.meta.url).href, invert: true },
  Ventrue: { src: new URL('../resources/Symbols/Ventrue/Ventrue.png', import.meta.url).href, invert: true },
});
const CREATION_ASSISTANT_QUESTION_FLOW = Object.freeze([
  {
    id: 'identity',
    heading: 'The Identity',
    prompt: "What is your character's name, age, and gender?",
  },
  {
    id: 'mortalLife',
    heading: 'Mortal Life and Profession',
    prompt: 'Before they became a vampire, what did your character do for a living?',
  },
  {
    id: 'embrace',
    heading: 'The Embrace',
    prompt:
      'How was your character turned into a vampire? Was it sudden and violent, slow and seductive, deliberate grooming, or a desperate act to save your life?',
  },
  {
    id: 'clanAffinity',
    heading: 'Clan Affinity',
    prompt: 'What is your clan? Use the clan guide below and choose the one that fits your concept best.',
  },
  {
    id: 'natureDemeanor',
    heading: 'Nature and Demeanor',
    prompt:
      "A vampire's Nature is their true self and Demeanor is the mask they show the world. Choose one for each from the guide below.",
  },
  {
    id: 'vampireAge',
    heading: 'Age and Experience',
    prompt: 'How long has your character been a vampire?',
  },
  {
    id: 'touchstone',
    heading: 'Mortal Touchstone',
    prompt: 'Name one mortal person your character still cares about and describe the relationship.',
  },
  {
    id: 'hunting',
    heading: 'Hunting Method',
    prompt:
      'How does your character usually hunt? Describe where they feed and the method they rely on most often.',
  },
  {
    id: 'crisis',
    heading: 'A Moment of Crisis',
    prompt:
      'Describe a moral dilemma after the Embrace. Did they feel guilt, maintain control, or push through ruthlessly? How did they react?',
  },
]);

const ATTRIBUTE_GROUP_LABELS = ['Physical', 'Social', 'Mental'];
const ABILITY_GROUP_LABELS = ['Talents', 'Skills', 'Knowledges'];

function toTitleCaseWords(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeCategoryPriority(rawValue, allowed) {
  const normalized = toTitleCaseWords(rawValue);
  return allowed.find((entry) => entry.toLowerCase() === normalized.toLowerCase()) || null;
}

function normalizePriorityOrder(rawList, allowed) {
  const result = [];
  for (const rawValue of Array.isArray(rawList) ? rawList : []) {
    const normalized = normalizeCategoryPriority(rawValue, allowed);
    if (!normalized || result.includes(normalized)) {
      continue;
    }
    result.push(normalized);
  }

  for (const fallback of allowed) {
    if (!result.includes(fallback)) {
      result.push(fallback);
    }
  }

  return result.slice(0, allowed.length);
}

function normalizeTraitToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeDisciplineKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildRollTraitLookup() {
  const lookup = new Map();

  function register(alias, traitId, label) {
    const key = normalizeTraitToken(alias);
    if (key) {
      lookup.set(key, { id: traitId, label });
    }
  }

  for (const field of ATTRIBUTE_FIELDS) {
    register(field.id, field.id, field.label);
    register(field.label, field.id, field.label);
  }

  for (const field of ABILITY_FIELDS) {
    register(field.id, field.id, field.label);
    register(startCase(field.id), field.id, field.label);
    register(field.label, field.id, field.label);
  }

  register('dex', 'dexterity', 'Dexterity');
  register('str', 'strength', 'Strength');
  register('sta', 'stamina', 'Stamina');
  register('cha', 'charisma', 'Charisma');
  register('man', 'manipulation', 'Manipulation');
  register('app', 'appearance', 'Appearance');
  register('per', 'perception', 'Perception');
  register('int', 'intelligence', 'Intelligence');
  register('wit', 'wits', 'Wits');
  register('subfuge', 'subterfuge', 'Subterfuge');
  register('animal ken', 'animalKen', 'Animal Ken');
  register('willpower', 'willpower', 'Willpower');

  for (const discipline of disciplinesData ?? []) {
    const name = String(discipline?.name || '').trim();
    if (!name) {
      continue;
    }

    const traitId = `discipline:${normalizeDisciplineKey(name)}`;
    register(name, traitId, name);
  }

  return lookup;
}

const ROLL_TRAIT_LOOKUP = buildRollTraitLookup();
const ROLL_TRAIT_LABELS = new Map(Array.from(ROLL_TRAIT_LOOKUP.values()).map((entry) => [entry.id, entry.label]));
const DISCIPLINE_MECHANICS_LOOKUP = new Map(
  (Array.isArray(disciplineMechanicsData) ? disciplineMechanicsData : []).map((item) => [normalizeDisciplineKey(item?.name), item]),
);
const DISCIPLINE_CATALOG_LOOKUP = new Map(
  (Array.isArray(disciplinesData) ? disciplinesData : []).map((item) => [normalizeDisciplineKey(item?.name), item]),
);
const RITUALS_CATALOG = Object.freeze(Array.isArray(ritualsData) ? ritualsData : []);
const RITUALS_LOOKUP = new Map(
  RITUALS_CATALOG.map((item) => [`${normalizeDisciplineKey(item?.discipline)}::${normalizeDisciplineKey(item?.name)}`, item]),
);
const BLOOD_MAGIC_DISCIPLINES = new Set(['thaumaturgy', 'necromancy']);
const RITUAL_MAX_PER_DISCIPLINE = 3;
const EQUIPMENT_CATEGORIES = ['Modern Gear', 'Dark Ages Weapons'];
const EQUIPMENT_CATALOG = Object.freeze([
  { category: 'Modern Gear', name: '9mm Pistol', details: 'Diff 6, Damage 4, Rate 3, Clip 15, Concealable' },
  { category: 'Modern Gear', name: 'Revolver', details: 'Diff 6, Damage 4, Rate 2, Cylinder 6' },
  { category: 'Modern Gear', name: 'Shotgun', details: 'Diff 7, Damage 8, Close range spread' },
  { category: 'Modern Gear', name: 'Hunting Rifle', details: 'Diff 8, Damage 8, long range' },
  { category: 'Modern Gear', name: 'Knife', details: 'Diff 6, Damage Strength +1, concealable' },
  { category: 'Modern Gear', name: 'Crowbar', details: 'Diff 6, Damage Strength +2' },
  { category: 'Modern Gear', name: 'Bat', details: 'Diff 6, Damage Strength +2' },
  { category: 'Modern Gear', name: 'Kevlar Vest', details: 'Armor 2 vs bullets, 1 vs bashing/lethal' },
  { category: 'Modern Gear', name: 'Tactical Vest', details: 'Armor 3 vs bullets, 2 vs bashing/lethal' },
  { category: 'Dark Ages Weapons', name: 'Arming Sword', details: 'Diff 6, Damage Strength +3' },
  { category: 'Dark Ages Weapons', name: 'Longsword', details: 'Diff 6, Damage Strength +3' },
  { category: 'Dark Ages Weapons', name: 'Dagger', details: 'Diff 5, Damage Strength +1, concealable' },
  { category: 'Dark Ages Weapons', name: 'Spear', details: 'Diff 6, Damage Strength +2, can set vs charge' },
  { category: 'Dark Ages Weapons', name: 'Axe', details: 'Diff 7, Damage Strength +3' },
  { category: 'Dark Ages Weapons', name: 'Mace', details: 'Diff 6, Damage Strength +3' },
  { category: 'Dark Ages Weapons', name: 'Crossbow', details: 'Diff 7, Damage 5, reload each shot' },
  { category: 'Dark Ages Weapons', name: 'Longbow', details: 'Diff 7, Damage 4, two-handed' },
  { category: 'Dark Ages Weapons', name: 'Chain Shirt', details: 'Armor 3 vs bashing/lethal, heavy' },
  { category: 'Dark Ages Weapons', name: 'Plate Armor', details: 'Armor 5 vs bashing/lethal, restrictive' },
]);
const DOWNTIME_ACTIVITY_DEFINITIONS = Object.freeze([
  { id: 'training', label: 'Training', pool: 'Intelligence + Academics', difficulty: 7, target: 5 },
  { id: 'investigation', label: 'Investigation', pool: 'Perception + Investigation', difficulty: 6, target: 5 },
  { id: 'influence', label: 'Influence Work', pool: 'Manipulation + Subterfuge', difficulty: 7, target: 5 },
  { id: 'feeding', label: 'Feeding Circuit', pool: 'Wits + Streetwise', difficulty: 6, target: 3 },
  { id: 'learn-ritual', label: 'Learn Ritual', pool: 'Intelligence + Occult', difficulty: 7, target: 5 },
]);

function parseDifficultyValue(value, fallback = 6) {
  return Math.min(10, Math.max(2, Number(value) || fallback));
}

function getDisciplineMechanicsEntry(disciplineName) {
  return DISCIPLINE_MECHANICS_LOOKUP.get(normalizeDisciplineKey(disciplineName)) || null;
}

function getDisciplineCatalogEntry(disciplineName) {
  return DISCIPLINE_CATALOG_LOOKUP.get(normalizeDisciplineKey(disciplineName)) || null;
}

function getDisciplinePathOptions(disciplineName) {
  const entry = getDisciplineMechanicsEntry(disciplineName);
  if (!entry || !entry.pathBased || !Array.isArray(entry.paths)) {
    return [];
  }
  return entry.paths
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean);
}

function isBloodMagicDisciplineName(disciplineName) {
  const key = normalizeDisciplineKey(disciplineName);
  return BLOOD_MAGIC_DISCIPLINES.has(key);
}

function getPathCapForDisciplineDots(dots) {
  const rating = Math.max(1, Math.min(5, Number(dots) || 1));
  if (rating >= 5) {
    return 5;
  }
  if (rating >= 4) {
    return 4;
  }
  if (rating >= 3) {
    return 3;
  }
  return 2;
}

function ensureDisciplinePathState(item) {
  if (!item || !item.name) {
    return;
  }

  const options = getDisciplinePathOptions(item.name);
  if (!options.length) {
    delete item.primaryPath;
    delete item.secondaryPath;
    delete item.tertiaryPath;
    delete item.secondaryPathDots;
    delete item.tertiaryPathDots;
    return;
  }

  const dots = Math.max(1, Math.min(5, Number(item.dots) || 1));
  const cap = getPathCapForDisciplineDots(dots);
  const selected = [];

  function normalizePath(pathName) {
    const normalized = String(pathName || '').trim();
    if (!normalized || !options.includes(normalized) || selected.includes(normalized)) {
      return '';
    }
    selected.push(normalized);
    return normalized;
  }

  item.primaryPath = normalizePath(item.primaryPath) || options[0];
  item.secondaryPath = normalizePath(item.secondaryPath);
  item.tertiaryPath = normalizePath(item.tertiaryPath);
  item.secondaryPathDots = Math.max(0, Math.min(cap, Number(item.secondaryPathDots) || 0));
  item.tertiaryPathDots = Math.max(0, Math.min(cap, Number(item.tertiaryPathDots) || 0));
}

function getSelectedDisciplinePaths(item) {
  return [item?.primaryPath, item?.secondaryPath, item?.tertiaryPath].map((name) => String(name || '').trim()).filter(Boolean);
}

function getPrimaryPathLevel(item) {
  const totalDots = Math.max(1, Math.min(5, Number(item?.dots) || 1));
  const secondaryDots = Math.max(0, Number(item?.secondaryPathDots) || 0);
  const tertiaryDots = Math.max(0, Number(item?.tertiaryPathDots) || 0);
  return Math.max(1, Math.min(5, totalDots - secondaryDots - tertiaryDots));
}

function getRitualOptionsForDiscipline(item) {
  if (!isBloodMagicDisciplineName(item?.name)) {
    return [];
  }
  const disciplineKey = normalizeDisciplineKey(item?.name);
  const maxLevel = getPrimaryPathLevel(item);
  const tracked = new Set((Array.isArray(item?.rituals) ? item.rituals : []).map((ritual) => ritual?.name).filter(Boolean));
  return RITUALS_CATALOG
    .filter((ritual) => normalizeDisciplineKey(ritual?.discipline) === disciplineKey)
    .filter((ritual) => Math.max(1, Math.min(5, Number(ritual?.level) || 1)) <= maxLevel)
    .filter((ritual) => !tracked.has(ritual.name))
    .map((ritual) => ritual.name);
}

function getRitualCatalogEntry(ritualName, disciplineName = '') {
  if (disciplineName) {
    const directMatch = RITUALS_LOOKUP.get(`${normalizeDisciplineKey(disciplineName)}::${normalizeDisciplineKey(ritualName)}`);
    if (directMatch) {
      return directMatch;
    }
  }
  return RITUALS_CATALOG.find((ritual) => normalizeDisciplineKey(ritual?.name) === normalizeDisciplineKey(ritualName)) || null;
}

function renderDisciplineReferenceContent(disciplineName, characterDiscipline) {
  const summaryEntry = getDisciplineCatalogEntry(disciplineName);
  const mechanics = getDisciplineMechanicsEntry(disciplineName);
  const pathNames = getDisciplinePathOptions(disciplineName);
  const levelSummaries = Array.isArray(summaryEntry?.levels) ? summaryEntry.levels : [];
  const levelMechanics = Array.isArray(mechanics?.levelMechanics) ? mechanics.levelMechanics : [];
  return `
    <h2>${escapeHtml(disciplineName || 'Discipline Reference')}</h2>
    <p class="helper-text">Reference window for sourced discipline mechanics and path constraints.</p>
    ${summaryEntry
      ? `<div class="summary-list">
          <div><strong>Source:</strong> ${escapeHtml(summaryEntry.source || 'Unknown')}</div>
          <div><strong>Summary:</strong> ${escapeHtml(summaryEntry.summary || 'No summary recorded.')}</div>
          ${Array.isArray(summaryEntry.commonClans) && summaryEntry.commonClans.length ? `<div><strong>Common Clans:</strong> ${escapeHtml(summaryEntry.commonClans.join(', '))}</div>` : ''}
        </div>`
      : ''}
    ${mechanics
      ? `<div class="summary-list">
          ${mechanics.certification?.status ? `<div><strong>Certification:</strong> ${escapeHtml(mechanics.certification.status)}</div>` : ''}
          ${mechanics.contested ? '<div><strong>Contested:</strong> Yes</div>' : ''}
          <div><strong>Path-based:</strong> ${mechanics.pathBased ? 'Yes' : 'No'}</div>
        </div>`
      : '<p class="helper-text">No discipline mechanics record was found for this entry.</p>'}
    ${levelSummaries.length
      ? `<div class="list-card">
          <h4>Discipline Levels</h4>
          <div class="summary-list">${levelSummaries.map((item, index) => `<div><strong>${index + 1}:</strong> ${escapeHtml(item)}</div>`).join('')}</div>
        </div>`
      : ''}
    ${levelMechanics.length
      ? `<div class="list-card">
          <h4>Core Mechanics</h4>
          <div class="summary-list">${levelMechanics.map((item) => `<div><strong>${item.dot}:</strong> ${escapeHtml(item.power || 'Unnamed power')} · ${escapeHtml(item.pool || 'No pool')} · Diff ${escapeHtml(String(item.difficulty || 'Varies'))}</div>`).join('')}</div>
        </div>`
      : ''}
    ${pathNames.length
      ? `<div class="list-card">
          <h4>Available Paths</h4>
          <div class="summary-list">${pathNames.map((name) => `<div>${escapeHtml(name)}</div>`).join('')}</div>
        </div>`
      : ''}
    ${characterDiscipline && Array.isArray(characterDiscipline.rituals)
      ? `<div class="list-card">
          <h4>Tracked Rituals</h4>
          <div class="summary-list">${characterDiscipline.rituals.length
            ? characterDiscipline.rituals.map((item) => `<div class="entry-row inventory"><span>${escapeHtml(item.name)}</span><button class="secondary-button" type="button" data-action="open-ritual-reference" data-ritual-name="${escapeHtml(item.name)}" data-ritual-discipline="${escapeHtml(disciplineName)}">Details</button></div>`).join('')
            : '<div>None recorded.</div>'}</div>
        </div>`
      : ''}
  `;
}

function renderRitualReferenceContent(ritualName, disciplineName) {
  const ritual = getRitualCatalogEntry(ritualName, disciplineName);
  const parentDiscipline = ritual?.discipline || disciplineName || '';
  const disciplineSummary = getDisciplineCatalogEntry(parentDiscipline);
  return `
    <h2>${escapeHtml(ritualName || 'Ritual Reference')}</h2>
    <p class="helper-text">Reference window for sourced ritual rules and blood magic progression notes.</p>
    ${ritual
      ? `<div class="summary-list">
          <div><strong>Discipline:</strong> ${escapeHtml(ritual.discipline || 'Unknown')}</div>
          <div><strong>Ritual Level:</strong> ${ritual.level ?? 'Unknown'}</div>
          <div><strong>Source:</strong> ${escapeHtml(ritual.source || 'Unknown')}</div>
          <div><strong>Pool:</strong> ${escapeHtml(ritual.pool || 'Intelligence + Occult')}</div>
          <div><strong>Difficulty:</strong> ${escapeHtml(String(ritual.difficulty || 'Varies'))}</div>
          <div><strong>Notes:</strong> ${escapeHtml(ritual.notes || 'No ritual notes recorded.')}</div>
        </div>`
      : '<p class="helper-text">No ritual mechanics record was found for this entry.</p>'}
    ${disciplineSummary
      ? `<div class="list-card">
          <h4>Parent Discipline</h4>
          <div class="summary-list">
            <div><strong>${escapeHtml(disciplineSummary.name)}</strong></div>
            <div>${escapeHtml(disciplineSummary.summary || 'No summary recorded.')}</div>
          </div>
        </div>`
      : ''}
    <div class="footer-note">Rituals are gated by primary path level only. When the primary path reaches a new level, the character may choose one ritual of the same level for free.</div>
  `;
}

function renderTrackedRitualRows(character) {
  const rituals = (character.disciplines || [])
    .filter((item) => Array.isArray(item.rituals) && item.rituals.length)
    .flatMap((item) => item.rituals.map((ritual) => ({ ritualName: ritual.name, disciplineName: item.name, level: getRitualCatalogEntry(ritual.name, item.name)?.level ?? '' })));

  if (!rituals.length) {
    return '<div class="helper-text">None recorded.</div>';
  }

  return rituals
    .map((item) => `<div class="entry-row inventory"><span>${escapeHtml(`${item.disciplineName}: ${item.ritualName}${item.level ? ` (Lv ${item.level})` : ''}`)}</span><button class="secondary-button" type="button" data-action="open-ritual-reference" data-ritual-name="${escapeHtml(item.ritualName)}" data-ritual-discipline="${escapeHtml(item.disciplineName)}">Details</button></div>`)
    .join('');
}

function getEquipmentCategoryEntries(category) {
  return EQUIPMENT_CATALOG.filter((item) => item.category === category);
}

function getDowntimeActivityDefinition(activityType) {
  return DOWNTIME_ACTIVITY_DEFINITIONS.find((item) => item.id === activityType) || null;
}

function extractTraitExpressionFromPoolText(poolText) {
  const raw = String(poolText || '');
  if (!raw.trim()) {
    return null;
  }

  const candidates = [raw];
  for (const match of raw.matchAll(/\(([^)]+)\)/g)) {
    candidates.push(match[1]);
  }

  for (const candidate of candidates) {
    const cleaned = candidate
      .replace(/\b\d+\b/g, ' ')
      .replace(/\b(mod(?:ifier)?|dot(?:s)?|rating|score|pool|total)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) {
      continue;
    }

    const parts = cleaned
      .split(/\s*\+\s*|\s+plus\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);

    if (!parts.length) {
      continue;
    }

    const resolved = [];
    for (const part of parts) {
      const key = normalizeTraitToken(part);
      const match = ROLL_TRAIT_LOOKUP.get(key);
      if (!match) {
        resolved.length = 0;
        break;
      }
      resolved.push(match);
    }

    if (resolved.length) {
      return {
        traitIds: resolved.map((entry) => entry.id),
        traitLabels: resolved.map((entry) => entry.label),
      };
    }
  }

  return null;
}

function parseMechanicsRollDirectives(content) {
  const lines = String(content || '').split('\n');
  const directives = [];
  let inMechanicsSection = false;
  let currentDifficulty = null;
  let currentResistance = null;
  let currentResistanceDifficulty = null;
  let currentPath = '';

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (!inMechanicsSection) {
      if (/^(?:\*\*)?mechanics(?:\*\*)?\s*:?$/i.test(trimmed)) {
        inMechanicsSection = true;
        continue;
      }
    }

    if (inMechanicsSection && (/^\|\s*[^|]+\|/.test(trimmed) || /^---\s*$/.test(trimmed))) {
      break;
    }

    const diffMatch = trimmed.match(/\*?\*?difficulty\*?\*?\s*:?\s*(\d{1,2})/i);
    if (diffMatch) {
      currentDifficulty = parseDifficultyValue(diffMatch[1]);
    }

    const resistanceDiffMatch = trimmed.match(/\*?\*?(?:resistance|resist)\s+difficulty\*?\*?\s*:?\s*(\d{1,2})/i);
    if (resistanceDiffMatch) {
      currentResistanceDifficulty = parseDifficultyValue(resistanceDiffMatch[1]);
    }

    const resistancePoolMatch = trimmed.match(/^(?:[-*]\s*)?(?:\*\*)?(?:resistance|resist)\s+pool\*?\*?\s*:?\s*(.+)$/i);
    if (resistancePoolMatch) {
      const resistanceExpression = extractTraitExpressionFromPoolText(resistancePoolMatch[1]);
      currentResistance = resistanceExpression
        ? {
            traitIds: resistanceExpression.traitIds,
            traitLabels: resistanceExpression.traitLabels,
          }
        : null;
    }

    const pathMatch = trimmed.match(/^(?:[-*]\s*)?(?:\*\*)?path\*?\*?\s*:?\s*(.+)$/i);
    if (pathMatch) {
      currentPath = String(pathMatch[1] || '').trim();
    }

    const poolMatch = trimmed.match(/^(?:[-*]\s*)?(?:\*\*)?pool\*?\*?\s*:?\s*(.+)$/i);
    if (!poolMatch) {
      continue;
    }

    const expression = extractTraitExpressionFromPoolText(poolMatch[1]);
    if (!expression) {
      continue;
    }

    directives.push({
      lineIndex: index,
      traitIds: expression.traitIds,
      traitLabels: expression.traitLabels,
      difficulty: currentDifficulty ?? 6,
      resistanceTraitIds: currentResistance?.traitIds ?? null,
      resistanceTraitLabels: currentResistance?.traitLabels ?? null,
      resistanceDifficulty: currentResistanceDifficulty ?? 6,
      path: currentPath,
    });
  }

  return directives;
}

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
  return items.map((item) => {
    const next = {
      id: uid(prefix),
      name: item.name,
      dots: item.dots,
      rituals: [],
    };
    if (prefix === 'discipline') {
      ensureDisciplinePathState(next);
    }
    return next;
  });
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
    category: prefix === 'equipment' ? EQUIPMENT_CATEGORIES[0] : undefined,
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
    <span class="info-chip-wrap">
      <button class="info-chip" type="button" data-action="toggle-help" aria-label="Explain ${escapeHtml(label)}" aria-expanded="false">
        <span aria-hidden="true">?</span>
      </button>
      <span class="tooltip-bubble" role="tooltip">
        <button class="tooltip-close" type="button" data-action="close-tooltip" aria-label="Close help">Close</button>
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(helpText)}</span>
      </span>
    </span>
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
  state.sidebarCollapsed = typeof state.sidebarCollapsed === 'boolean' ? state.sidebarCollapsed : true;
  state.chronicles.forEach((chronicle) => {
    ensureCharacterCreationState(chronicle.character);
    for (const discipline of chronicle.character.disciplines || []) {
      ensureDisciplinePathState(discipline);
      if (!Array.isArray(discipline.rituals)) {
        discipline.rituals = [];
      }
    }
    for (const equipment of chronicle.character.equipment || []) {
      if (!EQUIPMENT_CATEGORIES.includes(equipment.category)) {
        equipment.category = EQUIPMENT_CATEGORIES[0];
      }
    }
    syncCharacterDerivedStats(chronicle.character);
  });
  ensureActiveChronicle(state);

  const runtime = {
    archiveRootHandle: null,
    archiveLabel: '',
    xpDraft: null,
    xpPlans: {},
    sheetUi: {},
    modelCooldowns: {},
    promptRollPending: false,
    referenceDetail: null,
    referenceReturnPanel: null,
    storytellerPending: false,
    pendingChronicleId: null,
    storytellerAbortController: null,
    retryableStorytellerRequest: null,
    wallpaperDeck: [],
    wallpaperIndex: 0,
    wallpaperVisibleLayer: 'a',
    wallpaperIntervalId: null,
    overlayOffsets: {},
  };

  const ui = {
    stage: null,
    playShell: null,
    chatLog: null,
    chronicleList: null,
    overlayHost: null,
    messageInput: null,
    composer: null,
    retryButton: null,
    stopButton: null,
    sendButton: null,
    topbarControls: null,
    appShell: null,
    sidebar: null,
    wallpaperLayerA: null,
    wallpaperLayerB: null,
  };

  renderShell();
  render();

  function renderShell() {
    root.innerHTML = `
      <div class="page-background" aria-hidden="true">
        <div class="wallpaper-layer active" data-role="wallpaper-a"></div>
        <div class="wallpaper-layer" data-role="wallpaper-b"></div>
        <div class="wallpaper-overlay"></div>
      </div>
      <div class="app-shell${state.sidebarCollapsed ? ' sidebar-collapsed' : ''}" data-role="app-shell">
        <aside class="sidebar">
          <div class="sidebar-toggle-row">
            <button class="sidebar-toggle" type="button" data-action="toggle-sidebar" aria-expanded="${state.sidebarCollapsed ? 'false' : 'true'}" aria-label="${state.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
              <span></span><span></span><span></span>
            </button>
          </div>

          <div class="sidebar-scroll" data-role="sidebar-scroll">
            <section class="brand-block">
              <div class="brand-eyebrow">V20 Storyteller</div>
              <h1 class="brand-title">Storyteller AI</h1>
              <p class="brand-copy">Build the chronicle, track the vampire, and keep every session moving through the same night city.</p>
            </section>

            <details class="sidebar-section sidebar-group">
              <summary class="section-heading">[S] Settings</summary>
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
              <div class="api-actions">
                <button class="secondary-button" data-action="save-api-config">Save AI Settings</button>
              </div>
              <p class="footer-note" data-role="model-help"></p>
              <p class="footer-note">OpenRouter settings and model selection.</p>
            </details>

            <details class="sidebar-section sidebar-group">
              <summary class="section-heading">[C] Chronicles</summary>
              <button class="primary" data-action="new-chronicle">+ New Chronicle</button>
              <button class="ghost-button" data-action="delete-chronicle">Delete Active Chronicle</button>
              <div class="chronicle-list" data-role="chronicle-list"></div>
              <p class="footer-note">Chronicles auto-save in this browser via local storage. Closing the page keeps your current chronicle, notes, sheet, and chat history on this device.</p>
            </details>

            <details class="sidebar-section sidebar-group">
              <summary class="section-heading">[P] Character</summary>
              <div class="tab-row">
                <button class="tab-button" data-nav="sessions">Sessions</button>
                <button class="tab-button" data-nav="chronicle">Chronicle</button>
              </div>
              <div class="tab-row">
                <button class="tab-button" data-panel="notes">Notes</button>
                <button class="tab-button" data-panel="sheet">Character Sheet</button>
                <button class="tab-button" data-panel="npcs">NPC Directory</button>
                <button class="tab-button" data-panel="archives">Archives</button>
                <button class="tab-button" data-panel="downtime">Downtime</button>
              </div>
            </details>
          </div>
        </aside>

        <main class="main-panel">
          <header class="topbar">
            <div class="topbar-heading">
              <div class="brand-eyebrow" data-role="top-eyebrow">Current Domain</div>
              <div class="topbar-title-row">
                <h1 data-role="top-title"></h1>
                <div class="topbar-clan-symbol" data-role="top-symbol"></div>
              </div>
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
                <button class="ghost-button" type="button" data-action="retry-response" hidden>Retry</button>
                <button class="ghost-button" type="button" data-action="stop-response" hidden aria-label="Stop Storyteller response">
                  <span class="button-stop" aria-hidden="true"></span>
                </button>
                <button class="send-button icon-button" type="submit" aria-label="Send message to Storyteller">
                  <span class="button-spinner" aria-hidden="true"></span>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M3 11.5 20.5 3l-4.6 18-4.9-6.3-4.3-1.7 10-6.3-11.6 4.8Z" fill="currentColor"></path>
                  </svg>
                </button>
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
    ui.appShell = root.querySelector('[data-role="app-shell"]');
    ui.sidebar = root.querySelector('.sidebar');
    ui.wallpaperLayerA = root.querySelector('[data-role="wallpaper-a"]');
    ui.wallpaperLayerB = root.querySelector('[data-role="wallpaper-b"]');
    ui.messageInput = root.querySelector('[data-role="message-input"]');
    ui.composer = root.querySelector('[data-role="composer"]');
    ui.retryButton = root.querySelector('[data-action="retry-response"]');
    ui.stopButton = root.querySelector('[data-action="stop-response"]');
    ui.sendButton = root.querySelector('.send-button');
    ui.topbarControls = root.querySelector('[data-role="topbar-controls"]');
    ui.chatLog?.addEventListener('click', onPromptRollClick);
    root.addEventListener('click', onTooltipClick);
    root.addEventListener('keydown', onTooltipKeydown);

    root.querySelector('[data-role="composer"]').addEventListener('submit', onSendMessage);
    ui.retryButton?.addEventListener('click', onRetryStorytellerResponse);
    ui.stopButton?.addEventListener('click', onStopStorytellerRequest);
    ui.messageInput?.addEventListener('input', syncComposerHeight);
    ui.messageInput?.addEventListener('keydown', onComposerKeyDown);
    root.querySelector('[data-action="new-chronicle"]').addEventListener('click', onNewChronicle);
    root.querySelector('[data-action="delete-chronicle"]').addEventListener('click', onDeleteChronicle);
    root.querySelector('[data-action="save-api-config"]').addEventListener('click', onSaveApiConfig);
    root.querySelector('[data-action="toggle-sidebar"]')?.addEventListener('click', onToggleSidebar);
    root.querySelector('[data-role="model-select"]')?.addEventListener('change', syncModelPricingUi);
    root.querySelector('[data-role="model"]')?.addEventListener('input', syncModelPricingUi);

    for (const button of root.querySelectorAll('[data-nav]')) {
      button.addEventListener('click', () => {
        state.activeView = resolveNavigationView(button.dataset.nav, getActiveChronicle());
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
    initializeWallpaperRotation();
  }

  function shuffleArray(items) {
    const next = [...items];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }
    return next;
  }

  function ensureWallpaperDeck() {
    if (!runtime.wallpaperDeck.length) {
      runtime.wallpaperDeck = shuffleArray(WALLPAPER_URLS);
      runtime.wallpaperIndex = 0;
    }
    return runtime.wallpaperDeck;
  }

  function getCurrentWallpaperUrl() {
    const deck = ensureWallpaperDeck();
    return deck[runtime.wallpaperIndex] || deck[0] || '';
  }

  function advanceWallpaperDeck() {
    const deck = ensureWallpaperDeck();
    runtime.wallpaperIndex += 1;
    if (runtime.wallpaperIndex >= deck.length) {
      runtime.wallpaperDeck = shuffleArray(WALLPAPER_URLS);
      runtime.wallpaperIndex = 0;
    }
    return getCurrentWallpaperUrl();
  }

  function initializeWallpaperRotation() {
    const initialUrl = getCurrentWallpaperUrl();
    if (ui.wallpaperLayerA) {
      ui.wallpaperLayerA.style.backgroundImage = `url("${initialUrl}")`;
    }
    if (runtime.wallpaperIntervalId) {
      return;
    }
    runtime.wallpaperIntervalId = window.setInterval(() => {
      crossfadeToWallpaper(advanceWallpaperDeck());
    }, WALLPAPER_INTERVAL_MS);
  }

  function crossfadeToWallpaper(url) {
    if (!ui.wallpaperLayerA || !ui.wallpaperLayerB || !url) {
      return;
    }
    const nextLayer = runtime.wallpaperVisibleLayer === 'a' ? ui.wallpaperLayerB : ui.wallpaperLayerA;
    const previousLayer = runtime.wallpaperVisibleLayer === 'a' ? ui.wallpaperLayerA : ui.wallpaperLayerB;
    nextLayer.style.backgroundImage = `url("${url}")`;
    nextLayer.classList.add('active');
    previousLayer.classList.remove('active');
    runtime.wallpaperVisibleLayer = runtime.wallpaperVisibleLayer === 'a' ? 'b' : 'a';
  }

  function onToggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    applySidebarState();
    persist();
  }

  function applySidebarState() {
    ui.appShell?.classList.toggle('sidebar-collapsed', Boolean(state.sidebarCollapsed));
    const toggle = root.querySelector('[data-action="toggle-sidebar"]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', state.sidebarCollapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', state.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    }
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

  function isStorytellerRequestPending(chronicle = null) {
    if (!runtime.storytellerPending) {
      return false;
    }

    if (!chronicle) {
      return true;
    }

    return runtime.pendingChronicleId === chronicle.id;
  }

  function getRetryableStorytellerRequest(chronicle) {
    if (!chronicle) {
      return null;
    }

    return runtime.retryableStorytellerRequest?.chronicleId === chronicle.id ? runtime.retryableStorytellerRequest : null;
  }

  function renderComposerState(chronicle) {
    if (!ui.composer || !ui.sendButton || !ui.stopButton || !ui.retryButton) {
      return;
    }

    const pending = isStorytellerRequestPending(chronicle);
    const retryableRequest = getRetryableStorytellerRequest(chronicle);
    ui.composer.classList.toggle('is-pending', pending);
    ui.sendButton.disabled = pending;
    ui.sendButton.classList.toggle('pending', pending);
    ui.stopButton.hidden = !pending;
    ui.stopButton.disabled = !pending;
    ui.retryButton.hidden = pending || !retryableRequest;
    ui.retryButton.disabled = pending || !retryableRequest;

    if (ui.messageInput) {
      ui.messageInput.setAttribute('aria-busy', pending ? 'true' : 'false');
    }
  }

  function onComposerKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    ui.composer?.requestSubmit();
  }

  function closeOpenTooltips(exceptWrap = null) {
    root.querySelectorAll('.info-chip-wrap.open').forEach((wrap) => {
      if (exceptWrap && wrap === exceptWrap) {
        return;
      }
      wrap.classList.remove('open');
      wrap.querySelector('[data-action="toggle-help"]')?.setAttribute('aria-expanded', 'false');
    });
  }

  function onTooltipClick(event) {
    const closeButton = event.target.closest('[data-action="close-tooltip"]');
    if (closeButton) {
      const wrap = closeButton.closest('.info-chip-wrap');
      if (wrap) {
        wrap.classList.remove('open');
        wrap.querySelector('[data-action="toggle-help"]')?.setAttribute('aria-expanded', 'false');
      }
      return;
    }

    const toggle = event.target.closest('[data-action="toggle-help"]');
    if (toggle) {
      event.preventDefault();
      const wrap = toggle.closest('.info-chip-wrap');
      if (!wrap) {
        return;
      }
      const shouldOpen = !wrap.classList.contains('open');
      closeOpenTooltips(wrap);
      wrap.classList.toggle('open', shouldOpen);
      toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      return;
    }

    if (!event.target.closest('.info-chip-wrap')) {
      closeOpenTooltips();
    }
  }

  function onTooltipKeydown(event) {
    if (event.key !== 'Escape') {
      return;
    }

    closeOpenTooltips();
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
        <option value="${option.id}">${escapeHtml(option.label)} | ${escapeHtml(option.id)}</option>
      `).join('') + `<option value="${CUSTOM_MODEL_SENTINEL}">Custom model</option>`;
      modelSelect.value = isKnownStoryModel(model) ? model : CUSTOM_MODEL_SENTINEL;
    }

    if (modelInput) {
      modelInput.value = isKnownStoryModel(state.model || DEFAULT_MODEL) ? '' : state.model || '';
    }

    syncModelPricingUi();
  }

  function syncModelPricingUi() {
    const modelSelect = root.querySelector('[data-role="model-select"]');
    const modelInput = root.querySelector('[data-role="model"]');
    const modelHelp = root.querySelector('[data-role="model-help"]');
    const customModelRow = root.querySelector('[data-role="custom-model-row"]');
    const selectedValue = modelSelect?.value || (isKnownStoryModel(state.model || DEFAULT_MODEL) ? state.model || DEFAULT_MODEL : CUSTOM_MODEL_SENTINEL);
    const model = selectedValue === CUSTOM_MODEL_SENTINEL
      ? modelInput?.value.trim() || state.model || DEFAULT_MODEL
      : selectedValue;
    const preset = getStoryModelEntry(model);

    if (customModelRow) {
      customModelRow.style.display = selectedValue === CUSTOM_MODEL_SENTINEL ? 'grid' : 'none';
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

    modelHelp.textContent = 'Custom model entries are allowed, but they do not get automatic fallback handling because there is no guaranteed equivalent preset.';
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
    applySidebarState();
    renderChronicleList();
    renderSidebarConfig();
    renderViewButtons();
    renderPanelButtons();

    root.querySelector('[data-action="delete-chronicle"]').disabled = !chronicle;

    if (!chronicle) {
      renderEmptyState();
      return;
    }

    const city = getChronicleCity(chronicle);
    const selectedHooks = getChronicleHookSummaries(chronicle.cityId, chronicle.plotHookIds);

    ensureValidView(chronicle);
    renderHeader(chronicle, city);
    renderMainContent(chronicle, city, selectedHooks);
    renderOverlay(chronicle, city, selectedHooks);
  }

  function renderEmptyState() {
    const title = root.querySelector('[data-role="top-title"]');
    const copy = root.querySelector('[data-role="top-copy"]');
    const eyebrow = root.querySelector('[data-role="top-eyebrow"]');
    const symbol = root.querySelector('[data-role="top-symbol"]');

    eyebrow.textContent = 'Current Domain';
    eyebrow.hidden = false;
    symbol.innerHTML = '';
    symbol.hidden = true;
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
    const activeNav = getActiveNavigationKey(chronicle);
    root.querySelectorAll('[data-nav]').forEach((button) => {
      const nav = button.dataset.nav;
      button.classList.toggle('active', activeNav === nav);
      if (!hasChronicle) {
        button.disabled = nav === 'sessions';
        return;
      }

      button.disabled = nav === 'sessions' && !chronicle.character.created;
    });
  }

  function resolveNavigationView(nav, chronicle) {
    if (nav === 'sessions') {
      return 'creation';
    }

    if (!chronicle) {
      return 'settings';
    }

    if (!chronicle.setupComplete) {
      return 'settings';
    }

    if (!chronicle.character.created) {
      return 'creation';
    }

    return 'play';
  }

  function getActiveNavigationKey(chronicle) {
    if (!chronicle) {
      return state.activeView === 'creation' ? 'sessions' : 'chronicle';
    }

    if (state.activeView === 'creation' && chronicle.character.created) {
      return 'sessions';
    }

    return 'chronicle';
  }

  function renderPanelButtons() {
    const hasChronicle = Boolean(getActiveChronicle());
    root.querySelectorAll('[data-panel]').forEach((button) => {
      const panel = button.dataset.panel;
      button.classList.toggle('active', state.activePanel === panel);
      button.disabled = !hasChronicle;
    });
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
    const eyebrow = root.querySelector('[data-role="top-eyebrow"]');
    const symbol = root.querySelector('[data-role="top-symbol"]');

    eyebrow.hidden = false;
    symbol.innerHTML = '';
    symbol.hidden = true;

    if (state.activeView === 'creation') {
      if (chronicle.character.created) {
        eyebrow.textContent = 'Current Domain';
        title.textContent = 'Chronicle Sessions';
        copy.textContent = 'Review active chronicles, reopen a saved chat session, or start a new chronicle from the sidebar.';
        ui.topbarControls.innerHTML = `<div class="pill-row"><span class="status-pill">${state.chronicles.length} chronicle${state.chronicles.length === 1 ? '' : 's'} tracked</span></div>`;
        return;
      }

      eyebrow.textContent = 'Current Domain';
      title.textContent = 'Character Creation';
      copy.textContent = `Build the vampire for ${city.name}. Once the sheet is locked in, spend experience through confirmed purchases only.`;
      ui.topbarControls.innerHTML = '<div class="pill-row"><span class="status-pill">Page 2 of 3</span></div>';
      return;
    }

    if (state.activeView === 'settings') {
      eyebrow.textContent = 'Current Domain';
      title.textContent = 'Chronicle Settings';
      copy.textContent = 'Choose the chronicle foundation, city frame, and Storyteller brief before character creation begins.';
      ui.topbarControls.innerHTML = '<div class="pill-row"><span class="status-pill">Page 1 of 3</span></div>';
      return;
    }

    title.textContent = city.chronicleBook || chronicle.title;
    eyebrow.hidden = true;
    copy.textContent = `${chronicle.character.name || 'Unnamed vampire'} · ${city.name} · ${chronicle.character.experience.unspent} XP available`;
    ui.topbarControls.innerHTML = renderPlayControls(chronicle);
    bindPlayControls(chronicle);
  }

  function renderClanSymbol(clanName) {
    const config = CLAN_SYMBOLS[clanName];
    if (!config?.src) {
      return '';
    }
    return `<img class="clan-symbol${config.invert ? ' invert-white' : ''}" src="${config.src}" alt="${escapeHtml(clanName)} clan symbol" />`;
  }

  function renderPlayControls(chronicle) {
    const progression = ensureChronicleProgressionState(chronicle);
    return `
      <div class="topbar-row play-topbar-row">
        <div class="topbar-card">
          <span class="helper-text">Character</span>
          <strong>${escapeHtml(chronicle.character.name || 'Unnamed vampire')}</strong>
        </div>
        <div class="topbar-card">
          <span class="helper-text">EXP Available</span>
          <strong>${chronicle.character.experience.unspent}</strong>
        </div>
        <div class="topbar-card">
          <span class="helper-text">Willpower</span>
          <strong>${chronicle.character.currentWillpower}/${chronicle.character.willpower}</strong>
        </div>
        <div class="topbar-card">
          <span class="helper-text">Phase</span>
          <strong>${progression.phase === 'downtime' ? 'Downtime' : 'Active Scene'}</strong>
        </div>
        <div class="topbar-card">
          <span class="helper-text">Session</span>
          <strong>${progression.sessionNumber}</strong>
        </div>
      </div>
      <div class="play-topbar-actions">
        ${progression.downtimeReason ? `<span class="status-pill compact">${escapeHtml(progression.downtimeReason)}</span>` : ''}
        <span class="helper-text">Downtime is Storyteller-triggered.</span>
      </div>
    `;
  }

  function bindPlayControls(chronicle) {
    // Downtime transitions are Storyteller-driven via structured state updates.
    void chronicle;
  }

  function renderMainContent(chronicle, city, selectedHooks) {
    const isPlay = state.activeView === 'play';
    
    // Show/hide sections based on view
    ui.stage.style.display = isPlay ? 'none' : 'block';
    ui.playShell.style.display = isPlay ? 'grid' : 'none';

    if (isPlay) {
      renderComposerState(chronicle);
      syncComposerHeight();
      renderChat(chronicle.messages, chronicle);
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
          <div class="stage-actions">
            <button class="primary" type="button" data-action="open-creation-assistant">Open AI Character Assistant</button>
          </div>
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
              chronicle,
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

  function renderCreationStepContent({ chronicle, character, validation, creationBudget, clanOptions, clanMeritTitle, clanFlawTitle, morality, phase, currentStepId }) {
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
        ${phase === 'experience' ? renderCreationExperienceCard(character, chronicle) : renderCreationLockedCard('Starting Experience', 'Starting XP unlocks only after you confirm the freebie phase.')}
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
      ${renderSpecialtyCard(character, false)}
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

    const offset = getOverlayOffset(state.activePanel);

    const overlay = document.createElement('div');
    overlay.className = 'overlay-backdrop';
    overlay.innerHTML = `
      <div class="overlay-window" data-role="overlay-window" style="--overlay-offset-x: ${offset.x}px; --overlay-offset-y: ${offset.y}px;">
        <div class="overlay-window-header" data-role="overlay-drag-handle">
          <strong>${escapeHtml(getOverlayTitle(state.activePanel))}</strong>
          <div class="overlay-window-actions">
            <button class="overlay-reset" type="button" data-action="reset-overlay-position" aria-label="Reset overlay position">Reset</button>
            <button class="overlay-close" type="button" data-action="close-overlay" aria-label="Close overlay">X</button>
          </div>
        </div>
        ${
          state.activePanel === 'notes'
            ? renderNotesOverlay(chronicle, city, selectedHooks)
            : state.activePanel === 'sheet'
              ? renderSheetOverlay(chronicle)
              : state.activePanel === 'npcs'
                ? renderNpcOverlay(chronicle)
                : state.activePanel === ARCHIVE_PANEL_ID
                  ? renderArchiveOverlay(chronicle)
                : state.activePanel === 'downtime'
                  ? renderDowntimeOverlay(chronicle)
                : state.activePanel === 'reference'
                  ? renderReferenceOverlay(chronicle)
            : state.activePanel === CREATION_ASSISTANT_PANEL_ID
              ? renderCreationAssistantOverlay(chronicle)
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
    overlay.querySelector('[data-action="reset-overlay-position"]')?.addEventListener('click', () => {
      resetOverlayPosition(state.activePanel, overlay.querySelector('[data-role="overlay-window"]'));
    });
    bindOverlayWindowDrag(overlay);

    ui.overlayHost.appendChild(overlay);

    if (state.activePanel === 'notes') {
      bindNotesEvents(overlay, chronicle);
    } else if (state.activePanel === 'sheet') {
      bindSheetEvents(overlay, chronicle);
    } else if (state.activePanel === 'npcs') {
      return;
    } else if (state.activePanel === ARCHIVE_PANEL_ID) {
      return;
    } else if (state.activePanel === 'downtime') {
      bindDowntimeEvents(overlay, chronicle);
    } else if (state.activePanel === 'reference') {
      bindReferenceEvents(overlay);
    } else if (state.activePanel === CREATION_ASSISTANT_PANEL_ID) {
      bindCreationAssistantEvents(overlay, chronicle);
    } else if (state.activePanel === 'xp') {
      bindXpEvents(overlay, chronicle);
    }
  }

  function getOverlayTitle(panelId) {
    if (panelId === 'notes') {
      return 'Chronicle Notes';
    }
    if (panelId === 'sheet') {
      return 'Character Sheet';
    }
    if (panelId === 'npcs') {
      return 'NPC Directory';
    }
    if (panelId === ARCHIVE_PANEL_ID) {
      return 'Archives';
    }
    if (panelId === 'downtime') {
      return 'Downtime';
    }
    if (panelId === 'reference') {
      return 'Reference';
    }
    if (panelId === CREATION_ASSISTANT_PANEL_ID) {
      return 'Creation Assistant';
    }
    if (panelId === 'xp') {
      return 'Experience';
    }
    return 'Window';
  }

  function getOverlayOffset(panelId) {
    if (!runtime.overlayOffsets[panelId]) {
      runtime.overlayOffsets[panelId] = { x: 0, y: 0 };
    }
    return runtime.overlayOffsets[panelId];
  }

  function clampOverlayOffset(windowEl, offset) {
    if (!windowEl) {
      return offset;
    }

    const rect = windowEl.getBoundingClientRect();
    const margin = 16;
    const maxX = Math.max(0, window.innerWidth - rect.width - margin);
    const minX = Math.min(0, margin - rect.left + offset.x);
    const clampedX = Math.min(maxX, Math.max(minX, offset.x));

    const maxY = Math.max(0, window.innerHeight - rect.height - margin);
    const minY = Math.min(0, margin - rect.top + offset.y);
    const clampedY = Math.min(maxY, Math.max(minY, offset.y));

    return { x: clampedX, y: clampedY };
  }

  function applyOverlayOffset(panelId, windowEl, offset) {
    const next = clampOverlayOffset(windowEl, offset);
    runtime.overlayOffsets[panelId] = next;
    windowEl.style.setProperty('--overlay-offset-x', `${next.x}px`);
    windowEl.style.setProperty('--overlay-offset-y', `${next.y}px`);
  }

  function resetOverlayPosition(panelId, windowEl) {
    if (!panelId || !windowEl) {
      return;
    }
    applyOverlayOffset(panelId, windowEl, { x: 0, y: 0 });
  }

  function bindOverlayWindowDrag(overlay) {
    const handle = overlay.querySelector('[data-role="overlay-drag-handle"]');
    const windowEl = overlay.querySelector('[data-role="overlay-window"]');
    if (!handle || !windowEl || !state.activePanel) {
      return;
    }

    handle.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) {
        return;
      }

      event.preventDefault();
      const panelId = state.activePanel;
      const startOffset = getOverlayOffset(panelId);
      const startX = event.clientX;
      const startY = event.clientY;

      const onMove = (moveEvent) => {
        const nextX = startOffset.x + (moveEvent.clientX - startX);
        const nextY = startOffset.y + (moveEvent.clientY - startY);
        applyOverlayOffset(panelId, windowEl, { x: nextX, y: nextY });
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
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
    const sheetUi = getSheetUiState(chronicle);
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
        <p class="helper-text">Only identity and motivation details stay editable here. Backgrounds, equipment, and items are Storyteller-managed once play begins.</p>

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
            <div class="locked-card compact">${renderFieldLabel('Available EXP')}<strong>${character.experience.unspent}</strong></div>
            <div class="meta-text">Spent XP: ${character.experience.spent}</div>
            <div class="meta-text">Confirmed purchases cannot be refunded. Use plus/minus to draft changes before confirming.</div>
            <div class="meta-text">${escapeHtml(xpSpendAllowed ? 'XP spending is currently available.' : getXpGateMessage(chronicle))}</div>
          </div>
        </div>

        ${renderXpPlannerCard(chronicle, false)}

        <div class="list-card">
          <div class="card-heading-row">
            <h4>Quick Guide</h4>
            <button class="secondary-button" type="button" data-action="toggle-sheet-guide">${sheetUi.showGuide ? 'Hide' : 'Show'}</button>
          </div>
          ${sheetUi.showGuide
            ? `
              <label>
                <span class="helper-text">Search reference</span>
                <input type="search" data-role="sheet-guide-search" value="${escapeHtml(sheetUi.guideQuery || '')}" placeholder="Search stats, traits, and rules notes" />
              </label>
              <div class="summary-list">${renderQuickGuideList(sheetUi.guideQuery || '')}</div>
            `
            : '<p class="helper-text">Open the quick guide for a searchable in-sheet reference to core non-discipline traits.</p>'}
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
          <div class="card-heading-row">
            <h4>Confirmed XP Log</h4>
            <button class="secondary-button" type="button" data-action="toggle-xp-log">${sheetUi.showXpLog ? 'Hide' : 'Show'}</button>
          </div>
          ${sheetUi.showXpLog ? `<div class="xp-log">${renderXpLog(character.experience.log)}</div>` : '<p class="helper-text">Expand to review confirmed XP transactions.</p>'}
        </div>
      </div>
    `;
  }

  function renderReferenceOverlay(chronicle) {
    const detail = runtime.referenceDetail || {};
    const disciplineName = String(detail.name || detail.discipline || '').trim();
    const ritualName = String(detail.ritualName || detail.name || '').trim();
    const characterDiscipline = (chronicle.character.disciplines || []).find((entry) => entry.name === disciplineName);
    const content = detail.kind === 'ritual'
      ? renderRitualReferenceContent(ritualName, disciplineName)
      : renderDisciplineReferenceContent(disciplineName, characterDiscipline);
    return `
      <div class="drawer-card overlay-card">
        ${content}
        <div class="stage-actions split">
          <button class="secondary-button" type="button" data-action="reference-back">Back</button>
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

  function renderArchiveOverlay(chronicle) {
    const archives = Array.isArray(chronicle.messageArchives) ? [...chronicle.messageArchives].reverse() : [];
    return `
      <div class="drawer-card overlay-card">
        <h2>Archives</h2>
        <p class="helper-text">Older turns are compacted here so the live chat stays focused on the latest Storyteller reply.</p>
        <div class="summary-list">
          <div><strong>Archived blocks:</strong> ${archives.length}</div>
          <div><strong>Compaction rule:</strong> archive the oldest ${ARCHIVE_MESSAGE_BATCH_SIZE} eligible messages while preserving the newest Storyteller reply in live chat.</div>
        </div>
        <div class="npc-directory-grid">
          ${archives.length
            ? archives
                .map(
                  (archive) => `
                    <article class="npc-card npc-dossier archive-card">
                      <div class="npc-header-row">
                        <strong>${escapeHtml(archive.title || 'Archived Turns')}</strong>
                        <span class="meta-text">${escapeHtml(formatArchiveDateRange(archive.startedAt, archive.endedAt))}</span>
                      </div>
                      <div class="meta-text">${archive.messageCount} messages archived · Created ${escapeHtml(formatTimestamp(archive.createdAt))}</div>
                      <div><strong>Summary:</strong> ${escapeHtml(archive.summary || 'Summary pending.')}</div>
                      <details>
                        <summary>View archived transcript</summary>
                        <pre class="archive-transcript">${escapeHtml(archive.text || 'No transcript stored.')}</pre>
                      </details>
                    </article>
                  `,
                )
                .join('')
            : '<p class="helper-text">No archived turn blocks yet.</p>'}
        </div>
      </div>
    `;
  }

  function renderDowntimeOverlay(chronicle) {
    const progression = ensureChronicleProgressionState(chronicle);
    const downtimeActive = progression.phase === 'downtime';
    const xpSpendAllowed = canSpendExperience(chronicle);
    const downtimeActivity = progression.downtimeActivity || {};
    const activityLabel = downtimeActivity.type ? startCase(downtimeActivity.type) : 'None selected';
    const activityStatus = downtimeActivity.completed
      ? 'Completed'
      : downtimeActivity.status === 'active'
        ? 'In progress'
        : 'Idle';
    const activityProgress = downtimeActivity.targetSuccesses > 0
      ? `${downtimeActivity.progressSuccesses}/${downtimeActivity.targetSuccesses}`
      : 'N/A';
    const activityOptions = DOWNTIME_ACTIVITY_DEFINITIONS.map((item) => item.id);
    const selectedActivityType = downtimeActivity.type || activityOptions[0] || '';
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

        <div class="list-card">
          <h4>Downtime Activity</h4>
          <div class="summary-list">
            <div><strong>Selection:</strong> ${escapeHtml(activityLabel)}</div>
            <div><strong>Status:</strong> ${escapeHtml(activityStatus)}</div>
            <div><strong>Progress:</strong> ${escapeHtml(activityProgress)}</div>
            <div><strong>Rule:</strong> Only one downtime activity can be completed per downtime session.</div>
          </div>
          <div class="entry-row inventory">
            <label><span class="helper-text">Choose Activity</span>${renderSelect('downtime-activity', activityOptions.map((item) => startCase(item)), selectedActivityType, 'data-downtime-activity', activityOptions)}</label>
            <button class="secondary-button" type="button" data-action="set-downtime-activity" ${downtimeActivity.completed ? 'disabled' : ''}>Set Activity</button>
            <button class="secondary-button" type="button" data-action="prompt-downtime-roll" ${downtimeActivity.status === 'active' ? '' : 'disabled'}>Prompt Roll</button>
            <button class="secondary-button" type="button" data-action="advance-downtime-success" ${downtimeActivity.status === 'active' ? '' : 'disabled'}>+1 Success</button>
          </div>
          <p class="footer-note">Use Prompt Roll to generate clickable chat roll controls from the mechanics block.</p>
        </div>

        <div class="stage-actions split">
          <button class="secondary-button" type="button" data-action="prompt-combat-sequence">Combat Sequence Prompt</button>
        </div>
        <p class="footer-note">Spend XP from Character Sheet using the planner controls once downtime is active.</p>
        <p class="footer-note">Only the Storyteller can start or end downtime. Ask in chat when you want to transition phases.</p>
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

    container.querySelector('[data-action="open-creation-assistant"]')?.addEventListener('click', () => {
      openCreationAssistant(chronicle);
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
      const entry = { id: uid('discipline'), name: disciplinesData[0].name, dots: 1, rituals: [] };
      ensureDisciplinePathState(entry);
      chronicle.character.disciplines.push(entry);
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
      chronicle.character.equipment.push({ id: uid('equipment'), category: EQUIPMENT_CATEGORIES[0], name: '', details: '' });
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
      getXpPlanState(chronicle).steps = [];
      setCharacterCreationUiStep(chronicle.character, 'finishing');
      persist();
      setStatus('Freebie phase confirmed. Starting experience is now available. Any unspent creation XP will be lost once the chronicle begins.');
      render();
    });

    bindXpPlannerEvents(container, chronicle);

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

  function createCreationAssistantMessage(role, content) {
    return {
      id: uid('creation-assistant-msg'),
      role,
      content: String(content || '').trim(),
      timestamp: new Date().toISOString(),
    };
  }

  function getCreationAssistantState(chronicle) {
    const creation = ensureCharacterCreationState(chronicle.character);
    if (!creation.aiAssistant || typeof creation.aiAssistant !== 'object') {
      creation.aiAssistant = {
        messages: [],
        answers: {},
        currentQuestionIndex: 0,
        completed: false,
        isGenerating: false,
        backstory: '',
        suggestion: null,
        autoApplied: false,
        applySnapshot: null,
        error: '',
      };
    }
    creation.aiAssistant.messages = Array.isArray(creation.aiAssistant.messages) ? creation.aiAssistant.messages : [];
    creation.aiAssistant.answers = creation.aiAssistant.answers && typeof creation.aiAssistant.answers === 'object' ? creation.aiAssistant.answers : {};
    creation.aiAssistant.currentQuestionIndex = Math.max(0, Number(creation.aiAssistant.currentQuestionIndex) || 0);
    creation.aiAssistant.completed = Boolean(creation.aiAssistant.completed);
    creation.aiAssistant.isGenerating = Boolean(creation.aiAssistant.isGenerating);
    creation.aiAssistant.backstory = typeof creation.aiAssistant.backstory === 'string' ? creation.aiAssistant.backstory : '';
    creation.aiAssistant.suggestion = creation.aiAssistant.suggestion && typeof creation.aiAssistant.suggestion === 'object' ? creation.aiAssistant.suggestion : null;
    creation.aiAssistant.autoApplied = Boolean(creation.aiAssistant.autoApplied);
    creation.aiAssistant.error = typeof creation.aiAssistant.error === 'string' ? creation.aiAssistant.error : '';
    return creation.aiAssistant;
  }

  function getCreationAssistantStepPrompt(step) {
    if (!step) {
      return '';
    }

    if (step.id === 'clanAffinity') {
      const clanGuide = clansData
        .map((clan) => `- ${clan.name}: ${clan.theme}`)
        .join('\n');
      return `**${step.heading}**\n${step.prompt}\n\n${clanGuide}`;
    }

    if (step.id === 'natureDemeanor') {
      const natureGuide = natureDemeanorData.natures.map((entry) => `- ${entry.name}: ${entry.summary}`).join('\n');
      const demeanorGuide = natureDemeanorData.demeanors.map((entry) => `- ${entry.name}: ${entry.summary}`).join('\n');
      return `**${step.heading}**\n${step.prompt}\n\nNatures:\n${natureGuide}\n\nDemeanors:\n${demeanorGuide}`;
    }

    return `**${step.heading}**\n${step.prompt}`;
  }

  function seedCreationAssistantConversation(chronicle) {
    const assistant = getCreationAssistantState(chronicle);
    if (assistant.messages.length) {
      return;
    }

    assistant.messages.push(
      createCreationAssistantMessage(
        'assistant',
        'Welcome to Character Creation Assistant. I will ask a fixed set of questions, then write a 2-3 paragraph backstory and auto-fill your sheet using V20-safe rules.',
      ),
    );
    const firstStep = CREATION_ASSISTANT_QUESTION_FLOW[0];
    if (firstStep) {
      assistant.messages.push(createCreationAssistantMessage('assistant', getCreationAssistantStepPrompt(firstStep)));
    }
  }

  function openCreationAssistant(chronicle) {
    if (chronicle.character.created) {
      setStatus('Character creation assistant is only available before the sheet is finalized.', true);
      return;
    }

    seedCreationAssistantConversation(chronicle);
    state.activePanel = CREATION_ASSISTANT_PANEL_ID;
    persist();
    render();
  }

  function renderCreationAssistantOverlay(chronicle) {
    const assistant = getCreationAssistantState(chronicle);
    const totalQuestions = CREATION_ASSISTANT_QUESTION_FLOW.length;
    const answeredCount = Math.min(totalQuestions, assistant.currentQuestionIndex);
    const awaitingInput = !assistant.completed && !assistant.isGenerating;

    return `
      <div class="drawer-card overlay-card creation-assistant-panel">
        <h2>Character Creation Assistant</h2>
        <p class="helper-text">Answer the guided questions. After assessment, the assistant writes a 2-3 paragraph backstory and auto-fills the sheet.</p>
        <div class="meta-text">Progress: ${answeredCount}/${totalQuestions}</div>

        <div class="creation-assistant-log" data-role="creation-assistant-log">
          ${assistant.messages
            .map(
              (message) => `
                <article class="creation-assistant-message ${message.role === 'user' ? 'user' : 'assistant'}">
                  <header>${message.role === 'user' ? 'You' : 'Assistant'}</header>
                  <div>${formatMessageContent(message.content)}</div>
                </article>
              `,
            )
            .join('')}
          ${assistant.isGenerating ? '<p class="helper-text">Assistant is assessing your answers and building the sheet...</p>' : ''}
        </div>

        ${assistant.backstory ? `<label><span class="helper-text">Generated Backstory</span><textarea rows="8" readonly>${escapeHtml(assistant.backstory)}</textarea></label>` : ''}
        ${assistant.error ? `<p class="footer-note">${escapeHtml(assistant.error)}</p>` : ''}

        <form class="creation-assistant-form" data-role="creation-assistant-form">
          <label>
            <span class="helper-text">Your Answer</span>
            <textarea rows="4" data-role="creation-assistant-input" ${awaitingInput ? '' : 'disabled'} placeholder="Type your answer for the current question..."></textarea>
          </label>
          <div class="stage-actions split">
            <button class="secondary-button" type="button" data-action="creation-assistant-reset">Restart Interview</button>
            ${assistant.autoApplied ? '<button class="secondary-button" type="button" data-action="creation-assistant-undo">Undo Auto-Fill</button>' : ''}
            <button class="primary" type="submit" ${awaitingInput ? '' : 'disabled'}>${assistant.isGenerating ? 'Generating...' : 'Send Answer'}</button>
          </div>
        </form>
      </div>
    `;
  }

  function resetCreationAssistantState(chronicle) {
    const assistant = getCreationAssistantState(chronicle);
    assistant.messages = [];
    assistant.answers = {};
    assistant.currentQuestionIndex = 0;
    assistant.completed = false;
    assistant.isGenerating = false;
    assistant.backstory = '';
    assistant.suggestion = null;
    assistant.autoApplied = false;
    assistant.applySnapshot = null;
    assistant.error = '';
    seedCreationAssistantConversation(chronicle);
  }

  function bindCreationAssistantEvents(container, chronicle) {
    const assistant = getCreationAssistantState(chronicle);
    const log = container.querySelector('[data-role="creation-assistant-log"]');
    if (log) {
      log.scrollTop = log.scrollHeight;
    }

    container.querySelector('[data-action="creation-assistant-reset"]')?.addEventListener('click', () => {
      resetCreationAssistantState(chronicle);
      persist();
      render();
    });

    container.querySelector('[data-action="creation-assistant-undo"]')?.addEventListener('click', () => {
      if (!assistant.applySnapshot) {
        setStatus('No auto-fill snapshot is available to undo.', true);
        return;
      }
      chronicle.character = JSON.parse(JSON.stringify(assistant.applySnapshot));
      assistant.autoApplied = false;
      assistant.applySnapshot = null;
      markCharacterSummaryDirty(chronicle);
      persist();
      render();
      setStatus('Character sheet auto-fill was undone.');
    });

    container.querySelector('[data-role="creation-assistant-form"]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (assistant.isGenerating || assistant.completed) {
        return;
      }

      const input = container.querySelector('[data-role="creation-assistant-input"]');
      const answer = String(input?.value || '').trim();
      if (!answer) {
        setStatus('Please answer the current question before continuing.', true);
        return;
      }

      await onCreationAssistantAnswer(chronicle, answer);
    });
  }

  async function onCreationAssistantAnswer(chronicle, answer) {
    const assistant = getCreationAssistantState(chronicle);
    const step = CREATION_ASSISTANT_QUESTION_FLOW[assistant.currentQuestionIndex];
    if (!step) {
      return;
    }

    assistant.messages.push(createCreationAssistantMessage('user', answer));
    assistant.answers[step.id] = answer;
    assistant.currentQuestionIndex += 1;
    assistant.error = '';

    const nextStep = CREATION_ASSISTANT_QUESTION_FLOW[assistant.currentQuestionIndex];
    if (nextStep) {
      assistant.messages.push(createCreationAssistantMessage('assistant', getCreationAssistantStepPrompt(nextStep)));
      persist();
      render();
      return;
    }

    assistant.isGenerating = true;
    assistant.messages.push(
      createCreationAssistantMessage(
        'assistant',
        'Perfect. I am synthesizing your answers into a backstory and a rules-safe sheet recommendation now.',
      ),
    );
    persist();
    render();

    await finalizeCreationAssistant(chronicle);
  }

  async function finalizeCreationAssistant(chronicle) {
    const assistant = getCreationAssistantState(chronicle);
    if (!state.apiKey) {
      assistant.isGenerating = false;
      assistant.error = 'Add an OpenRouter API key in the sidebar to finish AI synthesis.';
      persist();
      render();
      setStatus(assistant.error, true);
      return;
    }

    const prompt = buildCreationAssistantPrompt({
      clans: clansData,
      natures: natureDemeanorData.natures,
      demeanors: natureDemeanorData.demeanors,
    });

    const answerPayload = {
      questions: CREATION_ASSISTANT_QUESTION_FLOW.map((step) => ({
        id: step.id,
        heading: step.heading,
        answer: assistant.answers[step.id] || '',
      })),
    };

    try {
      const result = await sendChatCompletion({
        apiKey: state.apiKey,
        model: state.model || DEFAULT_MODEL,
        systemPrompt: prompt,
        history: [],
        userMessage: `Assess this interview and return synthesis now:\n${JSON.stringify(answerPayload, null, 2)}`,
      });

      const parsed = parseCreationAssistantPayload(result.content);
      assistant.backstory = parsed.backstory;
      assistant.suggestion = parsed.recommendation;
      assistant.completed = true;
      assistant.isGenerating = false;
      assistant.messages.push(createCreationAssistantMessage('assistant', parsed.backstory || result.content));

      const applyResult = applyCreationAssistantAutofill(chronicle, parsed.recommendation, parsed.backstory, assistant.answers);
      assistant.autoApplied = applyResult.applied;
      if (applyResult.applied) {
        assistant.applySnapshot = applyResult.snapshot;
      }
      assistant.messages.push(createCreationAssistantMessage('assistant', applyResult.message));

      persist();
      render();
      setStatus(`Character creation assistant finished using ${result.model}.`);
    } catch (error) {
      assistant.isGenerating = false;
      assistant.error = error.message;
      assistant.messages.push(createCreationAssistantMessage('assistant', `Synthesis failed: ${error.message}`));
      persist();
      render();
      setStatus(error.message, true);
    }
  }

  function resolveNameFromList(value, names, fallback = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    return names.find((name) => name.toLowerCase() === normalized) || fallback;
  }

  function parseIdentityNameFromAnswer(answer) {
    const text = String(answer || '').trim();
    if (!text) {
      return '';
    }
    const nameMatch = text.match(/name\s*[:\-]\s*([^,\n]+)/i);
    if (nameMatch) {
      return nameMatch[1].trim();
    }
    const parts = text.split(/[,.\n]/).map((part) => part.trim()).filter(Boolean);
    return parts[0] || '';
  }

  function parseIdentityPronounsFromAnswer(answer) {
    const text = String(answer || '').toLowerCase();
    if (!text) {
      return '';
    }
    if (text.includes('they/them')) {
      return 'they/them';
    }
    if (text.includes('she/her')) {
      return 'she/her';
    }
    if (text.includes('he/him')) {
      return 'he/him';
    }
    return '';
  }

  function allocateDotsToFields(baseValues, fieldIds, extraDots, maxValue, focusScores) {
    const values = { ...baseValues };
    let remaining = Math.max(0, Number(extraDots) || 0);
    const safeFields = fieldIds.filter(Boolean);
    if (!safeFields.length) {
      return values;
    }

    const sortedFields = [...safeFields].sort((left, right) => {
      const rightScore = Number(focusScores[right]) || 0;
      const leftScore = Number(focusScores[left]) || 0;
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      return left.localeCompare(right);
    });

    while (remaining > 0) {
      let spentThisPass = false;
      for (const fieldId of sortedFields) {
        if ((Number(values[fieldId]) || 0) >= maxValue) {
          continue;
        }
        values[fieldId] = (Number(values[fieldId]) || 0) + 1;
        remaining -= 1;
        spentThisPass = true;
        if (remaining <= 0) {
          break;
        }
      }

      if (!spentThisPass) {
        break;
      }
    }

    return values;
  }

  function computeFocusScores(recommendation) {
    const scores = {};
    const traitEntries = Array.isArray(recommendation?.focusTraits) ? recommendation.focusTraits : [];
    for (const rawTrait of traitEntries) {
      const token = normalizeTraitToken(rawTrait);
      const found = ROLL_TRAIT_LOOKUP.get(token);
      if (!found) {
        continue;
      }
      scores[found.id] = (Number(scores[found.id]) || 0) + 1;
    }
    return scores;
  }

  function applyCreationAssistantAutofill(chronicle, recommendation, backstory, answers) {
    if (chronicle.character.created) {
      return {
        applied: false,
        snapshot: null,
        message: 'Autofill skipped because this character is already finalized.',
      };
    }

    const snapshot = JSON.parse(JSON.stringify(chronicle.character));
    const character = chronicle.character;
    const identity = recommendation?.identity && typeof recommendation.identity === 'object' ? recommendation.identity : {};
    const focusScores = computeFocusScores(recommendation);
    const attributePriority = normalizePriorityOrder(recommendation?.priorities?.attributes, ATTRIBUTE_GROUP_LABELS);
    const abilityPriority = normalizePriorityOrder(recommendation?.priorities?.abilities, ABILITY_GROUP_LABELS);
    const clanNames = clansData.map((item) => item.name);
    const natureNames = natureDemeanorData.natures.map((item) => item.name);
    const demeanorNames = natureDemeanorData.demeanors.map((item) => item.name);

    character.name = String(identity.name || '').trim() || parseIdentityNameFromAnswer(answers?.identity) || character.name;
    character.age = Math.max(0, Math.min(1000, Number(identity.age) || Number(character.age) || 0));
    character.pronouns = String(identity.pronouns || '').trim() || parseIdentityPronounsFromAnswer(answers?.identity) || character.pronouns;
    character.concept = String(identity.concept || '').trim() || String(answers?.mortalLife || '').slice(0, 120) || character.concept;
    character.sire = String(identity.sire || '').trim() || character.sire;
    character.ambition = String(identity.ambition || '').trim() || character.ambition;
    character.desire = String(identity.desire || '').trim() || character.desire;
    character.backstory = String(backstory || '').trim() || character.backstory;
    character.path = 'Humanity';

    const resolvedClan = resolveNameFromList(identity.clan, clanNames, resolveNameFromList(answers?.clanAffinity, clanNames, character.clan));
    character.clan = resolvedClan || character.clan;
    character.nature = resolveNameFromList(identity.nature, natureNames, resolveNameFromList(answers?.natureDemeanor, natureNames, character.nature || natureNames[0] || 'Architect'));
    character.demeanor = resolveNameFromList(identity.demeanor, demeanorNames, resolveNameFromList(answers?.natureDemeanor, demeanorNames, character.demeanor || demeanorNames[0] || 'Architect'));

    const attributeFieldsByGroup = Object.fromEntries(schema.attributes.map((group) => [group.label, group.fields.map((field) => field.id)]));
    const abilityFieldsByGroup = Object.fromEntries(schema.abilities.map((group) => [group.label, group.fields.map((field) => field.id)]));
    const attributeGroupDots = {
      [attributePriority[0]]: 7,
      [attributePriority[1]]: 5,
      [attributePriority[2]]: 3,
    };
    const abilityGroupDots = {
      [abilityPriority[0]]: 13,
      [abilityPriority[1]]: 9,
      [abilityPriority[2]]: 5,
    };

    character.attributes = ATTRIBUTE_FIELDS.reduce((accumulator, field) => ({ ...accumulator, [field.id]: 1 }), {});
    for (const groupLabel of ATTRIBUTE_GROUP_LABELS) {
      character.attributes = allocateDotsToFields(
        character.attributes,
        attributeFieldsByGroup[groupLabel] || [],
        attributeGroupDots[groupLabel] || 0,
        5,
        focusScores,
      );
    }

    character.abilities = ABILITY_FIELDS.reduce((accumulator, field) => ({ ...accumulator, [field.id]: 0 }), {});
    for (const groupLabel of ABILITY_GROUP_LABELS) {
      character.abilities = allocateDotsToFields(
        character.abilities,
        abilityFieldsByGroup[groupLabel] || [],
        abilityGroupDots[groupLabel] || 0,
        3,
        focusScores,
      );
    }

    const allDisciplines = disciplinesData.map((entry) => entry.name);
    const clanDisciplines = getClanDisciplineNames(character.clan);
    const requestedDisciplines = Array.isArray(recommendation?.disciplinePreference) ? recommendation.disciplinePreference : [];
    const normalizedRequested = requestedDisciplines
      .map((name) => resolveNameFromList(name, allDisciplines))
      .filter(Boolean);
    const disciplinePool = character.clan === 'Caitiff'
      ? (normalizedRequested.length ? normalizedRequested : allDisciplines)
      : (clanDisciplines.length ? clanDisciplines : allDisciplines);
    const pickedDisciplines = [...new Set(disciplinePool)].slice(0, 2);
    if (!pickedDisciplines.length) {
      pickedDisciplines.push(allDisciplines[0]);
    }
    character.disciplines = [
      { id: uid('discipline'), name: pickedDisciplines[0], dots: pickedDisciplines.length > 1 ? 2 : 3 },
      ...(pickedDisciplines.length > 1 ? [{ id: uid('discipline'), name: pickedDisciplines[1], dots: 1 }] : []),
    ];

    const preferredBackgrounds = Array.isArray(recommendation?.backgroundPreferences)
      ? recommendation.backgroundPreferences
      : [];
    const canonicalBackgroundNames = backgroundsData.map((entry) => entry.name);
    const consumedBackgrounds = [];
    let remainingBackgroundDots = 5;
    for (const item of preferredBackgrounds) {
      const canonical = resolveNameFromList(item?.name, canonicalBackgroundNames);
      if (!canonical || consumedBackgrounds.some((entry) => entry.name === canonical)) {
        continue;
      }
      const dots = Math.max(1, Math.min(3, Number(item?.dots) || 1, remainingBackgroundDots));
      consumedBackgrounds.push({ id: uid('background'), name: canonical, dots });
      remainingBackgroundDots -= dots;
      if (remainingBackgroundDots <= 0) {
        break;
      }
    }
    const fallbackBackgrounds = ['Resources', 'Contacts', 'Allies', 'Status', 'Herd'];
    let fallbackIndex = 0;
    while (remainingBackgroundDots > 0) {
      const nextName = fallbackBackgrounds[fallbackIndex % fallbackBackgrounds.length];
      fallbackIndex += 1;
      const existing = consumedBackgrounds.find((entry) => entry.name === nextName);
      if (!existing) {
        consumedBackgrounds.push({ id: uid('background'), name: nextName, dots: 1 });
        remainingBackgroundDots -= 1;
      } else if (existing.dots < 5) {
        existing.dots += 1;
        remainingBackgroundDots -= 1;
      }
    }
    character.backgrounds = consumedBackgrounds;

    character.virtues = { conscience: 1, selfControl: 1, courage: 1 };
    const tilt = String(recommendation?.virtueTilt || '').trim().toLowerCase();
    const virtuePlan =
      tilt === 'bold'
        ? ['courage', 'courage', 'courage', 'conscience', 'conscience', 'selfControl', 'selfControl']
        : tilt === 'controlled'
          ? ['selfControl', 'selfControl', 'selfControl', 'conscience', 'conscience', 'courage', 'courage']
          : ['conscience', 'conscience', 'conscience', 'selfControl', 'selfControl', 'courage', 'courage'];
    for (const virtueId of virtuePlan) {
      character.virtues[virtueId] = Math.min(5, (Number(character.virtues[virtueId]) || 0) + 1);
    }

    character.humanity = Math.max(1, Math.min(10, (Number(character.virtues.conscience) || 0) + (Number(character.virtues.selfControl) || 0)));
    character.willpower = Math.max(1, Math.min(10, Number(character.virtues.courage) || 0));
    character.currentWillpower = character.willpower;
    character.merits = [];
    character.flaws = [];
    character.clanMerits = [];
    character.clanFlaws = [];
    character.additionalClanDisciplines = [];
    character.specialties = [];
    character.creation = {
      ...getDefaultCreationState(),
      phase: 'allocation',
      uiStep: 'review',
      allocationSnapshot: null,
      freebieSnapshot: null,
      startingExperience: 15,
      aiAssistant: ensureCharacterCreationState(character).aiAssistant,
    };
    character.experience = {
      unspent: 15,
      spent: 0,
      log: [],
    };

    syncCharacterDerivedStats(character);
    markCharacterSummaryDirty(chronicle);
    updateChronicleTitle(chronicle);

    const validation = getCharacterCreationValidation(character);
    if (!validation.valid) {
      return {
        applied: true,
        snapshot,
        message: `Autofill applied, but manual review is needed: ${validation.issues[0] || 'validation issue found.'}`,
      };
    }

    return {
      applied: true,
      snapshot,
      message: 'Autofill applied. Review the sheet, then continue to freebie and XP phases when ready.',
    };
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
    container.querySelectorAll('[data-action="open-discipline-reference"]').forEach((button) => {
      button.addEventListener('click', () => {
        runtime.referenceDetail = {
          kind: 'discipline',
          name: button.getAttribute('data-discipline-name') || '',
        };
        runtime.referenceReturnPanel = 'sheet';
        state.activePanel = 'reference';
        persist();
        render();
      });
    });
    container.querySelectorAll('[data-action="open-ritual-reference"]').forEach((button) => {
      button.addEventListener('click', () => {
        runtime.referenceDetail = {
          kind: 'ritual',
          name: button.getAttribute('data-ritual-name') || '',
          ritualName: button.getAttribute('data-ritual-name') || '',
          discipline: button.getAttribute('data-ritual-discipline') || '',
        };
        runtime.referenceReturnPanel = 'sheet';
        state.activePanel = 'reference';
        persist();
        render();
      });
    });
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

    const sheetUi = getSheetUiState(chronicle);
    container.querySelector('[data-action="toggle-sheet-guide"]')?.addEventListener('click', () => {
      sheetUi.showGuide = !sheetUi.showGuide;
      persist();
      render();
    });

    container.querySelector('[data-role="sheet-guide-search"]')?.addEventListener('input', (event) => {
      sheetUi.guideQuery = event.target.value;
      persist();
      render();
    });

    container.querySelector('[data-action="toggle-xp-log"]')?.addEventListener('click', () => {
      sheetUi.showXpLog = !sheetUi.showXpLog;
      persist();
      render();
    });

    bindXpPlannerEvents(container, chronicle);

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

  function bindXpPlannerEvents(container, chronicle) {
    const plan = getXpPlanState(chronicle);

    container.querySelector('[data-role="xp-plan-reason"]')?.addEventListener('input', (event) => {
      plan.reason = event.target.value;
      persist();
    });

    container.querySelector('[data-role="xp-plan-filter"]')?.addEventListener('input', (event) => {
      plan.reasonFilter = event.target.value;
      render();
    });

    container.querySelectorAll('[data-action="xp-plan-plus"]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!canSpendExperience(chronicle)) {
          setStatus(getXpGateMessage(chronicle), true);
          return;
        }

        const category = button.getAttribute('data-category') || '';
        const target = button.getAttribute('data-target') || '';
        const projected = getProjectedCharacterForXpPlan(chronicle.character, plan);
        const preview = getXpPurchasePreview(projected, { category, target, reason: plan.reason });
        const currentDraftCost = plan.steps.reduce((sum, step) => sum + step.cost, 0);
        const remaining = Math.max(0, Number(chronicle.character.experience.unspent) - currentDraftCost);

        if (!preview.valid) {
          setStatus(preview.summary, true);
          return;
        }

        if (preview.cost > remaining) {
          setStatus('Not enough available EXP for that draft change.', true);
          return;
        }

        plan.steps.push({
          key: `${category}:${target}`,
          category,
          target,
          cost: preview.cost,
          summary: preview.summary,
          formula: preview.formula,
        });
        persist();
        render();
      });
    });

    container.querySelectorAll('[data-action="xp-plan-minus"]').forEach((button) => {
      button.addEventListener('click', () => {
        const category = button.getAttribute('data-category') || '';
        const target = button.getAttribute('data-target') || '';
        const key = `${category}:${target}`;
        const index = [...plan.steps].map((step) => step.key).lastIndexOf(key);
        if (index < 0) {
          return;
        }
        plan.steps.splice(index, 1);
        persist();
        render();
      });
    });

    container.querySelector('[data-action="xp-plan-clear"]')?.addEventListener('click', () => {
      plan.steps = [];
      persist();
      render();
    });

    container.querySelector('[data-action="xp-plan-confirm"]')?.addEventListener('click', () => {
      if (!canSpendExperience(chronicle)) {
        setStatus(getXpGateMessage(chronicle), true);
        return;
      }

      if (!plan.steps.length) {
        setStatus('Add at least one change to the XP draft first.', true);
        return;
      }

      const reason = String(plan.reason || '').trim();
      let totalCost = 0;
      for (const step of plan.steps) {
        const preview = getXpPurchasePreview(chronicle.character, { category: step.category, target: step.target, reason });
        if (!preview.valid) {
          setStatus(preview.summary, true);
          return;
        }
        totalCost += preview.cost;
        if (totalCost > chronicle.character.experience.unspent) {
          setStatus('This draft now exceeds available EXP.', true);
          return;
        }
        applyXpPurchase(chronicle.character, { category: step.category, target: step.target }, preview);
        chronicle.character.experience.log.unshift({
          id: uid('xp'),
          category: step.category,
          target: step.target,
          cost: preview.cost,
          reason: reason || preview.summary,
          formula: preview.formula,
          summary: preview.summary,
          timestamp: new Date().toISOString(),
        });
      }

      chronicle.character.experience.unspent -= totalCost;
      chronicle.character.experience.spent += totalCost;
      markCharacterSummaryDirty(chronicle);
      plan.steps = [];
      persist();
      setStatus(`Confirmed XP draft for ${totalCost} EXP.`);
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
    container.querySelector('[data-action="set-downtime-activity"]')?.addEventListener('click', () => {
      const select = container.querySelector('[data-downtime-activity]');
      const nextType = String(select?.value || '').trim();
      const progression = ensureChronicleProgressionState(chronicle);
      if (!nextType) {
        setStatus('Choose a downtime activity first.', true);
        return;
      }
      if (progression.downtimeActivity?.completed) {
        setStatus('Only one downtime activity can complete per downtime session.', true);
        return;
      }
      const def = getDowntimeActivityDefinition(nextType);
      if (!def) {
        setStatus('That downtime activity is not configured.', true);
        return;
      }
      progression.downtimeActivity = {
        type: def.id,
        status: 'active',
        completed: false,
        progressSuccesses: 0,
        targetSuccesses: def.target,
        rollPool: def.pool,
        rollDifficulty: def.difficulty,
      };
      persist();
      render();
      setStatus(`${def.label} started. Progress now tracks on the downtime card.`);
    });

    container.querySelector('[data-action="prompt-downtime-roll"]')?.addEventListener('click', () => {
      const progression = ensureChronicleProgressionState(chronicle);
      const activity = progression.downtimeActivity || {};
      if (!activity.type || activity.status !== 'active') {
        setStatus('No active downtime activity is selected.', true);
        return;
      }
      const def = getDowntimeActivityDefinition(activity.type);
      if (!def) {
        setStatus('Downtime activity definition is missing.', true);
        return;
      }
      appendStorytellerPrompt(
        chronicle,
        [
          `Downtime Activity: ${def.label}`,
          'Mechanics:',
          `- Pool: ${def.pool}`,
          `- Difficulty: ${def.difficulty}`,
          '- Outcome: Apply successes toward the activity target.',
        ].join('\n'),
      );
      persist();
      render();
      setStatus('Downtime roll prompt added to chat.');
    });

    container.querySelector('[data-action="advance-downtime-success"]')?.addEventListener('click', () => {
      const progression = ensureChronicleProgressionState(chronicle);
      const activity = progression.downtimeActivity || {};
      if (!activity.type || activity.status !== 'active') {
        setStatus('No active downtime activity to advance.', true);
        return;
      }
      activity.progressSuccesses = Math.max(0, Number(activity.progressSuccesses) || 0) + 1;
      if (activity.targetSuccesses > 0 && activity.progressSuccesses >= activity.targetSuccesses) {
        activity.completed = true;
        activity.status = 'completed';
      }
      persist();
      render();
    });

    container.querySelector('[data-action="prompt-combat-sequence"]')?.addEventListener('click', () => {
      appendStorytellerPrompt(
        chronicle,
        [
          'Combat Sequence Prompt',
          'Mechanics:',
          '- Pool: Wits + Alertness',
          '- Difficulty: 6',
          '- Outcome: Initiative ordering for the round.',
          'After initiative, resolve declarations then actions in order.',
        ].join('\n'),
      );
      persist();
      render();
      setStatus('Combat sequence prompt added to chat.');
    });
  }

  function bindReferenceEvents(container) {
    container.querySelector('[data-action="reference-back"]')?.addEventListener('click', () => {
      state.activePanel = runtime.referenceReturnPanel || null;
      persist();
      render();
    });
    container.querySelectorAll('[data-action="open-discipline-reference"]').forEach((button) => {
      button.addEventListener('click', () => {
        runtime.referenceDetail = {
          kind: 'discipline',
          name: button.getAttribute('data-discipline-name') || '',
        };
        state.activePanel = 'reference';
        persist();
        render();
      });
    });
    container.querySelectorAll('[data-action="open-ritual-reference"]').forEach((button) => {
      button.addEventListener('click', () => {
        runtime.referenceDetail = {
          kind: 'ritual',
          name: button.getAttribute('data-ritual-name') || '',
          ritualName: button.getAttribute('data-ritual-name') || '',
          discipline: button.getAttribute('data-ritual-discipline') || '',
        };
        state.activePanel = 'reference';
        persist();
        render();
      });
    });
  }

  function appendStorytellerPrompt(chronicle, content) {
    chronicle.messages.push({
      id: uid('msg'),
      role: 'assistant',
      kind: 'storyteller',
      content,
      timestamp: new Date().toISOString(),
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
      const nameInput = row.querySelector(`[${nameAttr}]`);
      const dotsInput = row.querySelector(`[${dotsAttr}]`);
      const removeButton = row.querySelector('[data-remove-entry]');

      if (!id || !nameInput || !dotsInput || !removeButton) {
        return;
      }

      nameInput.addEventListener('change', (event) => {
        const item = target[`${type}s`].find((entry) => entry.id === id);
        if (!item) {
          return;
        }
        if (namespace !== 'xp' && isCreationPhaseLockedEntry(target, type, id)) {
          render();
          return;
        }
        item.name = event.target.value;
        if (type === 'discipline') {
          ensureDisciplinePathState(item);
        }
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
      dotsInput.addEventListener('input', (event) => {
        const item = target[`${type}s`].find((entry) => entry.id === id);
        if (!item) {
          return;
        }
        item.dots = namespace === 'xp' ? Number(event.target.value) : sanitizeCreationTraitDots(target, type, id, Number(event.target.value));
        if (type === 'discipline') {
          ensureDisciplinePathState(item);
        }
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
      removeButton.addEventListener('click', () => {
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

      if (type === 'discipline') {
        row.querySelector('[data-discipline-primary-path]')?.addEventListener('change', (event) => {
          const item = target.disciplines.find((entry) => entry.id === id);
          if (!item) {
            return;
          }
          item.primaryPath = event.target.value;
          ensureDisciplinePathState(item);
          persist();
          render();
        });

        row.querySelector('[data-discipline-secondary-path]')?.addEventListener('change', (event) => {
          const item = target.disciplines.find((entry) => entry.id === id);
          if (!item) {
            return;
          }
          item.secondaryPath = event.target.value;
          ensureDisciplinePathState(item);
          persist();
          render();
        });

        row.querySelector('[data-discipline-tertiary-path]')?.addEventListener('change', (event) => {
          const item = target.disciplines.find((entry) => entry.id === id);
          if (!item) {
            return;
          }
          item.tertiaryPath = event.target.value;
          ensureDisciplinePathState(item);
          persist();
          render();
        });

        row.querySelector('[data-action="open-discipline-reference"]')?.addEventListener('click', () => {
          runtime.referenceDetail = {
            kind: 'discipline',
            name: nameInput.value || '',
          };
          runtime.referenceReturnPanel = state.activePanel || null;
          state.activePanel = 'reference';
          persist();
          render();
        });

        row.querySelectorAll('[data-action="open-ritual-reference"]').forEach((button) => {
          button.addEventListener('click', () => {
            runtime.referenceDetail = {
              kind: 'ritual',
              name: button.getAttribute('data-ritual-name') || '',
              ritualName: button.getAttribute('data-ritual-name') || '',
              discipline: button.getAttribute('data-ritual-discipline') || '',
            };
            runtime.referenceReturnPanel = state.activePanel || null;
            state.activePanel = 'reference';
            persist();
            render();
          });
        });

        row.querySelector('[data-action="add-discipline-ritual"]')?.addEventListener('click', () => {
          const item = target.disciplines.find((entry) => entry.id === id);
          if (!item) {
            return;
          }
          if (!isBloodMagicDisciplineName(item.name)) {
            setStatus('Rituals are only available for blood magic disciplines.', true);
            return;
          }
          if (!Array.isArray(item.rituals)) {
            item.rituals = [];
          }
          if (item.rituals.length >= RITUAL_MAX_PER_DISCIPLINE) {
            setStatus(`A maximum of ${RITUAL_MAX_PER_DISCIPLINE} rituals can be tracked per discipline here.`, true);
            return;
          }

          const selectedTemplate = row.querySelector('[data-discipline-ritual-template]')?.value || '';
          if (!selectedTemplate) {
            setStatus('Choose a ritual from the dropdown before adding it.', true);
            return;
          }
          if (item.rituals.some((ritual) => ritual.name === selectedTemplate)) {
            setStatus('That ritual is already tracked for this discipline.', true);
            return;
          }

          item.rituals.push({ id: uid('ritual'), name: selectedTemplate });
          persist();
          render();
        });
      }
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
      row.querySelector(`[data-${key}-category]`)?.addEventListener('change', (event) => {
        const item = target[key].find((entry) => entry.id === id);
        if (!item) {
          return;
        }
        item.category = event.target.value;
        const firstOption = getEquipmentCategoryEntries(item.category)[0];
        if (firstOption && !item.name) {
          item.name = firstOption.name;
          item.details = firstOption.details;
        }
        persist();
        render();
      });
      row.querySelector(`[data-${key}-template]`)?.addEventListener('change', (event) => {
        const item = target[key].find((entry) => entry.id === id);
        if (!item) {
          return;
        }
        const templateName = event.target.value;
        const selected = getEquipmentCategoryEntries(item.category).find((entry) => entry.name === templateName);
        if (selected) {
          item.name = selected.name;
          item.details = selected.details;
          persist();
          render();
        }
      });
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

  function renderChat(messages, chronicle = getActiveChronicle()) {
    ui.chatLog.innerHTML = '';
    for (const message of messages) {
      const kind = getMessageKind(message);
      const speaker = kind === 'storyteller' ? 'Storyteller' : kind === 'player' ? 'Player' : 'Chronicle';
      const card = document.createElement('article');
      card.className = `message-card ${message.role} ${kind}`;
      card.innerHTML = `
        <div class="message-header">
          <span>${speaker}</span>
          <span class="meta-text">${formatTimestamp(message.timestamp)}</span>
        </div>
        <div class="message-body">${formatMessageContent(message.content, { enableInteractiveRolls: kind === 'storyteller' })}</div>
      `;
      ui.chatLog.appendChild(card);
    }

    if (isStorytellerRequestPending(chronicle)) {
      const pendingCard = document.createElement('article');
      pendingCard.className = 'message-card assistant storyteller pending-message';
      pendingCard.innerHTML = `
        <div class="message-header">
          <span>Storyteller</span>
          <span class="meta-text">Pending...</span>
        </div>
        <div class="message-body pending-message-body"><span class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></span></div>
      `;
      ui.chatLog.appendChild(pendingCard);
    }

    ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
  }

  function getPromptRollTraitDots(character, traitId) {
    if (traitId === 'willpower') {
      const current = Number(character.currentWillpower);
      const permanent = Number(character.willpower);
      return Number.isFinite(current) ? current : Number.isFinite(permanent) ? permanent : null;
    }

    if (Object.hasOwn(character.attributes || {}, traitId)) {
      return Number(character.attributes[traitId]) || 0;
    }

    if (Object.hasOwn(character.abilities || {}, traitId)) {
      return Number(character.abilities[traitId]) || 0;
    }

    if (String(traitId).startsWith('discipline:')) {
      const requested = String(traitId).slice('discipline:'.length);
      const match = (character.disciplines || []).find(
        (entry) => normalizeDisciplineKey(entry?.name) === requested,
      );
      const dots = Number(match?.dots) || 0;
      return dots > 0 ? dots : null;
    }

    return null;
  }

  function resolvePromptPool(character, traitIds) {
    let pool = 0;
    const parts = [];

    for (const traitId of traitIds) {
      const dots = getPromptRollTraitDots(character, traitId);
      if (!Number.isFinite(dots)) {
        return {
          error: `Trait ${ROLL_TRAIT_LABELS.get(traitId) || traitId} is unavailable on the current sheet.`,
          pool: 0,
          parts: [],
        };
      }

      pool += dots;
      parts.push(`${ROLL_TRAIT_LABELS.get(traitId) || startCase(traitId)} ${dots}`);
    }

    return {
      error: '',
      pool,
      parts,
    };
  }

  async function onPromptRollClick(event) {
    const trigger = event.target.closest('[data-action="roll-from-prompt"], [data-action="roll-with-willpower-from-prompt"]');
    if (!trigger) {
      return;
    }

    if (runtime.promptRollPending) {
      setStatus('A prompt roll is already being processed. Please wait.', true);
      return;
    }

    event.preventDefault();
    runtime.promptRollPending = true;

    try {
      const chronicle = getActiveChronicle();
      if (!chronicle) {
        setStatus('No active chronicle available for rolling.', true);
        return;
      }

      const traitIds = String(trigger.dataset.rollTraits || '')
        .split('+')
        .map((value) => value.trim())
        .filter(Boolean);

      if (!traitIds.length) {
        setStatus('Could not parse a valid trait expression from this roll prompt.', true);
        return;
      }

      const actorPool = resolvePromptPool(chronicle.character, traitIds);
      if (actorPool.error) {
        setStatus(actorPool.error, true);
        return;
      }

      const { pool, parts } = actorPool;

      if (pool <= 0) {
        setStatus('Computed dice pool is 0. Adjust the character sheet first.', true);
        return;
      }

      const useWillpower = trigger.dataset.action === 'roll-with-willpower-from-prompt';
      const currentWillpower = Math.max(0, Number(chronicle.character.currentWillpower) || 0);
      if (useWillpower && currentWillpower <= 0) {
        setStatus('No temporary willpower is available to spend for this roll.', true);
        return;
      }

      const difficulty = parseDifficultyValue(trigger.dataset.rollDifficulty, 6);
      const selectedPath = String(trigger.dataset.rollPath || '').trim();
      const baseResult = rollDice(pool, difficulty);

      const resistanceTraitIds = String(trigger.dataset.rollResistanceTraits || '')
        .split('+')
        .map((value) => value.trim())
        .filter(Boolean);

      const hasResistance = resistanceTraitIds.length > 0;
      const resistanceDifficulty = parseDifficultyValue(trigger.dataset.rollResistanceDifficulty, 6);
      let resistanceSummary = null;
      if (hasResistance) {
        const resistancePool = resolvePromptPool(chronicle.character, resistanceTraitIds);
        if (resistancePool.error) {
          setStatus(resistancePool.error, true);
          return;
        }

        if (resistancePool.pool <= 0) {
          setStatus('Computed resistance pool is 0. Adjust the character sheet first.', true);
          return;
        }

        const resistanceResult = rollDice(resistancePool.pool, resistanceDifficulty);
        resistanceSummary = {
          pool: resistancePool.pool,
          parts: resistancePool.parts,
          result: resistanceResult,
        };
      }

      let finalResult = {
        ...baseResult,
        automaticSuccesses: 0,
        willpowerSpent: false,
        resistance: resistanceSummary,
        path: selectedPath,
      };

      if (useWillpower) {
        chronicle.character.currentWillpower = Math.max(0, currentWillpower - 1);
        markCharacterSummaryDirty(chronicle);

        const totalSuccesses = baseResult.totalSuccesses + 1;
        const outcome = totalSuccesses > 0 ? (totalSuccesses >= 5 ? 'Exceptional success' : 'Success') : 'Failure';
        finalResult = {
          ...finalResult,
          totalSuccesses,
          outcome,
          automaticSuccesses: 1,
          willpowerSpent: true,
        };
      }

      chronicle.diceLog.push(finalResult);
      const resistanceNotes = finalResult.resistance
        ? ` Resistance (${finalResult.resistance.parts.join(' + ')}) at difficulty ${resistanceDifficulty}: ${finalResult.resistance.result.outcome}; dice ${finalResult.resistance.result.dice.join(', ')}, net successes ${finalResult.resistance.result.totalSuccesses}.`
        : '';
      const pathNotes = finalResult.path ? ` Path: ${finalResult.path}.` : '';
      chronicle.notes = `${chronicle.notes}\n[${new Date().toLocaleTimeString()}] Prompt roll (${parts.join(' + ')}) at difficulty ${finalResult.difficulty}: ${finalResult.outcome}; dice ${finalResult.dice.join(', ')}, net successes ${finalResult.totalSuccesses}${finalResult.automaticSuccesses ? `, +${finalResult.automaticSuccesses} automatic success` : ''}.${pathNotes}${resistanceNotes}`.trim();
      persist();
      render();

      let resistanceBlock = [];
      if (finalResult.resistance) {
        const contestMargin = finalResult.totalSuccesses - finalResult.resistance.result.totalSuccesses;
        const contestLabel = contestMargin > 0 ? 'Actor overcomes resistance' : contestMargin < 0 ? 'Resistance prevails' : 'Stalemate';
        resistanceBlock = [
          `Resistance Pool: ${finalResult.resistance.pool} (${finalResult.resistance.parts.join(' + ')})`,
          `Resistance Difficulty: ${resistanceDifficulty}`,
          `Resistance Dice: ${finalResult.resistance.result.dice.join(', ')}`,
          `Resistance Raw Successes: ${finalResult.resistance.result.rawSuccesses}`,
          `Resistance 1s: ${finalResult.resistance.result.cancelledByOnes}`,
          `Resistance Final Successes: ${finalResult.resistance.result.totalSuccesses}`,
          `Contest Margin (Actor - Resistance): ${contestMargin}`,
          `Contest Outcome: ${contestLabel}`,
        ];
      }

      const reportMessage = [
        '[AUTO-ROLL RESULT]',
        ...(finalResult.path ? [`Path: ${finalResult.path}`] : []),
        `Pool: ${finalResult.pool} (${parts.join(' + ')})`,
        `Difficulty: ${finalResult.difficulty}`,
        `Dice: ${finalResult.dice.join(', ')}`,
        `Raw Successes: ${baseResult.rawSuccesses}`,
        `1s: ${baseResult.cancelledByOnes}`,
        `Net Successes: ${baseResult.totalSuccesses}`,
        ...(finalResult.automaticSuccesses ? [`Automatic Successes: +${finalResult.automaticSuccesses} (Willpower spent)`] : []),
        `Final Successes: ${finalResult.totalSuccesses}`,
        `Outcome: ${finalResult.outcome}`,
        ...resistanceBlock,
        'Storyteller: adjudicate consequences from this result.',
      ].join('\n');

      await requestStorytellerTurn(chronicle, {
        userMessage: reportMessage,
        appendUserMessage: true,
        pendingStatus: 'The Storyteller is adjudicating the roll result.',
      });
    } finally {
      runtime.promptRollPending = false;
    }
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
    for (const discipline of character.disciplines) {
      ensureDisciplinePathState(discipline);
    }
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
    const ritualSummary = (character.disciplines || [])
      .filter((item) => Array.isArray(item.rituals) && item.rituals.length)
      .flatMap((item) => item.rituals.map((ritual) => `${item.name}: ${ritual.name}`));
    return `
      <div class="inline-grid two">
        <div class="list-card">
          ${renderCardHeading('Disciplines', 'disciplines')}
          <div class="summary-list">
            ${character.disciplines.length
              ? character.disciplines
                  .map(
                    (item) => `<div class="entry-row inventory"><button class="reference-link-button" type="button" data-action="open-discipline-reference" data-discipline-name="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button><span>${item.dots}</span></div>`,
                  )
                  .join('')
              : '<div>None recorded.</div>'}
          </div>
          <p class="footer-note">Raise or learn disciplines through XP purchases only.</p>
        </div>
        <div class="list-card">
          ${renderCardHeading('Specialties', 'specialties')}
          ${renderSimpleList(character.specialties.map((item) => `${startCase(item.ability)}: ${item.name}`), 'New specialties should be confirmed through XP purchases.')}
        </div>
      </div>

      <div class="list-card">
        ${renderCardHeading('Rituals')}
        <div class="summary-list">${renderTrackedRitualRows(character)}</div>
        <p class="footer-note">Rituals are tied to blood magic disciplines and should be granted through downtime or Storyteller updates. A new primary path level grants one ritual of the same level for free.</p>
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

  function getSheetUiState(chronicle) {
    if (!runtime.sheetUi[chronicle.id]) {
      runtime.sheetUi[chronicle.id] = {
        showGuide: false,
        guideQuery: '',
        showXpLog: false,
      };
    }
    return runtime.sheetUi[chronicle.id];
  }

  function getXpPlanState(chronicle) {
    if (!runtime.xpPlans[chronicle.id]) {
      runtime.xpPlans[chronicle.id] = {
        steps: [],
        reason: '',
        reasonFilter: '',
      };
    }
    return runtime.xpPlans[chronicle.id];
  }

  function getProjectedCharacterForXpPlan(character, plan) {
    const projected = JSON.parse(JSON.stringify(character));
    for (const step of plan.steps) {
      const preview = getXpPurchasePreview(projected, { category: step.category, target: step.target, reason: plan.reason });
      if (!preview.valid) {
        continue;
      }
      applyXpPurchase(projected, { category: step.category, target: step.target }, preview);
    }
    return projected;
  }

  function getXpDraftLabel(projectedCharacter, category, target) {
    if (category === 'attribute') {
      const field = ATTRIBUTE_FIELDS.find((item) => item.id === target);
      return field?.label || startCase(target);
    }
    if (category === 'ability') {
      const field = ABILITY_FIELDS.find((item) => item.id === target);
      return field?.label || startCase(target);
    }
    if (category === 'discipline') {
      const [mode, name] = String(target).split(':');
      const current = (projectedCharacter.disciplines || []).find((item) => item.name === name)?.dots || 0;
      return mode === 'new' ? `Learn ${name}` : `Raise ${name} (${current} -> ${current + 1})`;
    }
    if (category === 'virtue') {
      const morality = getMoralityConfig(projectedCharacter.path);
      if (target === 'conscience') {
        return morality.primaryLabel;
      }
      if (target === 'selfControl') {
        return morality.secondaryLabel;
      }
      return 'Courage';
    }
    if (category === 'humanity') {
      return getMoralityConfig(projectedCharacter.path).ratingLabel;
    }
    return 'Willpower';
  }

  function renderXpPlannerCard(chronicle, isCreationPhase) {
    const character = chronicle.character;
    const plan = getXpPlanState(chronicle);
    const projected = getProjectedCharacterForXpPlan(character, plan);
    const xpSpendAllowed = canSpendExperience(chronicle);
    const remaining = Math.max(0, Number(character.experience.unspent) - plan.steps.reduce((sum, step) => sum + step.cost, 0));
    const rows = [];

    const pushRows = (category, options) => {
      for (const option of options) {
        const target = option.value;
        const draft = { category, target, reason: plan.reason };
        const preview = getXpPurchasePreview(projected, draft);
        const key = `${category}:${target}`;
        const pending = plan.steps.filter((step) => step.key === key).length;
        const nextCost = preview.valid ? preview.cost : 0;
        const label = getXpDraftLabel(projected, category, target);
        rows.push({ key, category, target, label, preview, pending, nextCost });
      }
    };

    pushRows('attribute', ATTRIBUTE_FIELDS.map((item) => ({ value: item.id })));
    pushRows('ability', ABILITY_FIELDS.map((item) => ({ value: item.id })));
    pushRows('discipline', getXpTargetOptions(projected, 'discipline'));
    pushRows('virtue', getXpTargetOptions(projected, 'virtue'));
    pushRows('humanity', [{ value: 'humanity' }]);
    pushRows('willpower', [{ value: 'willpower' }]);

    const filter = (plan.reasonFilter || '').trim().toLowerCase();
    const visibleRows = rows.filter((row) => {
      if (!filter) {
        return true;
      }
      return row.label.toLowerCase().includes(filter) || row.preview.summary.toLowerCase().includes(filter);
    });

    return `
      <div class="list-card xp-planner-card ${xpSpendAllowed ? '' : 'disabled'}">
        <div class="npc-header-row">
          <h4>${isCreationPhase ? 'Starting Experience Planner' : 'Experience Planner'}</h4>
          <span class="status-pill">Draft: ${plan.steps.length} change${plan.steps.length === 1 ? '' : 's'}</span>
        </div>
        <div class="inline-grid three">
          <div class="locked-card compact"><span class="helper-text">Available EXP</span><strong>${character.experience.unspent}</strong></div>
          <div class="locked-card compact"><span class="helper-text">Draft Cost</span><strong>${plan.steps.reduce((sum, step) => sum + step.cost, 0)}</strong></div>
          <div class="locked-card compact"><span class="helper-text">Remaining After Draft</span><strong>${remaining}</strong></div>
        </div>
        <label>
          <span class="helper-text">Reason for this XP batch</span>
          <input data-role="xp-plan-reason" value="${escapeHtml(plan.reason || '')}" placeholder="Why did this growth happen in play?" ${xpSpendAllowed ? '' : 'disabled'} />
        </label>
        <label>
          <span class="helper-text">Filter targets</span>
          <input data-role="xp-plan-filter" value="${escapeHtml(plan.reasonFilter || '')}" placeholder="Search attribute, ability, discipline, or virtue" />
        </label>
        <div class="xp-plan-grid">
          ${visibleRows
            .map(
              (row) => `
                <div class="xp-plan-row ${row.preview.valid ? '' : 'invalid'}">
                  <div>
                    <strong>${escapeHtml(row.label)}</strong>
                    <div class="meta-text">${escapeHtml(row.preview.summary)}</div>
                    <div class="meta-text">${escapeHtml(row.preview.formula)}</div>
                  </div>
                  <div class="locked-card compact"><span class="helper-text">Cost</span><strong>${row.preview.valid ? row.nextCost : '-'}</strong></div>
                  <div class="locked-card compact"><span class="helper-text">Pending</span><strong>${row.pending}</strong></div>
                  <div class="inline-actions">
                    <button class="secondary-button" type="button" data-action="xp-plan-minus" data-category="${row.category}" data-target="${escapeHtml(row.target)}" ${row.pending > 0 ? '' : 'disabled'}>-</button>
                    <button class="secondary-button" type="button" data-action="xp-plan-plus" data-category="${row.category}" data-target="${escapeHtml(row.target)}" ${xpSpendAllowed && row.preview.valid && row.nextCost <= remaining ? '' : 'disabled'}>+</button>
                  </div>
                </div>
              `,
            )
            .join('')}
        </div>
        <div class="stage-actions split">
          <button class="secondary-button" type="button" data-action="xp-plan-clear" ${plan.steps.length ? '' : 'disabled'}>Clear Draft</button>
          <button class="primary" type="button" data-action="xp-plan-confirm" ${xpSpendAllowed && plan.steps.length ? '' : 'disabled'}>Confirm Draft</button>
        </div>
        ${isCreationPhase
          ? '<p class="footer-note">Unspent starting XP is discarded when creation ends. Confirm this draft before finalizing the character.</p>'
          : '<p class="footer-note">XP spending is available during downtime only. Build the draft with plus/minus, then confirm in one batch.</p>'}
      </div>
    `;
  }

  function renderQuickGuideList(query) {
    const needle = String(query || '').trim().toLowerCase();
    const entries = Object.entries(STAT_HELP)
      .filter(([key]) => !key.includes('discipline') && !key.includes('ritual'))
      .filter(([key, value]) => {
        if (!needle) {
          return true;
        }
        return key.toLowerCase().includes(needle) || String(value).toLowerCase().includes(needle);
      })
      .sort((a, b) => a[0].localeCompare(b[0]));

    if (!entries.length) {
      return '<div class="helper-text">No matching quick-guide entries.</div>';
    }

    return entries
      .map(([key, value]) => `<div><strong>${escapeHtml(startCase(key))}:</strong> ${escapeHtml(String(value))}</div>`)
      .join('');
  }

  function renderCreationExperienceCard(character, chronicle) {
    const startingExperience = Number(character.creation?.startingExperience) || 15;
    return `
      <div class="list-card validation-card valid">
        <div class="npc-header-row">
          <h4>Starting Experience</h4>
          <span class="status-pill">${character.experience.spent} spent / ${startingExperience} total</span>
        </div>
        <div class="summary-list validation-list">
          <div>Confirmed purchases use the normal V20 XP costs.</div>
          <div>Available EXP: ${character.experience.unspent}</div>
          <div>Spent starting XP: ${character.experience.spent}</div>
        </div>
        ${chronicle ? renderXpPlannerCard(chronicle, true) : ''}
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
      .map((item) => {
        if (type !== 'discipline') {
          return `
            <div class="entry-row" ${idAttr}="${item.id}">
              ${renderSelect(`${type}-name`, options, item.name, nameAttr)}
              <label><span class="helper-text">Dots</span><input type="number" min="1" max="5" value="${item.dots}" ${dotsAttr} /></label>
              <button class="remove-button" type="button" data-remove-entry>Remove</button>
            </div>
          `;
        }

        ensureDisciplinePathState(item);
        const pathOptions = getDisciplinePathOptions(item.name);
        const usedPaths = getSelectedDisciplinePaths(item);
        const ritualOptions = getRitualOptionsForDiscipline(item);
        const rituals = Array.isArray(item.rituals) ? item.rituals : [];
        return `
          <div class="trait-entry-group" ${idAttr}="${item.id}">
            <div class="entry-row">
              ${renderSelect(`${type}-name`, options, item.name, nameAttr)}
              <label><span class="helper-text">Dots</span><input type="number" min="1" max="5" value="${item.dots}" ${dotsAttr} /></label>
              <button class="secondary-button" type="button" data-action="open-discipline-reference">Details</button>
              <button class="remove-button" type="button" data-remove-entry>Remove</button>
            </div>
          ${pathOptions.length
            ? `<div class="entry-row inventory">
                <label><span class="helper-text">Primary Path</span>${renderSelect('discipline-primary-path', pathOptions, item.primaryPath, 'data-discipline-primary-path')}</label>
              </div>
              <div class="footer-note">Starting blood magic uses only the primary path. Additional paths can be tracked later through play and XP. Current selection: ${escapeHtml(usedPaths[0] || 'None')}</div>`
            : ''}
          ${isBloodMagicDisciplineName(item.name)
            ? `<div class="entry-row inventory ${rituals.length >= RITUAL_MAX_PER_DISCIPLINE ? 'readonly' : ''}">
                <label><span class="helper-text">Rituals</span>${renderSelect('ritual-template', ['Select ritual', ...ritualOptions], '', 'data-discipline-ritual-template', ['', ...ritualOptions])}</label>
                <button class="secondary-button" type="button" data-action="add-discipline-ritual" ${rituals.length >= RITUAL_MAX_PER_DISCIPLINE ? 'disabled' : ''}>Add Ritual</button>
              </div>
              <div class="summary-list">${rituals.length ? rituals.map((ritual) => `<div class="entry-row inventory"><span>${escapeHtml(ritual.name)}</span><button class="secondary-button" type="button" data-action="open-ritual-reference" data-ritual-name="${escapeHtml(ritual.name)}" data-ritual-discipline="${escapeHtml(item.name)}">Details</button></div>`).join('') : '<div class="helper-text">No rituals recorded.</div>'}</div>
              <div class="footer-note">Primary path level sets ritual availability. Reaching a new primary path level grants one ritual of the same level for free.</div>`
            : ''}
          </div>
        `;
      })
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
      .map((item) => {
        if (key !== 'equipment') {
          return `
            <div class="entry-row inventory ${readOnly ? 'readonly' : ''}" data-${key}-id="${item.id}">
              <label><span class="helper-text">Name</span><input ${readOnly ? 'disabled' : ''} data-${key}-name value="${escapeHtml(item.name)}" /></label>
              <label><span class="helper-text">Details</span><input ${readOnly ? 'disabled' : ''} data-${key}-details value="${escapeHtml(item.details || '')}" /></label>
              ${readOnly ? '' : '<button class="remove-button" type="button" data-remove-entry>Remove</button>'}
            </div>
          `;
        }
        const category = EQUIPMENT_CATEGORIES.includes(item.category) ? item.category : EQUIPMENT_CATEGORIES[0];
        const categoryEntries = getEquipmentCategoryEntries(category);
        const templateNames = categoryEntries.map((entry) => entry.name);
        return `
          <div class="entry-row inventory ${readOnly ? 'readonly' : ''}" data-${key}-id="${item.id}">
            <label><span class="helper-text">Source</span>${renderSelect('equipment-category', EQUIPMENT_CATEGORIES, category, `data-${key}-category`)}</label>
            <label><span class="helper-text">Preset</span>${renderSelect('equipment-template', ['Custom', ...templateNames], templateNames.includes(item.name) ? item.name : '', `data-${key}-template`, ['', ...templateNames])}</label>
            <label><span class="helper-text">Name</span><input ${readOnly ? 'disabled' : ''} data-${key}-name value="${escapeHtml(item.name)}" /></label>
            <label><span class="helper-text">Details</span><input ${readOnly ? 'disabled' : ''} data-${key}-details value="${escapeHtml(item.details || '')}" /></label>
            ${readOnly ? '' : '<button class="remove-button" type="button" data-remove-entry>Remove</button>'}
          </div>
        `;
      })
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
      const archiveFolder = await chronicleFolder.getDirectoryHandle('chat-archives', { create: true });

      await writeTextFile(chronicleFolder, 'campaign-memory.txt', formatCampaignMemoryForExport(chronicle));
      await writeTextFile(chronicleFolder, 'chronicle-summary.txt', chronicle.summary || 'No chronicle summary recorded yet.');
      await writeTextFile(chronicleFolder, 'chronicle-notes.txt', chronicle.notes || 'No notes recorded yet.');
      await writeTextFile(chronicleFolder, 'plot-points.txt', chronicle.plotPoints || 'No plot points recorded yet.');

      const archives = Array.isArray(chronicle.messageArchives) ? chronicle.messageArchives : [];
      await writeTextFile(
        archiveFolder,
        'index.txt',
        archives.length
          ? archives
              .map(
                (archive, index) => `${index + 1}. ${archive.title || `Archive ${index + 1}`} | ${formatArchiveDateRange(archive.startedAt, archive.endedAt)} | ${archive.messageCount} messages`,
              )
              .join('\n')
          : 'No archived chat blocks yet.',
      );

      for (let index = 0; index < archives.length; index += 1) {
        const archive = archives[index];
        const baseName = `${String(index + 1).padStart(3, '0')}-${safeSegment(archive.title || `archive-${index + 1}`)}`;
        await writeTextFile(archiveFolder, `${baseName}.txt`, archive.text || 'No archive transcript stored.');
        await writeTextFile(
          archiveFolder,
          `${baseName}.summary.txt`,
          archive.summary || 'Summary unavailable for this archive.',
        );
      }

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

    if (isStorytellerRequestPending(getActiveChronicle())) {
      setStatus('The Storyteller is already responding. Stop the current request before sending another.', true);
      return;
    }

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
      runtime.retryableStorytellerRequest = null;
      ui.messageInput.value = '';
      syncComposerHeight();
    }
  }

  async function onRetryStorytellerResponse() {
    const chronicle = getActiveChronicle();
    const retryRequest = getRetryableStorytellerRequest(chronicle);
    if (!retryRequest) {
      setStatus('There is no retryable Storyteller response for this chronicle.', true);
      return;
    }

    runtime.retryableStorytellerRequest = null;
    await requestStorytellerTurn(chronicle, {
      ...retryRequest,
      pendingStatus: 'Retrying the Storyteller response.',
      reuseTrailingUserMessage: Boolean(retryRequest.appendUserMessage),
      replaceLastAssistant: true,
    });
  }

  function onStopStorytellerRequest() {
    if (!runtime.storytellerAbortController) {
      return;
    }

    runtime.storytellerAbortController.abort();
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

  function didPlayerAskForOptions(userMessage) {
    if (typeof userMessage !== 'string') {
      return false;
    }
    return /\b(options?|possible next moves|suggest(?:ions?|ed)?|what can i do|what should i do|choices?|menu)\b/i.test(userMessage);
  }

  function stripVtmStateBlock(content) {
    return String(content || '').replace(/```vtm_state\s*[\s\S]*?```/gi, '').trim();
  }

  function detectStorytellerFormatViolations(content, userMessage) {
    const text = stripVtmStateBlock(content);
    const violations = [];
    const askedForOptions = didPlayerAskForOptions(userMessage);
    const bulletLineCount = text.split('\n').filter((line) => /^\s*(?:[-*]|\d+\.)\s+/.test(line)).length;

    if (/possible next moves/i.test(text)) {
      violations.push('Contains forbidden phrase "Possible next moves".');
    }

    if (!askedForOptions && /(^|\n)\s*(?:\*\*|<strong>)?\s*Immediate pressure\s*:?\s*(?:\*\*|<\/strong>)?/i.test(text)) {
      violations.push('Uses Immediate pressure heading while options were not requested.');
    }

    if (!askedForOptions && bulletLineCount >= 3 && /(what do you do\?|you may now|you can choose|available actions?|choices?)/i.test(text)) {
      violations.push('Contains menu-style action list while options were not requested.');
    }

    return violations;
  }

  async function requestCorrectedStorytellerResponse({ systemPrompt, history, userMessage, model, rejectedContent, violations }) {
    const correctionHistory = [...history];
    if (correctionHistory.at(-1)?.role !== 'user' || correctionHistory.at(-1)?.content !== userMessage) {
      correctionHistory.push({ role: 'user', content: userMessage });
    }
    correctionHistory.push({ role: 'assistant', content: rejectedContent });

    const correctionMessage = [
      'Rewrite your previous reply so it fully complies with formatting and agency rules.',
      'Keep the same scene facts and timeline. Do not retcon outcomes unless the prior text was invalid.',
      'Do not output "Possible next moves".',
      'Do not output an "Immediate pressure" heading or any action menu unless the player explicitly asked for options.',
      'Keep pressure in prose and end with a plain response prompt only if needed.',
      `Fix these violations: ${violations.join(' ')}`,
      'Return only the corrected final reply.',
    ].join('\n');

    return sendChatCompletion({
      apiKey: state.apiKey,
      model,
      systemPrompt,
      history: correctionHistory,
      userMessage: correctionMessage,
    });
  }

  async function enforceStorytellerCompliance({ systemPrompt, history, userMessage, initialResult }) {
    let resolvedResult = initialResult;
    let attempts = 0;

    while (attempts < OUTPUT_COMPLIANCE_RETRY_LIMIT) {
      const violations = detectStorytellerFormatViolations(resolvedResult.content, userMessage);
      if (!violations.length) {
        return resolvedResult;
      }

      attempts += 1;
      setStatus('Storyteller response violated formatting guardrails. Requesting an automatic correction pass.');
      resolvedResult = await requestCorrectedStorytellerResponse({
        systemPrompt,
        history,
        userMessage,
        model: resolvedResult.model || state.model || DEFAULT_MODEL,
        rejectedContent: resolvedResult.content,
        violations,
      });
    }

    const remainingViolations = detectStorytellerFormatViolations(resolvedResult.content, userMessage);
    if (remainingViolations.length) {
      throw new Error('Storyteller response failed format guardrails after automatic retry. Please regenerate or switch to another model.');
    }

    return resolvedResult;
  }

  function buildStorytellerHistory(chronicle, { appendUserMessage, reuseTrailingUserMessage = false, policyReduced = false } = {}) {
    const baseHistory = appendUserMessage || reuseTrailingUserMessage ? chronicle.messages.slice(0, -1) : chronicle.messages;
    let recent = baseHistory.slice(-8);

    if (!policyReduced) {
      return recent;
    }

    // If a previous narrator turn tripped moderation, retry without the latest Storyteller turn and with fewer lines.
    const reduced = [...recent];
    for (let index = reduced.length - 1; index >= 0; index -= 1) {
      if (isStorytellerMessage(reduced[index])) {
        reduced.splice(index, 1);
        break;
      }
    }

    return reduced.slice(-6);
  }

  async function requestArchiveSummary(chronicle, archiveRecord) {
    const transcript = String(archiveRecord?.text || '').trim();
    if (!transcript) {
      return 'Summary unavailable: archive transcript was empty.';
    }

    if (!state.apiKey) {
      return 'Summary unavailable: API key is not configured.';
    }

    const primaryModel = state.model || DEFAULT_MODEL;
    const modelChain = isKnownStoryModel(primaryModel)
      ? [primaryModel, ...getFallbackModelChain(primaryModel)]
      : [primaryModel];

    const systemPrompt = [
      'You are a Vampire: The Masquerade chronicle archivist.',
      'Summarize archived chat for continuity recall.',
      'Return plain text only with exactly four lines:',
      'Scene Arc: ...',
      'Major Revelations: ...',
      'Unresolved Threads: ...',
      'Current Pressure: ...',
      'Do not include markdown, bullets, or extra headings.',
    ].join('\n');

    const userMessage = [
      `Chronicle: ${chronicle.title}`,
      `Archive window: ${formatArchiveDateRange(archiveRecord.startedAt, archiveRecord.endedAt)}`,
      `Archived message count: ${archiveRecord.messageCount}`,
      '',
      'Archive transcript:',
      transcript,
    ].join('\n');

    for (const model of modelChain) {
      try {
        const result = await sendChatCompletion({
          apiKey: state.apiKey,
          model,
          systemPrompt,
          history: [],
          userMessage,
          temperature: 0.2,
          maxTokens: 260,
        });

        return String(result.content || '').trim() || 'Summary unavailable: model returned empty output.';
      } catch (error) {
        if (!error?.isRateLimit && !error?.isPolicyViolation) {
          return `Summary unavailable: ${error.message}`;
        }
      }
    }

    return 'Summary unavailable: all configured models rejected the archive summary request.';
  }

  async function compactChronicleMessagesIfNeeded(chronicle) {
    if (!Array.isArray(chronicle.messages) || !chronicle.messages.length) {
      return false;
    }

    const latestStorytellerIndex = (() => {
      for (let index = chronicle.messages.length - 1; index >= 0; index -= 1) {
        if (isStorytellerMessage(chronicle.messages[index])) {
          return index;
        }
      }
      return -1;
    })();

    if (latestStorytellerIndex < 0) {
      return false;
    }

    const eligibleIndices = [];
    for (let index = 0; index < chronicle.messages.length; index += 1) {
      if (index === latestStorytellerIndex) {
        continue;
      }
      if (isArchiveEligibleMessage(chronicle.messages[index])) {
        eligibleIndices.push(index);
      }
    }

    if (eligibleIndices.length < ARCHIVE_MESSAGE_BATCH_SIZE) {
      return false;
    }

    const archivedIndices = eligibleIndices.slice(0, ARCHIVE_MESSAGE_BATCH_SIZE);
    const archivedMessages = archivedIndices.map((index) => chronicle.messages[index]);
    const startedAt = archivedMessages[0]?.timestamp || '';
    const endedAt = archivedMessages[archivedMessages.length - 1]?.timestamp || '';
    const archiveText = formatArchiveTranscript(archivedMessages);
    const archiveIndex = (Array.isArray(chronicle.messageArchives) ? chronicle.messageArchives.length : 0) + 1;

    const archiveRecord = {
      id: uid('archive'),
      createdAt: new Date().toISOString(),
      startedAt,
      endedAt,
      messageCount: archivedMessages.length,
      summary: '',
      text: archiveText,
      title: buildArchiveTitle(chronicle, archiveIndex),
      originalMessageIds: archivedMessages.map((message) => message?.id).filter(Boolean),
    };

    archiveRecord.summary = await requestArchiveSummary(chronicle, archiveRecord);

    const archiveIndexSet = new Set(archivedIndices);
    chronicle.messages = chronicle.messages.filter((_, index) => !archiveIndexSet.has(index));
    chronicle.messageArchives = Array.isArray(chronicle.messageArchives) ? chronicle.messageArchives : [];
    chronicle.messageArchives.push(archiveRecord);

    return true;
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
      renderChat(chronicle.messages, chronicle);
    }

    runtime.retryableStorytellerRequest = null;
    runtime.storytellerPending = true;
    runtime.pendingChronicleId = chronicle.id;
    runtime.storytellerAbortController = new AbortController();
    setStatus(pendingStatus);
    renderComposerState(chronicle);
    renderChat(chronicle.messages, chronicle);
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
      const history = buildStorytellerHistory(chronicle, { appendUserMessage, reuseTrailingUserMessage });
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
        signal: runtime.storytellerAbortController.signal,
      });
      let resolvedResult = result;

      if (!resolvedResult?.model) {
        resolvedResult = {
          ...result,
          model: selectedModel,
        };
      }

      resolvedResult = await enforceStorytellerCompliance({
        systemPrompt,
        history,
        userMessage,
        initialResult: resolvedResult,
      });

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

      await compactChronicleMessagesIfNeeded(chronicle);

      if (openingScene) {
        chronicle.openingSceneDelivered = true;
      }

      const responseStatus = `Response received from ${resolvedResult.model}.`;

      persist();
      render();
      await syncArchiveFiles(chronicle, false);
      setStatus(responseStatus, responseStatus.includes('warning'));
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus('Storyteller response canceled.');
        return false;
      }

      if (error?.isRateLimit) {
        registerModelRateLimit(selectedModel);
        const fallbackResult = await tryRateLimitFallback({ chronicle, userMessage, appendUserMessage, reuseTrailingUserMessage, sourceModel: selectedModel });
        if (fallbackResult) {
          return finalizeFallbackResponse(chronicle, fallbackResult, replaceIntroMessage, openingScene, replaceLastAssistant);
        }
        error.message = getRateLimitStatusMessage(selectedModel, getFallbackModelChain(selectedModel));
      } else if (error?.isPolicyViolation) {
        const fallbackResult = await tryRateLimitFallback({
          chronicle,
          userMessage,
          appendUserMessage,
          reuseTrailingUserMessage,
          sourceModel: selectedModel,
          reason: 'policy',
          policyReduced: true,
        });
        if (fallbackResult) {
          return finalizeFallbackResponse(chronicle, fallbackResult, replaceIntroMessage, openingScene, replaceLastAssistant);
        }
      }

      if (error?.message === 'OpenRouter returned no assistant content.') {
        runtime.retryableStorytellerRequest = {
          chronicleId: chronicle.id,
          userMessage,
          appendUserMessage: Boolean(appendUserMessage),
          replaceIntroMessage: Boolean(replaceIntroMessage),
          openingScene: Boolean(openingScene),
        };
      } else if (runtime.retryableStorytellerRequest?.chronicleId === chronicle.id) {
        runtime.retryableStorytellerRequest = null;
      }

      debugLog('Storyteller request failed', { chronicleId: chronicle.id, message: error.message, openingScene });
      chronicle.messages.push({
        id: uid('msg'),
        role: 'assistant',
        kind: 'error',
        content: `Storyteller connection error: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
      persist();
      renderChat(chronicle.messages, chronicle);
      setStatus(error.message, true);
      return false;
    } finally {
      runtime.storytellerPending = false;
      runtime.pendingChronicleId = null;
      runtime.storytellerAbortController = null;
      renderComposerState(chronicle);
      if (state.activeView === 'play' && state.activeChronicleId === chronicle.id) {
        renderChat(chronicle.messages, chronicle);
      }
    }
  }

  async function tryRateLimitFallback({ chronicle, userMessage, appendUserMessage, reuseTrailingUserMessage = false, sourceModel, reason = 'rate-limit', policyReduced = false }) {
    const currentModel = sourceModel || state.model || DEFAULT_MODEL;
    const fallbackModels = isKnownStoryModel(currentModel) ? getFallbackModelChain(currentModel) : [];
    if (!fallbackModels.length) {
      return null;
    }

    const city = getChronicleCity(chronicle);
    const selectedHooks = getChronicleHookSummaries(chronicle.cityId, chronicle.plotHookIds);
    const pack = getChroniclePack(chronicle.cityId);
    const history = buildStorytellerHistory(chronicle, { appendUserMessage, reuseTrailingUserMessage, policyReduced });
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
        const fallbackStatus = reason === 'policy'
          ? `Primary model rejected content by policy. Retrying with ${fallbackModel} using reduced history.`
          : `Primary model was rate-limited. Retrying with ${fallbackModel}.`;
        setStatus(fallbackStatus);
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
          retryContext: {
            systemPrompt,
            history,
            userMessage,
          },
        };
      } catch (fallbackError) {
        if (fallbackError?.isRateLimit) {
          registerModelRateLimit(fallbackModel);
        }
        if (reason === 'policy' && fallbackError?.isPolicyViolation) {
          continue;
        }
        if (!fallbackError?.isRateLimit) {
          throw fallbackError;
        }
      }
    }

    return null;
  }

  async function finalizeFallbackResponse(chronicle, result, replaceIntroMessage, openingScene, replaceLastAssistant = false) {
    let resolvedResult = result;
    if (result.retryContext) {
      resolvedResult = await enforceStorytellerCompliance({
        systemPrompt: result.retryContext.systemPrompt,
        history: result.retryContext.history,
        userMessage: result.retryContext.userMessage,
        initialResult: {
          ...result,
          model: result.model || DEFAULT_MODEL,
        },
      });
      resolvedResult = {
        ...result,
        ...resolvedResult,
      };
    }

    const parsed = parseAssistantStatePayload(resolvedResult.content);
    applyStructuredUpdates(chronicle, parsed.updates);
    debugLog('Received storyteller response via fallback model', {
      chronicleId: chronicle.id,
      model: resolvedResult.model,
      fallbackFrom: resolvedResult.fallbackFrom,
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

    await compactChronicleMessagesIfNeeded(chronicle);

    if (openingScene) {
      chronicle.openingSceneDelivered = true;
    }

    const responseStatus = `Primary model hit a rate limit. Response delivered by fallback model ${resolvedResult.model}.`;

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
        category: EQUIPMENT_CATEGORIES.includes(item.category) ? item.category : EQUIPMENT_CATEGORIES[0],
        name: item.name || 'Equipment',
        details: item.details || '',
      }));
      markCharacterSummaryDirty(chronicle);
    }

    if (Array.isArray(updates.disciplines)) {
      const existingByName = new Map(
        (chronicle.character.disciplines || [])
          .filter((item) => item?.name)
          .map((item) => [String(item.name).toLowerCase(), item]),
      );
      chronicle.character.disciplines = updates.disciplines.map((item) => {
        const existing = existingByName.get(String(item?.name || '').toLowerCase());
        const incomingRituals = Array.isArray(item?.rituals)
          ? item.rituals
              .map((ritual) => ({ id: uid('ritual'), name: String(ritual?.name || '').trim() }))
              .filter((ritual) => ritual.name)
              .slice(0, RITUAL_MAX_PER_DISCIPLINE)
          : null;
        const fallbackRituals = Array.isArray(existing?.rituals)
          ? existing.rituals
              .map((ritual) => ({ id: uid('ritual'), name: String(ritual?.name || '').trim() }))
              .filter((ritual) => ritual.name)
              .slice(0, RITUAL_MAX_PER_DISCIPLINE)
          : [];
        const next = {
          id: uid('discipline'),
          name: item?.name || disciplinesData[0]?.name || 'Discipline',
          dots: Math.max(1, Math.min(5, Number(item?.dots) || 1)),
          primaryPath: typeof item?.primaryPath === 'string' ? item.primaryPath : existing?.primaryPath || '',
          secondaryPath: typeof item?.secondaryPath === 'string' ? item.secondaryPath : existing?.secondaryPath || '',
          tertiaryPath: typeof item?.tertiaryPath === 'string' ? item.tertiaryPath : existing?.tertiaryPath || '',
          secondaryPathDots: Number.isFinite(Number(item?.secondaryPathDots)) ? Number(item.secondaryPathDots) : Number(existing?.secondaryPathDots) || 0,
          tertiaryPathDots: Number.isFinite(Number(item?.tertiaryPathDots)) ? Number(item.tertiaryPathDots) : Number(existing?.tertiaryPathDots) || 0,
          rituals: incomingRituals ?? fallbackRituals,
        };
        ensureDisciplinePathState(next);
        return next;
      });
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
    runtime.referenceDetail = null;
    runtime.referenceReturnPanel = null;
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
      downtimeActivity: {
        type: '',
        status: 'idle',
        completed: false,
        progressSuccesses: 0,
        targetSuccesses: 0,
      },
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
  chronicle.progression.downtimeActivity = {
    type: typeof chronicle.progression.downtimeActivity?.type === 'string' ? chronicle.progression.downtimeActivity.type : '',
    status: typeof chronicle.progression.downtimeActivity?.status === 'string' ? chronicle.progression.downtimeActivity.status : 'idle',
    completed: Boolean(chronicle.progression.downtimeActivity?.completed),
    progressSuccesses: Math.max(0, Number(chronicle.progression.downtimeActivity?.progressSuccesses) || 0),
    targetSuccesses: Math.max(0, Number(chronicle.progression.downtimeActivity?.targetSuccesses) || 0),
    rollPool: typeof chronicle.progression.downtimeActivity?.rollPool === 'string' ? chronicle.progression.downtimeActivity.rollPool : '',
    rollDifficulty: Math.max(2, Math.min(10, Number(chronicle.progression.downtimeActivity?.rollDifficulty) || 6)),
  };
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
  progression.downtimeActivity = {
    type: '',
    status: 'idle',
    completed: false,
    progressSuccesses: 0,
    targetSuccesses: 0,
    rollPool: '',
    rollDifficulty: 6,
  };
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
    progression.downtimeActivity = {
      type: '',
      status: 'idle',
      completed: false,
      progressSuccesses: 0,
      targetSuccesses: 0,
      rollPool: '',
      rollDifficulty: 6,
    };
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

  if (downtimeUpdate.activity && typeof downtimeUpdate.activity === 'object') {
    const progression = ensureChronicleProgressionState(chronicle);
    const current = progression.downtimeActivity || {};
    progression.downtimeActivity = {
      ...current,
      type: typeof downtimeUpdate.activity.type === 'string' ? downtimeUpdate.activity.type : current.type,
      status: typeof downtimeUpdate.activity.status === 'string' ? downtimeUpdate.activity.status : current.status,
      completed: typeof downtimeUpdate.activity.completed === 'boolean' ? downtimeUpdate.activity.completed : current.completed,
      progressSuccesses: Number.isFinite(Number(downtimeUpdate.activity.progressSuccesses))
        ? Math.max(0, Number(downtimeUpdate.activity.progressSuccesses))
        : current.progressSuccesses,
      targetSuccesses: Number.isFinite(Number(downtimeUpdate.activity.targetSuccesses))
        ? Math.max(0, Number(downtimeUpdate.activity.targetSuccesses))
        : current.targetSuccesses,
      rollPool: typeof downtimeUpdate.activity.rollPool === 'string' ? downtimeUpdate.activity.rollPool : current.rollPool,
      rollDifficulty: Number.isFinite(Number(downtimeUpdate.activity.rollDifficulty))
        ? parseDifficultyValue(downtimeUpdate.activity.rollDifficulty, current.rollDifficulty || 6)
        : current.rollDifficulty,
    };
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

  character.disciplines = clanDisciplines.map((name) => {
    const entry = {
      id: uid('discipline'),
      name,
      dots: 1,
      rituals: [],
    };
    ensureDisciplinePathState(entry);
    return entry;
  });
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

function parseCreationAssistantPayload(content) {
  const text = String(content || '').trim();
  const match = text.match(/```vtm_creation\s*([\s\S]*?)```/i);
  if (!match) {
    return {
      backstory: text,
      recommendation: null,
    };
  }

  try {
    return {
      backstory: text.replace(match[0], '').trim(),
      recommendation: JSON.parse(match[1]),
    };
  } catch {
    return {
      backstory: text.replace(match[0], '').trim(),
      recommendation: null,
    };
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

function getMessageKind(message) {
  if (typeof message?.kind === 'string' && message.kind.trim()) {
    return message.kind;
  }

  if (message?.role === 'user') {
    return 'player';
  }

  if (message?.role === 'assistant' && /^Storyteller connection error:/i.test(String(message?.content || ''))) {
    return 'error';
  }

  if (message?.role === 'assistant') {
    return 'storyteller';
  }

  return 'system';
}

function isStorytellerMessage(message) {
  return getMessageKind(message) === 'storyteller';
}

function isArchiveEligibleMessage(message) {
  const kind = getMessageKind(message);
  return kind === 'player' || kind === 'storyteller';
}

function formatArchiveTranscript(messages) {
  return messages
    .map((message, index) => {
      const speaker = isStorytellerMessage(message) ? 'Storyteller' : 'Player';
      const timestamp = typeof message?.timestamp === 'string' && message.timestamp ? message.timestamp : 'Unknown time';
      return [
        `[${index + 1}] ${speaker} | ${timestamp}`,
        String(message?.content || '').trim() || '(No content)',
      ].join('\n');
    })
    .join('\n\n---\n\n');
}

function formatArchiveDateRange(startedAt, endedAt) {
  const parts = [startedAt, endedAt].filter(Boolean).map((value) => formatTimestamp(value));
  return parts.length ? parts.join(' -> ') : 'Unknown range';
}

function buildArchiveTitle(chronicle, archiveIndex) {
  const chronicleTitle = chronicle?.title?.trim() || 'Chronicle';
  return `${chronicleTitle} Archive ${archiveIndex}`;
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

function applyInlineMessageFormatting(value) {
  const withBold = value.replace(/\*\*([^*][\s\S]*?)\*\*/g, '<strong>$1</strong>');
  return withBold.replace(/(^|[^*])\*([^\s*][^*]*?[^\s*]|[^\s*])\*(?!\*)/g, '$1<em>$2</em>');
}

function formatMessageContent(value, { enableInteractiveRolls = false } = {}) {
  const text = String(value ?? '');
  const directives = enableInteractiveRolls ? parseMechanicsRollDirectives(text) : [];
  const directivesByLine = new Map(directives.map((directive) => [directive.lineIndex, directive]));

  const renderedLines = text.split('\n').map((line, index) => {
    const escaped = escapeHtml(line);
    const formatted = applyInlineMessageFormatting(escaped);
    const directive = directivesByLine.get(index);
    if (!directive) {
      return formatted;
    }

    const label = directive.traitLabels.join(' + ');
    const traitsValue = directive.traitIds.join('+');
    const pathData = directive.path ? ` data-roll-path="${escapeHtml(directive.path)}"` : '';
    const resistanceTraitsValue = directive.resistanceTraitIds?.join('+') || '';
    const resistanceData = directive.resistanceTraitIds
      ? ` data-roll-resistance-traits="${escapeHtml(resistanceTraitsValue)}" data-roll-resistance-difficulty="${directive.resistanceDifficulty}"`
      : '';
    const pathLabel = directive.path ? `; Path ${directive.path}` : '';
    const resistanceLabel = directive.resistanceTraitLabels?.length
      ? `; Resist ${directive.resistanceTraitLabels.join(' + ')} Diff ${directive.resistanceDifficulty}`
      : '';
    return `${formatted}<br /><span class="inline-roll-actions"><button class="inline-roll-trigger" type="button" data-action="roll-from-prompt" data-roll-traits="${escapeHtml(traitsValue)}" data-roll-difficulty="${directive.difficulty}"${pathData}${resistanceData} aria-label="Roll ${escapeHtml(label)} at difficulty ${directive.difficulty}">[roll]</button> <button class="inline-roll-trigger" type="button" data-action="roll-with-willpower-from-prompt" data-roll-traits="${escapeHtml(traitsValue)}" data-roll-difficulty="${directive.difficulty}"${pathData}${resistanceData} aria-label="Spend willpower and roll ${escapeHtml(label)} at difficulty ${directive.difficulty}">[willpower]</button> <span class="meta-text">(${escapeHtml(label)}, Diff ${directive.difficulty}${escapeHtml(pathLabel)}${escapeHtml(resistanceLabel)})</span></span>`;
  });

  return renderedLines.join('<br />');
}
