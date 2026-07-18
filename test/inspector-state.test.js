import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInspectorState,
  defaultInspectorDock,
  updateInspectorState
} from '../src/inspector-state.js';

test('defaults mobile displays to the bottom dock', () => {
  assert.equal(defaultInspectorDock(599), 'bottom');
  assert.equal(defaultInspectorDock(600), 'bottom');
  assert.equal(defaultInspectorDock(601), 'right');
});

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

test('keeps an opened inspector visible when selection clears until explicitly closed', () => {
  const initial = createInspectorState();
  const opened = updateInspectorState(initial, { type: 'open' });
  const deselected = updateInspectorState(opened, { type: 'deselect-person' });
  const closed = updateInspectorState(deselected, { type: 'close' });

  assert.equal(initial.open, false);
  assert.equal(opened.open, true);
  assert.equal(deselected.open, true);
  assert.equal(closed.open, false);
});
