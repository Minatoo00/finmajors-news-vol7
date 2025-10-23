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
  const richContent = `ジョン・ドウは中央銀行の政策について詳しく説明し、市場参加者に慎重な姿勢を促した。 John Doe noted that financial conditions remain tight, and John Doe emphasised the importance of data-dependent decisions in the upcoming meetings.`;

  const processor = new ArticleProcessorImpl({
    contentExtractor: async (url) => {
      extractorCalls.push(url);
      return {
        content: richContent,
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
  assert.equal(result.content, richContent.replace(/\s+/g, ' ').trim());
  assert.equal(result.contentHash.length, 64);
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

test('ArticleProcessor skips when mention count below threshold', async () => {
  let summaryCalls = 0;
  const processor = new ArticleProcessorImpl({
    contentExtractor: async () => ({
      content:
        '世界経済の動向や市場センチメントについて一般的な記述を行い、為替や株式の価格変動に対する分析を述べた記事です。政策当局者の具体的な名前には触れていません。',
    }),
    resolveUrl: async (url) => ({ url, method: 'fallback' }),
    summaryService: {
      generateSummary: async () => {
        summaryCalls += 1;
        return 'summary';
      },
    },
  });

  const result = await processor.process(
    {
      url: 'https://news.example.com/no-mention',
      sourceDomain: 'news.example.com',
      title: 'Headline',
      description: null,
      publishedAt: new Date(),
      fetchedAt: new Date(),
    },
    entry,
    {
      person: entry,
      env: { OPENAI_MODEL: 'gpt-4o-mini' },
    },
  );

  assert.equal(result, null);
  assert.equal(summaryCalls, 0);
});

test('ArticleProcessor skips short content with insufficient unique tokens', async () => {
  const processor = new ArticleProcessorImpl({
    contentExtractor: async () => ({
      content: 'ジョン・ドウ、ジョン・ドウ、ジョン。Same name repeated repeatedly John John.',
    }),
    resolveUrl: async (url) => ({ url, method: 'fallback' }),
    summaryService: {
      generateSummary: async () => 'summary',
    },
  });

  const result = await processor.process(
    {
      url: 'https://news.example.com/repeated',
      sourceDomain: 'news.example.com',
      title: 'Headline',
      description: null,
      publishedAt: new Date(),
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
