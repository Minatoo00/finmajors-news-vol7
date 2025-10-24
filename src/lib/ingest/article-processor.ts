import crypto from 'node:crypto';
import type { PersonDictionaryEntry, SaveArticleDraftInput } from '../persistence/service';
import type {
  ArticleProcessor,
  IngestLogger,
  ProcessContext,
  RssArticleCandidate,
  ProcessedArticle,
} from './types';
import { resolveOriginalUrl, type ResolveResult } from '../gn';

type ContentExtractorResult =
  | string
  | {
      content?: string | null;
      text?: string | null;
      imageUrl?: string | null;
    }
  | null
  | undefined;

type ContentExtractor = (url: string) => Promise<ContentExtractorResult>;

interface ArticleProcessorOptions {
  contentExtractor: ContentExtractor;
  resolveUrl?: (gnUrl: string) => Promise<ResolveResult>;
  logger?: IngestLogger;
  clock?: () => Date;
  mentionThreshold?: number;
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
  private readonly contentExtractor: ContentExtractor;

  private readonly resolveUrl: (url: string) => Promise<ResolveResult>;

  private readonly logger: IngestLogger;

  private readonly clock: () => Date;

  private readonly mentionThreshold: number;

  private static readonly PRIMARY_MENTION_WEIGHT = 2;

  private static readonly ALIAS_MENTION_WEIGHT = 1;

  private static readonly MINIMUM_CONTENT_LENGTH = 80;

  constructor(options: ArticleProcessorOptions) {
    this.contentExtractor = options.contentExtractor;
    this.resolveUrl = options.resolveUrl ?? resolveOriginalUrl;
    this.logger = options.logger ?? defaultLogger;
    this.clock = options.clock ?? (() => new Date());
    this.mentionThreshold = Math.max(1, options.mentionThreshold ?? 2);
  }

  async process(
    candidate: RssArticleCandidate,
    person: PersonDictionaryEntry,
    context: ProcessContext,
  ): Promise<ProcessedArticle | null> {
    const { env } = context;

    const resolution = await this.resolveUrl(candidate.url);
    const resolvedUrl = resolution.url ?? candidate.url;

    const articleContent = await this.contentExtractor(resolvedUrl);
    const textRaw = this.extractText(articleContent) ?? candidate.description ?? '';
    const cleanedText = this.cleanContent(textRaw);
    const imageUrl = this.extractImageUrl(articleContent) ?? candidate.imageUrl ?? null;

    if (!this.hasSufficientContent(cleanedText)) {
      this.logger.info('ingest.article.skipped', {
        slug: person.person.slug,
        reason: 'insufficient_content',
        url: resolvedUrl,
        environment: env.NODE_ENV,
      });
      return null;
    }

    const normalizedText = this.normalizeForComparison(cleanedText);
    const mentionCount = this.countMentions(normalizedText, person);
    if (mentionCount < this.mentionThreshold) {
      this.logger.info('ingest.article.skipped', {
        slug: person.person.slug,
        reason: 'insufficient_mentions',
        mentions: mentionCount,
        threshold: this.mentionThreshold,
        url: resolvedUrl,
        environment: env.NODE_ENV,
      });
      return null;
    }

    const contentHash = this.computeContentHash(normalizedText);

    const fetchedAt = candidate.fetchedAt ?? this.clock();

    const draft: SaveArticleDraftInput = {
      url: resolvedUrl,
      sourceDomain: this.toSourceDomain(resolvedUrl, candidate.sourceDomain),
      title: candidate.title,
      description: candidate.description,
      content: cleanedText,
      contentHash,
      imageUrl,
      publishedAt: candidate.publishedAt,
      fetchedAt,
      persons: [
        {
          id: person.person.id,
          slug: person.person.slug,
        },
      ],
    };

    const summaryInput = {
      title: candidate.title,
      content: cleanedText,
      url: resolvedUrl,
      persons: [
        {
          slug: person.person.slug,
          nameJp: person.person.nameJp,
          nameEn: person.person.nameEn,
          institutionCode: person.person.institutionCode,
        },
      ],
    };

    return { draft, summaryInput };
  }

  private cleanContent(input: string): string {
    return input.replace(/\s+/g, ' ').trim();
  }

  private normalizeForComparison(input: string): string {
    return input
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private computeContentHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private normalizeName(input: string): string {
    return this.normalizeForComparison(input);
  }

  private countMentions(normalizedContent: string, person: PersonDictionaryEntry): number {
    const terms = new Map<string, number>();
    const addTerm = (value: string, weight = 1) => {
      const normalized = this.normalizeName(value);
      if (!normalized) {
        return;
      }
      const existing = terms.get(normalized) ?? 0;
      terms.set(normalized, Math.max(existing, weight));
    };

    addTerm(person.person.nameJp, ArticleProcessorImpl.PRIMARY_MENTION_WEIGHT);
    addTerm(person.person.nameEn, ArticleProcessorImpl.PRIMARY_MENTION_WEIGHT);
    person.aliases.forEach((alias) => addTerm(alias, ArticleProcessorImpl.ALIAS_MENTION_WEIGHT));

    let score = 0;
    for (const [term, weight] of terms.entries()) {
      const matches = this.countOccurrences(normalizedContent, term);
      if (matches > 0) {
        score += matches * weight;
      }
    }
    return score;
  }

  private hasSufficientContent(content: string): boolean {
    const trimmed = content.trim();
    if (trimmed.length < ArticleProcessorImpl.MINIMUM_CONTENT_LENGTH) {
      return false;
    }
    const tokens = trimmed
      .split(/[\p{P}\s]+/u)
      .map((token) => this.normalizeForComparison(token))
      .filter((token) => token.length > 1);
    const uniqueTokens = new Set(tokens);
    return uniqueTokens.size >= Math.max(1, ArticleProcessorImpl.MINIMUM_CONTENT_LENGTH / 8);
  }

  private countOccurrences(haystack: string, needle: string): number {
    if (!needle) {
      return 0;
    }
    let index = haystack.indexOf(needle);
    if (index === -1) {
      return 0;
    }
    let count = 0;
    while (index !== -1) {
      count += 1;
      index = haystack.indexOf(needle, index + needle.length);
    }
    return count;
  }

  private toSourceDomain(resolvedUrl: string, fallbackDomain: string): string {
    try {
      const parsed = new URL(resolvedUrl);
      return parsed.hostname;
    } catch {
      return fallbackDomain;
    }
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

    if (typeof result === 'string') {
      const trimmed = result.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    const imageUrl = result?.imageUrl;
    if (typeof imageUrl === 'string') {
      const trimmed = imageUrl.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
