import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSelectionHistoryState,
  selectionFromHistoryState,
  selectionAfterShiftClick,
  validatedSelection
} from '../src/navigation-state.js';

const people = { I1: { id: 'I1' }, I2: { id: 'I2' } };
const graph = { people, families: [{ id: 'F1' }] };

test('round trips person, partnership, and children selections', () => {
  for (const selection of [
    { type: 'person', personId: 'I1' },
    { type: 'comparison', personIds: ['I1', 'I2'] },
    { type: 'partnership', familyId: 'F1' },
    { type: 'children', familyId: 'F1' },
    { type: 'none' }
  ]) {
    const state = createSelectionHistoryState('tree-a', selection);
    assert.deepEqual(selectionFromHistoryState(state, 'tree-a', graph), selection);
  }
});

test('rejects stale or malformed relationship selections', () => {
  assert.deepEqual(selectionFromHistoryState(
    createSelectionHistoryState('tree-b', { type: 'partnership', familyId: 'F1' }),
    'tree-a', graph
  ), { type: 'none' });
  assert.deepEqual(selectionFromHistoryState(
    createSelectionHistoryState('tree-a', { type: 'children', familyId: 'UNKNOWN' }),
    'tree-a', graph
  ), { type: 'none' });
  assert.deepEqual(selectionFromHistoryState(
    createSelectionHistoryState('tree-a', { type: 'comparison', personIds: ['I1', 'UNKNOWN'] }),
    'tree-a', graph
  ), { type: 'none' });
});

test('adds or replaces a comparison person relative to the primary selection', () => {
  assert.deepEqual(selectionAfterShiftClick({ type: 'person', personId: 'I1' }, 'I2'), {
    type: 'comparison', personIds: ['I1', 'I2']
  });
  assert.deepEqual(selectionAfterShiftClick(
    { type: 'comparison', personIds: ['I1', 'I2'] }, 'I3'
  ), { type: 'comparison', personIds: ['I1', 'I3'] });
  assert.deepEqual(selectionAfterShiftClick(
    { type: 'comparison', personIds: ['I1', 'I2'] }, 'I1'
  ), { type: 'person', personId: 'I1' });
  assert.deepEqual(selectionAfterShiftClick({ type: 'none' }, 'I2'), {
    type: 'person', personId: 'I2'
  });
});

test('validates selections without wrapping them in browser history state', () => {
  assert.deepEqual(validatedSelection({ type: 'person', personId: 'I2' }, graph), {
    type: 'person', personId: 'I2'
  });
  assert.deepEqual(validatedSelection({ type: 'person', personId: 'UNKNOWN' }, graph), {
    type: 'none'
  });
});
