type ResolveMethod = 'batchexecute' | 'playwright' | 'fallback';

interface ResolveResult {
  url: string | null;
  method: ResolveMethod;
}

const GOOGLE_NEWS_HOSTNAMES = new Set([
  'news.google.com',
  'www.news.google.com',
]);

const BATCHEXECUTE_ENDPOINT =
  'https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je';

const ARTICLE_META_ENDPOINT = 'https://news.google.com/articles/';

function isGoogleNewsHostname(hostname: string) {
  return GOOGLE_NEWS_HOSTNAMES.has(hostname.toLowerCase());
}

export function extractToken(gnUrl: string): string | null {
  try {
    const parsed = new URL(gnUrl);
    if (!isGoogleNewsHostname(parsed.hostname)) {
      return null;
    }

    const segments = parsed.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    if (segments.length === 0) {
      return null;
    }

    return segments[segments.length - 1] ?? null;
  } catch {
    return null;
  }
}

interface ArticleMetadata {
  timestamp: string;
  signature: string;
}

function buildFReqPayload(token: string, metadata: ArticleMetadata | null) {
  const localeBundle: [string, string, string[], null, null, number, number, string] = [
    'ja',
    'JP',
    ['WEB_TEST_1_0_0'],
    null,
    null,
    1,
    1,
    'JP:ja',
  ];

  const basePayload: unknown[] = [
    localeBundle,
    'ja',
    'JP',
    1,
    [2, 3, 4, 8],
    1,
    0,
    '655000234',
    0,
    0,
    null,
    0,
  ];

  const innerPayload: unknown[] = ['garturlreq', basePayload, token];

  if (metadata?.timestamp && metadata.signature) {
    innerPayload.push(metadata.timestamp, metadata.signature);
  }

  const outerPayload: unknown[] = [['Fbv4je', JSON.stringify(innerPayload), null, 'generic']];

  return `f.req=${encodeURIComponent(JSON.stringify([outerPayload]))}`;
}

interface BatchExecuteResponse {
  result: string | null;
  method: ResolveMethod;
}

const BATCHEXECUTE_TIMEOUT_MS = 2_000;

const ARTICLE_META_TIMEOUT_MS = 5_000;

async function fetchArticleMetadata(token: string): Promise<ArticleMetadata | null> {
  const url = new URL(token, ARTICLE_META_ENDPOINT);
  url.searchParams.set('hl', 'ja');
  url.searchParams.set('gl', 'JP');
  url.searchParams.set('ceid', 'JP:ja');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ARTICLE_META_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
        Referer: 'https://news.google.com/',
        'Accept-Language': 'ja,en;q=0.9',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const timestampMatch = text.match(/data-n-a-ts="(\d+)"/);
    const signatureMatch = text.match(/data-n-a-sg="([^"]+)"/);

    if (!timestampMatch?.[1] || !signatureMatch?.[1]) {
      return null;
    }

    return { timestamp: timestampMatch[1], signature: signatureMatch[1] };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return null;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveViaBatchExecute(token: string): Promise<BatchExecuteResponse> {
  const metadata = await fetchArticleMetadata(token);
  if (!metadata) {
    return { result: null, method: 'batchexecute' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BATCHEXECUTE_TIMEOUT_MS);

  try {
    const response = await fetch(BATCHEXECUTE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        Referer: 'https://news.google.com/',
      },
      body: buildFReqPayload(token, metadata),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { result: null, method: 'batchexecute' };
    }

    const text = await response.text();
    const url = extractResolvedUrl(text);

    return { result: url, method: 'batchexecute' };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { result: null, method: 'batchexecute' };
    }
    return { result: null, method: 'batchexecute' };
  } finally {
    clearTimeout(timer);
  }
}

function extractResolvedUrl(rawResponse: string): string | null {
  try {
    const sanitised = rawResponse.replace(/^\)\]\}'\s*/, '');
    const parsed = JSON.parse(sanitised);

    if (!Array.isArray(parsed)) {
      return null;
    }

    for (const entry of parsed) {
      if (!Array.isArray(entry)) {
        continue;
      }

      const [type, identifier, payload] = entry;
      if (type !== 'wrb.fr' || identifier !== 'Fbv4je' || payload == null) {
        continue;
      }

      let content: unknown = payload;
      if (typeof payload === 'string') {
        content = JSON.parse(payload);
      }

      if (!Array.isArray(content) || content[0] !== 'garturlres') {
        continue;
      }

      const targetUrl = content[1];
      if (typeof targetUrl === 'string' && /^https?:\/\//.test(targetUrl)) {
        return targetUrl;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function resolveViaPlaywright(url: string): Promise<BatchExecuteResponse> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
        extraHTTPHeaders: {
          'Accept-Language': 'ja,en;q=0.9',
          Referer: 'https://news.google.com/',
        },
      });

      const page = await context.newPage();
      await page.route('**/*', async (route) => {
        const resourceType = route.request().resourceType();
        if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
          await route.abort();
          return;
        }
        await route.continue();
      });

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });

      try {
        await page.waitForURL(
          (targetUrl) => {
            try {
              const parsed = new URL(targetUrl);
              return !isGoogleNewsHostname(parsed.hostname);
            } catch {
              return false;
            }
          },
          { timeout: 7_000 },
        );
      } catch {
        // ignore timeout; we still want the current page URL
      }

      const finalUrl = page.url();
      await page.close();
      await context.close();

      if (/^https?:\/\//.test(finalUrl)) {
        return { result: finalUrl, method: 'playwright' };
      }
    } finally {
      await browser.close();
    }
  } catch {
    // ignore playwright errors and fall through
  }

  return { result: null, method: 'playwright' };
}

export async function resolveOriginalUrl(gnUrl: string): Promise<ResolveResult> {
  const token = extractToken(gnUrl);

  if (token) {
    const batchResult = await resolveViaBatchExecute(token);
    if (batchResult.result) {
      return { url: batchResult.result, method: batchResult.method };
    }
  }

  const playwrightResult = await resolveViaPlaywright(gnUrl);
  if (playwrightResult.result) {
    return { url: playwrightResult.result, method: playwrightResult.method };
  }

  return { url: gnUrl, method: 'fallback' };
}

