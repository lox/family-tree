import test from 'node:test';
import assert from 'node:assert/strict';

import { roundedPath } from '../src/svg-rendering.js';

test('rounds connection corners without moving the route endpoints', () => {
  assert.equal(
    roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 2),
    'M 0 0 L 8 0 Q 10 0 10 2 L 10 10'
  );
});

test('keeps short and empty routes deterministic', () => {
  assert.equal(roundedPath([]), '');
  assert.equal(roundedPath([{ x: 4, y: 5 }]), '');
});
