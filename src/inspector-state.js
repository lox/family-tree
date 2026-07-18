const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const MOBILE_BREAKPOINT = 600;

export const defaultInspectorDock = viewportWidth =>
  viewportWidth <= MOBILE_BREAKPOINT ? 'bottom' : 'right';

export const createInspectorState = ({ dock = 'right', open = false } = {}) => ({
  dock,
  open,
  rightSize: 360,
  bottomSize: 240
});

export function updateInspectorState(state, action) {
  if (action.type === 'open') {
    return { ...state, open: true };
  }

  if (action.type === 'close') {
    return { ...state, open: false };
  }

  if (action.type === 'deselect-person') {
    return state;
  }

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
