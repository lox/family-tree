import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRelationshipFilter,
  createCustomRelationshipFilter,
  createRelationshipFilter,
  relationshipFilterAnchorPersonId,
  relationshipFilterPersonIds
} from '../src/relationship-filter.js';

const people = Object.fromEntries([
  'FOCUS', 'MOTHER', 'FATHER', 'GRANDPARENT', 'SIBLING', 'PARTNER',
  'PARTNER_CHILD', 'CHILD', 'CHILD_PARTNER', 'GRANDCHILD'
].map(id => [id, { id, name: id }]));

const graph = {
  people,
  families: [
    { id: 'PARENTS', partners: ['MOTHER', 'FATHER'], children: ['FOCUS', 'SIBLING'] },
    { id: 'GRANDPARENTS', partners: ['GRANDPARENT'], children: ['MOTHER'] },
    { id: 'FOCUS_FAMILY', partners: ['FOCUS', 'PARTNER'], children: ['CHILD'] },
    { id: 'PARTNER_OTHER_FAMILY', partners: ['PARTNER'], children: ['PARTNER_CHILD'] },
    { id: 'CHILD_FAMILY', partners: ['CHILD', 'CHILD_PARTNER'], children: ['GRANDCHILD'] }
  ],
  diagnostics: { warnings: [] }
};

test('the family preset keeps parents, anchor partners, and children only', () => {
  const filter = createRelationshipFilter('FOCUS', 'family');
  assert.deepEqual([...relationshipFilterPersonIds(graph, filter)].sort(), [
    'CHILD', 'FATHER', 'FOCUS', 'MOTHER', 'PARTNER'
  ]);
});

test('the immediate preset includes siblings but stops after children', () => {
  const filter = createRelationshipFilter('FOCUS', 'immediate');
  assert.deepEqual([...relationshipFilterPersonIds(graph, filter)].sort(), [
    'CHILD', 'FATHER', 'FOCUS', 'MOTHER', 'PARTNER', 'SIBLING'
  ]);
});

test('ancestor and descendant depth are independently configurable', () => {
  const filter = {
    ...createRelationshipFilter('FOCUS', 'family'),
    ancestorDepth: Infinity,
    descendantDepth: 2,
    includeDescendantPartners: true
  };
  assert.deepEqual([...relationshipFilterPersonIds(graph, filter)].sort(), [
    'CHILD', 'CHILD_PARTNER', 'FATHER', 'FOCUS', 'GRANDCHILD',
    'GRANDPARENT', 'MOTHER', 'PARTNER'
  ]);
});

test('filtered families omit hidden relatives while preserving graph metadata', () => {
  const focused = applyRelationshipFilter(graph, createRelationshipFilter('FOCUS', 'family'));

  assert.deepEqual(Object.keys(focused.people).sort(), [
    'CHILD', 'FATHER', 'FOCUS', 'MOTHER', 'PARTNER'
  ]);
  assert.deepEqual(focused.families.map(family => ({
    id: family.id,
    partners: family.partners,
    children: family.children
  })), [
    { id: 'PARENTS', partners: ['MOTHER', 'FATHER'], children: ['FOCUS'] },
    { id: 'FOCUS_FAMILY', partners: ['FOCUS', 'PARTNER'], children: ['CHILD'] }
  ]);
  assert.equal(focused.diagnostics, graph.diagnostics);
});

test('the full preset leaves the graph untouched', () => {
  assert.equal(
    applyRelationshipFilter(graph, createRelationshipFilter('FOCUS', 'full')),
    graph
  );
});

test('custom sibling filters retain the parent generation that establishes the relationship', () => {
  const filter = createCustomRelationshipFilter('FOCUS', {
    ancestorDepth: 0,
    descendantDepth: 0,
    includeAnchorPartners: false,
    includeSiblings: true,
    includeDescendantPartners: false
  });

  assert.equal(filter.ancestorDepth, 1);
  assert.equal(filter.preset, 'custom');
});

test('full-tree controls follow selection while active filters retain their anchor', () => {
  assert.equal(
    relationshipFilterAnchorPersonId(createRelationshipFilter('FOCUS', 'full'), 'CHILD'),
    'CHILD'
  );
  assert.equal(
    relationshipFilterAnchorPersonId(createRelationshipFilter('FOCUS', 'family'), 'CHILD'),
    'FOCUS'
  );
});
