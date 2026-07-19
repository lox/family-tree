import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGedcom } from '../src/gedcom-parser.js';
import { parseGedcomSyntax } from '../src/gedcom-syntax.js';
import {
  createTreeDocument,
  treeDocumentFromGedcom,
  validateTreeDocument
} from '../src/tree-document.js';
import { projectTreeDocument } from '../src/tree-projection.js';

const source = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Ada /LOVELACE/',
  '2 NSFX Countess',
  '1 ALIA Augusta Ada King',
  '1 TITL Countess of Lovelace',
  '1 SEX F',
  '1 BIRT',
  '2 DATE 10 DEC 1815',
  '2 PLAC London, England',
  '2 NOTE Born at home.',
  '2 SOUR @S1@',
  '3 PAGE certificate 12',
  '1 NOTE Biographical note.',
  '1 OBJE',
  '2 FILE portrait.jpg',
  '2 TITL Portrait',
  '0 @I2@ INDI',
  '1 NAME William /KING-NOEL/',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I1@',
  '1 MARR',
  '2 DATE 8 JUL 1835',
  '0 @S1@ SOUR',
  '1 TITL Birth register',
  '0 TRLR'
].join('\n');

test('imports a graph into a canonical document with stable child identities', () => {
  const syntax = { roots: [{ tag: 'HEAD' }] };
  const document = treeDocumentFromGedcom(source, {
    id: 'tree-1',
    syntax,
    parseGedcomSyntax: () => assert.fail('injected syntax should take precedence')
  });

  assert.equal(document.schemaVersion, 1);
  assert.equal(document.id, 'tree-1');
  assert.equal(document.revision, 0);
  assert.deepEqual(Object.keys(document.people), ['I1', 'I2']);
  assert.deepEqual(Object.keys(document.families), ['F1']);
  assert.equal(document.people.I1.names[0].value, 'Ada LOVELACE');
  assert.ok(document.people.I1.names[0].id);
  assert.ok(document.people.I1.aliases[0].id);
  assert.ok(document.people.I1.titles[0].id);
  assert.ok(document.people.I1.eventIds.every(id => document.events[id]?.id === id));
  assert.ok(document.people.I1.noteIds.every(id => document.notes[id]?.id === id));
  assert.ok(document.people.I1.mediaIds.every(id => document.media[id]?.id === id));
  assert.ok(document.families.F1.partnerLinks.every(link => link.id && document.people[link.personId]));
  assert.equal(document.importMetadata.gedcom.syntax, syntax);
  assert.equal(document.importMetadata.diagnostics.format.version, '5.5.1');
  assert.equal(validateTreeDocument(document), document);
});

test('projects a canonical document back to the existing graph contract', () => {
  const graph = parseGedcom(source);
  const document = createTreeDocument(graph, { id: 'tree-1', source });

  assert.deepEqual(projectTreeDocument(document), graph);
});

test('derives convenience fields from canonical events during projection', () => {
  const document = treeDocumentFromGedcom(source, { id: 'tree-1' });
  const birth = document.events[document.people.I1.eventIds[0]];
  birth.date.original = 'ABT 1816';
  birth.place.original = 'Greater London';

  const graph = projectTreeDocument(document);

  assert.equal(graph.people.I1.birth, 'ABT 1816');
  assert.equal(graph.people.I1.birthPlace, 'Greater London');
  assert.equal(graph.people.I1.facts[0].date, 'ABT 1816');
  assert.equal(graph.families[0].marriage, '8 JUL 1835');
});

test('uses a syntax parser when an imported syntax object is not supplied', () => {
  const syntax = { records: ['preserved'] };
  const document = treeDocumentFromGedcom(source, {
    id: 'tree-1',
    parseGedcomSyntax: value => {
      assert.equal(value, source);
      return syntax;
    }
  });

  assert.equal(document.importMetadata.gedcom.syntax, syntax);
});

test('retains GEDCOM origins while projecting normalized display names', () => {
  const document = treeDocumentFromGedcom(source, {
    id: 'tree-1',
    parseGedcomSyntax
  });

  assert.equal(document.people.I1.names[0].value, 'Ada /LOVELACE/');
  assert.deepEqual(document.people.I1.origin, { xref: 'I1', path: [1] });
  assert.deepEqual(document.people.I1.names[0].origin, { path: [1, 0] });
  assert.deepEqual(document.events[document.people.I1.eventIds[0]].origin, {
    path: [1, 4],
    datePath: [1, 4, 0],
    placePath: [1, 4, 1]
  });
  assert.equal(projectTreeDocument(document).people.I1.name, 'Ada LOVELACE');
});

test('rejects dangling canonical references', () => {
  const document = treeDocumentFromGedcom(source, { id: 'tree-1' });
  document.people.I1.eventIds.push('event:missing');

  assert.throws(() => validateTreeDocument(document), /missing event/i);
});
