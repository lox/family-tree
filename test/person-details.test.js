import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPersonDetails } from '../src/person-details.js';

test('builds readable detail sections from structured GEDCOM data', () => {
  const graph = {
    people: {
      I1: {
        id: 'I1', name: 'Ada LOVELACE', sex: 'F', birth: '1815', death: '1852',
        aliases: ['Augusta Ada King'], suffix: '', titles: ['Countess'],
        facts: [
          { tag: 'BIRT', label: 'Birth', value: '', date: '1815', place: 'London', notes: [], sources: [] },
          { tag: 'OCCU', label: 'Occupation', value: 'Mathematician', date: '', place: '', notes: [], sources: [] }
        ],
        notes: [{ text: 'Published the first algorithm.', sources: [] }],
        sources: [], media: []
      },
      I2: { id: 'I2', name: 'William King-Noel' },
      I3: { id: 'I3', name: 'Byron King-Noel' }
    },
    families: [{
      id: 'F1', partners: ['I1', 'I2'], children: ['I3'], marriage: '1835',
      divorce: '', separation: '', annulment: '', events: [
        { tag: 'MARR', label: 'Marriage', date: '1835', place: 'London', value: '', notes: [], sources: [] }
      ]
    }]
  };

  const details = buildPersonDetails(graph, 'I1');

  assert.deepEqual(details.personal, [
    ['Sex', 'Female'], ['Also known as', 'Augusta Ada King'], ['Title', 'Countess'], ['Occupation', 'Mathematician']
  ]);
  assert.equal(details.lifeEvents[0].label, 'Birth');
  assert.deepEqual(details.relationships[0], {
    familyId: 'F1',
    partners: ['William King-Noel'],
    children: ['Byron King-Noel'],
    events: [{ label: 'Marriage', date: '1835', place: 'London' }]
  });
  assert.equal(details.notes[0].text, 'Published the first algorithm.');
  assert.equal(details.lifespan, '1815–1852');
});

test('does not imply that a person with no recorded dates is living', () => {
  const graph = {
    people: {
      UNKNOWN: { id: 'UNKNOWN', name: 'Unknown dates' },
      LIVING: { id: 'LIVING', name: 'Living person', birth: '4 JUL 1980' },
      DECEASED: {
        id: 'DECEASED', name: 'Undated death', birth: '4 JUL 1980',
        facts: [
          { tag: 'BIRT', label: 'Birth', date: '4 JUL 1980', place: '', value: '', notes: [], sources: [] },
          { tag: 'DEAT', label: 'Death', date: '', place: '', value: 'Y', notes: [], sources: [] }
        ]
      }
    },
    families: []
  };

  assert.equal(buildPersonDetails(graph, 'UNKNOWN').lifespan, '');
  assert.equal(buildPersonDetails(graph, 'LIVING').lifespan, '1980–Present');
  assert.equal(buildPersonDetails(graph, 'DECEASED').lifespan, '1980–?');
});

test('keeps distinct inline citations that do not have GEDCOM IDs', () => {
  const graph = {
    people: {
      I1: {
        id: 'I1',
        name: 'Cited person',
        sources: [
          { id: '', page: '', record: { title: 'First source', author: 'A' } },
          { id: '', page: '', record: { title: 'Second source', author: 'B' } }
        ]
      }
    },
    families: []
  };

  assert.deepEqual(
    buildPersonDetails(graph, 'I1').sources.map(citation => citation.record.title),
    ['First source', 'Second source']
  );
});

test('includes citations attached to notes inside life events', () => {
  const noteCitation = {
    id: 'S1', page: '42', record: { title: 'Event note source' }
  };
  const graph = {
    people: {
      I1: {
        id: 'I1', name: 'Documented person',
        facts: [{
          tag: 'BIRT', label: 'Birth', value: '', date: '1900', place: '', sources: [],
          notes: [{ text: 'Recorded later.', sources: [noteCitation] }]
        }]
      }
    },
    families: []
  };

  assert.deepEqual(buildPersonDetails(graph, 'I1').sources, [noteCitation]);
});
