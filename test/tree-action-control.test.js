import test from 'node:test';
import assert from 'node:assert/strict';

import { createTreeActionControl } from '../src/tree-action-control.js';

function fixture() {
  return {
    fileControl: { hidden: false },
    shareTrigger: { hidden: true }
  };
}

test('shows Import for the bundled sample', () => {
  const elements = fixture();

  createTreeActionControl(elements);

  assert.equal(elements.fileControl.hidden, false);
  assert.equal(elements.shareTrigger.hidden, true);
});

test('replaces Import with Share for an imported or shared tree', () => {
  const imported = fixture();
  const importedControl = createTreeActionControl(imported);
  importedControl.showShare();

  assert.equal(imported.fileControl.hidden, true);
  assert.equal(imported.shareTrigger.hidden, false);

  const shared = fixture();
  createTreeActionControl({ ...shared, initiallyShareable: true });

  assert.equal(shared.fileControl.hidden, true);
  assert.equal(shared.shareTrigger.hidden, false);
});
