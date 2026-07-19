import test from 'node:test';
import assert from 'node:assert/strict';

import { exportGedcom } from '../src/gedcom-export.js';
import { parseGedcom } from '../src/gedcom-parser.js';
import { nodeAtPath, parseGedcomSyntax } from '../src/gedcom-syntax.js';
import { createTreeDocument } from '../src/tree-document.js';
import { applyTreeTransaction } from '../src/tree-operations.js';

const source = [
  '\uFEFF0 HEAD\r\n',
  '1 GEDC\r\n',
  '2 VERS 5.5.1\r\n',
  '0 @I1@ INDI\r\n',
  '1 NAME Ada /LOVELACE/\r\n',
  '1 BIRT Y\r\n',
  '2 DATE ABT 1815\r\n',
  '2 PLAC London\r\n',
  '2 _PRIVATE keep me  \r\n',
  '0 @F1@ FAM\r\n',
  '1 WIFE @I404@\r\n',
  '0 TRLR\r\n'
].join('');

function editableDocument() {
  const syntax = parseGedcomSyntax(source);
  const document = createTreeDocument(parseGedcom(source), {
    id: 'tree-1', source, syntax
  });
  const name = document.people.I1.names[0];
  const birthId = document.people.I1.eventIds[0];
  return applyTreeTransaction(document, {
    id: 'tx-1', baseRevision: 0, provenance: {}, operations: [
      { type: 'person.name.set', personId: 'I1', nameId: name.id, value: 'Augusta Ada /KING/' },
      {
        type: 'event.update', eventId: birthId,
        changes: {
          value: '',
          date: { original: '10 DEC 1815' },
          place: { original: 'London, England' }
        }
      },
      {
        type: 'event.add', ownerType: 'person', ownerId: 'I1',
        event: {
          id: 'event-new', tag: 'OCCU', label: 'Occupation', value: 'Mathematician',
          date: { original: '1835' }, place: { original: '' },
          noteIds: [], citationIds: [], mediaIds: []
        }
      },
      {
        type: 'note.add', ownerType: 'person', ownerId: 'I1',
        note: {
          id: 'note-new',
          text: 'Worked on the analytical engine.\nWith Charles Babbage.',
          citationIds: []
        }
      }
    ]
  }).document;
}

test('syntax parsing preserves source bytes and exposes stable origin paths', () => {
  const syntax = parseGedcomSyntax(source);

  assert.equal(syntax.bom, '\uFEFF');
  assert.equal(syntax.newline, '\r\n');
  assert.equal(nodeAtPath(syntax, [1]).xref, 'I1');
  assert.equal(nodeAtPath(syntax, [1, 1, 0]).value, 'ABT 1815');
  assert.equal(nodeAtPath(syntax, [1, 1, 2]).value, 'keep me  ');
  assert.deepEqual(syntax.malformedLines, []);
});

test('a revision-zero export is the exact original GEDCOM', () => {
  const document = createTreeDocument(parseGedcom(source), {
    id: 'tree-1', source, syntax: parseGedcomSyntax(source)
  });

  assert.equal(exportGedcom(document), source);
});

test('an edited export patches supported fields and preserves untouched data byte-for-byte', () => {
  const exported = exportGedcom(editableDocument());

  assert.match(exported, /1 NAME Augusta Ada \/KING\/\r\n/);
  assert.match(exported, /1 BIRT\r\n2 DATE 10 DEC 1815\r\n2 PLAC London, England\r\n/);
  assert.ok(exported.includes('2 _PRIVATE keep me  \r\n'));
  assert.ok(exported.includes('0 @F1@ FAM\r\n1 WIFE @I404@\r\n'));
  assert.match(exported, /1 OCCU Mathematician\r\n2 DATE 1835\r\n/);
  assert.match(exported, /1 NOTE Worked on the analytical engine\.\r\n2 CONT With Charles Babbage\.\r\n/);
  assert.equal(exported.startsWith('\uFEFF'), true);
});

test('edited export fails instead of silently dropping malformed input', () => {
  const damagedSource = '0 @I1@ INDI\n1 NAME Ada /LOVELACE/\nnot gedcom\n0 TRLR\n';
  const document = createTreeDocument(parseGedcom(damagedSource), {
    id: 'tree-1', source: damagedSource, syntax: parseGedcomSyntax(damagedSource)
  });
  document.revision = 1;

  assert.throws(() => exportGedcom(document), /cannot safely export.*line 3/i);
});

test('exports a canonical document edit without rewriting imported names or shared notes', () => {
  const imported = [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '0 @I1@ INDI',
    '1 NAME Ada /LOVELACE/',
    '1 BIRT',
    '2 DATE ABT 1815',
    '1 NOTE @N1@',
    '0 @N1@ NOTE Biography.',
    '1 CONT Still preserved.',
    '0 TRLR',
    ''
  ].join('\n');
  const document = createTreeDocument(parseGedcom(imported), {
    id: 'tree-1',
    source: imported,
    syntax: parseGedcomSyntax(imported)
  });
  const eventId = document.people.I1.eventIds[0];
  const edited = applyTreeTransaction(document, {
    id: 'tx-1',
    baseRevision: 0,
    operations: [{
      type: 'event.update',
      eventId,
      changes: { date: { original: '10 DEC 1815' } }
    }]
  }).document;

  const exported = exportGedcom(edited);

  assert.ok(exported.includes('1 NAME Ada /LOVELACE/\n'));
  assert.ok(exported.includes('1 NOTE @N1@\n'));
  assert.ok(exported.includes('0 @N1@ NOTE Biography.\n1 CONT Still preserved.\n'));
  assert.ok(exported.includes('2 DATE 10 DEC 1815\n'));
});

test('inserts a missing event detail inside its event subtree', () => {
  const imported = [
    '0 @I1@ INDI',
    '1 NAME Ada /LOVELACE/',
    '1 BIRT',
    '1 _AFTER belongs to the person',
    '0 TRLR',
    ''
  ].join('\n');
  const document = createTreeDocument(parseGedcom(imported), {
    id: 'tree-1', source: imported, syntax: parseGedcomSyntax(imported)
  });
  const birthId = document.people.I1.eventIds[0];
  const edited = applyTreeTransaction(document, {
    id: 'date', baseRevision: 0, provenance: {},
    operations: [{
      type: 'event.update', eventId: birthId,
      changes: { date: { original: '10 DEC 1815' } }
    }]
  }).document;

  assert.ok(exportGedcom(edited).includes([
    '1 BIRT',
    '2 DATE 10 DEC 1815',
    '1 _AFTER belongs to the person'
  ].join('\n')));
});

test('refuses to contradict structured name fields during a name edit', () => {
  const imported = [
    '0 @I1@ INDI',
    '1 NAME Ada /LOVELACE/',
    '2 GIVN Ada',
    '2 SURN Lovelace',
    '0 TRLR',
    ''
  ].join('\n');
  const document = createTreeDocument(parseGedcom(imported), {
    id: 'tree-1', source: imported, syntax: parseGedcomSyntax(imported)
  });
  const name = document.people.I1.names[0];
  const edited = applyTreeTransaction(document, {
    id: 'rename', baseRevision: 0, provenance: {},
    operations: [{ type: 'person.name.set', personId: 'I1', nameId: name.id, value: 'Grace /HOPPER/' }]
  }).document;

  assert.throws(() => exportGedcom(edited), /structured name fields/i);
});
