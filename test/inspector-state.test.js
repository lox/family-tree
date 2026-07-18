import test from 'node:test';
import assert from 'node:assert/strict';

import { createInspectorState, updateInspectorState } from '../src/inspector-state.js';

test('switches one inspector pane between right and bottom docks', () => {
  const initial = createInspectorState();
  const bottom = updateInspectorState(initial, { type: 'toggle-dock' });
  const right = updateInspectorState(bottom, { type: 'toggle-dock' });

  assert.equal(bottom.dock, 'bottom');
  assert.equal(right.dock, 'right');
  assert.equal(bottom.rightSize, initial.rightSize);
  assert.equal(right.bottomSize, initial.bottomSize);
});

test('resizes each dock independently and clamps the requested size', () => {
  const initial = createInspectorState();
  const wider = updateInspectorState(initial, {
    type: 'resize',
    dock: 'right',
    size: 420,
    min: 260,
    max: 500
  });
  const clamped = updateInspectorState(wider, {
    type: 'resize',
    dock: 'bottom',
    size: 900,
    min: 160,
    max: 360
  });

  assert.equal(wider.rightSize, 420);
  assert.equal(wider.bottomSize, initial.bottomSize);
  assert.equal(clamped.bottomSize, 360);
  assert.equal(clamped.rightSize, 420);
});
