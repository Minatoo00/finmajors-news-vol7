process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createPersonsHandler } = require('../src/app/api/persons/route');
const { createArticlesHandler } = require('../src/app/api/articles/route');
const { createArticleDetailHandler } = require('../src/app/api/articles/[id]/route');
const { createAdminPersonsHandlers } = require('../src/app/api/admin/persons/route');

function encodeBasic(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

test('persons route returns public API payload', async () => {
  const prisma = {
    person: {
      findMany: async () => [
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
      ],
    },
  };

  const handler = createPersonsHandler(prisma);
  const response = await handler();
  const body = await response.json();

  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].slug, 'jerome-h-powell');
  assert.equal(body.items[0].institution.code, 'FRB');
  assert.match(body.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('articles route serializes cursor pagination', async () => {
  const prisma = {
    article: {
      findMany: async () => [
        {
          id: BigInt(10),
          title: 'Headline',
          urlOriginal: 'https://example.com/news',
          sourceDomain: 'example.com',
          description: 'desc',
          publishedAt: new Date('2025-10-20T12:00:00Z'),
          fetchedAt: new Date('2025-10-20T12:05:00Z'),
          summary: { text: 'Summary text' },
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
              },
            },
          ],
        },
        {
          id: BigInt(9),
          title: 'Older',
          urlOriginal: 'https://example.com/older',
          sourceDomain: 'example.com',
          description: null,
          publishedAt: new Date('2025-10-20T11:00:00Z'),
          fetchedAt: new Date('2025-10-20T11:05:00Z'),
          summary: null,
          persons: [],
        },
      ],
    },
  };

  const handler = createArticlesHandler(prisma);
  const request = {
    nextUrl: new URL('https://example.com/api/articles?limit=1'),
    headers: new Headers(),
  };

  const response = await handler(request);
  const body = await response.json();

  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].id, '10');
  assert.equal(body.items[0].summary.text, 'Summary text');
  assert.ok(body.nextCursor);
});

test('article detail route returns 404 when missing', async () => {
  const prisma = {
    article: {
      findUnique: async () => null,
    },
  };

  const handler = createArticleDetailHandler(prisma);
  const request = {
    headers: new Headers(),
  };

  const response = await handler(request, { params: { id: '999' } });
  assert.equal(response.status, 404);
});

test('admin persons handlers enforce auth and perform CRUD', async () => {
  const institutions = new Map([
    [
      'FRB',
      {
        id: BigInt(1),
        code: 'FRB',
        nameJp: '米連邦準備制度理事会',
        nameEn: 'Federal Reserve Board',
      },
    ],
  ]);

  let nextPersonId = BigInt(1);
  let nextAliasId = BigInt(1);
  const persons = new Map();

  const prisma = {
    person: {
      findMany: async () => Array.from(persons.values()),
      findUnique: async ({ where: { id } }) => persons.get(id) ?? null,
      create: async ({ data }) => {
        const id = nextPersonId++;
        const institution = institutions.get(data.institution.connect.code);
        const record = {
          id,
          slug: data.slug,
          nameJp: data.nameJp,
          nameEn: data.nameEn,
          role: data.role,
          active: data.active ?? true,
          institution,
          aliases: [],
        };
        persons.set(id, record);
        return { id };
      },
      update: async ({ where: { id }, data }) => {
        const current = persons.get(id);
        if (!current) throw new Error('not found');
        Object.assign(current, data);
        if (data.institution?.connect?.code) {
          current.institution = institutions.get(data.institution.connect.code);
        }
        return current;
      },
    },
    alias: {
      createMany: async ({ data }) => {
        data.forEach((item) => {
          const person = persons.get(item.personId);
          if (!person) return;
          person.aliases.push({ id: nextAliasId++, text: item.text });
        });
        return { count: data.length };
      },
      findMany: async ({ where: { personId } }) => {
        const person = persons.get(personId);
        return person ? person.aliases : [];
      },
      deleteMany: async ({ where: { id: { in: ids } } }) => {
        let removed = 0;
        persons.forEach((person) => {
          const before = person.aliases.length;
          person.aliases = person.aliases.filter((alias) => !ids.includes(alias.id));
          removed += before - person.aliases.length;
        });
        return { count: removed };
      },
    },
  };

  const env = {
    BASIC_AUTH_USER: 'admin',
    BASIC_AUTH_PASS: 'secret',
    ALLOWED_ADMIN_IPS: ['203.0.113.5'],
  };

  const handlers = createAdminPersonsHandlers({ prisma, env });

  const unauthorized = await handlers.GET({
    headers: new Headers(),
    nextUrl: new URL('https://example.com/api/admin/persons'),
  });
  assert.equal(unauthorized.status, 401);

  const authHeaders = new Headers({
    authorization: encodeBasic('admin', 'secret'),
    'x-forwarded-for': '203.0.113.5',
  });

  const getResponse = await handlers.GET({
    headers: authHeaders,
    nextUrl: new URL('https://example.com/api/admin/persons'),
  });
  const emptyBody = await getResponse.json();
  assert.equal(emptyBody.items.length, 0);

  const postResponse = await handlers.POST({
    headers: authHeaders,
    nextUrl: new URL('https://example.com/api/admin/persons'),
    async json() {
      return {
        institutionCode: 'FRB',
        slug: 'jerome-h-powell',
        nameJp: 'ジェローム・パウエル',
        nameEn: 'Jerome H. Powell',
        role: '議長',
        active: true,
        aliases: ['Powell'],
      };
    },
  });

  assert.equal(postResponse.status, 201);
  const created = await postResponse.json();
  assert.equal(created.slug, 'jerome-h-powell');
  assert.deepEqual(created.aliases, ['Powell']);

  const putResponse = await handlers.PUT({
    headers: authHeaders,
    nextUrl: new URL('https://example.com/api/admin/persons'),
    async json() {
      return {
        id: created.id,
        aliases: ['Powell', 'Chair Powell'],
        active: false,
      };
    },
  });

  assert.equal(putResponse.status, 200);
  const updated = await putResponse.json();
  assert.equal(updated.active, false);
  assert.deepEqual(updated.aliases, ['Powell', 'Chair Powell']);
});
