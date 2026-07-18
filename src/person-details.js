const sexLabels = { M: 'Male', F: 'Female', U: 'Unspecified', X: 'Unspecified' };
const personalFactTags = new Set(['OCCU', 'RELI', 'HEAL']);
const eventFactTags = new Set(['BIRT', 'BAPM', 'CHR', 'DEAT', 'BURI', 'EDUC', 'GRAD', 'ELEC', 'ENGA', 'IMMI']);

const presentFact = fact => ({
  label: fact.label,
  value: fact.value || '',
  date: fact.date || '',
  place: fact.place || '',
  notes: fact.notes ?? [],
  sources: fact.sources ?? []
});

const year = value => (value?.match(/\b(\d{4})\b/) ?? [, ''])[1];

const lifespanFor = (person, facts) => {
  const birthYear = year(person.birth);
  const deathYear = year(person.death);
  const deathRecorded = facts.some(fact => fact.tag === 'DEAT');
  if (birthYear && deathYear) return `${birthYear}–${deathYear}`;
  if (birthYear) return deathRecorded ? `${birthYear}–?` : `${birthYear}–Present`;
  return deathYear;
};

const sourceKey = citation => {
  if (citation.id || citation.page) return `${citation.id ?? ''}|${citation.page ?? ''}`;
  const source = citation.record ?? {};
  return JSON.stringify([
    source.title, source.author, source.publisher, source.date,
    source.periodical, source.text, source.url
  ]);
};

export function buildPersonDetails(graph, personId) {
  const person = graph.people[personId];
  if (!person) return null;
  const facts = person.facts?.length ? person.facts : [
    person.birth && { tag: 'BIRT', label: 'Birth', value: '', date: person.birth, place: person.birthPlace, notes: [], sources: [] },
    person.death && { tag: 'DEAT', label: 'Death', value: '', date: person.death, place: person.deathPlace, notes: [], sources: [] },
    person.occupation && { tag: 'OCCU', label: 'Occupation', value: person.occupation, date: '', place: '', notes: [], sources: [] }
  ].filter(Boolean);
  const personal = [];
  if (person.sex) personal.push(['Sex', sexLabels[person.sex.toUpperCase()] ?? person.sex]);
  if (person.aliases?.length) personal.push(['Also known as', person.aliases.join('\n')]);
  if (person.suffix) personal.push(['Suffix', person.suffix]);
  if (person.titles?.length) personal.push(['Title', person.titles.join('\n')]);
  facts.filter(fact => personalFactTags.has(fact.tag)).forEach(fact => {
    if (fact.value) personal.push([fact.label, fact.value]);
  });

  const relationships = graph.families
    .filter(family => family.partners.includes(personId))
    .map(family => ({
      familyId: family.id,
      partners: family.partners
        .filter(id => id !== personId)
        .map(id => graph.people[id] && ({ id, name: graph.people[id].name }))
        .filter(Boolean),
      children: family.children
        .map(id => graph.people[id] && ({ id, name: graph.people[id].name }))
        .filter(Boolean),
      events: (family.events ?? [
        family.marriage && { label: 'Marriage', date: family.marriage, place: '' },
        family.divorce && { label: 'Divorce', date: family.divorce, place: '' },
        family.separation && { label: 'Separation', date: family.separation, place: '' },
        family.annulment && { label: 'Annulment', date: family.annulment, place: '' }
      ].filter(Boolean)).map(event => ({
        label: event.label,
        date: event.date || '',
        place: event.place || ''
      }))
    }));
  const parents = graph.families
    .filter(family => family.children.includes(personId))
    .flatMap(family => family.partners)
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .map(id => graph.people[id] && ({ id, name: graph.people[id].name }))
    .filter(Boolean);

  const citations = [
    ...(person.sources ?? []),
    ...facts.flatMap(fact => fact.sources ?? []),
    ...facts.flatMap(fact => (
      (fact.notes ?? []).flatMap(note => note.sources ?? [])
    )),
    ...(person.notes ?? []).flatMap(note => note.sources ?? [])
  ];
  const seenSources = new Set();
  const sources = citations.filter(citation => {
    const key = sourceKey(citation);
    if (seenSources.has(key)) return false;
    seenSources.add(key);
    return true;
  });

  return {
    person,
    lifespan: lifespanFor(person, facts),
    personal,
    lifeEvents: facts.filter(fact => eventFactTags.has(fact.tag)).map(presentFact),
    parents,
    relationships,
    notes: person.notes ?? [],
    sources,
    media: person.media ?? []
  };
}
