import { IngestScheduler } from '../src/lib/ingest/scheduler';
import { IngestJobRunner } from '../src/lib/ingest/job-runner';
import { GoogleNewsRssFetcher } from '../src/lib/ingest/rss-fetcher';
import { SummaryServiceImpl } from '../src/lib/ingest/summary-service';
import { ArticleProcessorImpl } from '../src/lib/ingest/article-processor';
import { PersistenceService } from '../src/lib/persistence/service';
import { getPrisma } from '../src/lib/prisma';
import { getEnv, type AppEnv } from '../src/lib/env';
import type { IngestLogger } from '../src/lib/ingest/types';
import { extractFromHtml } from '@extractus/article-extractor';
import type { PrismaClient } from '@prisma/client';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface IngestApplication {
  env: AppEnv;
  runOnce(): Promise<void>;
  startScheduler(): void;
  stopScheduler(): void;
}

interface CreateIngestApplicationOptions {
  env?: AppEnv;
  prisma?: PrismaClient;
  fetcher?: GoogleNewsRssFetcher;
  summaryService?: SummaryServiceImpl;
  contentExtractor?: (url: string) => Promise<ExtractedContent | null | undefined>;
  logger?: IngestLogger;
  fetchImpl?: FetchFn;
}

type ExtractedContent = {
  content?: string | null;
  text?: string | null;
  imageUrl?: string | null;
};

export function createHttpContentExtractor(timeoutMs: number, fetchImpl: FetchFn = globalThis.fetch.bind(globalThis)) {
  const maxDuration = Math.max(5_000, Math.min(timeoutMs, 15_000));
  const headers = {
    'User-Agent': 'finmajors-news-ingest/1.0',
    Accept: 'text/html,application/xhtml+xml',
  } as const;

  return async (initialUrl: string): Promise<ExtractedContent | null> => {
    const visited = new Set<string>();

    const normalizeUrl = (value: string) => {
      try {
        return new URL(value).toString();
      } catch {
        return value;
      }
    };

    const hasSufficientContent = (value: string | null | undefined) => {
      if (!value) {
        return false;
      }
      const trimmed = value.trim();
      if (trimmed.length < 80) {
        return false;
      }
      const tokens = trimmed
        .split(/[\p{P}\s]+/u)
        .map((token) => token.toLowerCase())
        .filter((token) => token.length > 1);
      const uniqueTokens = new Set(tokens);
      return uniqueTokens.size >= 10;
    };

    const decodeHtmlEntities = (value: string) =>
      value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");

    const stripHtml = (html: string) =>
      decodeHtmlEntities(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<!--([\s\S]*?)-->/g, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );

    const sanitizeContent = (value: string | null | undefined) => {
      if (typeof value !== 'string') {
        return null;
      }
      const stripped = stripHtml(value);
      if (stripped.length > 0) {
        return stripped;
      }
      const normalized = value.replace(/\s+/g, ' ').trim();
      return normalized.length > 0 ? normalized : null;
    };

    const limitLength = (value: string | null | undefined) => {
      if (!value) {
        return null;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      return trimmed.length > 10_000 ? trimmed.slice(0, 10_000) : trimmed;
    };

    const extractPrimaryImage = (html: string) => {
      const metas = [
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      ];
      for (const meta of metas) {
        const match = meta.exec(html);
        if (match?.[1]) {
          return match[1].trim();
        }
      }
      return null;
    };

    const fetchPage = async (targetUrl: string): Promise<string | null> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), maxDuration).unref?.() ?? null;
      try {
        const response = await fetchImpl(targetUrl, {
          signal: controller.signal,
          headers,
        });

        if (!response.ok) {
          return null;
        }

        return await response.text();
      } catch (error) {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'content.extractor.failed',
            meta: {
              url: targetUrl,
              error: error instanceof Error ? error.message : String(error),
            },
          }),
        );
        return null;
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    };

    const extractArticleSection = (html: string) => {
      const startPatterns = [
        /<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>/i,
        /<div[^>]+class=["'][^"']*body__inner[^"']*["'][^>]*>/i,
        /<article[^>]*>/i,
        /<main[^>]*>/i,
      ];
      const endPatterns = [
        /<div[^>]+class=["'][^"']*article-related[^"']*["'][^>]*>/i,
        /<div[^>]+class=["'][^"']*relatedArticles[^"']*["'][^>]*>/i,
        /<div[^>]+class=["'][^"']*articleFooter[^"']*["'][^>]*>/i,
        /<footer[^>]*>/i,
        /<\/article>/i,
        /<\/main>/i,
      ];

      for (const pattern of startPatterns) {
        pattern.lastIndex = 0;
        const startMatch = pattern.exec(html);
        if (!startMatch) {
          continue;
        }
        const startIndex = startMatch.index;
        const rest = html.slice(startIndex);
        let endIndex = -1;
        for (const endPattern of endPatterns) {
          endPattern.lastIndex = 0;
          const endMatch = endPattern.exec(rest);
          if (endMatch && endMatch.index !== undefined) {
            const candidate = endMatch.index;
            if (candidate >= 0 && (endIndex === -1 || candidate < endIndex)) {
              endIndex = candidate;
            }
          }
        }

        const snippet = endIndex === -1 ? rest : rest.slice(0, endIndex);
        if (snippet.trim().length > 0) {
          return snippet;
        }
      }
      return null;
    };

    const findReadMoreUrl = (html: string, baseUrl: string) => {
      const anchorRegex = /<a[^>]+href=["']([^"']+display=1[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match = anchorRegex.exec(html);
      while (match) {
        const label = stripHtml(match[2] ?? '').toLowerCase();
        if (!label || /続きを読む|read more/.test(label)) {
          try {
            return new URL(match[1], baseUrl).toString();
          } catch {
            // fall through
          }
        }
        match = anchorRegex.exec(html);
      }

      const displayQueryRegex = /href=["']([^"']+display=1[^"']*)["']/i;
      const displayMatch = displayQueryRegex.exec(html);
      if (displayMatch?.[1]) {
        try {
          return new URL(displayMatch[1], baseUrl).toString();
        } catch {
          return null;
        }
      }

      return null;
    };

    const buildResult = (content: string | null | undefined, imageUrl?: string | null): ExtractedContent | null => {
      const limited = limitLength(content ?? null);
      if (!limited) {
        return {
          content: null,
          text: null,
          imageUrl: imageUrl ?? null,
        };
      }
      return {
        content: limited,
        text: limited,
        imageUrl: imageUrl ?? null,
      };
    };

    type ExtractAttempt = {
      html: string | null;
      content: string | null;
      imageUrl: string | null;
    };

    const followReadMore = async (baseUrl: string, html: string) => {
      const nextUrl = findReadMoreUrl(html, baseUrl);
      if (!nextUrl) {
        return null;
      }
      const normalized = normalizeUrl(nextUrl);
      if (visited.has(normalized)) {
        return null;
      }
      visited.add(normalized);

      const nextHtml = await fetchPage(nextUrl);
      if (!nextHtml) {
        return null;
      }

      const section = extractArticleSection(nextHtml) ?? nextHtml;
      const text = stripHtml(section);
      if (!hasSufficientContent(text)) {
        return null;
      }

      const limited = limitLength(text);
      if (!limited) {
        return null;
      }
      return {
        content: limited,
        text: limited,
        imageUrl: extractPrimaryImage(nextHtml),
      } satisfies ExtractedContent;
    };

    const attemptPrimary = async (targetUrl: string): Promise<ExtractAttempt> => {
      const normalized = normalizeUrl(targetUrl);
      if (visited.has(normalized)) {
        return { html: null, content: null, imageUrl: null } as const;
      }
      visited.add(normalized);

      const html = await fetchPage(targetUrl);
      if (!html) {
        return { html: null, content: null, imageUrl: null } as const;
      }

      const extracted = await extractFromHtml(html, targetUrl).catch(() => null);
      const primaryCandidate =
        sanitizeContent(extracted?.content) ??
        sanitizeContent(extracted?.description);

      const articleSection = extractArticleSection(html);
      const sectionText = articleSection ? stripHtml(articleSection) : null;
      const combinedCandidate =
        primaryCandidate && sectionText
          ? (primaryCandidate.length >= sectionText.length ? primaryCandidate : sectionText)
          : primaryCandidate ?? sectionText;

      const imageUrl = extracted?.image ?? extracted?.favicon ?? extractPrimaryImage(html);

      return {
        html,
        content: combinedCandidate,
        imageUrl,
      } as const;
    };

    const primary = await attemptPrimary(initialUrl);
    if (!primary.html && !primary.content) {
      return null;
    }

    const primaryLimited = limitLength(primary.content);

    let fallbackContent: string | null = null;
    let fallbackImage: string | null | undefined = null;

    if (primary.html) {
      const fallback = await followReadMore(initialUrl, primary.html);
      if (fallback?.content) {
        fallbackContent = fallback.content;
        fallbackImage = fallback.imageUrl;
      }
    }

    if (fallbackContent) {
      if (!primaryLimited || !hasSufficientContent(primaryLimited) || fallbackContent.length > (primaryLimited?.length ?? 0) + 200) {
        return buildResult(fallbackContent, fallbackImage ?? primary.imageUrl);
      }
    }

    if (hasSufficientContent(primaryLimited)) {
      return buildResult(primaryLimited, primary.imageUrl);
    }

    if (fallbackContent && hasSufficientContent(fallbackContent)) {
      return buildResult(fallbackContent, fallbackImage ?? primary.imageUrl);
    }

    return buildResult(primaryLimited, primary.imageUrl);
  };
}

export function createIngestApplication(options: CreateIngestApplicationOptions = {}): IngestApplication {
  const env = options.env ?? getEnv();
  const prisma = options.prisma ?? getPrisma();
  const persistenceService = new PersistenceService(prisma);
  const persistencePort = {
    loadPersonDictionary: () => persistenceService.loadPersonDictionary(),
    recordJobStart: (startedAt: Date) => persistenceService.recordJobStart(startedAt),
    completeJobRun: (id: bigint, stats: { inserted: number; deduped: number; errors: number }) =>
      persistenceService.completeJobRun(id, stats),
    saveArticleResult: (input: Parameters<PersistenceService['saveArticleResult']>[0]) =>
      persistenceService.saveArticleResult(input),
    isDuplicateArticle: (url: string, contentHash?: string | null) =>
      persistenceService.isDuplicateArticle(url, contentHash),
  };

  const summaryService =
    options.summaryService ??
    new SummaryServiceImpl({
      env,
      fetch: options.fetchImpl,
      logger: options.logger,
    });

  const contentExtractor =
    options.contentExtractor ?? createHttpContentExtractor(env.INGEST_TIMEOUT_MS, options.fetchImpl);

  const processor = new ArticleProcessorImpl({
    contentExtractor,
    logger: options.logger,
  });

  const fetcher =
    options.fetcher ??
    new GoogleNewsRssFetcher({
      logger: options.logger,
      fetch: options.fetchImpl,
    });

  const jobRunner = new IngestJobRunner({
    persistence: persistencePort,
    fetcher,
    processor,
    summaryService,
    env,
    logger: options.logger,
  });

  const scheduler = new IngestScheduler({
    enableInternalCron: env.ENABLE_INTERNAL_CRON,
    cronExpression: env.INGEST_CRON,
    jobRunner: () => jobRunner.run(),
    logger: options.logger,
  });

  return {
    env,
    async runOnce() {
      await jobRunner.run();
    },
    startScheduler() {
      scheduler.start();
    },
    stopScheduler() {
      scheduler.stop();
    },
  };
}

export async function main() {
  const app = createIngestApplication();
  if (app.env.ENABLE_INTERNAL_CRON) {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'ingest.scheduler.start',
        meta: { cron: app.env.INGEST_CRON },
      }),
    );
    app.startScheduler();

    const shutdown = () => {
      console.log(JSON.stringify({ level: 'info', message: 'ingest.scheduler.stop' }));
      app.stopScheduler();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  await app.runOnce();
}
