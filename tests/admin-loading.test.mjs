import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminLoader } from '../src/admin-loader.mjs';
import adminReports from '../server/admin-reports.js';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('fast reports settle before slow staff; duplicate and fresh requests reuse the result', async () => {
  const staff = deferred(); const changes = {}; let requests = 0;
  const loader = createAdminLoader({
    request: key => { requests++; return key === 'moderators' ? staff.promise : Promise.resolve({ reports: [1] }); },
    onChange: (key, value) => { changes[key] = { ...value }; }
  });
  const slow = loader.load('moderators');
  const fast = loader.load('reports');
  assert.equal(fast, loader.load('reports', { force: true }));
  await fast;
  assert.equal(changes.reports.loaded, true);
  assert.equal(changes.moderators.loading, true);
  await loader.load('reports');
  assert.equal(requests, 2);
  staff.resolve({}); await slow;
});

test('refresh retains data; timeout stops spinner and permits retry', async () => {
  let hang = false; let last; let signal;
  const loader = createAdminLoader({ timeoutMs: 15,
    request: (_, s) => { signal = s; return hang ? new Promise(() => {}) : Promise.resolve({ reports: [1] }); },
    onChange: (_, value) => { last = { ...value }; }
  });
  await loader.load('reports'); hang = true;
  const refresh = loader.load('reports', { force: true });
  assert.equal(last.loaded, true); assert.deepEqual(last.data.reports, [1]);
  await refresh;
  assert.equal(last.loading, false); assert.match(last.error, /too long/);
  assert.equal(signal.aborted, true); assert.deepEqual(last.data.reports, [1]);
  hang = false; await loader.load('reports', { force: true });
  assert.equal(last.error, '');
});

test('account changes discard in-flight privileged results', async () => {
  const pending = deferred(); const changes = [];
  const loader = createAdminLoader({ request: () => pending.promise, onChange: (_, e) => changes.push({ ...e }) });
  const request = loader.load('reports'); loader.reset();
  pending.resolve({ reports: ['private'] }); await request;
  assert.equal(changes.length, 1);
  assert.equal(changes[0].loaded, undefined);
});

test('report list uses a fixed number of queries without fetching any conversation context', async () => {
  let calls = 0;
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i), campusId: 'campus', status: 'pending',
    reportedUserId: 'target', reportedUser: { id: 'target', campusId: 'campus' },
    reporter: { id: 'reporter', campusId: 'campus' }, message: { id: 'm', content: 'flagged' } }));
  const reports = await adminReports.listReports({
    report: { findMany: async () => { calls++; return rows; } },
    user: { groupBy: async () => { calls++; return [{ campusId: 'campus', _count: { _all: 4 } }]; } },
    moderationAction: { findMany: async () => { calls++; return []; } },
    message: { findMany: () => assert.fail('List must not load transcripts') }
  });
  assert.equal(calls, 3); assert.equal(reports.length, 100);
  assert.equal(reports[0].reportedUser.reportCoverage.percentage, 25);
  assert.equal(reports[0].contextLoaded, false);
  assert.equal(reports[0].message.content, 'flagged');
});

test('on-demand context retains chronology and handles deleted or missing reports', async () => {
  let lookups = 0;
  const prisma = { report: { findUnique: async () => ({ message: { id: 'flagged', roomId: 'room', createdAt: new Date() } }) },
    message: { findMany: async query => {
      lookups++; assert.equal(query.take, 5); assert.equal(query.where.roomId, 'room');
      return query.orderBy.createdAt === 'desc' ? [{ id: 'before2' }, { id: 'before1' }] : [{ id: 'after' }];
    } }
  };
  const result = await adminReports.reportContext(prisma, 'report');
  assert.equal(lookups, 2);
  assert.deepEqual(result.transcript.map(m => m.id), ['before1', 'before2', 'flagged', 'after']);
  prisma.report.findUnique = async () => ({ message: null });
  assert.deepEqual((await adminReports.reportContext(prisma, 'report')).transcript, []);
  assert.equal(lookups, 2);
  prisma.report.findUnique = async () => null;
  assert.equal(await adminReports.reportContext(prisma, 'missing'), null);
});
