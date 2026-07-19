export function claimConnectionFocus(claimedKeys, connectionKey) {
  if (claimedKeys.has(connectionKey)) return false;
  claimedKeys.add(connectionKey);
  return true;
}

export function updateConnectionHover(currentKey, transition) {
  if (transition.type === 'enter') return transition.key ?? '';
  if (transition.type === 'leave' && transition.key === currentKey) {
    return transition.nextKey ?? '';
  }
  return currentKey;
}
