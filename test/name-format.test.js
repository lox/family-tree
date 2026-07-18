import test from 'node:test';
import assert from 'node:assert/strict';

import { cardNameBaselines, formatCardName } from '../src/name-format.js';

test('keeps genealogical suffixes with the surname', () => {
  assert.deepEqual(
    formatCardName('John Fitzgerald KENNEDY Jr.'),
    ['John Fitzgerald', 'KENNEDY Jr.']
  );
  assert.deepEqual(
    formatCardName('Robert Sargent SHRIVER III'),
    ['Robert Sargent', 'SHRIVER III']
  );
});

test('wraps long given names before preserving the surname on a final line', () => {
  assert.deepEqual(
    formatCardName('Anthony Paul Kennedy SHRIVER'),
    ['Anthony Paul', 'Kennedy', 'SHRIVER']
  );
  assert.deepEqual(
    formatCardName('Christopher Sargent SHRIVER'),
    ['Christopher', 'Sargent', 'SHRIVER']
  );
});

test('balances three name lines without reducing the card top inset', () => {
  assert.deepEqual(cardNameBaselines(1), [27]);
  assert.deepEqual(cardNameBaselines(2), [20, 35]);
  assert.deepEqual(cardNameBaselines(3), [18, 29, 40]);
});
