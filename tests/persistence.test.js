process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeUrl } = require('../src/lib/persistence/url');
const { PersistenceService } = require('../src/lib/persistence/service');
const { Prisma } = require('@prisma/client');

test('normalizeUrl removes tracking parameters and trailing slash', () => {
  const normalized = normalizeUrl('https://example.com/path/?utm_source=test&utm_campaign=abc');
  assert.equal(normalized, 'https://example.com/path');
});

test('loadPersonDictionary aggregates aliases by slug', async () => {
  const mockPrisma = {
    person: {
      findMany: async () => [
        {
          id: BigInt(1),
          slug: 'john-doe',
          nameJp: 'ジョン・ドウ',
          nameEn: 'John Doe',
          role: '総裁',
          active: true,
          institution: {
            code: 'FRB',
            nameJp: '米連邦準備制度理事会',
            nameEn: 'Federal Reserve Board',
          },
          aliases: [
            { text: 'J. Doe' },
            { text: 'ジョンドウ' },
          ],
        },
      ],
    },
  };

  const service = new PersistenceService(mockPrisma);
  const dictionary = await service.loadPersonDictionary();

  assert.equal(dictionary.bySlug.get('john-doe')?.person.nameEn, 'John Doe');
  assert.deepEqual(dictionary.bySlug.get('john-doe')?.aliases, ['J. Doe', 'ジョンドウ']);
  assert.equal(dictionary.aliasToSlug.get('J. Doe'), 'john-doe');
});

test('recordJobStart and completeJobRun delegate to Prisma ingest_job_run model', async () => {
  const calls = { create: [], update: [] };
  const mockPrisma = {
    ingestJobRun: {
      create: async (args) => {
        calls.create.push(args);
        return { id: BigInt(10), ...args.data };
      },
      update: async (args) => {
        calls.update.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
  };

  const service = new PersistenceService(mockPrisma);
  const started = await service.recordJobStart(new Date('2025-01-01T00:05:00Z'));
  assert.equal(started.id, BigInt(10));

  const finished = await service.completeJobRun(BigInt(10), { inserted: 2, deduped: 1, errors: 0 });
  assert.equal(finished.inserted, 2);
  assert.equal(finished.deduped, 1);
  assert.equal(finished.errors, 0);

  assert.equal(calls.create.length, 1);
  assert.equal(calls.update.length, 1);
});

test('saveArticleResult skips duplicates based on normalized URL', async () => {
  const calls = { findUnique: [], create: [], upsert: [], link: [] };
  const mockPrisma = {
    $transaction: async (callback) => callback(transactionClient),
    article: {
      findUnique: async (args) => {
        calls.findUnique.push(args);
        if (args.where.urlNormalized === 'https://example.com/a') {
          return { id: BigInt(1), urlNormalized: 'https://example.com/a' };
        }
        return null;
      },
      create: async (args) => {
        calls.create.push(args);
        return { id: BigInt(2), ...args.data };
      },
    },
    summary: {
      upsert: async (args) => {
        calls.upsert.push(args);
        return args.create;
      },
    },
    articlePerson: {
      createMany: async (args) => {
        calls.link.push(args);
        return { count: args.data.length };
      },
      deleteMany: async () => ({ count: 0 }),
    },
  };

  const transactionClient = {
    article: mockPrisma.article,
    summary: mockPrisma.summary,
    articlePerson: mockPrisma.articlePerson,
  };

  const service = new PersistenceService(mockPrisma);

  const deduped = await service.saveArticleResult({
    url: 'https://example.com/a?utm_source=foo',
    sourceDomain: 'example.com',
    title: 'Title',
    description: null,
    publishedAt: new Date('2025-01-01T00:00:00Z'),
    fetchedAt: new Date('2025-01-01T00:05:00Z'),
    persons: [{ id: BigInt(1), slug: 'john-doe' }],
    content: 'article-body',
    summaryText: 'summary',
  });
  assert.equal(deduped.status, 'duplicate');

const created = await service.saveArticleResult({
    url: 'https://example.com/b',
    sourceDomain: 'example.com',
    title: 'Title B',
    description: 'Desc',
    publishedAt: null,
    fetchedAt: new Date('2025-01-01T01:05:00Z'),
    persons: [{ id: BigInt(1), slug: 'john-doe' }],
    content: 'article-body-b',
    summaryText: 'summary b',
  });
  assert.equal(created.status, 'inserted');
  assert.equal(calls.findUnique.length, 2);
  assert.equal(calls.create.length, 1);
  assert.equal(calls.upsert.length, 1);
  assert.equal(calls.link.length, 1);
});

test('saveArticleResult handles unique constraint race conditions', async () => {
  let createCalled = false;
  const mockPrisma = {
    $transaction: async (callback) => callback(transactionClient),
    article: {
      findUnique: async (args) => {
        if (args.where.urlNormalized === 'https://example.com/race') {
          return createCalled
            ? { id: BigInt(10), urlNormalized: 'https://example.com/race' }
            : null;
        }
        return null;
      },
      create: async () => {
        createCalled = true;
        const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          clientVersion: 'test',
          code: 'P2002',
        });
        throw error;
      },
    },
    summary: {
      upsert: async () => assert.fail('should not upsert summary when duplicate'),
    },
    articlePerson: {
      createMany: async () => assert.fail('should not link persons when duplicate'),
      deleteMany: async () => assert.fail('should not unlink persons when duplicate'),
    },
  };

  const transactionClient = {
    article: mockPrisma.article,
    summary: mockPrisma.summary,
    articlePerson: mockPrisma.articlePerson,
  };

  const service = new PersistenceService(mockPrisma);

  const outcome = await service.saveArticleResult({
    url: 'https://example.com/race',
    sourceDomain: 'example.com',
    title: 'Race Condition',
    description: null,
    publishedAt: new Date('2025-01-01T03:00:00Z'),
    fetchedAt: new Date('2025-01-01T03:05:00Z'),
    persons: [{ id: BigInt(1), slug: 'john-doe' }],
    content: 'race-body',
    summaryText: 'race summary',
  });

  assert.equal(outcome.status, 'duplicate');
  assert.equal(outcome.articleId, BigInt(10));
  assert.ok(createCalled);
});
