const TRACKING_PARAM_PREFIXES = ['utm_', 'fbclid', 'gclid', 'mc_', 'igshid'];

export function normalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch (error) {
    throw new Error(`Invalid URL provided for normalization: ${input}`, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }

  for (const key of Array.from(url.searchParams.keys())) {
    const lowerKey = key.toLowerCase();
    if (
      TRACKING_PARAM_PREFIXES.some((prefix) =>
        lowerKey.startsWith(prefix),
      )
    ) {
      url.searchParams.delete(key);
    }
  }

  let cleanedPath = url.pathname;
  if (cleanedPath !== '/') {
    cleanedPath = cleanedPath.replace(/\/+$/, '');
    if (cleanedPath.length === 0) {
      cleanedPath = '/';
    }
  }
  url.pathname = cleanedPath;

  url.searchParams.sort();
  const search = url.searchParams.toString();
  return search ? `${url.origin}${url.pathname}?${search}` : `${url.origin}${url.pathname}`;
}
