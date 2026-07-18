const PRESETS = {
  full: {
    preset: 'full',
    ancestorDepth: 0,
    descendantDepth: 0,
    includeAnchorPartners: false,
    includeSiblings: false,
    includeDescendantPartners: false
  },
  immediate: {
    preset: 'immediate',
    ancestorDepth: 1,
    descendantDepth: 1,
    includeAnchorPartners: true,
    includeSiblings: true,
    includeDescendantPartners: false
  },
  family: {
    preset: 'family',
    ancestorDepth: 1,
    descendantDepth: 1,
    includeAnchorPartners: true,
    includeSiblings: false,
    includeDescendantPartners: false
  },
  ancestors: {
    preset: 'ancestors',
    ancestorDepth: Infinity,
    descendantDepth: 0,
    includeAnchorPartners: false,
    includeSiblings: false,
    includeDescendantPartners: false
  },
  descendants: {
    preset: 'descendants',
    ancestorDepth: 0,
    descendantDepth: Infinity,
    includeAnchorPartners: true,
    includeSiblings: false,
    includeDescendantPartners: false
  }
};

const LABELS = {
  full: 'Filter',
  immediate: 'Immediate family',
  family: 'Family branch',
  ancestors: 'Ancestors',
  descendants: 'Descendants',
  custom: 'Custom filter'
};

function addToIndex(index, personId, family) {
  if (!index.has(personId)) index.set(personId, []);
  index.get(personId).push(family);
}

function indexFamilies(families) {
  const byPartner = new Map();
  const byChild = new Map();

  families.forEach(family => {
    family.partners.forEach(personId => addToIndex(byPartner, personId, family));
    family.children.forEach(personId => addToIndex(byChild, personId, family));
  });

  return { byPartner, byChild };
}

function addExistingPeople(personIds, candidates, people) {
  candidates.forEach(personId => {
    if (people[personId]) personIds.add(personId);
  });
}

export function createRelationshipFilter(anchorPersonId = '', preset = 'full') {
  const settings = PRESETS[preset] ?? PRESETS.full;
  return { anchorPersonId, ...settings };
}

export function createCustomRelationshipFilter(anchorPersonId, settings) {
  return {
    anchorPersonId,
    preset: 'custom',
    ...settings,
    ancestorDepth: settings.includeSiblings && settings.ancestorDepth === 0
      ? 1
      : settings.ancestorDepth
  };
}

export function relationshipFilterAnchorPersonId(filter, selectedPersonId) {
  return filter.preset === 'full' ? selectedPersonId : filter.anchorPersonId;
}

export function relationshipFilterLabel(preset) {
  return LABELS[preset] ?? LABELS.full;
}

export function relationshipFilterPersonIds(graph, filter) {
  const { anchorPersonId } = filter;
  const visiblePersonIds = new Set();
  if (!graph.people[anchorPersonId]) return visiblePersonIds;
  visiblePersonIds.add(anchorPersonId);

  const { byPartner, byChild } = indexFamilies(graph.families);

  const ancestors = [{ personId: anchorPersonId, depth: 0 }];
  const visitedAncestors = new Set();
  while (ancestors.length) {
    const current = ancestors.shift();
    if (visitedAncestors.has(current.personId) || current.depth >= filter.ancestorDepth) continue;
    visitedAncestors.add(current.personId);
    (byChild.get(current.personId) ?? []).forEach(family => {
      family.partners.forEach(parentId => {
        if (!graph.people[parentId]) return;
        visiblePersonIds.add(parentId);
        ancestors.push({ personId: parentId, depth: current.depth + 1 });
      });
    });
  }

  if (filter.includeSiblings) {
    (byChild.get(anchorPersonId) ?? []).forEach(family => {
      addExistingPeople(visiblePersonIds, family.children, graph.people);
    });
  }

  if (filter.includeAnchorPartners) {
    (byPartner.get(anchorPersonId) ?? []).forEach(family => {
      addExistingPeople(visiblePersonIds, family.partners, graph.people);
    });
  }

  const descendants = [{ personId: anchorPersonId, depth: 0 }];
  const visitedDescendants = new Set();
  while (descendants.length) {
    const current = descendants.shift();
    if (visitedDescendants.has(current.personId) || current.depth >= filter.descendantDepth) continue;
    visitedDescendants.add(current.personId);
    (byPartner.get(current.personId) ?? []).forEach(family => {
      if (current.depth > 0 && filter.includeDescendantPartners) {
        addExistingPeople(visiblePersonIds, family.partners, graph.people);
      }
      family.children.forEach(childId => {
        if (!graph.people[childId]) return;
        visiblePersonIds.add(childId);
        descendants.push({ personId: childId, depth: current.depth + 1 });
      });
    });
  }

  return visiblePersonIds;
}

export function applyRelationshipFilter(graph, filter) {
  if (!filter || filter.preset === 'full') return graph;

  const visiblePersonIds = relationshipFilterPersonIds(graph, filter);
  const people = Object.fromEntries(
    [...visiblePersonIds].map(id => [id, graph.people[id]])
  );
  const families = graph.families
    .map(family => ({
      ...family,
      partners: family.partners.filter(id => visiblePersonIds.has(id)),
      children: family.children.filter(id => visiblePersonIds.has(id))
    }))
    .filter(family => (
      family.partners.length > 1
      || (family.partners.length > 0 && family.children.length > 0)
    ));

  return { ...graph, people, families };
}
