const SCENE_FOCUS_MAP = {
  social: {
    label: 'Social',
    attributes: ['charisma', 'manipulation', 'appearance', 'perception', 'wits'],
    talents: ['empathy', 'expression', 'intimidation', 'leadership', 'subterfuge'],
    skills: ['etiquette', 'performance'],
    knowledges: ['law', 'politics'],
    backgrounds: ['Allies', 'Contacts', 'Influence', 'Resources', 'Retainers', 'Status'],
  },
  combat: {
    label: 'Combat',
    attributes: ['strength', 'dexterity', 'stamina', 'perception', 'wits'],
    talents: ['alertness', 'athletics', 'brawl', 'intimidation'],
    skills: ['drive', 'firearms', 'melee', 'security', 'stealth', 'survival'],
    knowledges: ['investigation'],
    backgrounds: ['Allies', 'Resources', 'Retainers'],
  },
  investigation: {
    label: 'Investigation',
    attributes: ['perception', 'intelligence', 'wits', 'dexterity'],
    talents: ['alertness', 'empathy', 'subterfuge'],
    skills: ['security', 'stealth'],
    knowledges: ['academics', 'computer', 'finance', 'investigation', 'linguistics', 'occult', 'politics'],
    backgrounds: ['Contacts', 'Influence', 'Library', 'Resources'],
  },
  occult: {
    label: 'Occult',
    attributes: ['intelligence', 'wits', 'perception', 'stamina'],
    talents: ['alertness', 'expression'],
    skills: ['crafts', 'medicine'],
    knowledges: ['academics', 'linguistics', 'occult', 'rituals'],
    backgrounds: ['Mentor', 'Resources', 'Retainers'],
  },
};

const SOURCEBOOK_NPC_SHEETS = {
  'kevin-jackson': {
    key: 'kevin-jackson',
    cityId: 'chicago-v5',
    name: 'Kevin Jackson',
    source: 'Chicago by Night (V5)',
    clan: 'Ventrue',
    sect: 'Camarilla',
    role: 'Prince of Chicago',
    concept: 'Corporate prince and coalition broker',
    apparentAge: 'Late 40s',
    generation: 8,
    nature: 'Director',
    demeanor: 'Architect',
    attributes: {
      strength: 3,
      dexterity: 3,
      stamina: 4,
      charisma: 5,
      manipulation: 5,
      appearance: 3,
      perception: 4,
      intelligence: 4,
      wits: 5,
    },
    abilities: {
      talents: { alertness: 3, empathy: 3, expression: 3, intimidation: 4, leadership: 5, subterfuge: 4, streetwise: 3 },
      skills: { drive: 2, etiquette: 5, firearms: 2, melee: 2, security: 3, stealth: 2 },
      knowledges: { finance: 4, investigation: 3, law: 3, politics: 5, computer: 2, linguistics: 2 },
    },
    disciplines: [
      { name: 'Dominate', dots: 5 },
      { name: 'Fortitude', dots: 4 },
      { name: 'Presence', dots: 5 },
    ],
    backgrounds: [
      { name: 'Allies', dots: 4 },
      { name: 'Contacts', dots: 5 },
      { name: 'Influence', dots: 5 },
      { name: 'Resources', dots: 5 },
      { name: 'Retainers', dots: 3 },
      { name: 'Status', dots: 5 },
    ],
    virtues: { conscience: 2, selfControl: 5, courage: 4 },
    humanity: 5,
    willpower: 9,
    bloodPool: 15,
    notes: 'Built for court politics, coercive negotiation, and calm command under pressure.',
  },
  'damien-edwards': {
    key: 'damien-edwards',
    cityId: 'chicago-v5',
    name: 'Damien Edwards',
    source: 'Chicago by Night (V5)',
    clan: 'Brujah',
    sect: 'Camarilla',
    role: 'Sheriff and blunt enforcer',
    concept: 'Street-hardened sheriff with court legitimacy',
    apparentAge: '30s',
    generation: 10,
    nature: 'Soldier',
    demeanor: 'Judge',
    attributes: {
      strength: 4,
      dexterity: 4,
      stamina: 4,
      charisma: 3,
      manipulation: 2,
      appearance: 2,
      perception: 4,
      intelligence: 3,
      wits: 4,
    },
    abilities: {
      talents: { alertness: 4, athletics: 3, brawl: 4, intimidation: 4, leadership: 3, streetwise: 4, subterfuge: 2 },
      skills: { drive: 2, firearms: 3, melee: 4, security: 3, stealth: 3, survival: 2 },
      knowledges: { investigation: 3, law: 2, politics: 2 },
    },
    disciplines: [
      { name: 'Celerity', dots: 4 },
      { name: 'Potence', dots: 4 },
      { name: 'Presence', dots: 2 },
    ],
    backgrounds: [
      { name: 'Allies', dots: 2 },
      { name: 'Contacts', dots: 3 },
      { name: 'Resources', dots: 2 },
      { name: 'Retainers', dots: 2 },
      { name: 'Status', dots: 3 },
    ],
    virtues: { conscience: 3, selfControl: 4, courage: 5 },
    humanity: 6,
    willpower: 8,
    bloodPool: 13,
    notes: 'Use for fast violence, hard intimidation, and practical street investigations.',
  },
  'annabelle-triabell': {
    key: 'annabelle-triabell',
    cityId: 'chicago-v5',
    name: 'Annabelle',
    source: 'Chicago by Night (V5)',
    clan: 'Toreador',
    sect: 'Anarch',
    role: 'Idealistic anarch agitator',
    concept: 'Public-facing rebel with surprising poise',
    apparentAge: '20s',
    generation: 12,
    nature: 'Visionary',
    demeanor: 'Celebrant',
    attributes: {
      strength: 2,
      dexterity: 3,
      stamina: 2,
      charisma: 4,
      manipulation: 3,
      appearance: 4,
      perception: 3,
      intelligence: 3,
      wits: 4,
    },
    abilities: {
      talents: { alertness: 2, empathy: 3, expression: 4, leadership: 3, streetwise: 3, subterfuge: 2 },
      skills: { etiquette: 2, performance: 3, stealth: 2 },
      knowledges: { academics: 2, politics: 3, investigation: 2 },
    },
    disciplines: [
      { name: 'Auspex', dots: 2 },
      { name: 'Celerity', dots: 2 },
      { name: 'Presence', dots: 3 },
    ],
    backgrounds: [
      { name: 'Allies', dots: 2 },
      { name: 'Contacts', dots: 2 },
      { name: 'Fame', dots: 1 },
      { name: 'Resources', dots: 1 },
      { name: 'Status', dots: 2 },
    ],
    virtues: { conscience: 4, selfControl: 3, courage: 4 },
    humanity: 7,
    willpower: 6,
    bloodPool: 11,
    notes: 'Use when a scene needs idealism, rhetoric, and precarious anarch legitimacy.',
  },
  'critias': {
    key: 'critias',
    cityId: 'chicago-v5',
    name: 'Critias',
    source: 'Chicago by Night (V5)',
    clan: 'Brujah',
    sect: 'Camarilla',
    role: 'Elder philosopher and Primogen power broker',
    concept: 'Ancient radical turned disciplined statesman',
    apparentAge: 'Middle-aged',
    generation: 6,
    nature: 'Architect',
    demeanor: 'Scholar',
    attributes: {
      strength: 4,
      dexterity: 4,
      stamina: 5,
      charisma: 4,
      manipulation: 4,
      appearance: 3,
      perception: 4,
      intelligence: 5,
      wits: 5,
    },
    abilities: {
      talents: { alertness: 4, empathy: 4, intimidation: 3, leadership: 4, subterfuge: 4 },
      skills: { etiquette: 4, firearms: 2, melee: 4, ride: 2 },
      knowledges: { academics: 4, investigation: 3, law: 3, occult: 3, politics: 5, linguistics: 4 },
    },
    disciplines: [
      { name: 'Celerity', dots: 5 },
      { name: 'Potence', dots: 5 },
      { name: 'Presence', dots: 4 },
    ],
    backgrounds: [
      { name: 'Allies', dots: 3 },
      { name: 'Contacts', dots: 4 },
      { name: 'Influence', dots: 3 },
      { name: 'Resources', dots: 4 },
      { name: 'Status', dots: 4 },
    ],
    virtues: { conscience: 3, selfControl: 5, courage: 5 },
    humanity: 6,
    willpower: 9,
    bloodPool: 20,
    notes: 'Use when the city needs an elder who wins by memory, force, and philosophical authority.',
  },
  'maldavis': {
    key: 'maldavis',
    cityId: 'chicago-v5',
    name: 'Maldavis',
    source: 'Chicago by Night (V5)',
    clan: 'Brujah',
    sect: 'Anarch',
    role: 'Anarch war leader and populist threat',
    concept: 'Veteran insurgent with the strength to back ideology',
    apparentAge: '40s',
    generation: 9,
    nature: 'Gallant',
    demeanor: 'Commander',
    attributes: {
      strength: 4,
      dexterity: 4,
      stamina: 4,
      charisma: 4,
      manipulation: 3,
      appearance: 2,
      perception: 3,
      intelligence: 3,
      wits: 4,
    },
    abilities: {
      talents: { alertness: 3, athletics: 3, brawl: 4, intimidation: 4, leadership: 4, streetwise: 4 },
      skills: { firearms: 3, melee: 3, stealth: 2, survival: 2 },
      knowledges: { investigation: 2, politics: 3 },
    },
    disciplines: [
      { name: 'Celerity', dots: 3 },
      { name: 'Potence', dots: 4 },
      { name: 'Presence', dots: 3 },
    ],
    backgrounds: [
      { name: 'Allies', dots: 3 },
      { name: 'Contacts', dots: 3 },
      { name: 'Resources', dots: 2 },
      { name: 'Retainers', dots: 2 },
      { name: 'Status', dots: 3 },
    ],
    virtues: { conscience: 3, selfControl: 3, courage: 5 },
    humanity: 6,
    willpower: 8,
    bloodPool: 14,
    notes: 'Use for scenes where anarch credibility, direct action, and credible violence intersect.',
  },
  'helena': {
    key: 'helena',
    cityId: 'chicago-v5',
    name: 'Helena',
    source: 'Chicago by Night (V5)',
    clan: 'Toreador',
    sect: 'Independent Elder Power',
    role: 'Ancient manipulator and hidden apex predator',
    concept: 'Mythic beauty masking predatory calculation',
    apparentAge: 'Timeless',
    generation: 5,
    nature: 'Autocrat',
    demeanor: 'Siren',
    attributes: {
      strength: 4,
      dexterity: 5,
      stamina: 5,
      charisma: 5,
      manipulation: 5,
      appearance: 5,
      perception: 5,
      intelligence: 4,
      wits: 5,
    },
    abilities: {
      talents: { empathy: 4, expression: 4, intimidation: 4, leadership: 4, subterfuge: 5 },
      skills: { etiquette: 5, melee: 3, performance: 4, stealth: 3 },
      knowledges: { academics: 4, occult: 4, politics: 5, linguistics: 4 },
    },
    disciplines: [
      { name: 'Auspex', dots: 5 },
      { name: 'Celerity', dots: 5 },
      { name: 'Presence', dots: 5 },
    ],
    backgrounds: [
      { name: 'Allies', dots: 4 },
      { name: 'Contacts', dots: 5 },
      { name: 'Influence', dots: 4 },
      { name: 'Resources', dots: 5 },
      { name: 'Status', dots: 5 },
    ],
    virtues: { conscience: 1, selfControl: 5, courage: 5 },
    humanity: 4,
    willpower: 10,
    bloodPool: 22,
    notes: 'Use sparingly. Helena should feel like a city-level catastrophe, not just another elder.',
  },
  mithras: {
    key: 'mithras',
    cityId: 'london-fall-v5',
    name: 'Mithras',
    source: 'The Fall of London (V5)',
    clan: 'Ventrue',
    sect: 'Ancient Camarilla Tyrant',
    role: 'Sleeping king and city-defining threat',
    concept: 'Mythic sovereign whose will still warps London',
    apparentAge: 'Ancient',
    generation: 4,
    nature: 'Autocrat',
    demeanor: 'Visionary',
    attributes: {
      strength: 5,
      dexterity: 5,
      stamina: 5,
      charisma: 5,
      manipulation: 5,
      appearance: 4,
      perception: 5,
      intelligence: 5,
      wits: 5,
    },
    abilities: {
      talents: { alertness: 5, empathy: 4, intimidation: 5, leadership: 5, subterfuge: 4 },
      skills: { etiquette: 5, melee: 5, ride: 4, stealth: 3 },
      knowledges: { academics: 4, investigation: 4, law: 4, occult: 5, politics: 5, linguistics: 5 },
    },
    disciplines: [
      { name: 'Dominate', dots: 6 },
      { name: 'Fortitude', dots: 6 },
      { name: 'Presence', dots: 6 },
    ],
    backgrounds: [
      { name: 'Allies', dots: 5 },
      { name: 'Contacts', dots: 5 },
      { name: 'Domain', dots: 5 },
      { name: 'Influence', dots: 5 },
      { name: 'Resources', dots: 5 },
      { name: 'Status', dots: 5 },
    ],
    virtues: { conscience: 1, selfControl: 5, courage: 5 },
    humanity: 3,
    willpower: 10,
    bloodPool: 24,
    notes: 'Treat as an apex chronicle threat. When active, scenes around Mithras should feel like national-level pressure.',
  },
  'roger-de-camden': {
    key: 'roger-de-camden',
    cityId: 'london-fall-v5',
    name: 'Roger de Camden',
    source: 'The Fall of London (V5)',
    clan: 'Ventrue',
    sect: 'Mithraic Court Loyalist',
    role: 'Court fixer and old-regime power broker',
    concept: 'Disciplined court survivor with ruthless political habits',
    apparentAge: 'Middle-aged',
    generation: 7,
    nature: 'Architect',
    demeanor: 'Director',
    attributes: {
      strength: 3,
      dexterity: 3,
      stamina: 4,
      charisma: 4,
      manipulation: 5,
      appearance: 3,
      perception: 4,
      intelligence: 4,
      wits: 4,
    },
    abilities: {
      talents: { alertness: 3, empathy: 3, intimidation: 3, leadership: 4, subterfuge: 5 },
      skills: { etiquette: 5, firearms: 2, melee: 2, stealth: 2 },
      knowledges: { investigation: 3, law: 3, occult: 2, politics: 5, finance: 3, linguistics: 3 },
    },
    disciplines: [
      { name: 'Dominate', dots: 4 },
      { name: 'Fortitude', dots: 4 },
      { name: 'Presence', dots: 4 },
    ],
    backgrounds: [
      { name: 'Allies', dots: 3 },
      { name: 'Contacts', dots: 4 },
      { name: 'Influence', dots: 4 },
      { name: 'Resources', dots: 4 },
      { name: 'Status', dots: 4 },
    ],
    virtues: { conscience: 2, selfControl: 5, courage: 4 },
    humanity: 5,
    willpower: 9,
    bloodPool: 16,
    notes: 'Use for court intrigue, status warfare, and scenes where old London still thinks it owns the night.',
  },
};

function normalizeSheet(sheet) {
  return JSON.parse(JSON.stringify(sheet));
}

function pickAbilityGroup(abilities, keys) {
  const entries = Object.entries(abilities || {}).filter(([key, value]) => keys.includes(key) && value > 0);
  return Object.fromEntries(entries);
}

export function getNpcConversionWorkflow() {
  return [
    'V5-to-V20 NPC conversion workflow:',
    '1. Identify the current scene focus before converting anything: social, combat, investigation, or occult.',
    '2. Convert only the attributes, abilities, disciplines, backgrounds, and derived traits that matter for that scene.',
    '3. Preserve narrative role first: clan, sect position, generation pressure, signature disciplines, resources, influence, and status should survive the conversion even if exact V5 numbers do not.',
    '4. If the scene changes, keep the already converted core traits and add the missing cluster instead of rebuilding the whole sheet.',
    '5. Named sourcebook NPCs should use their explicit helper sheets when available. Original or lesser NPCs can use the same workflow with threat-tier judgment.',
  ].join('\n');
}

export function getSourcebookNpcSheet(key) {
  return SOURCEBOOK_NPC_SHEETS[key] ? normalizeSheet(SOURCEBOOK_NPC_SHEETS[key]) : null;
}

export function getSourcebookNpcSheetsForCity(cityId) {
  return Object.values(SOURCEBOOK_NPC_SHEETS)
    .filter((sheet) => sheet.cityId === cityId)
    .map((sheet) => normalizeSheet(sheet));
}

export function getSceneFocusedNpcSheet(keyOrSheet, sceneType = 'social') {
  const sourceSheet = typeof keyOrSheet === 'string' ? getSourcebookNpcSheet(keyOrSheet) : normalizeSheet(keyOrSheet);
  if (!sourceSheet) {
    return null;
  }

  const focus = SCENE_FOCUS_MAP[sceneType] || SCENE_FOCUS_MAP.social;
  const focusedAttributes = Object.fromEntries(
    Object.entries(sourceSheet.attributes || {}).filter(([key]) => focus.attributes.includes(key)),
  );

  return {
    name: sourceSheet.name,
    sceneType,
    focusLabel: focus.label,
    concept: sourceSheet.concept,
    clan: sourceSheet.clan,
    role: sourceSheet.role,
    generation: sourceSheet.generation,
    willpower: sourceSheet.willpower,
    bloodPool: sourceSheet.bloodPool,
    disciplines: sourceSheet.disciplines,
    attributes: focusedAttributes,
    abilities: {
      talents: pickAbilityGroup(sourceSheet.abilities?.talents, focus.talents),
      skills: pickAbilityGroup(sourceSheet.abilities?.skills, focus.skills),
      knowledges: pickAbilityGroup(sourceSheet.abilities?.knowledges, focus.knowledges),
    },
    backgrounds: (sourceSheet.backgrounds || []).filter((item) => focus.backgrounds.includes(item.name)),
    escalationNote: 'If the scene pivots, preserve these converted traits and add the next relevant cluster instead of rebuilding the sheet.',
  };
}

export function formatNpcReferenceSheetsForPrompt(cityId) {
  const sheets = getSourcebookNpcSheetsForCity(cityId);
  if (!sheets.length) {
    return 'No explicit named sourcebook V20 sheets are prepared for this city yet. Use the conversion workflow to translate scene-relevant traits on demand.';
  }

  return sheets
    .map((sheet) => {
      const disciplineText = sheet.disciplines.map((discipline) => `${discipline.name} ${discipline.dots}`).join(', ');
      const backgroundText = sheet.backgrounds.map((background) => `${background.name} ${background.dots}`).join(', ');
      return [
        `${sheet.name} (${sheet.clan}, ${sheet.role})`,
        `Generation ${sheet.generation}; Willpower ${sheet.willpower}; Blood Pool ${sheet.bloodPool}`,
        `Attributes: Str ${sheet.attributes.strength}, Dex ${sheet.attributes.dexterity}, Sta ${sheet.attributes.stamina}, Cha ${sheet.attributes.charisma}, Man ${sheet.attributes.manipulation}, App ${sheet.attributes.appearance}, Per ${sheet.attributes.perception}, Int ${sheet.attributes.intelligence}, Wit ${sheet.attributes.wits}`,
        `Disciplines: ${disciplineText}`,
        `Backgrounds: ${backgroundText}`,
        `Use: ${sheet.notes}`,
      ].join('\n');
    })
    .join('\n\n');
}