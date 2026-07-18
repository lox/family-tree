import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPresentationSettings,
  parsePresentationSettings,
  serializePresentationSettings,
  updatePresentationSettings
} from '../src/presentation-settings.js';

test('keeps sex colours opt-in and ignores unsupported saved values', () => {
  assert.deepEqual(createPresentationSettings(), { colorBySex: false, cardScale: 1 });
  assert.deepEqual(createPresentationSettings({ colorBySex: 'yes', cardScale: 'large' }), {
    colorBySex: false,
    cardScale: 1
  });
  assert.deepEqual(createPresentationSettings({ colorBySex: true, cardScale: 1.2, unknown: true }), {
    colorBySex: true,
    cardScale: 1.2
  });
});

test('updates and round-trips presentation settings', () => {
  const enabled = updatePresentationSettings(createPresentationSettings(), {
    type: 'set-sex-colors',
    enabled: true
  });
  const serialized = serializePresentationSettings(enabled);

  assert.equal(serialized, '{"colorBySex":true,"cardScale":1}');
  assert.deepEqual(parsePresentationSettings(serialized), enabled);
});

test('updates card scale in bounded presentation steps', () => {
  const initial = createPresentationSettings();
  const enlarged = updatePresentationSettings(initial, {
    type: 'set-card-scale',
    scale: 1.2
  });
  const clamped = updatePresentationSettings(enlarged, {
    type: 'set-card-scale',
    scale: 2
  });

  assert.equal(enlarged.cardScale, 1.2);
  assert.equal(clamped.cardScale, 1.3);
  assert.deepEqual(parsePresentationSettings(serializePresentationSettings(enlarged)), enlarged);
});

test('reports malformed saved settings clearly', () => {
  assert.throws(
    () => parsePresentationSettings('{broken'),
    /Could not read saved presentation settings/
  );
});
