process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resetEnvCache } = require('../src/lib/env');

function setEnv(overrides = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
    OPENAI_API_KEY: 'test-key',
    OPENAI_MODEL: 'gpt-4o-mini',
    ENABLE_INTERNAL_CRON: 'false',
    INGEST_CRON: '5 * * * *',
    INGEST_CONCURRENCY: '1',
    INGEST_RETRY_LIMIT: '0',
    INGEST_TIMEOUT_MS: '1000',
    INGEST_JOB_TIMEOUT_MS: '2000',
    INGEST_MAX_ARTICLES_PER_PERSON: '8',
    BASIC_AUTH_USER: 'admin',
    BASIC_AUTH_PASS: 'secret',
    ALLOWED_ADMIN_IPS: '203.0.113.5',
    ...overrides,
  });
  resetEnvCache();
}

test('middleware bypasses non-protected paths and enforces auth on admin routes', async () => {
  setEnv();
  const { middleware, createAdminMiddleware } = require('../src/middleware');

  const publicResponse = middleware({
    nextUrl: new URL('https://example.com/news'),
    headers: new Headers(),
  });

  assert.equal(publicResponse.headers.get('x-middleware-next'), '1');

  const unauthorized = middleware({
    nextUrl: new URL('https://example.com/admin/persons'),
    headers: new Headers(),
  });
  assert.equal(unauthorized.status, 401);

  const env = {
    BASIC_AUTH_USER: 'admin',
    BASIC_AUTH_PASS: 'secret',
    ALLOWED_ADMIN_IPS: ['203.0.113.5'],
  };

  const customMiddleware = createAdminMiddleware(env);
  const authorized = customMiddleware({
    nextUrl: new URL('https://example.com/api/admin/persons'),
    headers: new Headers({
      authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}`,
      'x-forwarded-for': '203.0.113.5',
    }),
  });

  assert.equal(authorized.headers.get('x-middleware-next'), '1');
});
