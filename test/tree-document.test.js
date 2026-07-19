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
  '1 SOUR A family letter',
  '0 @I3@ INDI',
  '1 NAME Anne /KING-NOEL/',
  '1 FAMC @F1@',
  '2 PEDI adopted',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I1@',
  '1 CHIL @I3@',
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

  assert.equal(document.schemaVersion, 2);
  assert.equal(document.id, 'tree-1');
  assert.equal(document.revision, 0);
  assert.deepEqual(Object.keys(document.people), ['I1', 'I2', 'I3']);
  assert.deepEqual(Object.keys(document.families), ['F1']);
  assert.equal(document.people.I1.names[0].value, 'Ada LOVELACE');
  assert.ok(document.people.I1.names[0].id);
  assert.ok(document.people.I1.aliases[0].id);
  assert.ok(document.people.I1.titles[0].id);
  assert.ok(document.people.I1.eventIds.every(id => document.events[id]?.id === id));
  assert.ok(document.people.I1.noteIds.every(id => document.notes[id]?.id === id));
  assert.ok(document.people.I1.mediaIds.every(id => document.media[id]?.id === id));
  assert.ok(document.families.F1.partnerLinks.every(link => link.id && document.people[link.personId]));
  assert.deepEqual(document.families.F1.childLinks[0], {
    id: 'F1:child:0',
    personId: 'I3',
    parentage: 'unknown',
    order: 0,
    preferred: false,
    status: 'accepted',
    certainty: 'unknown',
    citationIds: []
  });
  assert.ok(document.families.F1.partnerLinks.every(link => (
    link.status === 'accepted' && link.certainty === 'inferred' && Array.isArray(link.citationIds)
  )));
  const inlineCitation = document.citations[document.people.I2.citationIds[0]];
  assert.ok(inlineCitation.sourceId);
  assert.equal(inlineCitation.inlineRecord, undefined);
  assert.equal(inlineCitation.text, '');
  assert.equal(document.sources[inlineCitation.sourceId].title, 'A family letter');
  assert.equal(document.sources[inlineCitation.sourceId].importedInline, true);
  assert.equal(document.importMetadata.gedcom.syntax, syntax);
  assert.equal(document.importMetadata.diagnostics.format.version, '5.5.1');
  assert.equal(validateTreeDocument(document), document);
});

test('imports parentage semantics into first-class relationship records', () => {
  const document = treeDocumentFromGedcom(source, { id: 'tree-1' });

  assert.deepEqual(document.families.F1.childLinks[0], {
    id: 'F1:child:0',
    personId: 'I3',
    parentage: 'adoptive',
    order: 0,
    preferred: false,
    status: 'accepted',
    certainty: 'explicit',
    citationIds: [],
    origin: { path: [4, 2], parentagePath: [3, 1, 0] }
  });
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

test('allows optional structured interpretations without replacing original text', () => {
  const document = treeDocumentFromGedcom(source, { id: 'tree-1' });
  const birth = document.events[document.people.I1.eventIds[0]];
  birth.date.interpretation = {
    kind: 'approximate',
    start: { year: 1815, month: 12, day: 10 },
    provenance: 'inferred'
  };
  birth.place.interpretation = {
    normalized: 'London, England, United Kingdom',
    parts: ['London', 'England', 'United Kingdom'],
    provenance: 'inferred'
  };

  assert.doesNotThrow(() => validateTreeDocument(document));
  assert.equal(projectTreeDocument(document).people.I1.birth, '10 DEC 1815');
  assert.equal(projectTreeDocument(document).people.I1.birthPlace, 'London, England');
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

test('rejects malformed canonical citation fields', () => {
  const document = treeDocumentFromGedcom(source, { id: 'tree-1' });
  const citation = document.citations[document.people.I2.citationIds[0]];
  citation.page = { invalid: true };

  assert.throws(() => validateTreeDocument(document), /citation.*page.*text/i);
});
