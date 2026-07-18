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

const recognizedTags = new Set([
  'HEAD', 'TRLR', 'INDI', 'FAM', 'SOUR', 'NOTE', 'REPO', 'OBJE', 'SUBM', 'SUBN',
  'GEDC', 'VERS', 'CHAR', 'LANG', 'DEST', 'DATE', 'TIME', 'CORP', 'ADDR', 'PHON',
  'EMAIL', 'WWW', 'NAME', 'NSFX', 'SEX', 'ALIA', 'TITL', 'HUSB', 'WIFE', 'PART',
  'CHIL', 'FAMC', 'FAMS', 'FILE', 'FORM', 'TYPE', 'PERI', 'PUBL', 'AUTH', 'TEXT',
  'URL', 'PLAC', 'MEDI', 'PAGE', 'CONT', 'CONC', '_TYPE', '_PRIM', '_UID', 'CHAN',
  ...Object.keys(factLabels),
  ...Object.keys(familyFactLabels)
]);
const supportedGedcomVersions = new Set(['5.5', '5.5.1', '7.0']);
const recordTags = new Set(['SOUR', 'NOTE', 'INDI', 'FAM']);
const diagnosticDetailLimit = 12;

const plural = (count, singular, pluralForm = `${singular}s`) => (
  count === 1 ? singular : pluralForm
);

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
  const malformedLines = [];
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const match = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s+(.*))?$/);
    if (!match) {
      malformedLines.push(`Line ${index + 1}: ${line.trim()}`);
      continue;
    }
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
  return { roots, malformedLines };
}

function unsupportedTagCounts(roots) {
  const counts = new Map();
  const visit = node => {
    if (!recognizedTags.has(node.tag)) {
      counts.set(node.tag, (counts.get(node.tag) ?? 0) + 1);
      return;
    }
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function collectRecords(roots, diagnostics) {
  const records = Object.fromEntries([...recordTags].map(tag => [tag, []]));
  const seen = new Map();
  roots.filter(node => recordTags.has(node.tag)).forEach(node => {
    if (!node.xref) {
      diagnostics.missingIdentifiers.push(node.tag);
      return;
    }
    if (seen.has(node.xref)) {
      diagnostics.duplicateIdentifiers.push(
        `${node.tag} ${node.xref} duplicates ${seen.get(node.xref)}`
      );
      return;
    }
    seen.set(node.xref, node.tag);
    records[node.tag].push(node);
  });
  return records;
}

function warning(code, count, message, details) {
  const visibleDetails = details.slice(0, diagnosticDetailLimit);
  if (details.length > diagnosticDetailLimit) {
    visibleDetails.push(`… ${details.length - diagnosticDetailLimit} more`);
  }
  return { code, count, message, details: visibleDetails };
}

function buildDiagnostics({ roots, malformedLines, people, families, sourceRecords, tracking }) {
  const header = roots.find(node => node.tag === 'HEAD');
  const gedcom = header ? children(header, 'GEDC')[0] : null;
  const version = gedcom ? childValue(gedcom, 'VERS') : '';
  const unsupportedTags = unsupportedTagCounts(roots);
  const missingReferences = [];
  families.forEach(family => {
    family.partners.forEach(personId => {
      if (!people[personId]) missingReferences.push(`${family.id} partner: ${personId}`);
    });
    family.children.forEach(personId => {
      if (!people[personId]) missingReferences.push(`${family.id} child: ${personId}`);
    });
  });

  const warnings = [];
  if (!supportedGedcomVersions.has(version)) {
    warnings.push(warning(
      'unsupported-version',
      1,
      version
        ? `GEDCOM ${version} is not a tested format.`
        : 'The GEDCOM version is missing.',
      ['Tested formats: 5.5, 5.5.1, and 7.0']
    ));
  }
  if (malformedLines.length) {
    warnings.push(warning(
      'malformed-lines',
      malformedLines.length,
      `${malformedLines.length} ${plural(malformedLines.length, 'line')} could not be read as GEDCOM.`,
      malformedLines
    ));
  }
  if (unsupportedTags.length) {
    const count = unsupportedTags.reduce((total, [, occurrences]) => total + occurrences, 0);
    warnings.push(warning(
      'unsupported-tags',
      count,
      `${count} ${plural(count, 'tag')} ${count === 1 ? 'is' : 'are'} not displayed.`,
      unsupportedTags.map(([tag, occurrences]) => `${tag} (${occurrences})`)
    ));
  }
  if (tracking.missingIdentifiers.length) {
    const count = tracking.missingIdentifiers.length;
    warnings.push(warning(
      'missing-record-identifiers',
      count,
      `${count} ${plural(count, 'record')} without an identifier was skipped.`,
      tracking.missingIdentifiers.map(tag => `${tag} record`)
    ));
  }
  if (tracking.duplicateIdentifiers.length) {
    const count = tracking.duplicateIdentifiers.length;
    warnings.push(warning(
      'duplicate-record-identifiers',
      count,
      `${count} duplicate ${plural(count, 'record identifier')} was skipped.`,
      tracking.duplicateIdentifiers
    ));
  }
  if (missingReferences.length) {
    const count = missingReferences.length;
    warnings.push(warning(
      'missing-person-references',
      count,
      `${count} family ${plural(count, 'link')} ${count === 1 ? 'points' : 'point'} to ${plural(count, 'a person that is', 'people that are')} not in the file.`,
      missingReferences
    ));
  }

  return {
    format: {
      version,
      producer: header ? childValue(header, 'SOUR') : ''
    },
    counts: {
      people: Object.keys(people).length,
      families: families.length,
      sources: Object.keys(sourceRecords).length
    },
    warnings
  };
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
  const { roots, malformedLines } = parseTree(source);
  const tracking = { missingIdentifiers: [], duplicateIdentifiers: [] };
  const records = collectRecords(roots, tracking);
  const sourceNodes = records.SOUR;
  const noteNodes = records.NOTE;
  const personNodes = records.INDI;
  const familyNodes = records.FAM;
  const sourceRecords = Object.fromEntries(
    sourceNodes.map(node => [node.xref, parseSourceRecord(node)])
  );
  const noteRecords = {};
  noteNodes.forEach(node => {
    noteRecords[node.xref] = { id: node.xref, text: nodeText(node), sources: [] };
  });
  const initialResolvers = createResolvers(noteRecords, sourceRecords);
  noteNodes.forEach(node => {
    noteRecords[node.xref].sources = initialResolvers.citationsFor(node);
  });
  const resolvers = createResolvers(noteRecords, sourceRecords);
  const people = Object.fromEntries(
    personNodes.map(node => [node.xref, parsePerson(node, resolvers)])
  );
  const families = familyNodes.map(node => parseFamily(node, resolvers));

  if (!Object.keys(people).length && !families.length) {
    throw new Error('GEDCOM contains no individual or family records');
  }
  const diagnostics = buildDiagnostics({
    roots,
    malformedLines,
    people,
    families,
    sourceRecords,
    tracking
  });
  const normalizedFamilies = families.map(family => ({
    ...family,
    partners: family.partners.filter(personId => people[personId]),
    children: family.children.filter(personId => people[personId])
  }));
  return { people, families: normalizedFamilies, sources: sourceRecords, diagnostics };
}
