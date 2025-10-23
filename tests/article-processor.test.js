process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ArticleProcessorImpl } = require('../src/lib/ingest/article-processor');
const { SummaryGenerationError } = require('../src/lib/ingest/errors');

const entry = {
  person: {
    id: 1n,
    slug: 'john-doe',
    nameJp: 'ジョン・ドウ',
    nameEn: 'John Doe',
    role: '総裁',
    active: true,
    institutionCode: 'FRB',
    institutionNameJp: '米連邦準備制度理事会',
    institutionNameEn: 'Federal Reserve Board',
  },
  aliases: ['J. Doe'],
};

test('ArticleProcessor resolves URL, extracts content, and requests summary', async () => {
  const extractorCalls = [];
  const summaryCalls = [];
  const resolveCalls = [];
  const processor = new ArticleProcessorImpl({
    contentExtractor: async (url) => {
      extractorCalls.push(url);
      return {
        content: '本文テキスト',
      };
    },
    resolveUrl: async (url) => {
      resolveCalls.push(url);
      return {
        url: 'https://original.example.com/article',
        method: 'batchexecute',
      };
    },
    summaryService: {
      generateSummary: async (input) => {
        summaryCalls.push(input);
        return '要約結果';
      },
    },
  });

  const candidate = {
    url: 'https://news.example.com/a',
    sourceDomain: 'news.example.com',
    title: 'Headline A',
    description: 'desc',
    publishedAt: new Date('2025-10-20T01:00:00Z'),
    fetchedAt: new Date('2025-10-20T01:05:00Z'),
  };

  const result = await processor.process(candidate, entry, {
    person: entry,
    env: {
      OPENAI_MODEL: 'gpt-4o-mini',
    },
  });

  assert.ok(result);
  assert.equal(result.url, 'https://original.example.com/article');
  assert.equal(result.title, candidate.title);
  assert.equal(result.summaryText, '要約結果');
  assert.equal(result.content, '本文テキスト');
  assert.equal(extractorCalls.length, 1);
  assert.equal(summaryCalls.length, 1);
  assert.deepEqual(resolveCalls, [candidate.url]);
  assert.equal(summaryCalls[0].url, 'https://original.example.com/article');
});

test('ArticleProcessor skips when content not available', async () => {
  const processor = new ArticleProcessorImpl({
    contentExtractor: async () => null,
    resolveUrl: async (url) => ({ url, method: 'fallback' }),
    summaryService: {
      generateSummary: async () => 'summary',
    },
  });

  const result = await processor.process(
    {
      url: 'https://news.example.com/b',
      sourceDomain: 'news.example.com',
      title: 'Headline B',
      description: null,
      publishedAt: null,
      fetchedAt: new Date(),
    },
    entry,
    {
      person: entry,
      env: { OPENAI_MODEL: 'gpt-4o-mini' },
    },
  );

  assert.equal(result, null);
});

test('ArticleProcessor throws when summary generation returns empty', async () => {
  const processor = new ArticleProcessorImpl({
    contentExtractor: async () => ({ content: '本文テキスト' }),
    resolveUrl: async (url) => ({ url, method: 'fallback' }),
    summaryService: {
      generateSummary: async () => null,
    },
    logger: {
      info: () => {},
      error: () => {},
    },
  });

  await assert.rejects(
    () =>
      processor.process(
        {
          url: 'https://news.example.com/c',
          sourceDomain: 'news.example.com',
          title: 'Headline C',
          description: null,
          publishedAt: new Date(),
          fetchedAt: new Date(),
        },
        entry,
        {
          person: entry,
          env: { OPENAI_MODEL: 'gpt-4o-mini' },
        },
      ),
    SummaryGenerationError,
  );
});
