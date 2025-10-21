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

const { NewsList } = require('../src/components/news/news-list');
const { NewsFilters } = require('../src/components/news/news-filters');
const { formatJstDateTime } = require('../src/lib/formatting/time');

test('formatJstDateTime converts ISO string to JST label', () => {
  const formatted = formatJstDateTime('2025-10-20T03:00:00Z');
  assert.equal(formatted, '2025-10-20 12:00 JST');
});

test('NewsList renders article summary with JST timestamp and load more link', () => {
  const html = renderToStaticMarkup(
    React.createElement(NewsList, {
      articles: [
        {
          id: '10',
          title: '政策金利は据え置き',
          url: 'https://example.com/article',
          sourceDomain: 'example.com',
          publishedAt: '2025-10-20T03:00:00Z',
          summary: { text: '要約本文' },
          persons: [
            {
              slug: 'jerome-h-powell',
              nameJp: 'ジェローム・パウエル',
              institution: { code: 'FRB', nameJp: '米連邦準備制度理事会', nameEn: 'FRB' },
            },
          ],
        },
      ],
      nextCursor: 'NEXT123',
    }),
  );

  assert.match(html, /政策金利は据え置き/);
  assert.match(html, /要約本文/);
  assert.match(html, /2025-10-20 12:00 JST/);
  assert.match(html, /href="\?cursor=NEXT123"/);
});

test('NewsFilters renders select options with current selection', () => {
  const html = renderToStaticMarkup(
    React.createElement(NewsFilters, {
      persons: [
        {
          slug: 'jerome-h-powell',
          nameJp: 'ジェローム・パウエル',
          institution: { code: 'FRB', nameJp: '米連邦準備制度理事会', nameEn: 'FRB' },
        },
      ],
      currentFilters: {
        person: 'jerome-h-powell',
        media: 'reuters.com',
        from: '2025-10-18',
        to: '2025-10-20',
      },
    }),
  );

  assert.match(html, /name="person"/);
  assert.match(html, /value="jerome-h-powell"/);
  assert.match(html, /name="media"/);
  assert.match(html, /value="reuters\.com"/);
});
