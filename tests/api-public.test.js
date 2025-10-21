process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArticlesListQuery,
  encodeArticlesCursor,
  decodeArticlesCursor,
  buildPersonsResponse,
  buildArticlesListResponse,
  buildArticleDetailResponse,
} = require('../src/lib/api/public');

test('parseArticlesListQuery coerces values and validates ISO dates', () => {
  const parsed = parseArticlesListQuery({
    person: 'jerome-h-powell',
    from: '2025-10-18T00:00:00Z',
    to: '2025-10-20T00:00:00Z',
    media: 'reuters.com',
    limit: '10',
  });

  assert.equal(parsed.person, 'jerome-h-powell');
  assert.equal(parsed.media, 'reuters.com');
  assert.equal(parsed.limit, 10);
  assert.ok(parsed.from instanceof Date);
  assert.ok(parsed.to instanceof Date);
});

test('parseArticlesListQuery rejects invalid ISO timestamp', () => {
  assert.throws(
    () =>
      parseArticlesListQuery({
        from: 'invalid-date',
      }),
    /Invalid ISO timestamp/,
  );
});

test('cursor encoding and decoding round-trips', () => {
  const cursor = {
    publishedAt: new Date('2025-10-20T12:00:00Z'),
    articleId: BigInt(42),
  };
  const encoded = encodeArticlesCursor(cursor);
  const decoded = decodeArticlesCursor(encoded);

  assert.equal(decoded.articleId, cursor.articleId);
  assert.equal(decoded.publishedAt.toISOString(), cursor.publishedAt.toISOString());
});

test('buildPersonsResponse maps active persons to API DTO', async () => {
  const calls = [];
  const mockPrisma = {
    person: {
      findMany: async (args) => {
        calls.push(args);
        return [
          {
            id: BigInt(1),
            slug: 'jerome-h-powell',
            nameJp: 'ジェローム・パウエル',
            nameEn: 'Jerome H. Powell',
            role: '議長',
            active: true,
            institution: {
              code: 'FRB',
              nameJp: '米連邦準備制度理事会',
              nameEn: 'Federal Reserve Board',
            },
          },
          {
            id: BigInt(2),
            slug: 'retired-member',
            nameJp: '退任 メンバー',
            nameEn: 'Retired Member',
            role: '元理事',
            active: false,
            institution: {
              code: 'ECB',
              nameJp: '欧州中央銀行',
              nameEn: 'European Central Bank',
            },
          },
        ];
      },
    },
  };

  const response = await buildPersonsResponse(mockPrisma);
  assert.equal(response.items.length, 2);
  assert.deepEqual(response.items[0], {
    slug: 'jerome-h-powell',
    nameJp: 'ジェローム・パウエル',
    nameEn: 'Jerome H. Powell',
    institution: {
      code: 'FRB',
      nameJp: '米連邦準備制度理事会',
      nameEn: 'Federal Reserve Board',
    },
    role: '議長',
    active: true,
  });
  assert.match(response.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(calls.length, 1);
});

test('buildArticlesListResponse returns cursor when more results exist', async () => {
  const calls = [];
  const mockPrisma = {
    article: {
      findMany: async (args) => {
        calls.push(args);
        return [
          {
            id: BigInt(10),
            title: 'Headline B',
            urlOriginal: 'https://example.com/b',
            urlNormalized: 'https://example.com/b',
            sourceDomain: 'example.com',
            description: 'desc',
            publishedAt: new Date('2025-10-20T12:00:00Z'),
            fetchedAt: new Date('2025-10-20T12:05:00Z'),
            summary: { text: 'Summary B' },
            persons: [
              {
                person: {
                  slug: 'jerome-h-powell',
                  nameJp: 'ジェローム・パウエル',
                  nameEn: 'Jerome H. Powell',
                  institution: { code: 'FRB', nameJp: '米連邦準備制度理事会', nameEn: 'Federal Reserve Board' },
                },
              },
            ],
          },
          {
            id: BigInt(9),
            title: 'Headline A',
            urlOriginal: 'https://example.com/a',
            urlNormalized: 'https://example.com/a',
            sourceDomain: 'example.com',
            description: null,
            publishedAt: new Date('2025-10-20T11:00:00Z'),
            fetchedAt: new Date('2025-10-20T11:05:00Z'),
            summary: { text: 'Summary A' },
            persons: [],
          },
          {
            id: BigInt(8),
            title: 'Headline Old',
            urlOriginal: 'https://example.com/old',
            urlNormalized: 'https://example.com/old',
            sourceDomain: 'example.com',
            description: null,
            publishedAt: new Date('2025-10-20T10:00:00Z'),
            fetchedAt: new Date('2025-10-20T10:05:00Z'),
            summary: null,
            persons: [],
          },
        ];
      },
    },
  };

  const query = parseArticlesListQuery({ limit: '2' });
  const response = await buildArticlesListResponse(mockPrisma, query);

  assert.equal(response.items.length, 2);
  assert.equal(response.items[0].title, 'Headline B');
  assert.ok(response.nextCursor, 'next cursor should be provided when more items exist');
  const decoded = decodeArticlesCursor(response.nextCursor);
  assert.equal(decoded.articleId, BigInt(9));
  assert.equal(decoded.publishedAt.toISOString(), '2025-10-20T11:00:00.000Z');

  assert.equal(calls.length, 1);
  const args = calls[0];
  assert.equal(args.take, 3, 'should request limit + 1 items to detect next cursor');
});

test('buildArticlesListResponse filters by cursor when provided', async () => {
  const calls = [];
  const mockPrisma = {
    article: {
      findMany: async (args) => {
        calls.push(args);
        return [];
      },
    },
  };
  const cursor = encodeArticlesCursor({
    publishedAt: new Date('2025-10-20T09:00:00Z'),
    articleId: BigInt(5),
  });
  const query = { ...parseArticlesListQuery({}), cursor };

  await buildArticlesListResponse(mockPrisma, query);
  assert.equal(calls.length, 1);
  const filter = calls[0].where;
  assert.ok(filter.OR, 'cursor filter should be applied with OR conditions');
});

test('buildArticleDetailResponse returns null when not found', async () => {
  const mockPrisma = {
    article: {
      findUnique: async () => null,
    },
  };
  const result = await buildArticleDetailResponse(mockPrisma, BigInt(1));
  assert.equal(result, null);
});

test('buildArticleDetailResponse maps summary and persons', async () => {
  const mockPrisma = {
    article: {
      findUnique: async () => ({
        id: BigInt(1),
        title: 'Headline',
        urlOriginal: 'https://example.com/a',
        sourceDomain: 'example.com',
        publishedAt: new Date('2025-10-20T08:00:00Z'),
        summary: { text: 'Summary' },
        persons: [
          {
            person: {
              slug: 'jerome-h-powell',
              nameJp: 'ジェローム・パウエル',
              nameEn: 'Jerome H. Powell',
              institution: {
                code: 'FRB',
                nameJp: '米連邦準備制度理事会',
                nameEn: 'Federal Reserve Board',
              },
              role: '議長',
              active: true,
            },
          },
        ],
      }),
    },
  };

  const result = await buildArticleDetailResponse(mockPrisma, BigInt(1));
  assert.ok(result);
  assert.equal(result.title, 'Headline');
  assert.equal(result.summary?.text, 'Summary');
  assert.equal(result.persons[0].slug, 'jerome-h-powell');
});

