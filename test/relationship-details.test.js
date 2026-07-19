import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChildrenDetails,
  buildPartnershipDetails
} from '../src/relationship-details.js';

const citation = { id: 'S1', page: '12', record: { title: 'Register' } };
const graph = {
  people: {
    I1: { id: 'I1', name: 'Ada LOVELACE' },
    I2: { id: 'I2', name: 'William KING' },
    I3: { id: 'I3', name: 'Byron KING' },
    I4: { id: 'I4', name: 'Anne KING' }
  },
  families: [{
    id: 'F1',
    partners: ['I1', 'I2'],
    children: ['I3', 'I4'],
    marriage: '8 JUL 1835',
    divorce: '', separation: '', annulment: '',
    events: [{
      tag: 'MARR', label: 'Marriage', date: '8 JUL 1835', place: 'London', value: '',
      notes: [{ text: 'Witnessed by family.', sources: [] }], sources: [citation]
    }],
    notes: [{ text: 'Family note.', sources: [] }],
    sources: [], media: [], record: { uid: 'family-uid', changed: '1 JAN 2020' }
  }]
};

test('builds attributed partnership details from the family record', () => {
  const details = buildPartnershipDetails(graph, 'F1');
  assert.equal(details.title, 'Ada LOVELACE & William KING');
  assert.deepEqual(details.partners.map(person => person.id), ['I1', 'I2']);
  assert.deepEqual(details.children.map(person => person.id), ['I3', 'I4']);
  assert.deepEqual(details.events[0], {
    label: 'Marriage', date: '8 JUL 1835', place: 'London', value: '',
    notes: [{ text: 'Witnessed by family.', sources: [] }]
  });
  assert.deepEqual(details.sources, [citation]);
  assert.equal(details.record.uid, 'family-uid');
});

test('builds a child-branch view with selectable children', () => {
  assert.deepEqual(buildChildrenDetails(graph, 'F1'), {
    familyId: 'F1',
    title: 'Children of Ada LOVELACE & William KING',
    partners: [graph.people.I1, graph.people.I2],
    children: [graph.people.I3, graph.people.I4]
  });
});
