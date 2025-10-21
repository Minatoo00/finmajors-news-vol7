process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseCreatePersonPayload,
  parseUpdatePersonPayload,
  verifyAdminAccess,
  buildAdminPersonsResponse,
  createAdminPerson,
  updateAdminPerson,
} = require('../src/lib/api/admin');

const baseEnv = {
  BASIC_AUTH_USER: 'admin',
  BASIC_AUTH_PASS: 'secret',
  ALLOWED_ADMIN_IPS: ['203.0.113.5'],
};

test('verifyAdminAccess accepts valid credentials and IP', () => {
  const authHeader = `Basic ${Buffer.from('admin:secret').toString('base64')}`;
  const allowed = verifyAdminAccess({
    authorizationHeader: authHeader,
    clientIp: '203.0.113.5',
    env: baseEnv,
  });
  assert.equal(allowed, true);
});

test('verifyAdminAccess rejects invalid password or IP', () => {
  const badAuth = `Basic ${Buffer.from('admin:wrong').toString('base64')}`;
  assert.equal(
    verifyAdminAccess({
      authorizationHeader: badAuth,
      clientIp: '203.0.113.5',
      env: baseEnv,
    }),
    false,
  );
  const goodAuth = `Basic ${Buffer.from('admin:secret').toString('base64')}`;
  assert.equal(
    verifyAdminAccess({
      authorizationHeader: goodAuth,
      clientIp: '198.51.100.1',
      env: baseEnv,
    }),
    false,
  );
});

test('parseCreatePersonPayload validates required fields', () => {
  const payload = parseCreatePersonPayload({
    institutionCode: 'FRB',
    slug: 'jerome-h-powell',
    nameJp: 'ジェローム・パウエル',
    nameEn: 'Jerome H. Powell',
    role: '議長',
    active: true,
    aliases: ['Powell Chair'],
  });
  assert.equal(payload.slug, 'jerome-h-powell');
  assert.equal(payload.aliases.length, 1);

  assert.throws(
    () =>
      parseCreatePersonPayload({
        institutionCode: 'FRB',
        slug: '',
        nameJp: '欠落',
        nameEn: 'Missing',
        role: '役割',
      }),
    /slug/,
  );
});

test('parseUpdatePersonPayload coerces id to bigint and cleans aliases', () => {
  const payload = parseUpdatePersonPayload({
    id: '15',
    role: '新しい役割',
    aliases: ['alias-one', ''],
    active: false,
  });
  assert.equal(payload.id, BigInt(15));
  assert.deepEqual(payload.aliases, ['alias-one']);
});

test('buildAdminPersonsResponse aggregates aliases', async () => {
  const calls = [];
  const mockPrisma = {
    person: {
      findMany: async (args) => {
        calls.push(args);
        return [
          {
            id: BigInt(1),
            institutionId: BigInt(1),
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
            aliases: [{ text: 'Powell Chair' }],
          },
        ];
      },
    },
  };

  const response = await buildAdminPersonsResponse(mockPrisma);
  assert.equal(response.items.length, 1);
  assert.equal(response.items[0].aliases[0], 'Powell Chair');
  assert.equal(calls.length, 1);
});

test('createAdminPerson persists person and aliases', async () => {
  const calls = { create: [], aliasCreate: [] };
  const mockPrisma = {
    person: {
      create: async (args) => {
        calls.create.push(args);
        return { id: BigInt(10), ...args.data };
      },
    },
    alias: {
      createMany: async (args) => {
        calls.aliasCreate.push(args);
        return { count: args.data.length };
      },
    },
  };

  const created = await createAdminPerson(mockPrisma, {
    institutionCode: 'FRB',
    slug: 'new-person',
    nameJp: '新規',
    nameEn: 'New Person',
    role: '理事',
    active: true,
    aliases: ['alias-a', 'alias-b'],
  });

  assert.equal(created.slug, 'new-person');
  assert.equal(calls.create.length, 1);
  assert.equal(calls.aliasCreate.length, 1);
});

test('updateAdminPerson updates fields and aliases diff', async () => {
  const calls = { update: [], deleteMany: [], createMany: [] };
  const mockPrisma = {
    person: {
      update: async (args) => {
        calls.update.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
    alias: {
      findMany: async () => [
        { id: BigInt(1), text: 'old-alias' },
        { id: BigInt(2), text: 'remove-me' },
      ],
      deleteMany: async (args) => {
        calls.deleteMany.push(args);
        return { count: 1 };
      },
      createMany: async (args) => {
        calls.createMany.push(args);
        return { count: args.data.length };
      },
    },
  };

  await updateAdminPerson(mockPrisma, {
    id: BigInt(1),
    nameJp: '更新後',
    aliases: ['old-alias', 'new-alias'],
  });

  assert.equal(calls.update.length, 1);
  assert.equal(calls.deleteMany.length, 1);
  assert.equal(calls.createMany.length, 1);
});

