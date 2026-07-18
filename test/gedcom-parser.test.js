import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGedcom } from '../src/gedcom-parser.js';

test('parses GEDCOM people, vital facts, occupation, and family links across CR line endings', () => {
  const ged = [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '0 @I1@ INDI',
    '1 NAME Ada /LOVELACE/',
    '1 SEX F',
    '1 BIRT',
    '2 DATE 10 DEC 1815',
    '2 PLAC London, England',
    '1 OCCU Mathematician',
    '2 CONT and writer',
    '0 @I2@ INDI',
    '1 NAME William /KING-NOEL/',
    '0 @I3@ INDI',
    '1 NAME Byron /KING-NOEL/',
    '0 @F1@ FAM',
    '1 HUSB @I2@',
    '1 WIFE @I1@',
    '1 CHIL @I3@',
    '1 MARR',
    '2 DATE 8 JUL 1835',
    '1 DIV',
    '2 DATE 16 MAY 1845',
    '0 TRLR'
  ].join('\r');

  const graph = parseGedcom(ged);

  assert.equal(Object.keys(graph.people).length, 3);
  assert.deepEqual(graph.people.I1, {
    id: 'I1',
    name: 'Ada LOVELACE',
    sex: 'F',
    birth: '10 DEC 1815',
    birthPlace: 'London, England',
    death: '',
    deathPlace: '',
    occupation: 'Mathematician\nand writer',
    aliases: [],
    suffix: '',
    titles: [],
    facts: [
      {
        tag: 'BIRT',
        label: 'Birth',
        value: '',
        date: '10 DEC 1815',
        place: 'London, England',
        notes: [],
        sources: []
      },
      {
        tag: 'OCCU',
        label: 'Occupation',
        value: 'Mathematician\nand writer',
        date: '',
        place: '',
        notes: [],
        sources: []
      }
    ],
    notes: [],
    sources: [],
    media: [],
    record: { uid: '', changed: '' }
  });
  assert.deepEqual(graph.families[0], {
    id: 'F1',
    partners: ['I2', 'I1'],
    children: ['I3'],
    marriage: '8 JUL 1835',
    divorce: '16 MAY 1845',
    separation: '',
    annulment: '',
    events: [
      { tag: 'MARR', label: 'Marriage', value: '', date: '8 JUL 1835', place: '', notes: [], sources: [] },
      { tag: 'DIV', label: 'Divorce', value: '', date: '16 MAY 1845', place: '', notes: [], sources: [] }
    ],
    notes: [],
    sources: [],
    media: [],
    record: { uid: '', changed: '' }
  });
});

test('retains and resolves rich person facts, notes, citations, and media', () => {
  const ged = [
    '0 @I1@ INDI',
    '1 _UID persistent-id',
    '1 NAME John /DOE/',
    '2 NSFX Jr.',
    '1 SEX M',
    '1 ALIA Jack',
    '1 TITL Dr.',
    '1 SOUR @S1@',
    '2 PAGE page 4',
    '1 BIRT',
    '2 DATE 1 JAN 1900',
    '2 PLAC Melbourne, Australia',
    '2 NOTE Born at home.',
    '2 SOUR @S1@',
    '3 PAGE certificate 12',
    '1 EDUC',
    '2 DATE 1920',
    '2 PLAC University of Melbourne',
    '2 NOTE Studied medicine.',
    '1 HEAL @N2@',
    '1 NOTE @N1@',
    '1 OBJE',
    '2 FILE portrait.jpg',
    '2 FORM image/jpeg',
    '2 TITL Graduation portrait',
    '2 _PRIM Y',
    '1 CHAN',
    '2 DATE 2 FEB 2020',
    '0 @N1@ NOTE',
    '1 CONT A long biographical note.',
    '2 SOUR @S1@',
    '0 @N2@ NOTE',
    '1 CONT Recovered from influenza.',
    '0 @S1@ SOUR',
    '1 TYPE Vital Record',
    '1 TITL Birth register',
    '1 AUTH State of Victoria',
    '1 URL https://example.test/register',
    '0 TRLR'
  ].join('\n');

  const person = parseGedcom(ged).people.I1;

  assert.equal(person.suffix, 'Jr.');
  assert.deepEqual(person.aliases, ['Jack']);
  assert.deepEqual(person.titles, ['Dr.']);
  assert.deepEqual(person.record, { uid: 'persistent-id', changed: '2 FEB 2020' });
  assert.equal(person.facts.find(fact => fact.tag === 'EDUC').notes[0].text, 'Studied medicine.');
  assert.equal(person.facts.find(fact => fact.tag === 'HEAL').value, 'Recovered from influenza.');
  assert.equal(person.facts.find(fact => fact.tag === 'BIRT').sources[0].page, 'certificate 12');
  assert.equal(person.notes[0].text, 'A long biographical note.');
  assert.equal(person.notes[0].sources[0].record.title, 'Birth register');
  assert.equal(person.sources[0].record.title, 'Birth register');
  assert.deepEqual(person.media[0], {
    file: 'portrait.jpg',
    format: 'image/jpeg',
    title: 'Graduation portrait',
    type: '',
    primary: true,
    note: ''
  });
});

test('fails clearly when a file has no GEDCOM individual or family records', () => {
  assert.throws(() => parseGedcom('0 HEAD\n0 TRLR'), /no individual or family records/i);
});
