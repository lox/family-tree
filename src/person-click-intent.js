export function personClickIntent(clickCount) {
  if (clickCount === 0) return 'select';
  if (clickCount > 1) return 'open-family-branch';
  return 'defer-selection';
}
