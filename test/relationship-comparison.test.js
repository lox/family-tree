import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRelationshipComparison,
  findRelationshipPath,
  relationshipConnectionKeys
} from '../src/relationship-comparison.js';

const graph = {
  people: {
    I1: { id: 'I1', name: 'Ada', sex: 'F' },
    I2: { id: 'I2', name: 'William', sex: 'M' },
    I3: { id: 'I3', name: 'Byron', sex: 'M' },
    I4: { id: 'I4', name: 'Anne', sex: 'F' },
    I5: { id: 'I5', name: 'Charles', sex: 'M' },
    I6: { id: 'I6', name: 'Unconnected', sex: '' }
  },
  families: [
    { id: 'F1', partners: ['I1', 'I2'], children: ['I3', 'I4'] },
    { id: 'F2', partners: ['I4', 'I5'], children: [] }
  ]
};

test('finds a deterministic typed route through recorded family links', () => {
  const path = findRelationshipPath(graph, 'I3', 'I5');

  assert.deepEqual(path.personIds, ['I3', 'I1', 'I4', 'I5']);
  assert.deepEqual(path.steps.map(step => [step.type, step.familyId]), [
    ['parent', 'F1'], ['child', 'F1'], ['partner', 'F2']
  ]);
  assert.deepEqual([...relationshipConnectionKeys(path)], ['child:F1', 'union:F2']);
});

test('builds a conservative literal relationship chain', () => {
  const comparison = buildRelationshipComparison(graph, 'I3', 'I4');

  assert.equal(comparison.title, 'Byron & Anne');
  assert.equal(comparison.relationship.forward, 'Anne is Byron’s sister');
  assert.equal(comparison.relationship.reverse, 'Byron is Anne’s brother');
  assert.equal(comparison.summary, 'Siblings · 2 recorded links');
  assert.deepEqual(comparison.steps.map(step => step.label), ['mother', 'daughter']);
  assert.deepEqual(comparison.people.map(person => person.id), ['I3', 'I1', 'I4']);
  assert.deepEqual(comparison.lineage.map(entry => entry.relationship), [
    'Reference person', 'mother', 'sister'
  ]);
});

test('names direct descendants and labels every generation from the reference person', () => {
  const directGraph = {
    people: {
      P0: { id: 'P0', name: 'Patrick', sex: 'M' },
      P1: { id: 'P1', name: 'Patrick Joseph', sex: 'M' },
      P2: { id: 'P2', name: 'Joseph Patrick', sex: 'M' },
      P3: { id: 'P3', name: 'Eunice', sex: 'F' },
      P4: { id: 'P4', name: 'Maria', sex: 'F' },
      P5: { id: 'P5', name: 'Christopher', sex: 'M' }
    },
    families: [
      { id: 'D1', partners: ['P0'], children: ['P1'] },
      { id: 'D2', partners: ['P1'], children: ['P2'] },
      { id: 'D3', partners: ['P2'], children: ['P3'] },
      { id: 'D4', partners: ['P3'], children: ['P4'] },
      { id: 'D5', partners: ['P4'], children: ['P5'] }
    ]
  };

  const comparison = buildRelationshipComparison(directGraph, 'P0', 'P5');

  assert.equal(comparison.relationship.forward, 'Christopher is Patrick’s great-great-great-grandson');
  assert.equal(comparison.relationship.reverse, 'Patrick is Christopher’s great-great-great-grandfather');
  assert.equal(comparison.summary, 'Direct descent · 5 generations apart');
  assert.deepEqual(comparison.lineage.map(entry => entry.relationship), [
    'Reference person',
    'son',
    'grandson',
    'great-granddaughter',
    'great-great-granddaughter',
    'great-great-great-grandson'
  ]);
});

test('uses cousin degree and removal only for collateral descendants', () => {
  const cousinGraph = {
    people: Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(id => [
      id, { id, name: id, sex: id === 'H' ? 'F' : 'M' }
    ])),
    families: [
      { id: 'C1', partners: ['A'], children: ['B', 'C'] },
      { id: 'C2', partners: ['B'], children: ['D'] },
      { id: 'C3', partners: ['D'], children: ['E'] },
      { id: 'C4', partners: ['C'], children: ['F'] },
      { id: 'C5', partners: ['F'], children: ['G'] },
      { id: 'C6', partners: ['G'], children: ['H'] }
    ]
  };

  const comparison = buildRelationshipComparison(cousinGraph, 'E', 'H');

  assert.equal(comparison.relationship.forward, 'H is E’s second cousin once removed');
  assert.equal(comparison.relationship.reverse, 'E is H’s second cousin once removed');
  assert.equal(comparison.summary, 'Second cousins once removed · 7 recorded links');
});

test('does not invent a blood relationship for a path through a partner', () => {
  const comparison = buildRelationshipComparison(graph, 'I3', 'I5');

  assert.equal(comparison.relationship.kind, 'recorded');
  assert.equal(comparison.relationship.forward, 'Byron and Charles are connected through recorded family relationships');
});

test('reports when no recorded relationship path connects two people', () => {
  const comparison = buildRelationshipComparison(graph, 'I3', 'I6');

  assert.equal(comparison.connected, false);
  assert.equal(comparison.summary, 'No relationship path is recorded in this tree');
  assert.deepEqual(comparison.steps, []);
});
