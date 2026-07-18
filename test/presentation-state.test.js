import test from 'node:test';
import assert from 'node:assert/strict';

import { projectFamilyForest } from '../src/layout-engine.js';
import {
  ancestralEndpointIds,
  computeRelationshipPath,
  selectionAfterTreeClick,
  toggleConnectionSelection
} from '../src/presentation-state.js';

const people = Object.fromEntries('ABCDELM'.split('').map(id => [id, { id, name: id }]));
const graph = {
  people,
  families: [
    { id: 'F0', partners: ['A', 'B'], children: ['C'], marriage: '' },
    { id: 'F1', partners: ['C', 'D'], children: ['L'], marriage: '' },
    { id: 'F2', partners: ['C', 'E'], children: ['M'], marriage: '' }
  ]
};
const projection = projectFamilyForest(graph);

test('clears the selected person when the tree background is clicked', () => {
  assert.equal(selectionAfterTreeClick('L'), 'L');
  assert.equal(selectionAfterTreeClick(), '');
});

test('toggles a routed connection without disturbing other emphasized lines', () => {
  const first = toggleConnectionSelection(new Set(['child:F0']), 'union:F1');
  const second = toggleConnectionSelection(first, 'child:F0');

  assert.deepEqual([...first], ['child:F0', 'union:F1']);
  assert.deepEqual([...second], ['union:F1']);
});

test('identifies partnered people with no recorded parent family as ancestral endpoints', () => {
  const endpointGraph = {
    people: Object.fromEntries('ABCDELMXY'.split('').map(id => [id, { id, name: id }])),
    families: [
      ...graph.families,
      { id: 'F3', partners: ['X', 'Y'], children: ['A'], marriage: '' }
    ]
  };
  const endpointProjection = projectFamilyForest(endpointGraph);

  assert.deepEqual([...ancestralEndpointIds(endpointProjection)].sort(), ['B', 'D', 'E', 'X', 'Y']);
});

test('keeps the tree neutral when a starting-family person is selected', () => {
  const state = computeRelationshipPath(projection, 'A');

  assert.equal(state.active, false);
  assert.deepEqual([...state.personIds], ['A']);
  assert.deepEqual([...state.unitIds], ['root:F0']);
  assert.deepEqual([...state.familyIds], ['F0']);
  assert.deepEqual([...state.unionFamilyIds], ['F0']);
  assert.deepEqual([...state.parentageFamilyIds], []);
});

test('highlights only the relationship path to a selected descendant', () => {
  const state = computeRelationshipPath(projection, 'L');

  assert.equal(state.active, true);
  assert.deepEqual([...state.unitIds], ['person:L', 'person:C', 'root:F0']);
  assert.deepEqual([...state.familyIds], ['F1', 'F0']);
  assert.deepEqual([...state.unionFamilyIds], ['F1', 'F0']);
  assert.deepEqual([...state.parentageFamilyIds], ['F1', 'F0']);
  assert.deepEqual([...state.parentageEdgeIds], ['F1:L', 'F0:C']);
  assert.deepEqual([...state.personIds], ['L', 'C', 'D', 'A', 'B']);
  assert.ok(!state.personIds.has('E'));
  assert.ok(!state.familyIds.has('F2'));
});

test('traces a selected non-anchor partner through their own parents', () => {
  const partnerGraph = {
    people: Object.fromEntries('ABCDELMXY'.split('').map(id => [id, { id, name: id }])),
    families: [
      ...graph.families,
      { id: 'F3', partners: ['X', 'Y'], children: ['D'], marriage: '' }
    ]
  };
  const partnerProjection = projectFamilyForest(partnerGraph);
  const state = computeRelationshipPath(partnerProjection, 'D');

  assert.deepEqual([...state.familyIds], ['F1', 'F3']);
  assert.deepEqual([...state.unionFamilyIds], ['F1', 'F3']);
  assert.deepEqual([...state.parentageFamilyIds], ['F3']);
  assert.deepEqual([...state.parentageEdgeIds], ['F3:D']);
  assert.deepEqual([...state.personIds], ['D', 'C', 'X', 'Y']);
  assert.ok(!state.personIds.has('A'));
  assert.ok(!state.personIds.has('B'));
  assert.ok(!state.personIds.has('E'));
  assert.ok(!state.familyIds.has('F2'));
  assert.ok(!state.familyIds.has('F0'));
});

test('traces a selected starting-family partner to their own parent family', () => {
  const connectedGraph = {
    people: Object.fromEntries('ABCDELMXYUV'.split('').map(id => [id, { id, name: id }])),
    families: [
      ...graph.families,
      { id: 'F3', partners: ['X', 'Y'], children: ['A'], marriage: '' },
      { id: 'F4', partners: ['U', 'V'], children: ['B'], marriage: '' }
    ]
  };
  const connectedProjection = projectFamilyForest(connectedGraph);
  const rootUnit = connectedProjection.units.find(unit => unit.id === connectedProjection.rootUnitId);
  const state = computeRelationshipPath(connectedProjection, 'B');

  assert.equal(rootUnit.generation, 1);
  assert.equal(state.active, true);
  assert.deepEqual([...state.parentageFamilyIds], ['F4']);
  assert.deepEqual([...state.parentageEdgeIds], ['F4:B']);
  assert.ok(state.personIds.has('U'));
  assert.ok(state.personIds.has('V'));
  assert.ok(!state.parentageFamilyIds.has('F3'));
  assert.ok(!state.personIds.has('X'));
  assert.ok(!state.personIds.has('Y'));
});
