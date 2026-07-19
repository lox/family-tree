import {
  validateDateValue,
  validatePlaceValue,
  validateTreeDocument
} from './tree-document.js';

const clone = value => structuredClone(value);

const requireRecord = (records, id, label) => {
  const record = records?.[id];
  if (!record) throw new Error(`Cannot edit missing ${label} ${id}`);
  return record;
};

const ownerFor = (document, ownerType, ownerId) => {
  if (ownerType === 'person') return requireRecord(document.people, ownerId, 'person');
  if (ownerType === 'family') return requireRecord(document.families, ownerId, 'family');
  throw new Error(`Unsupported owner type: ${ownerType}`);
};

const describeValue = value => value?.original ?? value ?? '';

const assertOnlyKeys = (value, allowed, label) => {
  const unsupported = Object.keys(value ?? {}).filter(key => !allowed.has(key));
  if (unsupported.length) throw new Error(`${label} cannot change ${unsupported.join(', ')}`);
};

function applyOperation(document, operation) {
  switch (operation.type) {
    case 'person.name.set': {
      const person = requireRecord(document.people, operation.personId, 'person');
      const name = person.names?.find(candidate => candidate.id === operation.nameId);
      if (!name) throw new Error(`Cannot edit missing name ${operation.nameId}`);
      if (typeof operation.value !== 'string') throw new Error('A primary name must be text');
      const previous = name.value;
      name.value = operation.value.trim();
      if (!name.value) throw new Error('A primary name cannot be empty');
      return {
        inverse: { ...operation, value: previous },
        summary: `${previous} → ${name.value}`
      };
    }
    case 'event.update': {
      const event = requireRecord(document.events, operation.eventId, 'event');
      if (event.ownerType !== 'person') {
        throw new Error('Editing family events is not supported by safe GEDCOM export');
      }
      const changes = clone(operation.changes ?? {});
      if (!Object.keys(changes).length) throw new Error('An event update must contain a change');
      assertOnlyKeys(changes, new Set(['value', 'date', 'place']), 'An event update');
      if (Object.hasOwn(changes, 'value') && typeof changes.value !== 'string') {
        throw new Error('An event value must be text');
      }
      if (Object.hasOwn(changes, 'date')) validateDateValue(changes.date, 'An event date');
      if (Object.hasOwn(changes, 'place')) validatePlaceValue(changes.place, 'An event place');
      const previous = {};
      Object.keys(changes).forEach(key => { previous[key] = clone(event[key]); });
      Object.assign(event, changes);
      const changed = Object.entries(changes)
        .map(([key, value]) => `${key} to ${describeValue(value)}`)
        .join(', ');
      return {
        inverse: { type: 'event.update', eventId: event.id, changes: previous },
        summary: `${event.label || event.tag || 'Event'}: ${changed}`
      };
    }
    case 'event.add': {
      if (operation.ownerType !== 'person') {
        throw new Error('Adding family events is not supported by safe GEDCOM export');
      }
      const owner = ownerFor(document, operation.ownerType, operation.ownerId);
      const event = clone(operation.event);
      if (!event?.id || document.events[event.id]) throw new Error(`Event id is missing or already exists: ${event?.id ?? ''}`);
      assertOnlyKeys(event, new Set([
        'id', 'tag', 'label', 'value', 'date', 'place', 'noteIds', 'citationIds', 'mediaIds'
      ]), 'A new event');
      if (typeof event.tag !== 'string' || !event.tag) throw new Error('A new event tag is required');
      if (typeof event.value !== 'string') throw new Error('A new event value must be text');
      validateDateValue(event.date, 'A new event date');
      validatePlaceValue(event.place, 'A new event place');
      event.ownerType = operation.ownerType;
      event.ownerId = operation.ownerId;
      document.events[event.id] = event;
      owner.eventIds ??= [];
      const index = operation.index ?? owner.eventIds.length;
      owner.eventIds.splice(index, 0, event.id);
      return {
        inverse: { type: 'event.remove', eventId: event.id },
        summary: `Add ${event.label || event.tag || 'event'}`
      };
    }
    case 'event.remove': {
      const event = requireRecord(document.events, operation.eventId, 'event');
      if (event.origin?.path) {
        throw new Error('Removing an imported event is not supported by safe GEDCOM export');
      }
      const owner = ownerFor(document, event.ownerType, event.ownerId);
      const index = owner.eventIds.indexOf(event.id);
      owner.eventIds.splice(index, 1);
      delete document.events[event.id];
      return {
        inverse: { type: 'event.add', ownerType: event.ownerType, ownerId: event.ownerId, event, index },
        summary: `Remove ${event.label || event.tag || 'event'}`
      };
    }
    case 'note.add': {
      if (operation.ownerType !== 'person') {
        throw new Error('Adding family notes is not supported by safe GEDCOM export');
      }
      const owner = ownerFor(document, operation.ownerType, operation.ownerId);
      const note = clone(operation.note);
      if (!note?.id || document.notes[note.id]) throw new Error(`Note id is missing or already exists: ${note?.id ?? ''}`);
      assertOnlyKeys(note, new Set(['id', 'text', 'citationIds']), 'A new note');
      if (typeof note.text !== 'string' || !note.text.trim()) throw new Error('A new note must contain text');
      document.notes[note.id] = note;
      owner.noteIds ??= [];
      const index = operation.index ?? owner.noteIds.length;
      owner.noteIds.splice(index, 0, note.id);
      return {
        inverse: { type: 'note.remove', ownerType: operation.ownerType, ownerId: operation.ownerId, noteId: note.id },
        summary: `Add note: ${note.text}`
      };
    }
    case 'note.remove': {
      if (operation.ownerType !== 'person') {
        throw new Error('Removing family notes is not supported by safe GEDCOM export');
      }
      const owner = ownerFor(document, operation.ownerType, operation.ownerId);
      const note = requireRecord(document.notes, operation.noteId, 'note');
      if (note.origin?.path) {
        throw new Error('Removing an imported note is not supported by safe GEDCOM export');
      }
      const index = owner.noteIds.indexOf(note.id);
      if (index < 0) throw new Error(`${owner.id} does not reference note ${note.id}`);
      owner.noteIds.splice(index, 1);
      delete document.notes[note.id];
      return {
        inverse: { type: 'note.add', ownerType: operation.ownerType, ownerId: operation.ownerId, note, index },
        summary: `Remove note: ${note.text}`
      };
    }
    default:
      throw new Error(`Unsupported tree operation: ${operation.type}`);
  }
}

export function applyTreeTransaction(current, transaction) {
  validateTreeDocument(current);
  if (!transaction || transaction.baseRevision !== current.revision) {
    throw new Error(`Tree is at revision ${current.revision}, but the change targets revision ${transaction?.baseRevision}`);
  }
  if (!Array.isArray(transaction.operations) || !transaction.operations.length) {
    throw new Error('A tree transaction must contain at least one operation');
  }
  const document = clone(current);
  const applied = transaction.operations.map(operation => applyOperation(document, operation));
  document.revision += 1;
  document.editLog ??= [];
  document.editLog.push({
    id: transaction.id,
    revision: document.revision,
    provenance: clone(transaction.provenance ?? {}),
    operations: clone(transaction.operations)
  });
  validateTreeDocument(document);
  return {
    document,
    summary: applied.map(item => item.summary),
    inverse: {
      id: `${transaction.id}:undo:${document.revision}`,
      baseRevision: document.revision,
      provenance: { actor: 'system', undoOf: transaction.id },
      operations: applied.map(item => item.inverse).reverse()
    }
  };
}

export const previewTreeTransaction = (document, transaction) => (
  applyTreeTransaction(document, transaction)
);

export { validateTreeDocument };
