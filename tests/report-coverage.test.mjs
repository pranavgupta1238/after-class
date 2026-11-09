import { test } from 'node:test';
import assert from 'node:assert/strict';
import coverage from '../server/report-coverage.js';
const { campusReportCoverage } = coverage;
const report = (reporterId, status = 'pending', extra = {}) => ({
  campusId: 'campus', status,
  reporter: { id: reporterId, campusId: 'campus', publicAlias: 'SameAlias' },
  reportedUser: { id: 'target', campusId: 'campus' }, ...extra
});

test('coverage deduplicates stable IDs across outcomes, not aliases or incident counts', () => {
  const result = campusReportCoverage([
    report('a'), report('a', 'resolved'), report('a', 'dismissed'), report('b', 'reviewing')
  ], new Map([['campus', 100]])).get('target');
  assert.deepEqual(result, { uniqueReporters: 2, registeredAccounts: 100, percentage: 2,
    outcomes: { pending: 1, reviewing: 1, resolved: 1, dismissed: 1 } });
});

test('self reports, unknown reporters and other campuses do not inflate coverage', () => {
  const result = campusReportCoverage([
    report('a'), report('target'), report('b', 'pending', { campusId: 'other' }),
    report('c', 'pending', { reporter: { id: 'c', campusId: 'other' } }),
    report('d', 'pending', { reporter: null })
  ], new Map([['campus', 4]])).get('target');
  assert.equal(result.uniqueReporters, 1);
  assert.equal(result.percentage, 25);
  assert.equal(result.outcomes.pending, 1);
});

test('each campus uses its own population; missing or inconsistent populations are unavailable', () => {
  const reports = [report('a'), report('b', 'dismissed', {
    campusId: 'other', reporter: { id: 'b', campusId: 'other' },
    reportedUser: { id: 'other-target', campusId: 'other' }
  })];
  const results = campusReportCoverage(reports, new Map([['campus', 4], ['other', 50]]));
  assert.equal(results.get('target').percentage, 25);
  assert.equal(results.get('other-target').percentage, 2);
  for (const population of [undefined, 0, -1]) {
    assert.equal(campusReportCoverage(reports, new Map([['campus', population]])).get('target').percentage, null);
  }
  assert.equal(campusReportCoverage([report('a'), report('b')], new Map([['campus', 1]])).get('target').percentage, null);
});
