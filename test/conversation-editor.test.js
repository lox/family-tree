import test from 'node:test';
import assert from 'node:assert/strict';

import { proposeConversationEdit } from '../src/conversation-editor.js';

const document = {
  revision: 3,
  people: {
    I1: {
      id: 'I1', names: [{ id: 'name-1', type: 'primary', value: 'Ada LOVELACE' }],
      eventIds: ['birth-1'], noteIds: []
    }
  },
  events: {
    'birth-1': { id: 'birth-1', ownerType: 'person', ownerId: 'I1', tag: 'BIRT', label: 'Birth', date: { original: '1815' }, place: { original: 'London' } }
  }
};

test('turns a natural-language birth correction into a reviewable operation', () => {
  const proposal = proposeConversationEdit(document, {
    personId: 'I1', input: 'Set birth date to about 1816', createId: () => 'tx-1'
  });
  assert.equal(proposal.status, 'ready');
  assert.match(proposal.message, /Ada LOVELACE.*birth date.*about 1816/i);
  assert.deepEqual(proposal.transaction.operations, [{
    type: 'event.update', eventId: 'birth-1', changes: { date: { original: 'about 1816' } }
  }]);
  assert.equal(proposal.transaction.baseRevision, 3);
  assert.equal(proposal.transaction.provenance.input, 'Set birth date to about 1816');
});

test('can add a sourced conversational note without treating it as genealogical evidence', () => {
  const ids = ['tx-1', 'note-1'];
  const proposal = proposeConversationEdit(document, {
    personId: 'I1', input: 'Add note: Aunt Margaret remembered the move.', createId: () => ids.shift()
  });
  assert.deepEqual(proposal.transaction.operations, [{
    type: 'note.add', ownerType: 'person', ownerId: 'I1',
    note: { id: 'note-1', text: 'Aunt Margaret remembered the move.', citationIds: [] }
  }]);
  assert.equal(proposal.transaction.provenance.actor, 'assistant');
  assert.equal(proposal.transaction.provenance.approvedBy, null);
});

test('asks for clarification instead of guessing unsupported intent or identity', () => {
  assert.equal(proposeConversationEdit(document, {
    personId: '', input: 'Set birth date to 1816'
  }).status, 'needs-context');
  assert.equal(proposeConversationEdit(document, {
    personId: 'I1', input: 'Robert probably knew the mayor'
  }).status, 'unsupported');
});
