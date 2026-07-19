export const PERSON_HISTORY_TYPE = 'family-tree-person';
export const SELECTION_HISTORY_TYPE = 'family-tree-selection';

export const emptySelection = () => ({ type: 'none' });

export function selectionAfterShiftClick(selection, personId) {
  const primaryId = selection?.type === 'comparison'
    ? selection.personIds[0]
    : selection?.type === 'person' ? selection.personId : '';
  if (!primaryId || primaryId === personId) return { type: 'person', personId };
  return { type: 'comparison', personIds: [primaryId, personId] };
}

export function createSelectionHistoryState(treeId, selection = emptySelection()) {
  return { type: SELECTION_HISTORY_TYPE, treeId, selection };
}

export function validatedSelection(selection, graph) {
  if (selection?.type === 'none') return emptySelection();
  if (selection?.type === 'person' && graph.people[selection.personId]) return selection;
  if (
    selection?.type === 'comparison'
    && selection.personIds?.length === 2
    && selection.personIds[0] !== selection.personIds[1]
    && selection.personIds.every(personId => graph.people[personId])
  ) return selection;
  if (
    (selection?.type === 'partnership' || selection?.type === 'children')
    && graph.families.some(family => family.id === selection.familyId)
  ) return selection;
  return emptySelection();
}

export function selectionFromHistoryState(state, treeId, graph) {
  if (state?.type === PERSON_HISTORY_TYPE && state.treeId === treeId) {
    return validatedSelection({ type: 'person', personId: state.personId }, graph);
  }
  if (state?.type !== SELECTION_HISTORY_TYPE || state.treeId !== treeId) return emptySelection();
  return validatedSelection(state.selection, graph);
}
