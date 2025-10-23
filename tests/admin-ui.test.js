process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
  jsx: 'react-jsx',
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { AdminPersonsTable } = require('../src/components/admin/persons-table');

const AdminPersonsPage = require('../src/app/(admin)/admin/persons/page.tsx').default;

test('AdminPersonsTable renders rows with aliases and status badge', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminPersonsTable, {
      persons: [
        {
          id: '1',
          slug: 'jerome-h-powell',
          nameJp: 'ジェローム・パウエル',
          nameEn: 'Jerome H. Powell',
          role: '議長',
          institution: { code: 'FRB', nameJp: '米連邦準備制度理事会', nameEn: 'FRB' },
          aliases: ['Powell', 'パウエル議長'],
          active: true,
        },
        {
          id: '2',
          slug: 'retired-member',
          nameJp: '退任 メンバー',
          nameEn: 'Retired Member',
          role: '元理事',
          institution: { code: 'ECB', nameJp: '欧州中央銀行', nameEn: 'ECB' },
          aliases: [],
          active: false,
        },
      ],
    }),
  );

  assert.match(html, /ジェローム・パウエル/);
  assert.match(html, /Powell, パウエル議長/);
  assert.match(html, /retired-member/);
  assert.match(html, /非アクティブ/);
});

test('AdminPersonsPage update form renders radio group for active status', async () => {
  const prismaMock = {
    person: {
      findMany: async () => [
        {
          id: BigInt(1),
          slug: 'sample-person',
          nameJp: 'サンプル人物',
          nameEn: 'Sample Person',
          role: '役職',
          active: true,
          aliases: [],
          institution: {
            code: 'FRB',
            nameJp: '米連邦準備制度理事会',
            nameEn: 'FRB',
          },
        },
      ],
    },
  };

  const originalGetPrisma = require('../src/lib/prisma').getPrisma;
  require('../src/lib/prisma').getPrisma = () => prismaMock;

  try {
    const page = await AdminPersonsPage();
    const html = renderToStaticMarkup(page);
    assert.match(html, /name="update-active"/);
    assert.match(html, /value="true"/);
    assert.match(html, /value="false"/);
    assert.match(html, /変更しない/);
  } finally {
    require('../src/lib/prisma').getPrisma = originalGetPrisma;
  }
});
