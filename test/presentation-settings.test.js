import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPresentationSettings,
  parsePresentationSettings,
  serializePresentationSettings,
  updatePresentationSettings
} from '../src/presentation-settings.js';

test('keeps sex colours opt-in and ignores unsupported saved values', () => {
  assert.deepEqual(createPresentationSettings(), { colorBySex: false });
  assert.deepEqual(createPresentationSettings({ colorBySex: 'yes' }), { colorBySex: false });
  assert.deepEqual(createPresentationSettings({ colorBySex: true, unknown: true }), { colorBySex: true });
});

test('updates and round-trips presentation settings', () => {
  const enabled = updatePresentationSettings(createPresentationSettings(), {
    type: 'set-sex-colors',
    enabled: true
  });
  const serialized = serializePresentationSettings(enabled);

  assert.equal(serialized, '{"colorBySex":true}');
  assert.deepEqual(parsePresentationSettings(serialized), enabled);
});

test('reports malformed saved settings clearly', () => {
  assert.throws(
    () => parsePresentationSettings('{broken'),
    /Could not read saved presentation settings/
  );
});
