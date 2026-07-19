import { parseGedcom } from './gedcom-parser.js';
import { parseGedcomSyntax as parseSyntax } from './gedcom-syntax.js';

export const TREE_DOCUMENT_SCHEMA_VERSION = 2;

const copy = value => value == null ? value : structuredClone(value);

const generatedTreeId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error('A tree document id is required when random UUIDs are unavailable');
};

const syntaxNodeAt = (syntax, path) => {
  let nodes = syntax?.roots;
  let node = null;
  for (const index of path ?? []) {
    node = nodes?.[index];
    if (!node) return null;
    nodes = node.children;
  }
  return node;
};

const recordPathFor = (syntax, tag, xref) => {
  const index = syntax?.roots?.findIndex(node => node.tag === tag && node.xref === xref) ?? -1;
  return index < 0 ? null : [index];
};

const childPathFor = (syntax, parentPath, tag, occurrence) => {
  if (!parentPath) return null;
  const parent = syntaxNodeAt(syntax, parentPath);
  let seen = 0;
  for (const [index, child] of (parent?.children ?? []).entries()) {
    if (child.tag !== tag) continue;
    if (seen === occurrence) return [...parentPath, index];
    seen += 1;
  }
  return null;
};

const childPathForTags = (syntax, parentPath, tags, occurrence) => {
  if (!parentPath) return null;
  const parent = syntaxNodeAt(syntax, parentPath);
  let seen = 0;
  for (const [index, child] of (parent?.children ?? []).entries()) {
    if (!tags.has(child.tag)) continue;
    if (seen === occurrence) return [...parentPath, index];
    seen += 1;
  }
  return null;
};

const originWithPath = path => path ? { path } : undefined;

const assertOnlyKeys = (value, allowed, label) => {
  const unsupported = Object.keys(value ?? {}).filter(key => !allowed.has(key));
  if (unsupported.length) throw new Error(`${label} contains unsupported ${unsupported.join(', ')}`);
};

const validatePartialDate = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a structured date`);
  }
  assertOnlyKeys(value, new Set(['year', 'month', 'day']), label);
  if (!Number.isInteger(value.year)) throw new Error(`${label} year must be an integer`);
  if (value.month != null && (!Number.isInteger(value.month) || value.month < 1 || value.month > 12)) {
    throw new Error(`${label} month must be between 1 and 12`);
  }
  if (value.day != null && (!Number.isInteger(value.day) || value.day < 1 || value.day > 31)) {
    throw new Error(`${label} day must be between 1 and 31`);
  }
};

export const validateDateValue = (value, label = 'Date') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  assertOnlyKeys(value, new Set(['original', 'interpretation']), label);
  if (typeof value.original !== 'string') throw new Error(`${label} original must be text`);
  if (!Object.hasOwn(value, 'interpretation')) return value;
  const interpretation = value.interpretation;
  if (typeof interpretation !== 'object' || Array.isArray(interpretation)) {
    throw new Error(`${label} interpretation must be an object`);
  }
  assertOnlyKeys(interpretation, new Set(['kind', 'start', 'end', 'provenance']), `${label} interpretation`);
  if (!new Set(['exact', 'approximate', 'before', 'after', 'range']).has(interpretation.kind)) {
    throw new Error(`${label} interpretation kind is invalid`);
  }
  if (!new Set(['explicit', 'inferred']).has(interpretation.provenance)) {
    throw new Error(`${label} interpretation provenance is invalid`);
  }
  validatePartialDate(interpretation.start, `${label} interpretation start`);
  if (interpretation.kind === 'range') validatePartialDate(interpretation.end, `${label} interpretation end`);
  else if (interpretation.end != null) throw new Error(`${label} interpretation end is only valid for a range`);
  return value;
};

export const validatePlaceValue = (value, label = 'Place') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  assertOnlyKeys(value, new Set(['original', 'interpretation']), label);
  if (typeof value.original !== 'string') throw new Error(`${label} original must be text`);
  if (!Object.hasOwn(value, 'interpretation')) return value;
  const interpretation = value.interpretation;
  if (typeof interpretation !== 'object' || Array.isArray(interpretation)) {
    throw new Error(`${label} interpretation must be an object`);
  }
  assertOnlyKeys(interpretation, new Set(['normalized', 'parts', 'provenance']), `${label} interpretation`);
  if (typeof interpretation.normalized !== 'string') {
    throw new Error(`${label} interpretation normalized must be text`);
  }
  if (interpretation.parts != null && (!Array.isArray(interpretation.parts)
    || interpretation.parts.some(part => typeof part !== 'string'))) {
    throw new Error(`${label} interpretation parts must be text values`);
  }
  if (!new Set(['explicit', 'inferred']).has(interpretation.provenance)) {
    throw new Error(`${label} interpretation provenance is invalid`);
  }
  return value;
};

const assertMap = (document, key, label) => {
  if (!document[key] || Array.isArray(document[key]) || typeof document[key] !== 'object') {
    throw new Error(`Tree document ${key} must be a map`);
  }
  Object.entries(document[key]).forEach(([id, record]) => {
    if (!record || record.id !== id) {
      throw new Error(`${label} map key ${id} does not match its record id`);
    }
  });
};

const assertReferences = (owner, ids, records, label) => {
  (ids ?? []).forEach(id => {
    if (!records[id]) throw new Error(`${owner.id} references missing ${label} ${id}`);
  });
};

const assertOrigin = (origin, allowedKeys, label) => {
  if (!origin) return;
  const unsupported = Object.keys(origin).filter(key => !allowedKeys.has(key));
  if (unsupported.length) throw new Error(`${label} origin contains unsupported ${unsupported.join(', ')}`);
  for (const [key, value] of Object.entries(origin)) {
    if (key === 'xref') {
      if (typeof value !== 'string' || !value) throw new Error(`${label} origin xref is invalid`);
      continue;
    }
    if (!Array.isArray(value) || !value.length
      || value.some(index => !Number.isInteger(index) || index < 0)) {
      throw new Error(`${label} origin ${key} is not a valid syntax path`);
    }
  }
};

export function validateTreeDocument(document) {
  if (!document || document.schemaVersion !== TREE_DOCUMENT_SCHEMA_VERSION) {
    throw new Error(`Tree document schemaVersion must be ${TREE_DOCUMENT_SCHEMA_VERSION}`);
  }
  if (typeof document.id !== 'string' || !document.id) throw new Error('Tree document id is required');
  if (!Number.isInteger(document.revision) || document.revision < 0) {
    throw new Error('Tree document revision must be a non-negative integer');
  }
  if (!document.importMetadata?.gedcom || !document.importMetadata.diagnostics) {
    throw new Error('Tree document importMetadata must contain GEDCOM metadata and diagnostics');
  }
  for (const [key, label] of [
    ['people', 'Person'], ['families', 'Family'], ['events', 'Event'], ['notes', 'Note'],
    ['citations', 'Citation'], ['sources', 'Source'], ['media', 'Media']
  ]) assertMap(document, key, label);

  const validateOwner = owner => {
    assertReferences(owner, owner.eventIds, document.events, 'event');
    assertReferences(owner, owner.noteIds, document.notes, 'note');
    assertReferences(owner, owner.citationIds, document.citations, 'citation');
    assertReferences(owner, owner.mediaIds, document.media, 'media');
  };
  Object.values(document.people).forEach(person => {
    validateOwner(person);
    assertOrigin(person.origin, new Set(['xref', 'path']), person.id);
    const names = person.names ?? [];
    if (!names.length || names.some(name => !name.id)) {
      throw new Error(`${person.id} must have names with stable ids`);
    }
    names.forEach(name => assertOrigin(name.origin, new Set(['path']), name.id));
  });
  Object.values(document.families).forEach(family => {
    validateOwner(family);
    assertOrigin(family.origin, new Set(['xref', 'path']), family.id);
    for (const collection of ['partnerLinks', 'childLinks']) {
      const ids = new Set();
      const memberships = new Set();
      (family[collection] ?? []).forEach(link => {
        if (!link.id) throw new Error(`${family.id} has a ${collection} entry without an id`);
        if (ids.has(link.id)) throw new Error(`${family.id} has duplicate link ${link.id}`);
        if (!document.people[link.personId]) {
          throw new Error(`${family.id} references missing person ${link.personId}`);
        }
        assertOrigin(link.origin, new Set(['path', 'parentagePath']), link.id);
        if (typeof link.order !== 'number' || !Number.isInteger(link.order) || link.order < 0) {
          throw new Error(`${link.id} order must be a non-negative integer`);
        }
        if (typeof link.preferred !== 'boolean') throw new Error(`${link.id} preferred must be boolean`);
        if (!new Set(['accepted', 'disputed']).has(link.status)) {
          throw new Error(`${link.id} relationship status is invalid`);
        }
        if (!new Set(['explicit', 'inferred', 'uncertain', 'unknown']).has(link.certainty)) {
          throw new Error(`${link.id} relationship certainty is invalid`);
        }
        if (collection === 'partnerLinks' && !new Set(['husband', 'wife', 'partner']).has(link.role)) {
          throw new Error(`${link.id} partner role is invalid`);
        }
        if (collection === 'childLinks'
          && !new Set(['biological', 'adoptive', 'foster', 'step', 'unknown']).has(link.parentage)) {
          throw new Error(`${link.id} parentage is invalid`);
        }
        assertReferences(link, link.citationIds, document.citations, 'citation');
        const membership = `${link.personId}|${link.role ?? link.parentage ?? ''}`;
        if (memberships.has(membership)) {
          throw new Error(`${family.id} has duplicate ${collection} membership for ${link.personId}`);
        }
        ids.add(link.id);
        memberships.add(membership);
      });
    }
  });
  Object.values(document.events).forEach(event => {
    const owners = event.ownerType === 'person' ? document.people : document.families;
    const owner = owners[event.ownerId];
    if (!owner) throw new Error(`${event.id} references missing ${event.ownerType} ${event.ownerId}`);
    if (!(owner.eventIds ?? []).includes(event.id)) {
      throw new Error(`${event.id} is not linked from owner ${event.ownerId}`);
    }
    assertOrigin(event.origin, new Set(['path', 'datePath', 'placePath']), event.id);
    validateDateValue(event.date, `${event.id} date`);
    validatePlaceValue(event.place, `${event.id} place`);
    assertReferences(event, event.noteIds, document.notes, 'note');
    assertReferences(event, event.citationIds, document.citations, 'citation');
    assertReferences(event, event.mediaIds, document.media, 'media');
  });
  Object.values(document.notes).forEach(note => {
    assertOrigin(note.origin, new Set(['path']), note.id);
    assertReferences(note, note.citationIds, document.citations, 'citation');
  });
  Object.values(document.citations).forEach(citation => {
    assertOnlyKeys(citation, new Set(['id', 'sourceId', 'page', 'text', 'unresolved', 'origin']), citation.id);
    assertOrigin(citation.origin, new Set(['path']), citation.id);
    if (typeof citation.page !== 'string') throw new Error(`${citation.id} citation page must be text`);
    if (typeof citation.text !== 'string') throw new Error(`${citation.id} citation text must be text`);
    if (Object.hasOwn(citation, 'unresolved') && typeof citation.unresolved !== 'boolean') {
      throw new Error(`${citation.id} citation unresolved must be boolean`);
    }
    if (typeof citation.sourceId !== 'string' || !citation.sourceId) {
      throw new Error(`${citation.id} must reference a source`);
    }
    if (citation.sourceId && !document.sources[citation.sourceId] && !citation.unresolved) {
      throw new Error(`${citation.id} references missing source ${citation.sourceId}`);
    }
  });
  Object.values(document.sources).forEach(source => {
    assertOrigin(source.origin, new Set(['path']), source.id);
  });
  Object.values(document.media).forEach(item => {
    assertOrigin(item.origin, new Set(['path']), item.id);
  });
  return document;
}

export function createTreeDocument(graph, {
  id = generatedTreeId(),
  source = '',
  filename = '',
  syntax = null
} = {}) {
  if (!graph?.people || !Array.isArray(graph?.families)) {
    throw new TypeError('Imported family graph must contain people and families');
  }
  const document = {
    schemaVersion: TREE_DOCUMENT_SCHEMA_VERSION,
    id,
    revision: 0,
    people: {},
    families: {},
    events: {},
    notes: {},
    citations: {},
    sources: {},
    media: {},
    editLog: []
  };
  const diagnostics = copy(graph.diagnostics ?? { format: {}, counts: {}, warnings: [] });
  const importedSyntax = syntax ?? (source ? parseSyntax(source) : null);
  document.importMetadata = { filename, diagnostics, gedcom: { syntax: importedSyntax } };
  syntax = importedSyntax;

  Object.values(graph.sources ?? {}).forEach(sourceRecord => {
    const path = recordPathFor(syntax, 'SOUR', sourceRecord.id);
    document.sources[sourceRecord.id] = {
      ...copy(sourceRecord),
      ...(originWithPath(path) ? { origin: originWithPath(path) } : {})
    };
  });

  const sequence = { event: 0, note: 0, citation: 0, media: 0, source: 0 };
  const nextId = type => `${type}:${++sequence[type]}`;

  const addCitations = (citations, parentPath) => (citations ?? []).map((citation, index) => {
    const citationId = nextId('citation');
    const path = childPathFor(syntax, parentPath, 'SOUR', index);
    let sourceId = citation.id ?? '';
    if (!sourceId && citation.record) {
      do sourceId = `source:inline:${++sequence.source}`;
      while (document.sources[sourceId]);
      document.sources[sourceId] = {
        ...copy(citation.record),
        id: sourceId,
        importedId: citation.record.id ?? '',
        importedInline: true,
        ...(originWithPath(path) ? { origin: originWithPath(path) } : {})
      };
    }
    document.citations[citationId] = {
      id: citationId,
      sourceId,
      page: citation.page ?? '',
      text: citation.text ?? '',
      ...(citation.id && !document.sources[citation.id] ? { unresolved: true } : {}),
      ...(originWithPath(path) ? { origin: originWithPath(path) } : {})
    };
    return citationId;
  });

  const addNotes = (notes, parentPath) => (notes ?? []).map((note, index) => {
    const noteId = nextId('note');
    const attachmentPath = childPathFor(syntax, parentPath, 'NOTE', index);
    const attachment = syntaxNodeAt(syntax, attachmentPath);
    const referencedXref = attachment?.value?.match(/^@([^@]+)@$/)?.[1];
    const path = referencedXref
      ? recordPathFor(syntax, 'NOTE', referencedXref) ?? attachmentPath
      : attachmentPath;
    document.notes[noteId] = {
      id: noteId,
      text: note.text ?? '',
      citationIds: addCitations(note.sources, path),
      ...(originWithPath(path) ? { origin: originWithPath(path) } : {})
    };
    return noteId;
  });

  const addMedia = (media, parentPath) => (media ?? []).map((item, index) => {
    const mediaId = nextId('media');
    const path = childPathFor(syntax, parentPath, 'OBJE', index);
    document.media[mediaId] = {
      ...copy(item),
      id: mediaId,
      ...(originWithPath(path) ? { origin: originWithPath(path) } : {})
    };
    return mediaId;
  });

  const addEvents = (events, ownerType, ownerId, recordPath) => {
    const occurrences = new Map();
    return (events ?? []).map(event => {
      const eventId = nextId('event');
      const occurrence = occurrences.get(event.tag) ?? 0;
      occurrences.set(event.tag, occurrence + 1);
      const path = childPathFor(syntax, recordPath, event.tag, occurrence);
      const datePath = childPathFor(syntax, path, 'DATE', 0);
      const placePath = childPathFor(syntax, path, 'PLAC', 0);
      document.events[eventId] = {
        id: eventId,
        ownerType,
        ownerId,
        tag: event.tag,
        label: event.label,
        value: event.value ?? '',
        date: { original: event.date ?? '' },
        place: { original: event.place ?? '' },
        noteIds: addNotes(event.notes, path),
        citationIds: addCitations(event.sources, path),
        mediaIds: [],
        ...(path ? { origin: { path, ...(datePath ? { datePath } : {}), ...(placePath ? { placePath } : {}) } } : {})
      };
      return eventId;
    });
  };

  Object.values(graph.people).forEach(person => {
    const path = recordPathFor(syntax, 'INDI', person.id);
    const namePath = childPathFor(syntax, path, 'NAME', 0);
    const importedName = syntaxNodeAt(syntax, namePath)?.value ?? person.name;
    document.people[person.id] = {
      id: person.id,
      names: [{
        id: `${person.id}:name:0`,
        type: 'primary',
        value: importedName,
        ...(originWithPath(namePath) ? { origin: originWithPath(namePath) } : {})
      }],
      sex: person.sex ?? '',
      aliases: (person.aliases ?? []).map((value, index) => ({
        id: `${person.id}:alias:${index}`,
        value,
        ...(originWithPath(childPathFor(syntax, path, 'ALIA', index))
          ? { origin: originWithPath(childPathFor(syntax, path, 'ALIA', index)) }
          : {})
      })),
      suffix: person.suffix ?? '',
      titles: (person.titles ?? []).map((value, index) => ({
        id: `${person.id}:title:${index}`,
        value,
        ...(originWithPath(childPathFor(syntax, path, 'TITL', index))
          ? { origin: originWithPath(childPathFor(syntax, path, 'TITL', index)) }
          : {})
      })),
      eventIds: addEvents(person.facts, 'person', person.id, path),
      noteIds: addNotes(person.notes, path),
      citationIds: addCitations(person.sources, path),
      mediaIds: addMedia(person.media, path),
      record: copy(person.record ?? { uid: '', changed: '' }),
      origin: { xref: person.id, ...(path ? { path } : {}) }
    };
  });

  graph.families.forEach(family => {
    const path = recordPathFor(syntax, 'FAM', family.id);
    const partnerLinks = family.partners.map((personId, index) => {
      const linkPath = childPathForTags(syntax, path, new Set(['HUSB', 'WIFE', 'PART']), index);
      const importedTag = syntaxNodeAt(syntax, linkPath)?.tag;
      const person = graph.people[personId];
      const role = importedTag === 'HUSB' ? 'husband'
        : importedTag === 'WIFE' ? 'wife'
          : importedTag === 'PART' ? 'partner'
            : person?.sex === 'M' ? 'husband' : person?.sex === 'F' ? 'wife' : 'partner';
      return {
        id: `${family.id}:partner:${index}`,
        personId,
        role,
        order: index,
        preferred: false,
        status: 'accepted',
        certainty: importedTag ? 'explicit' : 'inferred',
        citationIds: [],
        ...(originWithPath(linkPath) ? { origin: originWithPath(linkPath) } : {})
      };
    });
    const childLinks = family.children.map((personId, index) => {
      const linkPath = childPathFor(syntax, path, 'CHIL', index);
      const personPath = recordPathFor(syntax, 'INDI', personId);
      const membership = syntaxNodeAt(syntax, personPath)?.children?.find(node => (
        node.tag === 'FAMC' && node.value?.match(/^@([^@]+)@$/)?.[1] === family.id
      ));
      const membershipIndex = membership
        ? syntaxNodeAt(syntax, personPath).children.indexOf(membership)
        : -1;
      const membershipPath = membershipIndex >= 0 ? [...personPath, membershipIndex] : null;
      const parentagePath = childPathFor(syntax, membershipPath, 'PEDI', 0);
      const importedParentage = syntaxNodeAt(syntax, parentagePath)?.value?.trim().toLowerCase() ?? '';
      const parentage = new Map([
        ['birth', 'biological'], ['biological', 'biological'], ['natural', 'biological'],
        ['adopted', 'adoptive'], ['adoptive', 'adoptive'], ['foster', 'foster'], ['step', 'step']
      ]).get(importedParentage) ?? 'unknown';
      const statusValue = childPathFor(syntax, membershipPath, 'STAT', 0);
      const status = /challenged|disputed/i.test(syntaxNodeAt(syntax, statusValue)?.value ?? '')
        ? 'disputed'
        : 'accepted';
      const preferredPath = childPathForTags(syntax, membershipPath, new Set(['PREF', '_PREF']), 0);
      const preferred = /^(?:y|yes|true|1)$/i.test(syntaxNodeAt(syntax, preferredPath)?.value?.trim() ?? '');
      return {
        id: `${family.id}:child:${index}`,
        personId,
        parentage,
        order: index,
        preferred,
        status,
        certainty: parentagePath ? 'explicit' : 'unknown',
        citationIds: [],
        ...((linkPath || parentagePath) ? {
          origin: {
            ...(linkPath ? { path: linkPath } : {}),
            ...(parentagePath ? { parentagePath } : {})
          }
        } : {})
      };
    });
    document.families[family.id] = {
      id: family.id,
      partnerLinks,
      childLinks,
      eventIds: addEvents(family.events, 'family', family.id, path),
      noteIds: addNotes(family.notes, path),
      citationIds: addCitations(family.sources, path),
      mediaIds: addMedia(family.media, path),
      record: copy(family.record ?? { uid: '', changed: '' }),
      origin: { xref: family.id, ...(path ? { path } : {}) }
    };
  });

  return validateTreeDocument(document);
}

export function treeDocumentFromGedcom(source, {
  parseGedcomImpl = parseGedcom,
  parseGedcomSyntax = parseSyntax,
  syntax = parseGedcomSyntax?.(source) ?? null,
  ...options
} = {}) {
  return createTreeDocument(parseGedcomImpl(source), { ...options, source, syntax });
}
