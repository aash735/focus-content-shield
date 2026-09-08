import test from 'node:test';
import assert from 'node:assert/strict';
import { ImportExportService } from '../src/services/import-export-service.js';

test('ImportExportService - export and import validation', () => {
  const dummyState = {
    permanentDomains: [{ domain: 'example.com', source: 'user_permanent' }],
    protectedKeywords: [{ pattern: 'sex', matchScope: 'path_query', action: 'redirect_safe_home' }],
    categories: { adult: { enabled: true } },
    schedules: [],
    settings: { searchProtectionEnabled: true }
  };

  const jsonStr = ImportExportService.exportConfiguration(dummyState);
  assert.ok(jsonStr);
  assert.ok(jsonStr.includes('example.com'));

  const importResult = ImportExportService.parseAndValidateImport(jsonStr);
  assert.equal(importResult.success, true);
  assert.equal(importResult.data.permanentDomains.length, 1);
  assert.equal(importResult.data.permanentDomains[0].domain, 'example.com');
  assert.equal(importResult.data.protectedKeywords[0].pattern, 'sex');
});
