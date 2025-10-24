process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { IngestScheduler } = require('../src/lib/ingest/scheduler');

const baseLogger = () => {
  const entries = [];
  return {
    logger: {
      info: (message, meta) => entries.push({ level: 'info', message, meta }),
      error: (message, meta) => entries.push({ level: 'error', message, meta }),
    },
    entries,
  };
};

test('scheduler does not register cron when internal cron disabled', () => {
  const calls = [];
  const { logger, entries } = baseLogger();
  const scheduler = new IngestScheduler({
    enableInternalCron: false,
    cronExpression: '5 * * * *',
    jobRunner: async () => {
      calls.push('run');
    },
    scheduleFn: () => {
      throw new Error('schedule should not be called');
    },
    logger,
  });

  const task = scheduler.start();
  assert.equal(task, null);
  assert.equal(calls.length, 0);
  assert.equal(entries.length, 0);
});

test('scheduler registers cron and invokes job runner when triggered', async () => {
  const scheduleCalls = [];
  const runners = [];
  const fakeTask = {
    started: false,
    stopped: false,
    start() {
      this.started = true;
    },
    stop() {
      this.stopped = true;
    },
  };

  const scheduleFn = (expression, handler) => {
    scheduleCalls.push(expression);
    runners.push(handler);
    return fakeTask;
  };

  const jobRunnerCalls = [];
  const { logger, entries } = baseLogger();

  const scheduler = new IngestScheduler({
    enableInternalCron: true,
    cronExpression: '5 * * * *',
    jobRunner: async () => {
      jobRunnerCalls.push('run');
    },
    scheduleFn,
    logger,
  });

  const task = scheduler.start();
  assert.equal(scheduleCalls.length, 1);
  assert.equal(scheduleCalls[0], '5 * * * *');
  assert.equal(fakeTask.started, true);
  assert.notEqual(task, null);

  await runners[0]();
  assert.equal(jobRunnerCalls.length, 1);
  assert.equal(entries.find((entry) => entry.level === 'info' && entry.message === 'ingest.cron.trigger'), undefined);

  scheduler.stop();
  assert.equal(fakeTask.stopped, true);
});

test('runOnce executes job runner and logs structured message', async () => {
  const { logger, entries } = baseLogger();
  const scheduler = new IngestScheduler({
    enableInternalCron: false,
    cronExpression: '5 * * * *',
    jobRunner: async () => ({
      jobId: 42n,
      stats: { inserted: 2, deduped: 1, errors: 0 },
    }),
    logger,
  });

  const result = await scheduler.runOnce();
  assert.equal(result.stats.inserted, 2);
  const logEntry = entries.find((entry) => entry.message === 'ingest.run.complete');
  assert.ok(logEntry, 'structured log entry should exist');
  assert.equal(logEntry.meta.jobId, '42');
  assert.equal(logEntry.meta.inserted, 2);
  assert.equal(logEntry.meta.deduped, 1);
  assert.equal(logEntry.meta.errors, 0);
  assert.equal(logEntry.meta.skipped ?? 0, 0);
  assert.equal(logEntry.meta.fetched ?? 0, 0);
});
