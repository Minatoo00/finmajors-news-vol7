process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { SummaryServiceImpl } = require('../src/lib/ingest/summary-service');

const input = {
  title: 'Headline',
  content: 'article body text',
  url: 'https://news.example.com/a',
  persons: [
    {
      slug: 'john-doe',
      nameJp: 'ジョン・ドウ',
      nameEn: 'John Doe',
      institutionCode: 'FRB',
    },
  ],
};

const createLogger = () => {
  const entries = [];
  return {
    logger: {
      info: () => {},
      error: (message, meta) => entries.push({ message, meta }),
    },
    entries,
  };
};

test('SummaryService calls OpenAI API and extracts text', async () => {
  const calls = [];
  const { logger } = createLogger();
  const service = new SummaryServiceImpl({
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: {
                    value: '要約テキスト',
                  },
                },
              ],
            },
          ],
        }),
      };
    },
    env: {
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'gpt-4o-mini',
    },
    logger,
  });

  const result = await service.generateSummary(input);
  assert.equal(result, '要約テキスト');
  assert.equal(calls.length, 1);
  const request = calls[0];
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  const body = JSON.parse(request.init.body);
  assert.equal(body.model, 'gpt-4o-mini');
  assert.ok(body.input);
});

test('SummaryService retries on failure and returns null after max retries', async () => {
  let attempts = 0;
  const { logger, entries } = createLogger();
  const service = new SummaryServiceImpl({
    fetch: async () => {
      attempts += 1;
      return {
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'error',
      };
    },
    env: {
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'gpt-4o-mini',
    },
    maxRetries: 2,
    logger,
  });

  const result = await service.generateSummary(input);
  assert.equal(result, null);
  assert.equal(attempts, 3);
  const httpLogs = entries.filter((entry) => entry.message === 'ingest.summary.http-error');
  assert.equal(httpLogs.length, 3);
  assert.ok(httpLogs.every((entry) => entry.meta.code === 'SUMMARY_HTTP_ERROR'));
  const maxRetryLog = entries.find((entry) => entry.message === 'ingest.summary.max-retries');
  assert.ok(maxRetryLog);
  assert.equal(maxRetryLog.meta.code, 'SUMMARY_MAX_RETRIES');
});
