import { getEnv, type AppEnv } from '../env';
import type { PersistenceService, SaveArticleInput, PersonDictionaryEntry } from '../persistence/service';
import { IngestError } from './errors';
import type { ArticleProcessor, FetchContext, IngestLogger, IngestResult, IngestStats, ProcessContext, RssFetcher, RssArticleCandidate } from './types';

const defaultLogger: IngestLogger = {
  info(message, meta) {
    console.log(
      JSON.stringify({
        level: 'info',
        message,
        ...formatMeta(meta),
      }),
    );
  },
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

interface PersistencePort {
  loadPersonDictionary(): Promise<Awaited<ReturnType<PersistenceService['loadPersonDictionary']>>>;
  recordJobStart(startedAt: Date): Promise<{ id: bigint }>;
  completeJobRun(id: bigint, stats: IngestStats): Promise<unknown>;
  saveArticleResult(input: SaveArticleInput): Promise<{ status: 'duplicate' | 'inserted'; articleId: bigint }>;
}

interface Dependencies {
  persistence: PersistencePort;
  fetcher: RssFetcher;
  processor: ArticleProcessor;
  logger?: IngestLogger;
  env?: AppEnv;
  now?: () => Date;
}

export class IngestJobRunner {
  private readonly persistence: PersistencePort;

  private readonly fetcher: RssFetcher;

  private readonly processor: ArticleProcessor;

  private readonly logger: IngestLogger;

  private readonly env: AppEnv;

  private readonly now: () => Date;

  constructor(deps: Dependencies) {
    this.persistence = deps.persistence;
    this.fetcher = deps.fetcher;
    this.processor = deps.processor;
    this.logger = deps.logger ?? defaultLogger;
    this.env = deps.env ?? getEnv();
    this.now = deps.now ?? (() => new Date());
  }

  async run(): Promise<IngestResult> {
    const jobStartedAt = this.now();
    const job = await this.persistence.recordJobStart(jobStartedAt);
    const stats: IngestStats = { inserted: 0, deduped: 0, errors: 0 };

    try {
      await this.runWithJobTimeout(this.processAllPersons(stats), this.env.INGEST_JOB_TIMEOUT_MS);
    } catch (error) {
      stats.errors += 1;
      this.logError('ingest.job.failed', 'INGEST_JOB_FAILED', error, {
        jobId: job.id.toString(),
      });
    } finally {
      await this.persistence.completeJobRun(job.id, stats);
    }

    this.logger.info('ingest.job.complete', {
      jobId: job.id.toString(),
      inserted: stats.inserted,
      deduped: stats.deduped,
      errors: stats.errors,
    });

    return {
      jobId: job.id,
      stats,
    };
  }

  private async processAllPersons(stats: IngestStats): Promise<void> {
    const dictionary = await this.persistence.loadPersonDictionary();
    const persons = Array.from(dictionary.bySlug.values());

    if (persons.length === 0) {
      this.logger.info('ingest.dictionary.empty');
      return;
    }

    await runWithConcurrency(persons, this.env.INGEST_CONCURRENCY, async (entry) => {
      await this.processPerson(entry, stats);
    });
  }

  private async processPerson(entry: PersonDictionaryEntry, stats: IngestStats): Promise<void> {
    const fetchContext: FetchContext = {
      timeoutMs: this.env.INGEST_TIMEOUT_MS,
      retryLimit: this.env.INGEST_RETRY_LIMIT,
      env: this.env,
    };

    let articles: RssArticleCandidate[];

    try {
      articles = await this.executeWithRetry(
        async () => this.fetcher.fetch(entry, fetchContext),
        this.env.INGEST_RETRY_LIMIT,
      );
    } catch (error) {
      stats.errors += 1;
      this.logError('ingest.person.failed', 'PERSON_FETCH_FAILED', error, {
        slug: entry.person.slug,
      });
      return;
    }

    if (articles.length > this.env.INGEST_MAX_ARTICLES_PER_PERSON) {
      articles = articles.slice(0, this.env.INGEST_MAX_ARTICLES_PER_PERSON);
    }

    if (articles.length === 0) {
      return;
    }

    const processContext: ProcessContext = {
      person: entry,
      env: this.env,
    };

    for (const candidate of articles) {
      try {
        const saveInput = await this.processor.process(candidate, entry, processContext);
        if (!saveInput) {
          continue;
        }
        const outcome = await this.persistence.saveArticleResult(saveInput);
        if (outcome.status === 'duplicate') {
          stats.deduped += 1;
        } else {
          stats.inserted += 1;
        }
      } catch (error) {
        stats.errors += 1;
        this.logError('ingest.article.failed', 'ARTICLE_PROCESS_FAILED', error, {
          slug: entry.person.slug,
          url: candidate.url,
        });
      }
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= retries) {
      try {
        return await this.withTimeout(fn(), this.env.INGEST_TIMEOUT_MS);
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt > retries) {
          break;
        }
        this.logger.info('ingest.retry', {
          code: 'INGEST_RETRY',
          attempt,
          retryLimit: retries,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    throw lastError ?? new Error('unknown failure');
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    if (timeoutMs <= 0) {
      return promise;
    }

    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`operation timed out after ${timeoutMs}ms`));
          }, timeoutMs).unref?.();
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async runWithJobTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    if (timeoutMs <= 0) {
      return promise;
    }

    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`job exceeded timeout ${timeoutMs}ms`));
          }, timeoutMs).unref?.();
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private logError(
    message: string,
    fallbackCode: string,
    error: unknown,
    extra: Record<string, unknown> = {},
  ): void {
    const code = error instanceof IngestError ? error.code : fallbackCode;
    const details = error instanceof IngestError ? error.details : {};
    const errMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    this.logger.error(message, {
      code,
      error: errMessage,
      stack,
      ...details,
      ...extra,
    });
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const queue = items.slice();
  const limit = Math.max(1, concurrency);

  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        return;
      }
      await handler(next);
    }
  });

  await Promise.all(workers);
}
