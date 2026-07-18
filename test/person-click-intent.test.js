import test from 'node:test';
import assert from 'node:assert/strict';

import { personClickIntent } from '../src/person-click-intent.js';

test('defers the first pointer click so a second click can reuse the same card', () => {
  assert.equal(personClickIntent(1), 'defer-selection');
});

test('uses the second pointer click to open the family branch', () => {
  assert.equal(personClickIntent(2), 'open-family-branch');
});

test('keeps keyboard-generated clicks immediate', () => {
  assert.equal(personClickIntent(0), 'select');
});
