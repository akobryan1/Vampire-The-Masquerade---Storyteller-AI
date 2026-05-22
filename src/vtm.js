const STORAGE_KEY = 'vtm-storyteller-state';

export const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash:free';
export const DIFFICULTY_LEVELS = [
  {
    id: 'merciful',
    label: 'Merciful',
    prompt: 'NPCs start more agreeable, consequences bend toward survival, and setbacks should leave room for recovery.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    prompt: 'NPCs react according to motive and status, and failures should create pressure without arbitrary cruelty.',
  },
  {
    id: 'unforgiving',
    label: 'Unforgiving',
    prompt: 'NPCs are suspicious, mistakes compound quickly, and consequences should be sharp unless the player earns relief.',
  },
];

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getDefaultCampaignMemory() {
  return {
    establishedFacts: '',
    unresolvedThreads: '',
    factionPositions: '',
    boonsAndDebts: '',
    relationshipShifts: '',
    timeline: '',
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

function getDefaultCloudCache() {
  return {
    configured: false,
    ready: false,
    user: null,
    bank: null,
    error: '',
  };
}

function getDefaultProgressionState() {
  return {
    phase: 'scene',
    sessionNumber: 1,
    downtimeReason: '',
    rewardCaps: {
      desireGranted: false,
      ambitionGranted: false,
    },
  };
}

function getDefaultPromptSyncState() {
  return {
    forceFullSheetRefresh: true,
    turnsSinceFullSheet: 0,
  };
}

export function getDefaultCharacter(schema) {
  const attributes = {};
  const abilities = {};

  for (const group of schema.attributes) {
    for (const field of group.fields) {
      attributes[field.id] = 1;
    }
  }

  for (const group of schema.abilities) {
    for (const field of group.fields) {
      abilities[field.id] = 0;
    }
  }

  return {
    created: false,
    name: '',
    concept: '',
    clan: 'Caitiff',
    path: 'Humanity',
    sire: '',
    chronicle: '',
    nature: 'Architect',
    demeanor: 'Director',
    generation: 13,
    age: 28,
    ageCategory: 'Neonate',
    pronouns: '',
    ambition: '',
    desire: '',
    physicalDescription: '',
    backstory: '',
    attributes,
    abilities,
    disciplines: [
      { id: uid('discipline'), name: 'Celerity', dots: 1 },
      { id: uid('discipline'), name: 'Obfuscate', dots: 1 },
      { id: uid('discipline'), name: 'Auspex', dots: 1 },
    ],
    additionalClanDisciplines: [],
    backgrounds: [
      { id: uid('background'), name: 'Contacts', dots: 1 },
      { id: uid('background'), name: 'Resources', dots: 1 },
      { id: uid('background'), name: 'Allies', dots: 1 },
      { id: uid('background'), name: 'Herd', dots: 1 },
      { id: uid('background'), name: 'Status', dots: 1 },
    ],
    merits: [],
    flaws: [],
    clanMerits: [],
    clanFlaws: [],
    specialties: [
      { id: uid('specialty'), ability: 'streetwise', name: 'Street rumors' },
    ],
    equipment: [],
    items: [],
    virtues: {
      conscience: 3,
      selfControl: 3,
      courage: 3,
    },
    humanity: 6,
    willpower: 3,
    currentWillpower: 3,
    bloodPool: 10,
    currentBloodPool: 10,
    currentResources: 1,
    health: ['Healthy', 'Bruised', 'Hurt', 'Injured', 'Wounded', 'Mauled', 'Crippled', 'Incapacitated'],
    currentHealthLevel: 0,
    notes: '',
    creation: getDefaultCreationState(),
    experience: {
      unspent: 0,
      spent: 0,
      log: [],
    },
  };
}

export function getDefaultChronicle(schema, cities, hooks) {
  const defaultCity = cities[0];
  const randomHook = hooks.length ? hooks[Math.floor(Math.random() * hooks.length)] : null;
  return {
    id: uid('chronicle'),
    title: defaultCity ? `${defaultCity.name} Nights` : 'New Chronicle',
    cityId: defaultCity?.id ?? '',
    customCityName: '',
    storytellerBrief: '',
    year: 2025,
    difficulty: 'balanced',
    setupComplete: false,
    openingSceneDelivered: false,
    promptSync: getDefaultPromptSyncState(),
    progression: getDefaultProgressionState(),
    summary: '',
    campaignMemory: getDefaultCampaignMemory(),
    notes: '',
    plotPoints: '',
    plotHookIds: randomHook ? [randomHook.id] : [],
    temporaryEffects: [],
    messages: [
      {
        id: uid('msg'),
        role: 'assistant',
        content:
          'The night is waiting. Choose the chronicle foundation first, then build the vampire who must survive it.',
        timestamp: new Date().toISOString(),
      },
    ],
    diceLog: [],
    npcs: [],
    character: getDefaultCharacter(schema),
  };
}

function normalizeList(items, prefix, factory) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => ({
    ...factory(index),
    ...item,
    id: item?.id || uid(prefix),
  }));
}

function getBackgroundDotsByName(backgrounds, backgroundName) {
  return (Array.isArray(backgrounds) ? backgrounds : [])
    .filter((item) => item?.name === backgroundName)
    .reduce((sum, item) => sum + Math.max(0, Number(item?.dots) || 0), 0);
}

function hydrateCharacter(schema, rawCharacter) {
  const defaults = getDefaultCharacter(schema);
  const character = rawCharacter ?? {};
  const maxWillpower = Math.max(0, Number(character.willpower ?? defaults.willpower) || 0);
  const rawCurrentWillpower = character.currentWillpower ?? maxWillpower;
  const normalizedBackgrounds = normalizeList(character.backgrounds ?? defaults.backgrounds, 'background', () => ({
    name: 'Contacts',
    dots: 1,
  }));
  const maxResources = getBackgroundDotsByName(normalizedBackgrounds, 'Resources');
  const maxBloodPool = Math.max(0, Number(character.bloodPool ?? defaults.bloodPool) || 0);
  const rawCurrentBloodPool = character.currentBloodPool ?? maxBloodPool;
  const rawCurrentResources = character.currentResources ?? maxResources;
  const healthTrack = Array.isArray(character.health) && character.health.length ? character.health : defaults.health;
  const rawHealthLevel = Number(character.currentHealthLevel) || 0;

  return {
    ...defaults,
    ...character,
    created: Boolean(character.created),
    creation: {
      ...defaults.creation,
      ...(character.creation ?? {}),
    },
    attributes: {
      ...defaults.attributes,
      ...(character.attributes ?? {}),
    },
    abilities: {
      ...defaults.abilities,
      ...(character.abilities ?? {}),
    },
    disciplines: normalizeList(character.disciplines ?? defaults.disciplines, 'discipline', () => ({
      name: 'Celerity',
      dots: 1,
    })),
    additionalClanDisciplines: Array.isArray(character.additionalClanDisciplines)
      ? [...new Set(character.additionalClanDisciplines.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()))]
      : defaults.additionalClanDisciplines,
    backgrounds: normalizedBackgrounds,
    specialties: normalizeList(character.specialties ?? defaults.specialties, 'specialty', () => ({
      ability: 'streetwise',
      name: 'Street rumors',
    })),
    merits: normalizeList(character.merits, 'merit', () => ({
      name: 'Unlisted merit',
      points: 1,
      details: '',
    })),
    flaws: normalizeList(character.flaws, 'flaw', () => ({
      name: 'Unlisted flaw',
      points: 1,
      details: '',
    })),
    clanMerits: normalizeList(character.clanMerits, 'clan-merit', () => ({
      name: 'Unlisted clan merit',
      points: 1,
      details: '',
    })),
    clanFlaws: normalizeList(character.clanFlaws, 'clan-flaw', () => ({
      name: 'Unlisted clan flaw',
      points: 1,
      details: '',
    })),
    equipment: normalizeList(character.equipment, 'equipment', () => ({
      name: 'Unlisted item',
      details: '',
    })),
    items: normalizeList(character.items, 'item', () => ({
      name: 'Unlisted item',
      details: '',
    })),
    virtues: {
      ...defaults.virtues,
      ...(character.virtues ?? {}),
    },
    health: healthTrack,
    experience: {
      ...defaults.experience,
      ...(character.experience ?? {}),
      log: Array.isArray(character.experience?.log) ? character.experience.log : defaults.experience.log,
    },
    currentWillpower: Math.max(0, Math.min(maxWillpower, Number(rawCurrentWillpower) || 0)),
    currentBloodPool: Math.max(0, Math.min(maxBloodPool, Number(rawCurrentBloodPool) || 0)),
    currentResources: Math.max(0, Math.min(maxResources, Number(rawCurrentResources) || 0)),
    currentHealthLevel: Math.max(0, Math.min(healthTrack.length - 1, rawHealthLevel)),
  };
}

function hydrateChronicle(schema, cities, hooks, rawChronicle) {
  const defaults = getDefaultChronicle(schema, cities, hooks);
  const chronicle = rawChronicle ?? {};
  const character = hydrateCharacter(schema, chronicle.character);

  return {
    ...defaults,
    ...chronicle,
    customCityName: chronicle.customCityName || '',
    storytellerBrief: chronicle.storytellerBrief || '',
    year: Number(chronicle.year) || defaults.year,
    difficulty: chronicle.difficulty || defaults.difficulty,
    promptSync: {
      ...defaults.promptSync,
      ...(chronicle.promptSync ?? {}),
    },
    progression: {
      ...defaults.progression,
      ...(chronicle.progression ?? {}),
      rewardCaps: {
        ...defaults.progression.rewardCaps,
        ...(chronicle.progression?.rewardCaps ?? {}),
      },
    },
    summary: chronicle.summary || '',
    campaignMemory: {
      ...defaults.campaignMemory,
      ...(chronicle.campaignMemory ?? {}),
    },
    setupComplete: chronicle.setupComplete ?? Boolean(chronicle.cityId && chronicle.character?.created),
    openingSceneDelivered:
      typeof chronicle.openingSceneDelivered === 'boolean'
        ? chronicle.openingSceneDelivered
        : Array.isArray(chronicle.messages)
          ? chronicle.messages.some(
              (message) => message.role === 'assistant' && !message.content.includes('Choose the chronicle foundation first'),
            )
          : defaults.openingSceneDelivered,
    plotHookIds: Array.isArray(chronicle.plotHookIds) && chronicle.plotHookIds.length ? chronicle.plotHookIds : defaults.plotHookIds,
    messages: Array.isArray(chronicle.messages) && chronicle.messages.length ? chronicle.messages : defaults.messages,
    diceLog: Array.isArray(chronicle.diceLog) ? chronicle.diceLog : defaults.diceLog,
    npcs: normalizeList(chronicle.npcs, 'npc', () => ({
      name: 'Unnamed NPC',
      clan: '',
      ageCategory: '',
      role: '',
      summary: '',
      status: '',
      ambition: '',
      desire: '',
      notes: '',
      secrets: '',
    })),
    temporaryEffects: normalizeList(chronicle.temporaryEffects, 'temporary-effect', () => ({
      name: 'Temporary effect',
      details: '',
    })),
    character,
  };
}

export function loadState(schema, cities, hooks) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        apiKey: '',
        model: DEFAULT_MODEL,
        customModelCostUnits: null,
        chronicles: [],
        activeChronicleId: null,
        activePanel: null,
        activeView: 'creation',
        cloudCache: getDefaultCloudCache(),
      };
    }

    const parsed = JSON.parse(raw);
    const chronicles = Array.isArray(parsed.chronicles)
      ? parsed.chronicles.map((chronicle) => hydrateChronicle(schema, cities, hooks, chronicle))
      : [];

    return {
      apiKey: parsed.apiKey ?? '',
      model: parsed.model || DEFAULT_MODEL,
      customModelCostUnits: Number.isFinite(Number(parsed.customModelCostUnits)) ? Number(parsed.customModelCostUnits) : null,
      chronicles,
      activeChronicleId: parsed.activeChronicleId ?? chronicles[0]?.id ?? null,
      activePanel: ['notes', 'sheet', 'npcs', 'xp'].includes(parsed.activePanel) ? parsed.activePanel : null,
      activeView: ['creation', 'settings', 'play'].includes(parsed.activeView) ? parsed.activeView : 'creation',
      cloudCache: {
        ...getDefaultCloudCache(),
        ...(parsed.cloudCache ?? {}),
      },
    };
  } catch {
    return {
      apiKey: '',
      model: DEFAULT_MODEL,
      customModelCostUnits: null,
      chronicles: [],
      activeChronicleId: null,
      activePanel: null,
      activeView: 'creation',
      cloudCache: getDefaultCloudCache(),
    };
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function ensureActiveChronicle(state) {
  const active = state.chronicles.find((chronicle) => chronicle.id === state.activeChronicleId);
  if (active) {
    return active;
  }
  state.activeChronicleId = state.chronicles[0]?.id ?? null;
  return state.chronicles[0] ?? null;
}

export function getCityById(cities, id) {
  return cities.find((city) => city.id === id) ?? cities[0] ?? null;
}

export function getHookSummaries(hooks, ids) {
  return hooks.filter((hook) => ids.includes(hook.id));
}

export function summarizeCharacter(character) {
  const additionalClanDisciplines = Array.isArray(character.additionalClanDisciplines) && character.additionalClanDisciplines.length
    ? character.additionalClanDisciplines.join(', ')
    : 'None selected';
  const attributes = Object.entries(character.attributes)
    .map(([key, value]) => `${startCase(key)} ${value}`)
    .join(', ');
  const abilities = Object.entries(character.abilities)
    .filter(([, value]) => value > 0)
    .slice(0, 10)
    .map(([key, value]) => `${startCase(key)} ${value}`)
    .join(', ');
  const disciplines = character.disciplines.map((item) => `${item.name} ${item.dots}`).join(', ');
  const backgrounds = character.backgrounds.map((item) => `${item.name} ${item.dots}`).join(', ');
  const merits = character.merits.map((item) => `${item.name} (${item.points})`).join(', ');
  const flaws = character.flaws.map((item) => `${item.name} (${item.points})`).join(', ');
  const clanMerits = character.clanMerits.map((item) => `${item.name} (${item.points})`).join(', ');
  const clanFlaws = character.clanFlaws.map((item) => `${item.name} (${item.points})`).join(', ');
  const equipment = character.equipment.map((item) => item.name).join(', ');
  const items = character.items.map((item) => item.name).join(', ');

  return [
    `Name: ${character.name || 'Unnamed vampire'}`,
    `Clan: ${character.clan}`,
    `Morality: ${character.path || 'Humanity'}`,
    `Nature/Demeanor: ${character.nature} / ${character.demeanor}`,
    `Age as a Vampire: ${character.age}`,
    `Age Category: ${character.ageCategory || 'Unwritten'}`,
    `Generation: ${character.generation}`,
    `Concept: ${character.concept || 'Unwritten'}`,
    `Ambition: ${character.ambition || 'Unwritten'}`,
    `Desire: ${character.desire || 'Unwritten'}`,
    `Physical Description: ${character.physicalDescription || 'No physical description recorded.'}`,
    `Attributes: ${attributes}`,
    `Abilities: ${abilities || 'None yet assigned'}`,
    `Disciplines: ${disciplines || 'None assigned'}`,
    `Additional Discipline Merit Target: ${additionalClanDisciplines}`,
    `Backgrounds: ${backgrounds || 'None assigned'}`,
    `Merits: ${merits || 'None selected'}`,
    `Flaws: ${flaws || 'None selected'}`,
    `Clan Merits: ${clanMerits || 'None selected'}`,
    `Clan Flaws: ${clanFlaws || 'None selected'}`,
    `Equipment: ${equipment || 'No starting equipment listed'}`,
    `Items: ${items || 'No inventory listed'}`,
    `${character.path === 'Humanity' ? 'Humanity' : 'Path Rating'}: ${character.humanity}`,
    `Willpower: ${character.currentWillpower}/${character.willpower} current/max`,
    `Blood Pool: ${character.currentBloodPool}/${character.bloodPool} current/max`,
    `Health Status: ${character.health[character.currentHealthLevel] || 'Healthy'} (${character.currentHealthLevel}/${Math.max(0, character.health.length - 1)})`,
    `Temporary Resources: ${character.currentResources}/${getBackgroundDotsByName(character.backgrounds, 'Resources')} current/max`,
    `Backstory: ${character.backstory || 'No backstory written yet.'}`,
  ].join('\n');
}

export function summarizeCompactCharacter(character, temporaryEffects = []) {
  const disciplines = character.disciplines.map((item) => `${item.name} ${item.dots}`).join(', ');
  const keyBackgrounds = character.backgrounds
    .filter((item) => ['Resources', 'Retainers', 'Contacts', 'Allies', 'Status', 'Domain', 'Influence', 'Herd', 'Generation'].includes(item.name))
    .map((item) => `${item.name} ${item.dots}`)
    .join(', ');
  const activeEffects = Array.isArray(temporaryEffects) && temporaryEffects.length
    ? temporaryEffects.map((item) => `${item.name}: ${item.details}`).join('; ')
    : 'None recorded';

  return [
    `Name: ${character.name || 'Unnamed vampire'}`,
    `Clan: ${character.clan}`,
    `Nature/Demeanor: ${character.nature} / ${character.demeanor}`,
    `Age Category: ${character.ageCategory || 'Unwritten'}`,
    `Generation: ${character.generation}`,
    `Concept: ${character.concept || 'Unwritten'}`,
    `Ambition/Desire: ${character.ambition || 'Unwritten'} / ${character.desire || 'Unwritten'}`,
    `Physical Description: ${character.physicalDescription || 'No physical description recorded.'}`,
    `Disciplines: ${disciplines || 'None assigned'}`,
    `Key Backgrounds: ${keyBackgrounds || 'None assigned'}`,
    `Willpower: ${character.currentWillpower}/${character.willpower}`,
    `Blood Pool: ${character.currentBloodPool}/${character.bloodPool}`,
    `Health Status: ${character.health[character.currentHealthLevel] || 'Healthy'}`,
    `Temporary Resources: ${character.currentResources}/${getBackgroundDotsByName(character.backgrounds, 'Resources')}`,
    `Temporary Effects: ${activeEffects}`,
  ].join('\n');
}

export function startCase(value) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

export function rollDice(pool, difficulty) {
  const sanitizedPool = Math.max(1, Number(pool) || 1);
  const sanitizedDifficulty = Math.min(10, Math.max(2, Number(difficulty) || 6));
  const dice = Array.from({ length: sanitizedPool }, () => Math.floor(Math.random() * 10) + 1);
  const rawSuccesses = dice.filter((die) => die >= sanitizedDifficulty).length;
  const ones = dice.filter((die) => die === 1).length;
  const totalSuccesses = rawSuccesses - ones;

  let outcome = 'Failure';
  if (rawSuccesses === 0 && ones > 0) {
    outcome = 'Botch';
  } else if (totalSuccesses > 0) {
    outcome = totalSuccesses >= 5 ? 'Exceptional success' : 'Success';
  }

  return {
    id: uid('roll'),
    pool: sanitizedPool,
    difficulty: sanitizedDifficulty,
    dice,
    rawSuccesses,
    cancelledByOnes: ones,
    totalSuccesses,
    outcome,
    timestamp: new Date().toISOString(),
  };
}

export function formatTimestamp(value) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
