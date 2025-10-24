process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createHttpContentExtractor } = require('../scripts/ingest');

const makeResponse = (body) => ({
  ok: true,
  text: async () => body,
});

test('createHttpContentExtractor follows read-more link when primary content insufficient', async () => {
  const firstHtml = `
    <html>
      <body>
        <div class="article-body">概要のみ</div>
        <a href="/articles/example?display=1">続きを読む</a>
      </body>
    </html>
  `;

  const richParagraphs = Array.from({ length: 12 }, (_, index) =>
    `先月の米連邦公開市場委員会について詳細に解説し、市場参加者が注視する利下げ見通しと雇用統計、第${index + 1}四半期の成長率、物価動向、企業決算、地政学リスクについて幅広く論じた。`,
  ).join('');
  const secondHtml = `
    <html>
      <body>
        <div class="article-body">
          <p>${richParagraphs}</p>
        </div>
      </body>
    </html>
  `;

  const calls = [];
  const fetchStub = async (url) => {
    calls.push(url.toString());
    if (calls.length === 1) {
      return makeResponse(firstHtml);
    }
    if (calls.length === 2) {
      return makeResponse(secondHtml);
    }
    throw new Error('unexpected fetch invocation');
  };

  const extractor = createHttpContentExtractor(5_000, fetchStub);
  const result = await extractor('https://news.example.com/articles/example');

  assert.ok(result);
  assert.ok(result.content);
  assert.ok(result.content.length > 80, 'fallback content should satisfy minimum length');
  assert.match(result.content, /米連邦公開市場委員会/);
  assert.equal(calls.length, 2); // primary + read more
});

