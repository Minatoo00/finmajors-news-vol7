process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ArticleProcessorImpl } = require('../src/lib/ingest/article-processor');

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

const baseEnv = { NODE_ENV: 'test', OPENAI_MODEL: 'gpt-4o-mini' };

const richContent = `ジョン・ドウは中央銀行の政策について詳しく説明し、市場参加者に慎重な姿勢を促した。
John Doe noted that financial conditions remain tight, and John Doe emphasised the importance of data-dependent decisions in the upcoming meetings.`;

const createCandidate = (overrides = {}) => ({
  url: 'https://news.example.com/a',
  sourceDomain: 'news.example.com',
  title: 'Headline A',
  description: 'desc',
  publishedAt: new Date('2025-10-20T01:00:00Z'),
  fetchedAt: new Date('2025-10-20T01:05:00Z'),
  ...overrides,
});

const processorFactory = (overrides = {}) =>
  new ArticleProcessorImpl({
    contentExtractor: overrides.contentExtractor ?? (async () => ({ content: richContent })),
    resolveUrl: overrides.resolveUrl ?? (async (url) => ({ url: 'https://original.example.com/article', method: 'batchexecute' })),
    logger: overrides.logger,
  });

test('process returns draft and summary input when content and mentions are sufficient', async () => {
  const processor = processorFactory();
  const candidate = createCandidate();

  const result = await processor.process(candidate, entry, { person: entry, env: baseEnv });

  assert.ok(result);
  assert.equal(result.draft.url, 'https://original.example.com/article');
  assert.equal(result.draft.title, candidate.title);
  assert.equal(result.draft.content?.includes('中央銀行'), true);
  assert.equal(result.draft.contentHash?.length, 64);
  assert.equal(result.draft.summaryText, undefined);
  assert.equal(result.summaryInput.url, 'https://original.example.com/article');
  assert.equal(result.summaryInput.persons[0].slug, entry.person.slug);
});

test('process skips when extractor returns null content', async () => {
  const processor = processorFactory({
    contentExtractor: async () => null,
  });

  const result = await processor.process(createCandidate(), entry, { person: entry, env: baseEnv });
  assert.equal(result, null);
});

test('process skips when mention count below threshold', async () => {
  const processor = processorFactory({
    contentExtractor: async () => ({
      content:
        '世界経済の動向や市場センチメントについて一般的な記述を行い、為替や株式の価格変動に対する分析を述べた記事です。政策当局者の具体的な名前には触れていません。',
    }),
  });

  const result = await processor.process(createCandidate(), entry, { person: entry, env: baseEnv });
  assert.equal(result, null);
});

test('process skips when content too short or lacks unique tokens', async () => {
  const processor = processorFactory({
    contentExtractor: async () => ({ content: 'ジョン・ドウ、ジョン・ドウ、ジョン。Same name repeated repeatedly John John.' }),
  });

  const result = await processor.process(createCandidate(), entry, { person: entry, env: baseEnv });
  assert.equal(result, null);
});
