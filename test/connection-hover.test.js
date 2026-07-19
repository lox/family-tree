import test from 'node:test';
import assert from 'node:assert/strict';

import {
  claimConnectionFocus,
  updateConnectionHover
} from '../src/connection-hover.js';

test('exposes only the first rendered segment of a relationship to keyboard focus', () => {
  const claimed = new Set();

  assert.equal(claimConnectionFocus(claimed, 'child:F1'), true);
  assert.equal(claimConnectionFocus(claimed, 'child:F1'), false);
  assert.equal(claimConnectionFocus(claimed, 'union:F1'), true);
});

test('keeps one routed relationship hovered while moving between its segments', () => {
  assert.equal(updateConnectionHover('', { type: 'enter', key: 'child:F1' }), 'child:F1');
  assert.equal(updateConnectionHover('child:F1', {
    type: 'leave', key: 'child:F1', nextKey: 'child:F1'
  }), 'child:F1');
});

test('moves or clears relationship hover when the pointer leaves the connection', () => {
  assert.equal(updateConnectionHover('child:F1', {
    type: 'leave', key: 'child:F1', nextKey: 'union:F1'
  }), 'union:F1');
  assert.equal(updateConnectionHover('child:F1', {
    type: 'leave', key: 'child:F1', nextKey: ''
  }), '');
});
