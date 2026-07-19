const peopleFor = (graph, ids = []) => ids.map(id => graph.people[id]).filter(Boolean);

const citationKey = citation => JSON.stringify([
  citation.id ?? '', citation.page ?? '', citation.record?.title ?? '', citation.record?.url ?? ''
]);

const uniqueCitations = citations => {
  const seen = new Set();
  return citations.filter(citation => {
    const key = citationKey(citation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const familyFor = (graph, familyId) => graph.families.find(family => family.id === familyId);
const partnerTitle = partners => partners.map(person => person.name).join(' & ') || 'Recorded family';

export function buildPartnershipDetails(graph, familyId) {
  const family = familyFor(graph, familyId);
  if (!family) return null;
  const partners = peopleFor(graph, family.partners);
  const events = (family.events ?? []).map(event => ({
    label: event.label,
    date: event.date,
    place: event.place,
    value: event.value,
    notes: event.notes ?? []
  }));
  const sources = uniqueCitations([
    ...(family.sources ?? []),
    ...(family.events ?? []).flatMap(event => [
      ...(event.sources ?? []),
      ...(event.notes ?? []).flatMap(note => note.sources ?? [])
    ]),
    ...(family.notes ?? []).flatMap(note => note.sources ?? [])
  ]);
  return {
    familyId,
    title: partnerTitle(partners),
    partners,
    children: peopleFor(graph, family.children),
    events,
    notes: family.notes ?? [],
    sources,
    media: family.media ?? [],
    record: family.record ?? {}
  };
}

export function buildChildrenDetails(graph, familyId) {
  const family = familyFor(graph, familyId);
  if (!family) return null;
  const partners = peopleFor(graph, family.partners);
  return {
    familyId,
    title: `Children of ${partnerTitle(partners)}`,
    partners,
    children: peopleFor(graph, family.children)
  };
}
