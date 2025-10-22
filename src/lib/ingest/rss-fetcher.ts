import { XMLParser } from 'fast-xml-parser';
import { IngestError, type IngestErrorOptions, RssFetchError } from './errors';
import type { PersonDictionaryEntry } from '../persistence/service';
import type { FetchContext, IngestLogger, RssArticleCandidate, RssFetcher } from './types';

const defaultLogger: IngestLogger = {
  info() {},
  error(message, meta) {
    console.error(
      JSON.stringify({
        level: 'error',
        message,
        ...formatMeta(meta),
      }),
    );
  },
};

function formatMeta(meta?: Record<string, unknown>) {
  if (!meta) {
    return {};
  }
  return { meta };
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface GoogleNewsRssFetcherOptions {
  fetch?: FetchFn;
  logger?: IngestLogger;
  baseUrl?: string;
  parser?: XMLParser;
}

const DEFAULT_BASE_URL = 'https://news.google.com/rss/search';

export class GoogleNewsRssFetcher implements RssFetcher {
  private readonly fetchImpl: FetchFn;

  private readonly logger: IngestLogger;

  private readonly baseUrl: string;

  private readonly parser: XMLParser;

  constructor(options: GoogleNewsRssFetcherOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.logger = options.logger ?? defaultLogger;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.parser =
      options.parser ??
      new XMLParser({
        ignoreAttributes: false,
        trimValues: true,
      });
  }

  async fetch(
    person: PersonDictionaryEntry,
    context: FetchContext,
  ): Promise<RssArticleCandidate[]> {
    const controller = new AbortController();
    const timer = context.timeoutMs
      ? setTimeout(() => controller.abort(), context.timeoutMs).unref?.()
      : null;

    const requestUrl = this.buildRequestUrl(person);

    try {
      const response = await this.fetchImpl(requestUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'finmajors-news-ingest/1.0',
        },
      });

      if (!response.ok) {
        throw new IngestError('RSS_HTTP_ERROR', `Failed to fetch RSS feed (status ${response.status})`, {
          details: { status: response.status, slug: person.person.slug },
        });
      }

      const xml = await response.text();
      return this.parseFeed(xml);
    } catch (error) {
      let ingestError: IngestError;
      if (error instanceof IngestError) {
        ingestError = error;
      } else {
        const options: IngestErrorOptions = {
          details: { slug: person.person.slug, url: requestUrl.toString() },
        };
        if (error instanceof Error) {
          options.cause = error;
        }
        ingestError = new RssFetchError(
          error instanceof Error ? error.message : String(error),
          options,
        );
      }
      this.logger.error('ingest.rss.error', {
        code: ingestError.code,
        slug: person.person.slug,
        url: requestUrl.toString(),
        status: ingestError.details.status,
        error: ingestError.message,
        stack: ingestError.stack,
      });
      throw ingestError;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private buildRequestUrl(person: PersonDictionaryEntry): URL {
    const params = new URLSearchParams({
      hl: 'ja',
      gl: 'JP',
      ceid: 'JP:ja',
      q: this.buildQuery(person),
    });

    const url = new URL(this.baseUrl);
    url.search = params.toString();
    return url;
  }

  private buildQuery(person: PersonDictionaryEntry): string {
    const nameTerms = new Set<string>();
    nameTerms.add(person.person.nameEn);
    nameTerms.add(person.person.nameJp);
    person.aliases.forEach((alias) => nameTerms.add(alias));

    const namesExpression = Array.from(nameTerms)
      .filter((term) => term && term.trim().length > 0)
      .map((term) => `"${term.trim()}"`)
      .join(' OR ');

    const institutionExpression = person.person.institutionCode
      ? `"${person.person.institutionCode}"`
      : '';

    if (!institutionExpression) {
      return namesExpression;
    }

    return `${namesExpression} AND (${institutionExpression})`;
  }

  private parseFeed(xml: string): RssArticleCandidate[] {
    const parsed = this.parser.parse(xml);
    const items = this.ensureArray(parsed?.rss?.channel?.item);

    const seen = new Set<string>();
    const now = new Date();

    const results: RssArticleCandidate[] = [];

    for (const item of items) {
      const link = item?.link;
      if (typeof link !== 'string' || link.length === 0) {
        continue;
      }
      if (seen.has(link)) {
        continue;
      }
      seen.add(link);

      let sourceDomain = '';
      try {
        const url = new URL(link);
        sourceDomain = url.hostname;
      } catch {
        sourceDomain = '';
      }

      const publishedAt = this.parseDate(item?.pubDate);
      const description =
        typeof item?.description === 'string' && item.description.length > 0
          ? item.description
          : null;

      const enclosure = item?.enclosure;
      const mediaContent = item?.['media:content'] ?? item?.['media:thumbnail'];
      const imageUrlCandidate = this.extractImageUrl(enclosure, mediaContent);

      results.push({
        url: link,
        sourceDomain,
        title: typeof item?.title === 'string' ? item.title : link,
        description,
        imageUrl: imageUrlCandidate,
        publishedAt,
        fetchedAt: now,
        raw: item,
      });
    }

    return results;
  }

  private ensureArray<T>(value: T | T[] | undefined): T[] {
    if (!value) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  private parseDate(input: string | undefined): Date | null {
    if (!input) {
      return null;
    }
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date;
  }

  private extractImageUrl(
    enclosure: unknown,
    mediaContent: unknown,
  ): string | null {
    const parsedEnclosure = normaliseMediaValue<RssEnclosure>(enclosure as PossiblyArray<RssEnclosure>);
    const parsedMediaContent = normaliseMediaValue<RssMediaContent>(mediaContent as PossiblyArray<RssMediaContent>);

    return selectImageUrl(parsedEnclosure, parsedMediaContent);
  }
}

type RssEnclosure = {
  '@_url'?: string;
  '@_type'?: string;
};

type RssMediaContent = {
  '@_url'?: string;
  '@_type'?: string;
};

type PossiblyArray<T> = T | T[] | undefined;

function normaliseMediaValue<T>(value: PossiblyArray<T>): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isImageMime(type?: string): boolean {
  if (!type) {
    return false;
  }
  return type.startsWith('image/');
}

function selectImageUrl(
  enclosure: RssEnclosure | null,
  mediaContent: RssMediaContent | null,
): string | null {
  if (enclosure?.['@_url'] && isImageMime(enclosure['@_type'])) {
    return enclosure['@_url'];
  }

  if (mediaContent?.['@_url']) {
    if (!mediaContent['@_type'] || isImageMime(mediaContent['@_type'])) {
      return mediaContent['@_url'];
    }
  }

  return null;
}
