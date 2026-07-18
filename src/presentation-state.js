export const selectionAfterTreeClick = personId => personId ?? '';

export function toggleConnectionSelection(selectedKeys, connectionKey) {
  const next = new Set(selectedKeys);
  if (next.has(connectionKey)) next.delete(connectionKey);
  else next.add(connectionKey);
  return next;
}

export function ancestralEndpointIds(projection) {
  const recordedChildren = new Set(
    projection.families.flatMap(family => family.children)
  );
  return new Set(projection.units.flatMap(unit => (
    unit.personIds.length > 1
      ? unit.personIds.filter(personId => !recordedChildren.has(personId))
      : []
  )));
}

export function computeRelationshipPath(projection, selectedPersonId) {
  const unitIds = new Set();
  const personIds = new Set();
  const familyIds = new Set();
  const unionFamilyIds = new Set();
  const parentageFamilyIds = new Set();
  const parentageEdgeIds = new Set();
  const directChildFamilyIds = new Set();
  const directChildEdgeIds = new Set();
  const directChildPersonIds = new Set();
  const selectedUnit = projection.units.find(unit => unit.personIds.includes(selectedPersonId));
  const state = active => ({
    active,
    unitIds,
    personIds,
    familyIds,
    unionFamilyIds,
    parentageFamilyIds,
    parentageEdgeIds,
    directChildFamilyIds,
    directChildEdgeIds,
    directChildPersonIds
  });

  if (!selectedUnit) return state(false);

  unitIds.add(selectedUnit.id);
  personIds.add(selectedPersonId);

  const familyById = new Map(projection.families.map(family => [family.id, family]));
  const selectedFamilies = selectedUnit.familyIds
    .map(familyId => familyById.get(familyId))
    .filter(family => family?.partners.includes(selectedPersonId));
  const selectingRootUnit = projection.rootUnitIds
    ? projection.rootUnitIds.includes(selectedUnit.id)
    : selectedUnit.id === projection.rootUnitId;

  selectedFamilies.forEach(family => {
    familyIds.add(family.id);
    unionFamilyIds.add(family.id);
    family.partners.forEach(personId => personIds.add(personId));
    if (family.children.length) directChildFamilyIds.add(family.id);
    family.children.forEach(personId => {
      directChildPersonIds.add(personId);
      personIds.add(personId);
    });
  });

  projection.parentage.forEach(edge => {
    if (directChildFamilyIds.has(edge.sourceFamilyId)) directChildEdgeIds.add(edge.id);
  });

  const incomingByChild = new Map();
  projection.parentage.forEach(edge => {
    if (!incomingByChild.has(edge.childId)) incomingByChild.set(edge.childId, []);
    incomingByChild.get(edge.childId).push(edge);
  });
  const visitedPeople = new Set();
  const ancestorQueue = [selectedPersonId];

  while (ancestorQueue.length) {
    const childId = ancestorQueue.shift();
    if (visitedPeople.has(childId)) continue;
    visitedPeople.add(childId);

    (incomingByChild.get(childId) ?? []).forEach(incoming => {
      familyIds.add(incoming.sourceFamilyId);
      unionFamilyIds.add(incoming.sourceFamilyId);
      parentageFamilyIds.add(incoming.sourceFamilyId);
      parentageEdgeIds.add(incoming.id);
      const parentFamily = familyById.get(incoming.sourceFamilyId);
      parentFamily?.partners.forEach(personId => {
        personIds.add(personId);
        ancestorQueue.push(personId);
      });

      const sourceUnitId = projection.familyToUnit[incoming.sourceFamilyId];
      if (sourceUnitId) unitIds.add(sourceUnitId);
    });
  }

  return state(!selectingRootUnit || parentageEdgeIds.size > 0 || directChildEdgeIds.size > 0);
}
