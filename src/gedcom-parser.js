const cleanRef = value => value.replace(/^@|@$/g, '');
const isRef = value => /^@[^@]+@$/.test(value);
const cleanName = value => value.replaceAll('/', '').replace(/\s+/g, ' ').trim();

const factLabels = {
  BIRT: 'Birth',
  BAPM: 'Baptism',
  CHR: 'Christening',
  DEAT: 'Death',
  BURI: 'Burial',
  EDUC: 'Education',
  GRAD: 'Graduation',
  ELEC: 'Election',
  ENGA: 'Engagement',
  IMMI: 'Immigration',
  OCCU: 'Occupation',
  RELI: 'Religion',
  HEAL: 'Health'
};

const familyFactLabels = {
  MARR: 'Marriage',
  DIV: 'Divorce',
  SEPA: 'Separation',
  ANUL: 'Annulment'
};

const children = (node, tag) => node.children.filter(child => child.tag === tag);
const childValue = (node, tag) => children(node, tag)[0]?.value ?? '';

function nodeText(node) {
  let text = node.value ?? '';
  node.children
    .filter(child => child.tag === 'CONT' || child.tag === 'CONC')
    .forEach(child => {
      const separator = child.tag === 'CONT' && text ? '\n' : '';
      text += `${separator}${nodeText(child)}`;
    });
  return text.trim();
}

function parseTree(source) {
  const roots = [];
  const stack = [];
  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    const match = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s+(.*))?$/);
    if (!match) continue;
    const node = {
      level: Number(match[1]),
      xref: match[2] ? cleanRef(match[2]) : '',
      tag: match[3],
      value: match[4] ?? '',
      children: []
    };
    while (stack.length && stack.at(-1).level >= node.level) stack.pop();
    if (stack.length) stack.at(-1).children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

function parseSourceRecord(node) {
  return {
    id: node.xref,
    type: childValue(node, 'TYPE'),
    title: childValue(node, 'TITL'),
    periodical: childValue(node, 'PERI'),
    publisher: childValue(node, 'PUBL'),
    author: childValue(node, 'AUTH'),
    date: childValue(node, 'DATE'),
    text: children(node, 'TEXT').map(nodeText).filter(Boolean).join('\n'),
    url: childValue(node, 'URL'),
    repository: childValue(node, 'REPO'),
    place: childValue(node, 'PLAC'),
    media: childValue(node, 'MEDI')
  };
}

function parseMedia(node) {
  const primary = childValue(node, '_PRIM').toUpperCase();
  return {
    file: childValue(node, 'FILE'),
    format: childValue(node, 'FORM'),
    title: childValue(node, 'TITL'),
    type: childValue(node, '_TYPE'),
    primary: primary === 'Y',
    note: children(node, 'NOTE').map(nodeText).filter(Boolean).join('\n')
  };
}

function uniqueCitations(citations) {
  const seen = new Set();
  return citations.filter(citation => {
    const key = `${citation.id}|${citation.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createResolvers(noteRecords, sourceRecords) {
  const resolveCitation = node => {
    const id = isRef(node.value) ? cleanRef(node.value) : '';
    return {
      id,
      page: childValue(node, 'PAGE'),
      record: id ? sourceRecords[id] ?? null : {
        id: '', type: '', title: nodeText(node), periodical: '', publisher: '', author: '',
        date: '', text: '', url: '', repository: '', place: '', media: ''
      }
    };
  };
  const citationsFor = node => uniqueCitations([
    ...children(node, 'SOUR'),
    ...node.children
      .filter(child => child.tag === 'CONT' || child.tag === 'CONC')
      .flatMap(child => children(child, 'SOUR'))
  ].map(resolveCitation));
  const resolveNote = node => {
    if (isRef(node.value)) {
      const record = noteRecords[cleanRef(node.value)];
      return record ? { text: record.text, sources: record.sources } : { text: node.value, sources: [] };
    }
    return { text: nodeText(node), sources: citationsFor(node) };
  };
  return { citationsFor, resolveNote };
}

function parseFact(node, label, resolvers) {
  const { citationsFor, resolveNote } = resolvers;
  let value = node.value;
  let referencedNote = null;
  if (node.tag === 'HEAL' && isRef(value)) {
    referencedNote = resolveNote(node);
    value = referencedNote.text;
  }
  else if (node.tag === 'OCCU' || node.tag === 'RELI' || node.tag === 'EDUC') value = nodeText(node);
  return {
    tag: node.tag,
    label,
    value,
    date: childValue(node, 'DATE'),
    place: childValue(node, 'PLAC'),
    notes: children(node, 'NOTE').map(resolveNote).filter(note => note.text),
    sources: uniqueCitations([...citationsFor(node), ...(referencedNote?.sources ?? [])])
  };
}

function emptyPerson(id) {
  return {
    id,
    name: '',
    sex: '',
    birth: '',
    birthPlace: '',
    death: '',
    deathPlace: '',
    occupation: '',
    aliases: [],
    suffix: '',
    titles: [],
    facts: [],
    notes: [],
    sources: [],
    media: [],
    record: { uid: '', changed: '' }
  };
}

function parsePerson(node, resolvers) {
  const person = emptyPerson(node.xref);
  const nameNode = children(node, 'NAME')[0];
  person.name = nameNode ? cleanName(nameNode.value) : '';
  person.suffix = nameNode ? childValue(nameNode, 'NSFX') : '';
  person.sex = childValue(node, 'SEX');
  person.aliases = children(node, 'ALIA').map(nodeText).filter(Boolean);
  person.titles = children(node, 'TITL').map(nodeText).filter(Boolean);
  person.facts = node.children
    .filter(child => factLabels[child.tag])
    .map(child => parseFact(child, factLabels[child.tag], resolvers));
  const birth = person.facts.find(fact => fact.tag === 'BIRT');
  const death = person.facts.find(fact => fact.tag === 'DEAT');
  const occupation = person.facts.find(fact => fact.tag === 'OCCU');
  person.birth = birth?.date ?? '';
  person.birthPlace = birth?.place ?? '';
  person.death = death?.date ?? '';
  person.deathPlace = death?.place ?? '';
  person.occupation = occupation?.value ?? '';
  person.notes = children(node, 'NOTE').map(resolvers.resolveNote).filter(note => note.text);
  person.sources = resolvers.citationsFor(node);
  person.media = children(node, 'OBJE').map(parseMedia);
  person.record = {
    uid: childValue(node, '_UID'),
    changed: childValue(children(node, 'CHAN')[0] ?? { children: [] }, 'DATE')
  };
  if (!person.name) person.name = `Unknown person (${person.id})`;
  return person;
}

function parseFamily(node, resolvers) {
  const events = node.children
    .filter(child => familyFactLabels[child.tag])
    .map(child => parseFact(child, familyFactLabels[child.tag], resolvers));
  const dateFor = tag => events.find(event => event.tag === tag)?.date ?? '';
  return {
    id: node.xref,
    partners: node.children
      .filter(child => child.tag === 'HUSB' || child.tag === 'WIFE' || child.tag === 'PART')
      .map(child => cleanRef(child.value)),
    children: children(node, 'CHIL').map(child => cleanRef(child.value)),
    marriage: dateFor('MARR'),
    divorce: dateFor('DIV'),
    separation: dateFor('SEPA'),
    annulment: dateFor('ANUL'),
    events,
    notes: children(node, 'NOTE').map(resolvers.resolveNote).filter(note => note.text),
    sources: resolvers.citationsFor(node),
    media: children(node, 'OBJE').map(parseMedia),
    record: {
      uid: childValue(node, '_UID'),
      changed: childValue(children(node, 'CHAN')[0] ?? { children: [] }, 'DATE')
    }
  };
}

export function parseGedcom(source) {
  if (typeof source !== 'string') throw new TypeError('GEDCOM source must be text');
  const roots = parseTree(source);
  const sourceRecords = Object.fromEntries(
    roots.filter(node => node.tag === 'SOUR' && node.xref).map(node => [node.xref, parseSourceRecord(node)])
  );
  const noteRecords = {};
  roots.filter(node => node.tag === 'NOTE' && node.xref).forEach(node => {
    noteRecords[node.xref] = { id: node.xref, text: nodeText(node), sources: [] };
  });
  const initialResolvers = createResolvers(noteRecords, sourceRecords);
  roots.filter(node => node.tag === 'NOTE' && node.xref).forEach(node => {
    noteRecords[node.xref].sources = initialResolvers.citationsFor(node);
  });
  const resolvers = createResolvers(noteRecords, sourceRecords);
  const people = Object.fromEntries(
    roots.filter(node => node.tag === 'INDI').map(node => [node.xref, parsePerson(node, resolvers)])
  );
  const families = roots.filter(node => node.tag === 'FAM').map(node => parseFamily(node, resolvers));

  if (!Object.keys(people).length && !families.length) {
    throw new Error('GEDCOM contains no individual or family records');
  }
  return { people, families, sources: sourceRecords };
}
