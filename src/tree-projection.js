import { validateTreeDocument } from './tree-document.js';

const copy = value => value == null ? value : structuredClone(value);
const cleanName = value => String(value ?? '')
  .replaceAll('/', '')
  .replace(/\s+/g, ' ')
  .trim();

export function projectTreeDocument(document) {
  validateTreeDocument(document);
  const sources = Object.fromEntries(Object.values(document.sources).map(source => {
    const { origin, ...record } = source;
    return [source.id, copy(record)];
  }));

  const projectCitation = citationId => {
    const citation = document.citations[citationId];
    return {
      id: citation.sourceId,
      page: citation.page,
      record: citation.sourceId
        ? sources[citation.sourceId] ?? null
        : copy(citation.inlineRecord ?? null)
    };
  };
  const projectCitations = ids => (ids ?? []).map(projectCitation);
  const projectNote = noteId => {
    const note = document.notes[noteId];
    return { text: note.text, sources: projectCitations(note.citationIds) };
  };
  const projectMedia = mediaId => {
    const { id, origin, ...media } = document.media[mediaId];
    return copy(media);
  };
  const projectEvent = eventId => {
    const event = document.events[eventId];
    return {
      tag: event.tag ?? event.type,
      label: event.label ?? '',
      value: event.value ?? '',
      date: event.date?.original ?? '',
      place: event.place?.original ?? '',
      notes: (event.noteIds ?? []).map(projectNote),
      sources: projectCitations(event.citationIds)
    };
  };

  const people = Object.fromEntries(Object.values(document.people).map(person => {
    const facts = (person.eventIds ?? []).map(projectEvent);
    const fact = tag => facts.find(candidate => candidate.tag === tag);
    return [person.id, {
      id: person.id,
      name: cleanName(
        person.names.find(name => name.type === 'primary')?.value ?? person.names[0]?.value ?? ''
      ),
      sex: person.sex ?? '',
      birth: fact('BIRT')?.date ?? '',
      birthPlace: fact('BIRT')?.place ?? '',
      death: fact('DEAT')?.date ?? '',
      deathPlace: fact('DEAT')?.place ?? '',
      occupation: fact('OCCU')?.value ?? '',
      aliases: (person.aliases ?? []).map(alias => alias.value ?? alias),
      suffix: person.suffix ?? '',
      titles: (person.titles ?? []).map(title => title.value ?? title),
      facts,
      notes: (person.noteIds ?? []).map(projectNote),
      sources: projectCitations(person.citationIds),
      media: (person.mediaIds ?? []).map(projectMedia),
      record: copy(person.record ?? { uid: '', changed: '' })
    }];
  }));

  const families = Object.values(document.families).map(family => {
    const events = (family.eventIds ?? []).map(projectEvent);
    const dateFor = tag => events.find(event => event.tag === tag)?.date ?? '';
    return {
      id: family.id,
      partners: (family.partnerLinks ?? []).map(link => link.personId),
      children: (family.childLinks ?? []).map(link => link.personId),
      marriage: dateFor('MARR'),
      divorce: dateFor('DIV'),
      separation: dateFor('SEPA'),
      annulment: dateFor('ANUL'),
      events,
      notes: (family.noteIds ?? []).map(projectNote),
      sources: projectCitations(family.citationIds),
      media: (family.mediaIds ?? []).map(projectMedia),
      record: copy(family.record ?? { uid: '', changed: '' })
    };
  });

  return {
    people,
    families,
    sources,
    diagnostics: copy(document.importMetadata.diagnostics)
  };
}
