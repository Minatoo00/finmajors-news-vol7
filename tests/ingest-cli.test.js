process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createIngestApplication } = require('../scripts/ingest');

test('createIngestApplication runs ingest job once with stub dependencies', async () => {
  const events = [];
  const env = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
    DIRECT_DATABASE_URL: undefined,
    OPENAI_API_KEY: 'test-key',
    OPENAI_MODEL: 'gpt-4o-mini',
    ENABLE_INTERNAL_CRON: false,
    INGEST_CRON: '5 * * * *',
    INGEST_CONCURRENCY: 1,
    INGEST_RETRY_LIMIT: 0,
    INGEST_TIMEOUT_MS: 500,
    INGEST_JOB_TIMEOUT_MS: 1000,
    INGEST_MAX_ARTICLES_PER_PERSON: 8,
    BASIC_AUTH_USER: 'admin',
    BASIC_AUTH_PASS: 'secret',
    ALLOWED_ADMIN_IPS: [],
  };

  const prisma = {
    person: {
      findMany: async () => [],
    },
    ingestJobRun: {
      create: async (args) => {
        events.push({ type: 'create', args });
        return { id: BigInt(1) };
      },
      update: async (args) => {
        events.push({ type: 'update', args });
        return { id: BigInt(1) };
      },
    },
  };

  const fetchImpl = async () =>
    new Response(JSON.stringify({ output_text: 'summary' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const app = createIngestApplication({ env, prisma, fetchImpl });

  await app.runOnce();

  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'create');
  assert.equal(events[1].type, 'update');
});
