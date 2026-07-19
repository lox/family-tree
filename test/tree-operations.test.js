import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTreeTransaction,
  previewTreeTransaction,
  validateTreeDocument
} from '../src/tree-operations.js';

const document = () => ({
  schemaVersion: 2,
  id: 'tree-1',
  revision: 0,
  people: {
    I1: {
      id: 'I1',
      names: [{ id: 'I1:name:0', type: 'primary', value: 'Ada LOVELACE' }],
      sex: 'F', aliases: [], titles: [], eventIds: ['I1:event:0'], noteIds: [],
      citationIds: [], mediaIds: [], record: { uid: '', changed: '' }
    }
  },
  families: {},
  events: {
    'I1:event:0': {
      id: 'I1:event:0', ownerType: 'person', ownerId: 'I1', tag: 'BIRT', label: 'Birth',
      value: '', date: { original: '10 DEC 1815' }, place: { original: 'London' },
      noteIds: [], citationIds: [], mediaIds: [], origin: { path: [0, 0] }
    }
  },
  notes: {}, citations: {}, sources: {}, media: {},
  editLog: [],
  importMetadata: {
    filename: '',
    diagnostics: { format: {}, counts: {}, warnings: [] },
    gedcom: { syntax: null }
  }
});

test('validates canonical references and rejects dangling event ownership', () => {
  assert.doesNotThrow(() => validateTreeDocument(document()));
  const invalid = document();
  invalid.people.I1.eventIds.push('missing');
  assert.throws(() => validateTreeDocument(invalid), /missing event/i);
});

test('previews a transaction without mutating the document', () => {
  const current = document();
  const transaction = {
    id: 'tx-1', baseRevision: 0,
    provenance: { actor: 'user', input: 'Set birth date to 1816' },
    operations: [{ type: 'event.update', eventId: 'I1:event:0', changes: { date: { original: '1816' } } }]
  };

  const preview = previewTreeTransaction(current, transaction);

  assert.equal(current.events['I1:event:0'].date.original, '10 DEC 1815');
  assert.equal(preview.document.events['I1:event:0'].date.original, '1816');
  assert.equal(preview.document.revision, 1);
  assert.match(preview.summary[0], /Birth.*1816/i);
});

test('applies atomically and returns an inverse transaction for undo', () => {
  const current = document();
  const transaction = {
    id: 'tx-1', baseRevision: 0,
    provenance: { actor: 'assistant', approvedBy: 'user' },
    operations: [
      { type: 'event.update', eventId: 'I1:event:0', changes: { place: { original: 'Melbourne' } } },
      { type: 'note.add', ownerType: 'person', ownerId: 'I1', note: { id: 'note-1', text: 'Family recollection.', citationIds: [] } }
    ]
  };

  const applied = applyTreeTransaction(current, transaction);
  assert.equal(applied.document.revision, 1);
  assert.equal(applied.document.events['I1:event:0'].place.original, 'Melbourne');
  assert.deepEqual(applied.document.people.I1.noteIds, ['note-1']);
  assert.deepEqual(applied.document.editLog[0].provenance, transaction.provenance);

  const undone = applyTreeTransaction(applied.document, applied.inverse);
  assert.equal(undone.document.events['I1:event:0'].place.original, 'London');
  assert.deepEqual(undone.document.people.I1.noteIds, []);
  assert.equal(undone.document.notes['note-1'], undefined);
});

test('accepts validated optional date and place interpretations', () => {
  const current = document();
  const applied = applyTreeTransaction(current, {
    id: 'structured', baseRevision: 0, provenance: { actor: 'user' },
    operations: [{
      type: 'event.update',
      eventId: 'I1:event:0',
      changes: {
        date: {
          original: 'ABT 1815',
          interpretation: {
            kind: 'approximate',
            start: { year: 1815 },
            provenance: 'explicit'
          }
        },
        place: {
          original: 'London',
          interpretation: {
            normalized: 'London, England, United Kingdom',
            parts: ['London', 'England', 'United Kingdom'],
            provenance: 'inferred'
          }
        }
      }
    }]
  });

  assert.equal(applied.document.events['I1:event:0'].date.interpretation.kind, 'approximate');
  assert.equal(applied.document.events['I1:event:0'].place.interpretation.provenance, 'inferred');
});

test('rejects stale and partially invalid transactions without changing input', () => {
  const current = document();
  assert.throws(() => applyTreeTransaction(current, {
    id: 'stale', baseRevision: 2, provenance: {}, operations: []
  }), /revision 0.*2/i);

  assert.throws(() => applyTreeTransaction(current, {
    id: 'invalid', baseRevision: 0, provenance: {}, operations: [
      { type: 'event.update', eventId: 'I1:event:0', changes: { value: 'changed' } },
      { type: 'note.add', ownerType: 'person', ownerId: 'missing', note: { id: 'note-1', text: 'No', citationIds: [] } }
    ]
  }), /missing person/i);
  assert.equal(current.events['I1:event:0'].value, '');
});

test('does not let generated event changes mutate identity or GEDCOM origins', () => {
  const current = document();
  for (const changes of [
    { origin: { path: [9] } },
    { ownerId: 'other' },
    { tag: 'DEAT' },
    { date: '1816' }
  ]) {
    assert.throws(() => applyTreeTransaction(current, {
      id: 'unsafe', baseRevision: 0, provenance: {},
      operations: [{ type: 'event.update', eventId: 'I1:event:0', changes }]
    }), /cannot change|must contain only|must be/i);
  }
  assert.deepEqual(current.events['I1:event:0'].origin, { path: [0, 0] });
});

test('rejects deleting imported subtrees until export can preserve that intent', () => {
  const current = document();
  assert.throws(() => applyTreeTransaction(current, {
    id: 'remove', baseRevision: 0, provenance: {},
    operations: [{ type: 'event.remove', eventId: 'I1:event:0' }]
  }), /removing an imported event.*not supported/i);
  assert.ok(current.events['I1:event:0']);
});
