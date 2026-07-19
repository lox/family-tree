import {
  nodeAtPath,
  recordByXref,
  subtreeLastLineIndex
} from './gedcom-syntax.js';
import { validateTreeDocument } from './tree-document.js';

const values = collection => Object.values(collection ?? {});

const own = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);

function sourceFromSyntax(syntax) {
  return `${syntax.bom ?? ''}${(syntax.lines ?? [])
    .map(line => `${line.raw}${line.ending ?? ''}`)
    .join('')}`;
}

function importedSyntax(document) {
  const syntax = document?.importMetadata?.gedcom?.syntax;
  return syntax?.roots && syntax.lines ? syntax : null;
}

function originPath(origin, key = 'path') {
  return Array.isArray(origin?.[key]) ? origin[key] : null;
}

function requireSingleLine(value, context) {
  const text = String(value ?? '');
  if (/\r|\n/.test(text)) throw new Error(`${context} cannot contain a line break`);
  return text;
}

function lineFor(node, value) {
  const payload = requireSingleLine(value, `${node.tag} value`);
  const xref = node.xref ? ` @${node.xref}@` : '';
  return `${node.level}${xref} ${node.tag}${payload ? ` ${payload}` : ''}`;
}

function canonicalLine(level, tag, value = '') {
  const payload = requireSingleLine(value, `${tag} value`);
  return `${level} ${tag}${payload ? ` ${payload}` : ''}`;
}

function originalText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.original === 'string') return value.original;
  return '';
}

function primaryName(person) {
  const names = Array.isArray(person.names) ? person.names : [];
  return names.find(name => name.type === 'primary') ?? names[0] ?? null;
}

function personXref(person) {
  return person?.origin?.xref;
}

function eventTag(event) {
  const tag = String(event.tag ?? '').trim();
  return /^[A-Z][A-Z0-9_]{2,30}$/.test(tag) ? tag : '';
}

function memberIds(person, key) {
  const ids = person?.[key];
  return Array.isArray(ids) ? ids : [];
}

function ownedRecords(document, person, collectionName, idsKey) {
  return memberIds(person, idsKey).map(id => document[collectionName][id]);
}

function directChild(node, tag) {
  return node?.children?.find(child => child.tag === tag) ?? null;
}

function addPayloadLines(target, level, tag, text) {
  const parts = String(text ?? '').replace(/\r\n?|\n/g, '\n').split('\n');
  target.push(canonicalLine(level, tag, parts.shift() ?? ''));
  parts.forEach(part => target.push(canonicalLine(level + 1, 'CONT', part)));
}

function syntaxText(node) {
  let text = node?.value ?? '';
  (node?.children ?? [])
    .filter(child => child.tag === 'CONT' || child.tag === 'CONC')
    .forEach(child => {
      if (child.tag === 'CONT' && text) text += '\n';
      text += syntaxText(child);
    });
  return text.trim();
}

function importedText(syntax, node) {
  const reference = node?.value?.match(/^@([^@]+)@$/)?.[1];
  if (!reference) return syntaxText(node);
  const sharedNote = recordByXref(syntax, reference, 'NOTE')
    ?? recordByXref(syntax, reference, 'SNOTE');
  return sharedNote ? syntaxText(sharedNote) : syntaxText(node);
}

function patchValue(node, value, patches, removals, {
  removeEmpty = false,
  importedValue = syntaxText(node)
} = {}) {
  const candidate = String(value ?? '');
  if (candidate === importedValue) return;
  if (node.children.some(child => child.tag === 'CONT' || child.tag === 'CONC')) {
    throw new Error(`Cannot safely update multiline ${node.tag} yet`);
  }
  const text = requireSingleLine(candidate, `${node.tag} value`);
  if (!text && removeEmpty) {
    if (node.children.length) {
      throw new Error(`Cannot safely remove ${node.tag}; it contains preserved substructures`);
    }
    removals.add(node.lineIndex);
    return;
  }
  patches.set(node.lineIndex, lineFor(node, text));
}

function nodeFromOrigin(syntax, origin, key = 'path') {
  const path = originPath(origin, key);
  return path ? nodeAtPath(syntax, path) : null;
}

function queueInsertion(insertions, lineIndex, lines) {
  insertions.set(lineIndex, [...(insertions.get(lineIndex) ?? []), ...lines]);
}

function patchEvent(syntax, event, record, patches, removals, additions, insertions) {
  const suppliedPath = originPath(event.origin);
  const eventNode = suppliedPath ? nodeAtPath(syntax, suppliedPath) : null;
  if (suppliedPath && !eventNode) {
    throw new Error(`Cannot export event ${event.id ?? event.type}: its GEDCOM origin is missing`);
  }
  if (!eventNode) {
    const tag = eventTag(event);
    if (!tag) throw new Error(`Cannot export event ${event.id ?? ''}: unsupported tag ${event.tag ?? ''}`);
    additions.push(canonicalLine(record.level + 1, tag, event.value ?? ''));
    const date = originalText(event.date);
    const place = originalText(event.place);
    if (date) additions.push(canonicalLine(record.level + 2, 'DATE', date));
    if (place) additions.push(canonicalLine(record.level + 2, 'PLAC', place));
    return;
  }

  if (own(event, 'value')) patchValue(eventNode, event.value, patches, removals, {
    importedValue: importedText(syntax, eventNode)
  });
  const eventAdditions = [];
  for (const [property, tag, originKey] of [
    ['date', 'DATE', 'datePath'],
    ['place', 'PLAC', 'placePath']
  ]) {
    if (!own(event, property)) continue;
    const child = nodeFromOrigin(syntax, event.origin, originKey) ?? directChild(eventNode, tag);
    const text = originalText(event[property]);
    if (child) patchValue(child, text, patches, removals, { removeEmpty: true });
    else if (text) eventAdditions.push(canonicalLine(eventNode.level + 1, tag, text));
  }
  if (eventAdditions.length) {
    queueInsertion(insertions, subtreeLastLineIndex(eventNode), eventAdditions);
  }
}

/**
 * Export an editable tree document by overlaying supported changes onto its
 * original GEDCOM syntax. Untouched imported lines are emitted verbatim.
 */
export function exportGedcom(document) {
  if (!document || typeof document !== 'object') {
    throw new TypeError('Tree document is required for GEDCOM export');
  }
  validateTreeDocument(document);
  const syntax = importedSyntax(document);
  if (!syntax) throw new Error('Cannot export GEDCOM without original import syntax');
  const original = sourceFromSyntax(syntax);
  if ((document.revision ?? 0) === 0) return original;
  if (syntax.malformedLines?.length) {
    const first = syntax.malformedLines[0];
    const lineNumber = first.lineNumber ?? first.line ?? '?';
    throw new Error(`Cannot safely export edited GEDCOM: malformed input at line ${lineNumber}`);
  }

  const patches = new Map();
  const removals = new Set();
  const insertions = new Map();
  for (const person of values(document.people)) {
    const recordPath = originPath(person.origin);
    const record = recordPath
      ? nodeAtPath(syntax, recordPath)
      : recordByXref(syntax, personXref(person), 'INDI');
    if (!record || record.tag !== 'INDI') {
      throw new Error(`Cannot export person ${person.id ?? ''}: its GEDCOM record is missing`);
    }
    const additions = [];
    const name = primaryName(person);
    if (name) {
      const suppliedNamePath = originPath(name.origin);
      const nameNode = suppliedNamePath
        ? nodeAtPath(syntax, suppliedNamePath)
        : directChild(record, 'NAME');
      if (suppliedNamePath && !nameNode) {
        throw new Error(`Cannot export name ${name.id ?? ''}: its GEDCOM origin is missing`);
      }
      if (nameNode) {
        const nextName = name.value ?? name.text ?? '';
        const structuredNameTags = new Set(['NPFX', 'GIVN', 'NICK', 'SPFX', 'SURN', 'NSFX']);
        if (nextName !== syntaxText(nameNode)
          && nameNode.children.some(child => structuredNameTags.has(child.tag))) {
          throw new Error('Cannot safely update a name with structured name fields yet');
        }
        patchValue(nameNode, nextName, patches, removals);
      }
      else additions.push(canonicalLine(record.level + 1, 'NAME', name.value ?? name.text ?? ''));
    }

    ownedRecords(document, person, 'events', 'eventIds').forEach(event => {
      patchEvent(syntax, event, record, patches, removals, additions, insertions);
    });
    ownedRecords(document, person, 'notes', 'noteIds').forEach(note => {
      const suppliedNotePath = originPath(note.origin);
      const noteNode = suppliedNotePath ? nodeAtPath(syntax, suppliedNotePath) : null;
      if (suppliedNotePath && !noteNode) {
        throw new Error(`Cannot export note ${note.id ?? ''}: its GEDCOM origin is missing`);
      }
      if (noteNode) {
        if (String(note.text ?? '') !== importedText(syntax, noteNode)) {
          throw new Error(`Cannot safely update imported note ${note.id ?? ''} yet`);
        }
      }
      else addPayloadLines(additions, record.level + 1, 'NOTE', note.text ?? '');
    });
    if (additions.length) {
      const lineIndex = subtreeLastLineIndex(record);
      queueInsertion(insertions, lineIndex, additions);
    }
  }

  const output = [];
  syntax.lines.forEach((line, index) => {
    if (!removals.has(index)) output.push(`${patches.get(index) ?? line.raw}${line.ending ?? ''}`);
    const added = insertions.get(index);
    if (!added?.length) return;
    const newline = line.ending || syntax.newline || '\n';
    // A line without a terminator needs one before newly appended descendants.
    if (!line.ending && output.length) output[output.length - 1] += newline;
    output.push(`${added.join(newline)}${newline}`);
  });
  return `${syntax.bom ?? ''}${output.join('')}`;
}
