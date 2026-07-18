import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPersonHistoryState,
  personIdFromHistoryState
} from '../src/navigation-state.js';

const people = { I1: { id: 'I1' }, I2: { id: 'I2' } };

test('creates history state without changing the visible URL', () => {
  assert.deepEqual(createPersonHistoryState('tree-a', 'I1'), {
    type: 'family-tree-person', treeId: 'tree-a', personId: 'I1'
  });
  assert.equal(createPersonHistoryState('tree-a', '').personId, '');
});

test('only restores people belonging to the current in-memory tree', () => {
  assert.equal(personIdFromHistoryState(
    createPersonHistoryState('tree-a', 'I2'), 'tree-a', people
  ), 'I2');
  assert.equal(personIdFromHistoryState(
    createPersonHistoryState('tree-b', 'I2'), 'tree-a', people
  ), '');
  assert.equal(personIdFromHistoryState(
    createPersonHistoryState('tree-a', 'UNKNOWN'), 'tree-a', people
  ), '');
  assert.equal(personIdFromHistoryState(null, 'tree-a', people), '');
});
