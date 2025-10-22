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
  return async (url: string): Promise<ExtractedContent | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), maxDuration).unref?.() ?? null;

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'finmajors-news-ingest/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      const extracted = await extractFromHtml(html, url).catch(() => null);

      const rawContent = extracted?.content ?? extracted?.description ?? null;
      const cleaned = typeof rawContent === 'string'
        ? rawContent.replace(/\s+/g, ' ').trim().slice(0, 10_000)
        : null;

      return {
        content: cleaned && cleaned.length > 0 ? cleaned : null,
        text: cleaned && cleaned.length > 0 ? cleaned : null,
        imageUrl: extracted?.image ?? extracted?.favicon ?? null,
      };
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'content.extractor.failed',
          meta: {
            url,
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
    summaryService,
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
