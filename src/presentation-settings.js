export const PRESENTATION_SETTINGS_KEY = 'family-tree:presentation-settings';

const normalizeCardScale = value => {
  if (!Number.isFinite(value)) return 1;
  return Math.round(Math.min(1.3, Math.max(0.8, value)) * 10) / 10;
};

export const createPresentationSettings = (saved = {}) => ({
  colorBySex: saved?.colorBySex === true,
  cardScale: normalizeCardScale(saved?.cardScale)
});

export function updatePresentationSettings(settings, action) {
  if (action.type === 'set-sex-colors') {
    return { ...settings, colorBySex: Boolean(action.enabled) };
  }
  if (action.type === 'set-card-scale') {
    return { ...settings, cardScale: normalizeCardScale(action.scale) };
  }
  return settings;
}

export function parsePresentationSettings(serialized) {
  try {
    return createPresentationSettings(JSON.parse(serialized));
  } catch (error) {
    throw new Error(`Could not read saved presentation settings: ${error.message}`, { cause: error });
  }
}

export const serializePresentationSettings = settings => JSON.stringify(
  createPresentationSettings(settings)
);
