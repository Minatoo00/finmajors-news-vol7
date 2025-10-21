process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node16',
  esModuleInterop: true,
});
require('ts-node/register');

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { GoogleNewsRssFetcher } = require('../src/lib/ingest/rss-fetcher');

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
  aliases: ['J. Doe', 'ジョンドウ'],
};

const sampleRss = `
<rss version="2.0">
  <channel>
    <title>News</title>
    <item>
      <title>Headline A</title>
      <link>https://news.example.com/a</link>
      <description><![CDATA[Desc A]]></description>
      <pubDate>Mon, 20 Oct 2025 01:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Headline B</title>
      <link>https://news.example.com/b</link>
      <description><![CDATA[Desc B]]></description>
      <pubDate>Mon, 20 Oct 2025 02:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const createLogger = () => {
  const entries = [];
  return {
    logger: {
      info: () => {},
      error: (message, meta) => entries.push({ message, meta }),
    },
    entries,
  };
};

test('GoogleNewsRssFetcher builds query and parses feed', async () => {
  const requests = [];
  const fetchMock = async (url) => {
    requests.push(url.toString());
    return {
      ok: true,
      status: 200,
      text: async () => sampleRss,
    };
  };

  const { logger } = createLogger();

  const fetcher = new GoogleNewsRssFetcher({
    fetch: fetchMock,
    logger,
  });

  const result = await fetcher.fetch(entry, {
    timeoutMs: 10_000,
    retryLimit: 0,
    env: {
      OPENAI_MODEL: 'gpt-4o-mini',
    },
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'Headline A');
  assert.equal(result[0].sourceDomain, 'news.example.com');
  assert.equal(result[0].description, 'Desc A');
  assert.ok(result[0].publishedAt instanceof Date);
  assert.ok(result[0].fetchedAt instanceof Date);

  const url = new URL(requests[0]);
  assert.equal(url.pathname, '/rss/search');
  const query = url.searchParams.get('q');
  assert.ok(query.includes('"John Doe"'));
  assert.ok(query.includes('"J. Doe"'));
  assert.ok(query.includes('"ジョンドウ"'));
});

test('GoogleNewsRssFetcher throws on non-200 response', async () => {
  const { logger, entries } = createLogger();
  const fetcher = new GoogleNewsRssFetcher({
    fetch: async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'error',
    }),
    logger,
  });

  await assert.rejects(
    () =>
      fetcher.fetch(entry, {
        timeoutMs: 1000,
        retryLimit: 0,
        env: { OPENAI_MODEL: 'gpt-4o-mini' },
      }),
    /Failed to fetch RSS feed/,
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].message, 'ingest.rss.error');
  assert.equal(entries[0].meta.code, 'RSS_HTTP_ERROR');
});
