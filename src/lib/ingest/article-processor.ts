import type { PersonDictionaryEntry, SaveArticleInput } from '../persistence/service';
import { IngestError, SummaryGenerationError } from './errors';
import type {
  ArticleProcessor,
  IngestLogger,
  ProcessContext,
  RssArticleCandidate,
  SummaryService,
} from './types';

type ContentExtractorResult =
  | {
      content?: string | null;
      text?: string | null;
      imageUrl?: string | null;
    }
  | null
  | undefined;

type ContentExtractor = (url: string) => Promise<ContentExtractorResult>;

interface ArticleProcessorOptions {
  summaryService: SummaryService;
  contentExtractor: ContentExtractor;
  logger?: IngestLogger;
  clock?: () => Date;
}

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

export class ArticleProcessorImpl implements ArticleProcessor {
  private readonly summaryService: SummaryService;

  private readonly contentExtractor: ContentExtractor;

  private readonly logger: IngestLogger;

  private readonly clock: () => Date;

  constructor(options: ArticleProcessorOptions) {
    this.summaryService = options.summaryService;
    this.contentExtractor = options.contentExtractor;
    this.logger = options.logger ?? defaultLogger;
    this.clock = options.clock ?? (() => new Date());
  }

  async process(
    candidate: RssArticleCandidate,
    person: PersonDictionaryEntry,
    context: ProcessContext,
  ): Promise<SaveArticleInput | null> {
    const articleContent = await this.contentExtractor(candidate.url);
    const text = this.extractText(articleContent) ?? candidate.description ?? '';
    const imageUrl = this.extractImageUrl(articleContent) ?? candidate.imageUrl ?? null;

    if (!text || text.trim().length === 0) {
      this.logger.info('ingest.article.skipped', {
        slug: person.person.slug,
        reason: 'empty_content',
        url: candidate.url,
      });
      return null;
    }

    let summary: string | null = null;
    try {
      summary = await this.summaryService.generateSummary({
        title: candidate.title,
        content: text,
        url: candidate.url,
        persons: [
          {
            slug: person.person.slug,
            nameJp: person.person.nameJp,
            nameEn: person.person.nameEn,
            institutionCode: person.person.institutionCode,
          },
        ],
      });
    } catch (error) {
      const ingestError = error instanceof IngestError ? error : new SummaryGenerationError(
        error instanceof Error ? error.message : 'Summary generation failed',
        { cause: error instanceof Error ? error : undefined },
      );
      this.logger.error('ingest.summary.failed', {
        code: ingestError.code,
        slug: person.person.slug,
        url: candidate.url,
        error: ingestError.message,
        stack: ingestError.stack,
      });
      throw ingestError;
    }

    if (!summary || summary.trim().length === 0) {
      const emptyError = new SummaryGenerationError('Summary text is empty', {
        details: { slug: person.person.slug, url: candidate.url },
      });
      this.logger.error('ingest.summary.unavailable', {
        code: emptyError.code,
        slug: person.person.slug,
        url: candidate.url,
        error: emptyError.message,
      });
      throw emptyError;
    }

    const fetchedAt = candidate.fetchedAt ?? this.clock();

    return {
      url: candidate.url,
      sourceDomain: candidate.sourceDomain,
      title: candidate.title,
      description: candidate.description,
      imageUrl,
      publishedAt: candidate.publishedAt,
      fetchedAt,
      persons: [
        {
          id: person.person.id,
          slug: person.person.slug,
        },
      ],
      summaryText: summary,
    };
  }

  private extractText(result: ContentExtractorResult): string | null {
    if (!result) {
      return null;
    }

    if (typeof result === 'string') {
      return result;
    }

    if (typeof result.content === 'string') {
      return result.content;
    }

    if (typeof result.text === 'string') {
      return result.text;
    }

    return null;
  }

  private extractImageUrl(result: ContentExtractorResult): string | null {
    if (!result) {
      return null;
    }

    if (typeof result === 'string' && result.trim().length > 0) {
      return result.trim();
    }

    if (typeof result.imageUrl === 'string' && result.imageUrl.trim().length > 0) {
      return result.imageUrl.trim();
    }

    return null;
  }
}
