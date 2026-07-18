export const PRESENTATION_SETTINGS_KEY = 'family-tree:presentation-settings';

export const createPresentationSettings = (saved = {}) => ({
  colorBySex: saved?.colorBySex === true
});

export function updatePresentationSettings(settings, action) {
  if (action.type === 'set-sex-colors') {
    return { ...settings, colorBySex: Boolean(action.enabled) };
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
