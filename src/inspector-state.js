const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const createInspectorState = ({ dock = 'right' } = {}) => ({
  dock,
  rightSize: 360,
  bottomSize: 240
});

export function updateInspectorState(state, action) {
  if (action.type === 'toggle-dock') {
    return { ...state, dock: state.dock === 'right' ? 'bottom' : 'right' };
  }

  if (action.type === 'resize') {
    const sizeKey = action.dock === 'bottom' ? 'bottomSize' : 'rightSize';
    return {
      ...state,
      [sizeKey]: clamp(action.size, action.min, action.max)
    };
  }

  return state;
}
