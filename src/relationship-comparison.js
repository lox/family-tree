const edgeCost = type => type === 'partner' ? 2 : 1;

function addEdge(adjacency, fromId, toId, type, familyId) {
  if (!adjacency.has(fromId)) adjacency.set(fromId, []);
  if (!adjacency.get(fromId).some(edge => (
    edge.toId === toId && edge.type === type && edge.familyId === familyId
  ))) adjacency.get(fromId).push({ fromId, toId, type, familyId });
}

function relationshipAdjacency(graph) {
  const adjacency = new Map(Object.keys(graph.people).map(personId => [personId, []]));
  graph.families.forEach(family => {
    family.partners.forEach((personId, index) => {
      family.partners.slice(index + 1).forEach(otherId => {
        addEdge(adjacency, personId, otherId, 'partner', family.id);
        addEdge(adjacency, otherId, personId, 'partner', family.id);
      });
      family.children.forEach(childId => {
        addEdge(adjacency, personId, childId, 'child', family.id);
        addEdge(adjacency, childId, personId, 'parent', family.id);
      });
    });
  });
  adjacency.forEach(edges => edges.sort((left, right) => (
    edgeCost(left.type) - edgeCost(right.type)
    || left.toId.localeCompare(right.toId)
    || left.familyId.localeCompare(right.familyId)
  )));
  return adjacency;
}

const routeOrder = (left, right) => (
  left.cost - right.cost
  || left.steps.length - right.steps.length
  || left.personIds.join('\0').localeCompare(right.personIds.join('\0'))
);

export function findRelationshipPath(graph, fromId, toId) {
  if (!graph.people[fromId] || !graph.people[toId]) return null;
  if (fromId === toId) return { personIds: [fromId], steps: [], cost: 0 };
  const adjacency = relationshipAdjacency(graph);
  const queue = [{ personIds: [fromId], steps: [], cost: 0 }];
  const best = new Map([[fromId, { cost: 0, hops: 0 }]]);

  while (queue.length) {
    queue.sort(routeOrder);
    const current = queue.shift();
    const currentId = current.personIds.at(-1);
    if (currentId === toId) return current;
    for (const edge of adjacency.get(currentId) ?? []) {
      if (current.personIds.includes(edge.toId)) continue;
      const candidate = {
        personIds: [...current.personIds, edge.toId],
        steps: [...current.steps, edge],
        cost: current.cost + edgeCost(edge.type)
      };
      const previous = best.get(edge.toId);
      if (
        previous
        && (previous.cost < candidate.cost
          || (previous.cost === candidate.cost && previous.hops <= candidate.steps.length))
      ) continue;
      best.set(edge.toId, { cost: candidate.cost, hops: candidate.steps.length });
      queue.push(candidate);
    }
  }
  return null;
}

export function relationshipConnectionKeys(path) {
  const keys = new Set();
  path?.steps.forEach(step => keys.add(
    `${step.type === 'partner' ? 'union' : 'child'}:${step.familyId}`
  ));
  return keys;
}

function relationshipLabel(step, graph) {
  const person = graph.people[step.toId];
  const sex = String(person?.sex ?? '').toUpperCase();
  if (step.type === 'parent') return sex === 'F' ? 'mother' : sex === 'M' ? 'father' : 'parent';
  if (step.type === 'child') return sex === 'F' ? 'daughter' : sex === 'M' ? 'son' : 'child';
  return 'partner';
}

const sexedTerm = (sex, female, male, neutral) => {
  const value = String(sex ?? '').toUpperCase();
  return value === 'F' ? female : value === 'M' ? male : neutral;
};

const greatTerm = (count, root) => `${'great-'.repeat(Math.max(0, count))}${root}`;

const ordinal = value => {
  const words = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  if (words[value]) return words[value];
  const remainder = value % 100;
  const suffix = remainder >= 11 && remainder <= 13
    ? 'th'
    : value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th';
  return `${value}${suffix}`;
};

const removed = distance => distance === 0
  ? ''
  : distance === 1 ? ' once removed' : distance === 2 ? ' twice removed' : ` ${distance} times removed`;

function bloodPathShape(steps) {
  if (steps.some(step => step.type === 'partner')) return null;
  let up = 0;
  let down = 0;
  let descending = false;
  for (const step of steps) {
    if (step.type === 'parent' && !descending) {
      up += 1;
    } else if (step.type === 'child') {
      descending = true;
      down += 1;
    } else {
      return null;
    }
  }
  return { up, down };
}

function kinshipTerm(shape, person) {
  if (!shape) return null;
  const { up, down } = shape;
  if (up === 0 && down === 0) return 'self';
  if (up === 0) {
    if (down === 1) return sexedTerm(person.sex, 'daughter', 'son', 'child');
    return greatTerm(down - 2, sexedTerm(person.sex, 'granddaughter', 'grandson', 'grandchild'));
  }
  if (down === 0) {
    if (up === 1) return sexedTerm(person.sex, 'mother', 'father', 'parent');
    return greatTerm(up - 2, sexedTerm(person.sex, 'grandmother', 'grandfather', 'grandparent'));
  }
  if (up === 1 && down === 1) return sexedTerm(person.sex, 'sister', 'brother', 'sibling');
  if (up === 1) {
    return greatTerm(down - 2, sexedTerm(person.sex, 'niece', 'nephew', 'nibling'));
  }
  if (down === 1) {
    return greatTerm(up - 2, sexedTerm(person.sex, 'aunt', 'uncle', 'parent’s sibling'));
  }
  return `${ordinal(Math.min(up, down) - 1)} cousin${removed(Math.abs(up - down))}`;
}

const possessive = name => `${name}${name.endsWith('s') ? '’' : '’s'}`;
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1);

function relationshipKind(shape) {
  if (!shape) return 'recorded';
  if (shape.up === 0 || shape.down === 0) return 'direct';
  if (shape.up === 1 && shape.down === 1) return 'sibling';
  if (shape.up > 1 && shape.down > 1) return 'cousin';
  return 'avuncular';
}

function relationshipDescription(path, from, to) {
  const shape = bloodPathShape(path.steps);
  const kind = relationshipKind(shape);
  if (!shape) {
    if (path.steps.length === 1 && path.steps[0].type === 'partner') {
      return {
        kind: 'partner',
        forward: `${to.name} is ${possessive(from.name)} partner`,
        reverse: `${from.name} is ${possessive(to.name)} partner`
      };
    }
    const statement = `${from.name} and ${to.name} are connected through recorded family relationships`;
    return { kind, forward: statement, reverse: statement };
  }
  const forwardTerm = kinshipTerm(shape, to);
  const reverseTerm = kinshipTerm({ up: shape.down, down: shape.up }, from);
  return {
    kind,
    forwardTerm,
    reverseTerm,
    forward: `${to.name} is ${possessive(from.name)} ${forwardTerm}`,
    reverse: `${from.name} is ${possessive(to.name)} ${reverseTerm}`
  };
}

function comparisonSummary(relationship, linkCount) {
  const suffix = `${linkCount} recorded ${linkCount === 1 ? 'link' : 'links'}`;
  if (relationship.kind === 'direct') return `Direct descent · ${linkCount} ${linkCount === 1 ? 'generation' : 'generations'} apart`;
  if (relationship.kind === 'sibling') return `Siblings · ${suffix}`;
  if (relationship.kind === 'cousin') {
    const cousins = relationship.forwardTerm.replace(' cousin', ' cousins');
    return `${capitalize(cousins)} · ${suffix}`;
  }
  if (relationship.kind === 'partner') return `Partners · ${suffix}`;
  if (relationship.kind === 'avuncular') return `${capitalize(relationship.forwardTerm)} · ${suffix}`;
  return `Recorded family connection · ${suffix}`;
}

function comparisonLineage(path, graph) {
  return path.personIds.map((personId, index) => {
    const person = graph.people[personId];
    if (index === 0) return { person, relationship: 'Reference person' };
    const prefix = path.steps.slice(0, index);
    const term = kinshipTerm(bloodPathShape(prefix), person);
    return { person, relationship: term ?? (prefix.length === 1 && prefix[0].type === 'partner' ? 'partner' : 'Recorded connection') };
  });
}

export function buildRelationshipComparison(graph, fromId, toId) {
  const endpoints = [graph.people[fromId], graph.people[toId]].filter(Boolean);
  const title = endpoints.map(person => person.name).join(' & ');
  const path = findRelationshipPath(graph, fromId, toId);
  if (!path) {
    return {
      connected: false,
      title,
      summary: 'No relationship path is recorded in this tree',
      people: endpoints,
      lineage: endpoints.map((person, index) => ({
        person,
        relationship: index === 0 ? 'Reference person' : 'No recorded connection'
      })),
      steps: [],
      connectionKeys: new Set()
    };
  }
  const people = path.personIds.map(personId => graph.people[personId]);
  const relationship = relationshipDescription(path, people[0], people.at(-1));
  return {
    connected: true,
    title,
    summary: comparisonSummary(relationship, path.steps.length),
    relationship,
    people,
    lineage: comparisonLineage(path, graph),
    steps: path.steps.map(step => ({
      ...step,
      label: relationshipLabel(step, graph),
      from: graph.people[step.fromId],
      to: graph.people[step.toId]
    })),
    connectionKeys: relationshipConnectionKeys(path)
  };
}
