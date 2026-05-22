export const CUSTOM_CHRONICLE_PACK = {
  hooks: [
    {
      id: 'custom-civic-feeding-grid',
      title: 'Civic Feeding Grid Distortion',
      summary: 'A mortal institution has started unintentionally concentrating prey, surveillance, and political leverage in one district.',
      stakes: 'If someone controls the district, they control feeding safety and local influence.',
    },
    {
      id: 'custom-fractured-sect-pact',
      title: 'Fractured Sect Pact',
      summary: 'A temporary peace between local sect actors is falling apart over a single disappearance and a bad rumor.',
      stakes: 'Once the pact breaks, every faction starts testing new borders and debts.',
    },
    {
      id: 'custom-hunter-pattern-leak',
      title: 'Hunter Pattern Leak',
      summary: 'Someone is mapping how the city feeds at night using public data, private cameras, and missing-person timelines.',
      stakes: 'Leave it alone long enough and the whole city becomes legible to hunters.',
    },
  ],
  mainPlots: [
    {
      id: 'custom-city-power-vacuum',
      title: 'Original City Power Vacuum',
      summary: 'No local faction truly owns the city yet, and every victory risks creating a tyrant worse than the last one.',
      use: 'Use as the chronicle spine for original custom-city games.',
    },
    {
      id: 'custom-si-pressure',
      title: 'Custom City Second Inquisition Pressure',
      summary: 'Federal, civic, or private hunter pressure is tightening around one vulnerable district and radiating outward.',
      use: 'Use for paranoia, compromised feeding, and desperate political bargains.',
    },
  ],
  subplots: [
    {
      id: 'custom-boon-chain-fracture',
      title: 'Boon Chain Fracture',
      summary: 'A favor owed between local power brokers becomes public at the worst possible moment.',
      use: 'Pressure etiquette, reputation, and alliance structure.',
    },
    {
      id: 'custom-neonate-asset-grab',
      title: 'Neonate Asset Grab',
      summary: 'A newly embraced Kindred has stumbled into territory, money, or data that elders expected to own quietly.',
      use: 'Introduce predatory opportunism and messy local politics.',
    },
  ],
  npcSeeds: [
    { name: 'Original Prince Or Baron', clan: 'Open', role: 'Faction leader', summary: 'A local ruler whose authority is recent, brittle, and aggressively defended.' },
    { name: 'Local Harpy Or Broker', clan: 'Open', role: 'Prestige broker', summary: 'The person who decides which insults matter and which debts become public.' },
    { name: 'Hunter-Compromised Official', clan: 'Mortal', role: 'Municipal vulnerability', summary: 'A mortal functionary whose office has become a pressure point for the night.' },
    { name: 'Street-Level Anarch Organizer', clan: 'Open', role: 'Faction agitator', summary: 'A charismatic organizer who can mobilize crowds faster than courts can react.' },
  ],
};

export const CHRONICLE_PACKS = {
  'chicago-v5': {
    hooks: [
      {
        id: 'chicago-lasombra-entry',
        title: 'Lasombra Entry Price',
        summary: 'A Lasombra defector or sponsor is forcing Chicago to decide what price admission to power should really cost.',
        stakes: 'If the city mishandles it, every faction will test whether Chicago still controls its own standards.',
      },
      {
        id: 'chicago-anarch-street-balance',
        title: 'Anarch Street Balance',
        summary: 'Anarch neighborhoods are holding together through fragile personal deals that could collapse after one insult or feeding disaster.',
        stakes: 'If the balance goes, the city trades deniable unrest for open territorial conflict.',
      },
      {
        id: 'chicago-si-crawl',
        title: 'Second Inquisition Crawl',
        summary: 'Data collection, law-enforcement partnerships, and private contractors are quietly building a picture of Chicago after dark.',
        stakes: 'Once the crawl matures, even old havens and feeding routes become vulnerable.',
      },
    ],
    mainPlots: [
      {
        id: 'chicago-jackson-coalition',
        title: 'Jackson Coalition Under Strain',
        summary: 'Prince Jackson is holding the city together through negotiated strength, but every concession to elders, anarchs, and defectors weakens someone else.',
        use: 'Run this as a citywide legitimacy crisis and political balancing act.',
      },
      {
        id: 'chicago-helena-shadow',
        title: 'Helena In The Walls',
        summary: 'Signs of elder manipulation suggest that Chicago is still haunted by a much older appetite than its current prince can openly control.',
        use: 'Use for slow-burn dread, hidden patronage, and citywide paranoia.',
      },
      {
        id: 'chicago-night-war',
        title: 'Street War Beneath The Peace',
        summary: 'Anarchs, loyal sheriffs, and opportunistic outsiders are all treating the current peace as temporary.',
        use: 'Use for campaigns that lean on raids, reprisals, and difficult local alliances.',
      },
    ],
    subplots: [
      {
        id: 'chicago-damien-debt',
        title: 'Sheriff Debt Ledger',
        summary: 'A favor Damien extended off the books is being called in by the wrong person at the wrong time.',
        use: 'Use for sudden law-enforcement pressure and competing loyalties.',
      },
      {
        id: 'chicago-annabelle-stage',
        title: 'Annabelle\'s Public Stage',
        summary: 'A public-facing action by anarch activists forces neonates to choose between spectacle, safety, and principle.',
        use: 'Use for ideological conflict and Masquerade-adjacent tension.',
      },
      {
        id: 'chicago-primogen-blindside',
        title: 'Primogen Blindside',
        summary: 'A Primogen maneuver meant to embarrass a rival is about to expose something much larger.',
        use: 'Use for court drama, social traps, and status bargaining.',
      },
    ],
    npcSeeds: [
      { name: 'Kevin Jackson', clan: 'Ventrue', role: 'Prince', summary: 'Corporate ruler trying to keep Chicago governable by force of coalition and discipline.' },
      { name: 'Damien Edwards', clan: 'Brujah', role: 'Sheriff', summary: 'Direct, dangerous, and trusted to solve problems that outgrow etiquette.' },
      { name: 'Annabelle', clan: 'Toreador', role: 'Anarch firebrand', summary: 'Young, visible, and capable of making idealism politically contagious.' },
      { name: 'Critias', clan: 'Brujah', role: 'Primogen elder', summary: 'Ancient intellect whose endorsement or disdain can redirect the whole city.' },
      { name: 'Maldavis', clan: 'Brujah', role: 'Anarch commander', summary: 'Street-level legitimacy paired with enough force to make threats credible.' },
      { name: 'Helena', clan: 'Toreador', role: 'Hidden elder predator', summary: 'An elder presence that makes every local political plan feel smaller than it seemed.' },
    ],
  },
  'boston-v5': {
    hooks: [
      {
        id: 'boston-harbor-tribute',
        title: 'Harbor Tribute Dispute',
        summary: 'Money, blood, and illicit cargo moving through the harbor now answer to competing Kindred claims.',
        stakes: 'If the tribute line breaks, half the city loses either feeding safety or leverage.',
      },
      {
        id: 'boston-campus-radicals',
        title: 'Campus Radical Night Network',
        summary: 'Students, adjuncts, and activist circles have become an unusually effective information web after dark.',
        stakes: 'Whoever controls that network shapes rumor, recruitment, and public pressure.',
      },
      {
        id: 'boston-old-money-secrets',
        title: 'Old Money Secret Archive',
        summary: 'A family archive tied to Boston\'s old elite contains proof of mortal and Kindred crimes stretching back generations.',
        stakes: 'The archive can destroy local respectability or become the next great boon engine.',
      },
    ],
    mainPlots: [
      {
        id: 'boston-institutional-crown',
        title: 'Who Really Rules Boston',
        summary: 'Boston\'s universities, hospitals, family trusts, and cultural institutions each hide a different claimant to the city.',
        use: 'Use as a prestige war where influence matters as much as open status.',
      },
      {
        id: 'boston-revolutionary-debt',
        title: 'Revolutionary Debt Returns',
        summary: 'Old grievances from Boston\'s ideological history are resurfacing through modern organizing, leaked records, and undead hypocrisy.',
        use: 'Use for a chronicle about class, legitimacy, and inherited sins.',
      },
      {
        id: 'boston-hungry-harbor',
        title: 'The Harbor Feeds Back',
        summary: 'Waterfront redevelopment, smuggling, and shipping corruption are concentrating too much hunger in one corridor.',
        use: 'Use for domain fights and practical predation pressure.',
      },
    ],
    subplots: [
      {
        id: 'boston-elysium-benefactor',
        title: 'Elysium Benefactor Scandal',
        summary: 'A mortal donor funding an Elysium venue has become too curious about where the money and invitations actually lead.',
        use: 'Pressure etiquette and Masquerade maintenance.',
      },
      {
        id: 'boston-thesis-on-monsters',
        title: 'Thesis On Monsters',
        summary: 'A graduate researcher has accidentally built a disturbingly accurate pattern of predation in one district.',
        use: 'Use for investigation, surveillance, and moral compromise.',
      },
      {
        id: 'boston-giovanni-vacancy',
        title: 'Necromantic Property Vacancy',
        summary: 'A property connected to old necromantic wealth has become vacant and every scavenger in the city wants it quietly.',
        use: 'Use for occult side pressure and opportunistic theft.',
      },
    ],
    npcSeeds: [
      { name: 'Miranda Voss', clan: 'Ventrue', role: 'Institutional broker', summary: 'Moves between boardrooms, museums, and legacy families like they are one court.' },
      { name: 'Jonah Pike', clan: 'Brujah', role: 'Labor-and-campus organizer', summary: 'Can make half a district noisy before elders agree on who insulted whom.' },
      { name: 'Dr. Celia March', clan: 'Tremere', role: 'Academic occultist', summary: 'Treats Boston\'s knowledge economy as both feeding ground and laboratory.' },
      { name: 'Elias Roarke', clan: 'Nosferatu', role: 'Harbor intelligence broker', summary: 'Knows which ships carry blood, weapons, or secrets before they dock.' },
    ],
  },
  'london-fall-v5': {
    hooks: [
      {
        id: 'london-antigen-shadow',
        title: 'Operation Antigen Shadow',
        summary: 'A disciplined mortal threat is moving through London with better planning than ordinary hunters ever show.',
        stakes: 'If Antigen gets a full picture of the city, London becomes a containment exercise.',
      },
      {
        id: 'london-mithraeum-rumor',
        title: 'Mithraeum Rumor Chain',
        summary: 'Whispers around the Mithraeum keep resurfacing, drawing the greedy, the faithful, and the doomed.',
        stakes: 'The rumor chain can destabilize every faction that still fears or worships Mithras.',
      },
      {
        id: 'london-duskborn-pressure',
        title: 'Duskborn Pressure Valve',
        summary: 'London\'s outsiders are being pushed into impossible choices by the city\'s surviving elite and its mortal enemies.',
        stakes: 'Handle it poorly and you create both a rebellion and a purge target.',
      },
    ],
    mainPlots: [
      {
        id: 'london-mithras-return',
        title: 'The City Still Belongs To Mithras',
        summary: 'Every surviving power in London is forced to define itself in relation to Mithras, whether through loyalty, fear, or denial.',
        use: 'Use for conspiracies, dread, and old-regime politics.',
      },
      {
        id: 'london-antigen-net',
        title: 'Operation Antigen Tightens The Net',
        summary: 'Structured mortal pressure is turning London from a Kindred capital into a hunting preserve.',
        use: 'Use for a survival chronicle where logistics and secrecy matter constantly.',
      },
      {
        id: 'london-court-collapse',
        title: 'A Court Without A Stable Crown',
        summary: 'Queen Anne, old loyalists, opportunists, and desperate survivors are all trying to define what London becomes next.',
        use: 'Use for factional succession and the aftershocks of empire.',
      },
    ],
    subplots: [
      {
        id: 'london-camden-burn',
        title: 'Camden Burns Quietly',
        summary: 'A district-level crisis is spreading through music venues, street trade, and frightened feeding territory.',
        use: 'Use for local pressure that reveals the citywide collapse underneath.',
      },
      {
        id: 'london-anne-favor',
        title: 'Queen Anne\'s Poisoned Favor',
        summary: 'A favor from the old court offers safety only if the coterie accepts a deeper debt than they can see.',
        use: 'Use for court intrigue and irreversible obligations.',
      },
      {
        id: 'london-camden-ledger',
        title: 'Camden Intelligence Ledger',
        summary: 'A ledger linking mortal surveillance, old havens, and compromised Kindred assets is changing hands in the dark.',
        use: 'Use for investigation and political extortion.',
      },
    ],
    npcSeeds: [
      { name: 'Mithras', clan: 'Ventrue', role: 'Ancient city-defining tyrant', summary: 'More force of history than ordinary prince, and every rumor about him changes behavior.' },
      { name: 'Roger de Camden', clan: 'Ventrue', role: 'Old-regime broker', summary: 'Embodies the disciplined, suffocating habits of the old court.' },
      { name: 'Queen Anne', clan: 'Ventrue', role: 'Court survivor', summary: 'Represents continuity, ambition, and the danger of clinging to London\'s old hierarchy.' },
      { name: 'Operation Antigen', clan: 'Mortal', role: 'Organized hunter threat', summary: 'Structured mortal adversary operating like an intelligence service rather than a mob.' },
    ],
  },
  'custom-us-city': CUSTOM_CHRONICLE_PACK,
};

export function getChroniclePack(cityId) {
  return CHRONICLE_PACKS[cityId] || CUSTOM_CHRONICLE_PACK;
}

export function getChronicleHookSummaries(cityId, ids) {
  const pack = getChroniclePack(cityId);
  const selectedIds = Array.isArray(ids) && ids.length ? ids : [pack.hooks[0]?.id].filter(Boolean);
  return pack.hooks.filter((hook) => selectedIds.includes(hook.id));
}

export function getDefaultHookIdsForCity(cityId) {
  const pack = getChroniclePack(cityId);
  return pack.hooks[0] ? [pack.hooks[0].id] : [];
}