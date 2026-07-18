import test from 'node:test';
import assert from 'node:assert/strict';

import { relationshipPeriod } from '../src/relationship-period.js';

const people = {
  A: { id: 'A', death: '22 NOV 1963' },
  B: { id: 'B', death: '19 MAY 1994' }
};

test('uses an explicit divorce date instead of a later partner death', () => {
  const period = relationshipPeriod({
    partners: ['A', 'B'],
    marriage: '12 SEP 1953',
    divorce: '6 DEC 1960'
  }, people);

  assert.deepEqual(period, {
    label: '1953–1960',
    title: 'Married 12 SEP 1953 · Divorced 6 DEC 1960',
    endReason: 'divorce'
  });
});

test('labels a recorded separation without implying a divorce', () => {
  const period = relationshipPeriod({
    partners: ['A', 'B'],
    marriage: '26 APR 1986',
    separation: '9 MAY 2011'
  }, people);

  assert.deepEqual(period, {
    label: '1986–2011',
    title: 'Married 26 APR 1986 · Separated 9 MAY 2011',
    endReason: 'separation'
  });
});

test('infers the end of a marriage from the earliest recorded partner death', () => {
  const period = relationshipPeriod({
    partners: ['A', 'B'],
    marriage: '12 SEP 1953'
  }, people);

  assert.deepEqual(period, {
    label: '1953–1963',
    title: 'Married 12 SEP 1953 · Ended 22 NOV 1963 by death',
    endReason: 'death'
  });
});

test('keeps an open-ended marriage label when no end can be established', () => {
  const period = relationshipPeriod({ partners: ['A'], marriage: '1953' }, {
    A: { id: 'A', death: '' }
  });

  assert.deepEqual(period, {
    label: 'm. 1953',
    title: 'Married 1953',
    endReason: ''
  });
});
