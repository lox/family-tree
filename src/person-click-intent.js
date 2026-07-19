export function personClickIntent(clickCount, { inspectorOpen = false } = {}) {
  if (clickCount === 0) return 'select';
  if (clickCount > 1) return 'open-family-branch';
  return inspectorOpen ? 'select' : 'defer-selection';
}
