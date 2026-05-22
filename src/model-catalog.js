export const DEFAULT_BATTERY_CAP_UNITS = 1000;
export const DEFAULT_CUSTOM_MODEL_COST_UNITS = 150;
export const DEFAULT_FREE_MODEL_DAILY_LIMIT = 30;
export const DEFAULT_STARTING_BATTERY_UNITS = 300;
export const CUSTOM_MODEL_SENTINEL = '__custom_model__';

export const STORYTELLER_MODEL_OPTIONS = [
  {
    id: 'openai/gpt-oss-120b:free',
    label: 'GPT OSS 120B',
    costUnits: 0,
    description: 'Free model for longer sessions. Still limited by the app\'s daily free-use guard.',
  },
  {
    id: 'deepseek/deepseek-v4-flash:free',
    label: 'DeepSeek V4 Flash',
    costUnits: 100,
    description: 'Fast and inexpensive. Uses 0.10 battery per Storyteller response.',
  },
];

export function getFallbackModelChain(model) {
  const orderedModels = STORYTELLER_MODEL_OPTIONS.map((option) => option.id);
  return orderedModels.filter((candidate) => candidate !== model);
}

export function getStoryModelEntry(model) {
  return STORYTELLER_MODEL_OPTIONS.find((option) => option.id === model) ?? null;
}

export function isKnownStoryModel(model) {
  return Boolean(getStoryModelEntry(model));
}

export function getModelCostUnits(model, customModelCostUnits = null) {
  const preset = getStoryModelEntry(model);
  if (preset) {
    return preset.costUnits;
  }

  const overrideUnits = Number(customModelCostUnits);
  if (Number.isFinite(overrideUnits)) {
    return clampBatteryUnits(overrideUnits);
  }

  return DEFAULT_CUSTOM_MODEL_COST_UNITS;
}

export function clampBatteryUnits(value, capUnits = DEFAULT_BATTERY_CAP_UNITS) {
  return Math.max(0, Math.min(capUnits, Math.round(Number(value) || 0)));
}

export function formatBatteryUnits(value) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(Number(value) || 0)));
}

export function formatModelUnitCost(costUnits, capUnits = DEFAULT_BATTERY_CAP_UNITS) {
  const safeCap = Math.max(1, Number(capUnits) || DEFAULT_BATTERY_CAP_UNITS);
  return (clampBatteryUnits(costUnits, safeCap) / safeCap).toFixed(2);
}