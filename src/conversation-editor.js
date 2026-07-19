const primaryName = person => person.names?.find(name => name.type === 'primary') ?? person.names?.[0];

const ready = (document, person, input, transactionId, operations, message) => ({
  status: 'ready',
  message,
  transaction: {
    id: transactionId,
    baseRevision: document.revision,
    provenance: { actor: 'assistant', approvedBy: null, input },
    operations
  }
});

export function proposeConversationEdit(document, {
  personId,
  input,
  createId = () => crypto.randomUUID()
}) {
  const person = document.people?.[personId];
  if (!person) {
    return { status: 'needs-context', message: 'Select the person you want to change first.' };
  }
  const text = String(input ?? '').trim();
  const name = primaryName(person)?.value ?? person.id;
  const transactionId = createId();
  let match = text.match(/^(?:set|change|correct)\s+(?:the\s+)?birth\s+date\s+(?:to|as)\s+(.+)$/i);
  if (match) {
    const value = match[1].trim();
    const event = (person.eventIds ?? []).map(id => document.events[id]).find(item => item?.tag === 'BIRT');
    const operation = event
      ? { type: 'event.update', eventId: event.id, changes: { date: { original: value } } }
      : {
          type: 'event.add', ownerType: 'person', ownerId: person.id,
          event: {
            id: createId(), tag: 'BIRT', label: 'Birth', value: '',
            date: { original: value }, place: { original: '' },
            noteIds: [], citationIds: [], mediaIds: []
          }
        };
    return ready(document, person, text, transactionId, [operation], `Set ${name}’s birth date to ${value}.`);
  }
  match = text.match(/^(?:set|change|correct)\s+(?:the\s+)?birth\s+place\s+(?:to|as)\s+(.+)$/i);
  if (match) {
    const value = match[1].trim();
    const event = (person.eventIds ?? []).map(id => document.events[id]).find(item => item?.tag === 'BIRT');
    const operation = event
      ? { type: 'event.update', eventId: event.id, changes: { place: { original: value } } }
      : {
          type: 'event.add', ownerType: 'person', ownerId: person.id,
          event: {
            id: createId(), tag: 'BIRT', label: 'Birth', value: '',
            date: { original: '' }, place: { original: value },
            noteIds: [], citationIds: [], mediaIds: []
          }
        };
    return ready(document, person, text, transactionId, [operation], `Set ${name}’s birth place to ${value}.`);
  }
  match = text.match(/^(?:add\s+)?note\s*:\s*(.+)$/is);
  if (match) {
    const note = match[1].trim();
    return ready(document, person, text, transactionId, [{
      type: 'note.add', ownerType: 'person', ownerId: person.id,
      note: { id: createId(), text: note, citationIds: [] }
    }], `Add this note to ${name}: “${note}”`);
  }
  match = text.match(/^(?:set|change|correct)\s+(?:the\s+)?name\s+(?:to|as)\s+(.+)$/i);
  if (match) {
    const value = match[1].trim();
    const currentName = primaryName(person);
    if (!currentName) return { status: 'unsupported', message: 'This person has no editable primary name.' };
    return ready(document, person, text, transactionId, [{
      type: 'person.name.set', personId: person.id, nameId: currentName.id, value
    }], `Change ${name}’s name to ${value}.`);
  }
  return {
    status: 'unsupported',
    message: 'I can change a name, birth date, or birth place, or add a note. No change has been made.'
  };
}
