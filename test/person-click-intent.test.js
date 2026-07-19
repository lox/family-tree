import test from 'node:test';
import assert from 'node:assert/strict';

import { personClickIntent } from '../src/person-click-intent.js';

test('defers the first pointer click while opening the inspector could move the card', () => {
  assert.equal(personClickIntent(1, { inspectorOpen: false }), 'defer-selection');
});

test('selects immediately when the inspector is already open', () => {
  assert.equal(personClickIntent(1, { inspectorOpen: true }), 'select');
});

test('uses the second pointer click to open the family branch', () => {
  assert.equal(personClickIntent(2, { inspectorOpen: true }), 'open-family-branch');
});

test('keeps keyboard-generated clicks immediate', () => {
  assert.equal(personClickIntent(0), 'select');
});
