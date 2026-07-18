import test from 'node:test';
import assert from 'node:assert/strict';

import { buildImportReport } from '../src/import-report.js';

test('builds a concise clean report for a fully supported file', () => {
  const report = buildImportReport('kennedy.ged', {
    format: { version: '5.5.1', producer: 'Reunion' },
    counts: { people: 49, families: 16, sources: 25 },
    warnings: []
  });

  assert.deepEqual(report, {
    label: 'kennedy.ged',
    status: 'Imported without warnings',
    metadata: 'GEDCOM 5.5.1 from Reunion · 49 people · 16 families · 25 sources',
    warnings: []
  });
});

test('preserves actionable warning details in the report', () => {
  const report = buildImportReport('incomplete.ged', {
    format: { version: '', producer: '' },
    counts: { people: 2, families: 1, sources: 0 },
    warnings: [{
      code: 'missing-person-references',
      count: 1,
      message: '1 family link points to a person that is not in the file.',
      details: ['F1 child: I9']
    }]
  });

  assert.equal(report.status, 'Imported with 1 warning');
  assert.equal(report.metadata, 'Unknown GEDCOM version · 2 people · 1 family · 0 sources');
  assert.deepEqual(report.warnings, [{
    message: '1 family link points to a person that is not in the file.',
    details: ['F1 child: I9']
  }]);
});
