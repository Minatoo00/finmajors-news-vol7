process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { IngestJobRunner } = require('../src/lib/ingest/job-runner');
const { SummaryGenerationError } = require('../src/lib/ingest/errors');

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://localhost/test',
  DIRECT_DATABASE_URL: 'postgres://localhost/test',
  OPENAI_API_KEY: 'test',
  OPENAI_MODEL: 'gpt-4o-mini',
  ENABLE_INTERNAL_CRON: false,
  INGEST_CRON: '5 * * * *',
  INGEST_CONCURRENCY: 2,
  INGEST_RETRY_LIMIT: 1,
  INGEST_TIMEOUT_MS: 10000,
  INGEST_JOB_TIMEOUT_MS: 480000,
  INGEST_MAX_ARTICLES_PER_PERSON: 10,
  BASIC_AUTH_USER: 'user',
  BASIC_AUTH_PASS: 'pass',
  ALLOWED_ADMIN_IPS: [],
};

const personEntry = (id, slug) => ({
  person: {
    id: BigInt(id),
    slug,
    nameJp: `名前${id}`,
    nameEn: `Name ${id}`,
    role: '総裁',
    active: true,
    institutionCode: 'FRB',
    institutionNameJp: '米連邦準備制度理事会',
    institutionNameEn: 'Federal Reserve Board',
  },
  aliases: [],
});

const createLogger = () => {
  const entries = [];
  return {
    logger: {
      info: (message, meta) => entries.push({ level: 'info', message, meta }),
      error: (message, meta) => entries.push({ level: 'error', message, meta }),
    },
    entries,
  };
};

test('job runner processes persons, persists results, and returns stats', async () => {
  const dictionary = {
    bySlug: new Map([
      ['john', personEntry(1, 'john')],
      ['mary', personEntry(2, 'mary')],
    ]),
    aliasToSlug: new Map(),
  };

  const persistence = {
    loadPersonDictionary: async () => dictionary,
    recordJobStart: async () => ({ id: 101n }),
    saveArticleResult: async (input) => {
      if (input.url.endsWith('/dup')) {
        return { status: 'duplicate', articleId: 2n };
      }
      return { status: 'inserted', articleId: 1n };
    },
    completeJobRun: async (_id, stats) => stats,
  };

  const fetchCalls = [];
  const fetcher = {
    fetch: async (entry) => {
      fetchCalls.push(entry.person.slug);
      if (entry.person.slug === 'john') {
        return [
          {
            url: 'https://news.example.com/john',
            sourceDomain: 'news.example.com',
            title: 'John headline',
            description: 'desc',
            publishedAt: new Date('2025-01-01T00:00:00Z'),
          },
        ];
      }
      return [
        {
          url: 'https://news.example.com/mary',
          sourceDomain: 'news.example.com',
          title: 'Mary headline',
          description: null,
          publishedAt: new Date('2025-01-01T01:00:00Z'),
        },
        {
          url: 'https://news.example.com/dup',
          sourceDomain: 'news.example.com',
          title: 'Mary duplicate',
          description: null,
          publishedAt: new Date('2025-01-01T02:00:00Z'),
        },
      ];
    },
  };

  const processor = {
    process: async (item, entry) => ({
      url: item.url,
      sourceDomain: item.sourceDomain,
      title: item.title,
      description: item.description,
      publishedAt: item.publishedAt,
      fetchedAt: new Date('2025-01-01T03:00:00Z'),
      persons: [{ id: entry.person.id, slug: entry.person.slug }],
      summaryText: null,
    }),
  };

  const { logger, entries } = createLogger();

  const runner = new IngestJobRunner({
    persistence,
    fetcher,
    processor,
    logger,
    env: baseEnv,
  });

  const result = await runner.run();

  assert.equal(fetchCalls.length, 2);
  assert.equal(result.jobId, 101n);
  assert.deepEqual(result.stats, { inserted: 2, deduped: 1, errors: 0 });

  const completionLog = entries.find((entry) => entry.message === 'ingest.job.complete');
  assert.ok(completionLog, 'completion log should exist');
  assert.equal(completionLog.meta.inserted, 2);
});

test('job runner retries fetch failures and counts errors when retries exhausted', async () => {
  let attempts = 0;
  const dictionary = {
    bySlug: new Map([['john', personEntry(1, 'john')]]),
    aliasToSlug: new Map(),
  };

  const persistence = {
    loadPersonDictionary: async () => dictionary,
    recordJobStart: async () => ({ id: 101n }),
    saveArticleResult: async () => ({ status: 'inserted', articleId: 1n }),
    completeJobRun: async (_id, stats) => stats,
  };

  const fetcher = {
    fetch: async () => {
      attempts += 1;
      throw new Error('network failure');
    },
  };

  const processor = {
    process: async () => ({
      url: 'https://example.com',
      sourceDomain: 'example.com',
      title: 'Title',
      description: null,
      publishedAt: new Date(),
      fetchedAt: new Date(),
      persons: [{ id: 1n, slug: 'john' }],
      summaryText: null,
    }),
  };

  const { logger, entries } = createLogger();

  const runner = new IngestJobRunner({
    persistence,
    fetcher,
    processor,
    logger,
    env: {
      ...baseEnv,
      INGEST_RETRY_LIMIT: 2,
    },
  });

  const result = await runner.run();

  assert.equal(attempts, 3, 'should attempt fetch with retries (initial + 2)');
  assert.equal(result.stats.errors, 1);
  const retryLogs = entries.filter((entry) => entry.message === 'ingest.retry');
  assert.equal(retryLogs.length, 2);
  assert.ok(retryLogs.every((log) => log.meta?.code === 'INGEST_RETRY'));
  const errorLog = entries.find((entry) => entry.level === 'error' && entry.message === 'ingest.person.failed');
  assert.ok(errorLog, 'error log should be emitted');
  assert.equal(errorLog.meta?.code, 'PERSON_FETCH_FAILED');
  assert.ok(typeof errorLog.meta?.stack === 'string');
});

test('job runner respects per-person article limit', async () => {
  const dictionary = {
    bySlug: new Map([
      ['john', personEntry(1, 'john')],
    ]),
    aliasToSlug: new Map(),
  };

  const articles = Array.from({ length: 12 }, (_, index) => ({
    url: `https://news.example.com/item-${index}`,
    sourceDomain: 'news.example.com',
    title: `Headline ${index}`,
    description: null,
    publishedAt: new Date('2025-01-01T00:00:00Z'),
  }));

  const persistence = {
    loadPersonDictionary: async () => dictionary,
    recordJobStart: async () => ({ id: 55n }),
    saveArticleResult: async () => ({ status: 'inserted', articleId: 1n }),
    completeJobRun: async (_id, stats) => stats,
  };

  const fetcher = {
    fetch: async () => articles,
  };

  const processedUrls = [];
  const processor = {
    process: async (item, entry) => {
      processedUrls.push(item.url);
      return {
        url: item.url,
        sourceDomain: item.sourceDomain,
        title: item.title,
        description: item.description,
        publishedAt: item.publishedAt,
        fetchedAt: new Date('2025-01-01T03:00:00Z'),
        persons: [{ id: entry.person.id, slug: entry.person.slug }],
        summaryText: null,
      };
    },
  };

  const runner = new IngestJobRunner({
    persistence,
    fetcher,
    processor,
    env: {
      ...baseEnv,
      INGEST_MAX_ARTICLES_PER_PERSON: 10,
    },
  });

  const result = await runner.run();

  assert.equal(processedUrls.length, 10);
  assert.ok(processedUrls.every((url) => url.startsWith('https://news.example.com/item-')));
  assert.equal(result.stats.inserted, 10);
});

test('job runner respects concurrency limit', async () => {
  const dictionary = {
    bySlug: new Map([
      ['john', personEntry(1, 'john')],
      ['mary', personEntry(2, 'mary')],
      ['sara', personEntry(3, 'sara')],
    ]),
    aliasToSlug: new Map(),
  };

  const persistence = {
    loadPersonDictionary: async () => dictionary,
    recordJobStart: async () => ({ id: 101n }),
    saveArticleResult: async () => ({ status: 'inserted', articleId: 1n }),
    completeJobRun: async (_id, stats) => stats,
  };

  const concurrent = [];
  let active = 0;
  const fetcher = {
    fetch: async (entry) => {
      active += 1;
      concurrent.push(active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return [
        {
          url: `https://news.example.com/${entry.person.slug}`,
          sourceDomain: 'news.example.com',
          title: 'Headline',
          description: null,
          publishedAt: new Date(),
        },
      ];
    },
  };

  const processor = {
    process: async (item, entry) => ({
      url: item.url,
      sourceDomain: item.sourceDomain,
      title: item.title,
      description: item.description,
      publishedAt: item.publishedAt,
      fetchedAt: new Date(),
      persons: [{ id: entry.person.id, slug: entry.person.slug }],
      summaryText: null,
    }),
  };

  const { logger } = createLogger();

  const runner = new IngestJobRunner({
    persistence,
    fetcher,
    processor,
    logger,
    env: {
      ...baseEnv,
      INGEST_CONCURRENCY: 1,
    },
  });

  await runner.run();

  assert.ok(concurrent.every((value) => value <= 1), 'concurrency limit should restrict active fetches to 1');
});

test('job runner logs article processing failures with structured metadata', async () => {
  const dictionary = {
    bySlug: new Map([['john', personEntry(1, 'john')]]),
    aliasToSlug: new Map(),
  };

  const calls = { save: 0 };
  const persistence = {
    loadPersonDictionary: async () => dictionary,
    recordJobStart: async () => ({ id: 99n }),
    saveArticleResult: async () => {
      calls.save += 1;
      return { status: 'inserted', articleId: 1n };
    },
    completeJobRun: async (_id, stats) => stats,
  };

  const fetcher = {
    fetch: async () => [
      {
        url: 'https://news.example.com/error',
        sourceDomain: 'news.example.com',
        title: 'Headline',
        description: null,
        publishedAt: new Date(),
        fetchedAt: new Date(),
      },
    ],
  };

  const processor = {
    process: async () => {
      throw new SummaryGenerationError('Summary unavailable', {
        details: { reason: 'empty' },
      });
    },
  };

  const { logger, entries } = createLogger();

  const runner = new IngestJobRunner({
    persistence,
    fetcher,
    processor,
    logger,
    env: baseEnv,
  });

  const result = await runner.run();
  assert.equal(result.stats.errors, 1);
  assert.equal(result.stats.inserted, 0);
  assert.equal(calls.save, 0, 'saveArticleResult should not be called when processor throws');

  const articleError = entries.find((entry) => entry.message === 'ingest.article.failed');
  assert.ok(articleError, 'article failure log expected');
  assert.equal(articleError.meta?.code, 'SUMMARY_GENERATION_FAILED');
  assert.ok(typeof articleError.meta?.stack === 'string');
});
