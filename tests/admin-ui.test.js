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
