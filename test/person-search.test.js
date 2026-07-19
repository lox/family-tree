import test from 'node:test';
import assert from 'node:assert/strict';

import { moveSearchSelection, searchPeople } from '../src/person-search.js';

const people = {
  I1: {
    id: 'I1', name: 'Rose Elizabeth FITZGERALD', aliases: ['Rose Kennedy'],
    birth: '22 JUL 1890', death: '22 JAN 1995', birthPlace: 'Boston, MA'
  },
  I2: {
    id: 'I2', name: 'John Fitzgerald KENNEDY', birth: '29 MAY 1917',
    death: '22 NOV 1963', occupation: '35th President of the United States'
  },
  I3: {
    id: 'I3', name: 'José RIVERA', birth: '1950', birthPlace: 'San Juan, Puerto Rico'
  }
};

test('ranks names ahead of metadata matches and returns useful context', () => {
  assert.deepEqual(
    searchPeople(people, 'fitzgerald').map(result => result.id),
    ['I2', 'I1']
  );

  const occupationMatch = searchPeople(people, 'president')[0];
  assert.equal(occupationMatch.id, 'I2');
  assert.match(occupationMatch.context, /President/);
  assert.equal(occupationMatch.lifespan, '1917–1963');
});

test('searches aliases, places, years, and ignores accents', () => {
  assert.equal(searchPeople(people, 'rose kennedy')[0].id, 'I1');
  assert.equal(searchPeople(people, 'puerto rico')[0].id, 'I3');
  assert.equal(searchPeople(people, '1963')[0].id, 'I2');
  assert.equal(searchPeople(people, 'jose')[0].id, 'I3');
});

test('uses recent people for an empty query and ignores missing IDs', () => {
  assert.deepEqual(
    searchPeople(people, '', { recentIds: ['UNKNOWN', 'I2', 'I1'] }).map(result => result.id),
    ['I2', 'I1']
  );
});

test('can omit the comparison anchor from search results', () => {
  assert.deepEqual(
    searchPeople(people, '', { recentIds: ['I2', 'I1'], excludeIds: ['I2'] })
      .map(result => result.id),
    ['I1']
  );
  assert.deepEqual(
    searchPeople(people, 'fitzgerald', { excludeIds: ['I2'] }).map(result => result.id),
    ['I1']
  );
});

test('moves the active search result with wrapping keyboard navigation', () => {
  assert.equal(moveSearchSelection(-1, 1, 3), 0);
  assert.equal(moveSearchSelection(2, 1, 3), 0);
  assert.equal(moveSearchSelection(0, -1, 3), 2);
  assert.equal(moveSearchSelection(0, 1, 0), -1);
});
