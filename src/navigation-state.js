export const PERSON_HISTORY_TYPE = 'family-tree-person';

export const createPersonHistoryState = (treeId, personId = '') => ({
  type: PERSON_HISTORY_TYPE,
  treeId,
  personId
});

export function personIdFromHistoryState(state, treeId, people) {
  if (state?.type !== PERSON_HISTORY_TYPE || state.treeId !== treeId) return '';
  if (!state.personId) return '';
  return people[state.personId] ? state.personId : '';
}
