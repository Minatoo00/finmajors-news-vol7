import type { AppEnv } from '../env';
import type { PersonDictionaryEntry, SaveArticleDraftInput } from '../persistence/service';
import type { ResolveMethod } from '../gn';

export interface RssArticleCandidate {
  url: string;
  sourceDomain: string;
  title: string;
  description: string | null;
  imageUrl?: string | null;
  content?: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  raw?: unknown;
}

export interface FetchContext {
  timeoutMs: number;
  retryLimit: number;
  env: AppEnv;
}

export interface ProcessContext {
  person: PersonDictionaryEntry;
  env: AppEnv;
}

export interface RssFetcher {
  fetch(person: PersonDictionaryEntry, context: FetchContext): Promise<RssArticleCandidate[]>;
}

export interface ProcessedArticle {
  draft: SaveArticleDraftInput;
  summaryInput: SummaryInput;
}

export interface ArticleProcessor {
  process(
    candidate: RssArticleCandidate,
    person: PersonDictionaryEntry,
    context: ProcessContext,
  ): Promise<ProcessedArticle | null>;
}

export interface PersistenceDuplicateChecker {
  isDuplicateArticle(url: string, contentHash?: string | null): Promise<{ status: 'duplicate'; articleId: bigint } | null>;
}

export interface IngestStats {
  inserted: number;
  deduped: number;
  errors: number;
  skipped: number;
  fetched: number;
}

export interface IngestResult {
  jobId: bigint;
  stats: IngestStats;
}

export interface IngestLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface SummaryInput {
  title: string;
  content: string;
  url: string;
  persons: Array<{
    slug: string;
    nameJp: string;
    nameEn: string;
    institutionCode: string;
  }>;
}

export interface SummaryService {
  generateSummary(input: SummaryInput): Promise<string | null>;
}
