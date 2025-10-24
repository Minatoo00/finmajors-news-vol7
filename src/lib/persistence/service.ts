import { Prisma, type PrismaClient } from '@prisma/client';
import { normalizeUrl } from './url';

type PrismaLike = Pick<
  PrismaClient,
  'person' | 'article' | 'summary' | 'articlePerson' | 'ingestJobRun'
> & {
  $transaction?: PrismaClient['$transaction'];
};

type TransactionClient = Pick<
  Prisma.TransactionClient,
  'article' | 'summary' | 'articlePerson'
>;

type PersonWithRelations = Prisma.PersonGetPayload<{
  include: {
    aliases: true;
    institution: true;
  };
}>;

export interface PersonDictionaryEntry {
  person: {
    id: bigint;
    slug: string;
    nameJp: string;
    nameEn: string;
    role: string;
    active: boolean;
    institutionCode: string;
    institutionNameJp: string;
    institutionNameEn: string;
  };
  aliases: string[];
}

export interface PersonDictionary {
  bySlug: Map<string, PersonDictionaryEntry>;
  aliasToSlug: Map<string, string>;
}

export interface SaveArticleInput {
  url: string;
  sourceDomain: string;
  title: string;
  description?: string | null;
  content?: string | null;
  contentHash?: string | null;
  imageUrl?: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  persons: Array<{ id: bigint; slug: string }>;
  summaryText: string | null;
}

export type SaveArticleDraftInput = Omit<SaveArticleInput, 'summaryText'>;

export type SaveArticleOutcome =
  | { status: 'duplicate'; articleId: bigint }
  | { status: 'inserted'; articleId: bigint };

export class PersistenceService {
  constructor(private readonly prisma: PrismaLike) {}

  async loadPersonDictionary(): Promise<PersonDictionary> {
    const persons = (await this.prisma.person.findMany({
      where: { active: true },
      include: {
        aliases: true,
        institution: true,
      },
      orderBy: [{ institution: { code: 'asc' } }, { slug: 'asc' }],
    } as Prisma.PersonFindManyArgs)) as PersonWithRelations[];

    const bySlug = new Map<string, PersonDictionaryEntry>();
    const aliasToSlug = new Map<string, string>();

    for (const person of persons) {
      const entry: PersonDictionaryEntry = {
        person: {
          id: person.id as unknown as bigint,
          slug: person.slug,
          nameJp: person.nameJp,
          nameEn: person.nameEn,
          role: person.role,
          active: person.active,
          institutionCode: person.institution.code,
          institutionNameJp: person.institution.nameJp,
          institutionNameEn: person.institution.nameEn,
        },
        aliases: person.aliases.map((alias) => alias.text),
      };

      bySlug.set(person.slug, entry);
      for (const alias of entry.aliases) {
        aliasToSlug.set(alias, person.slug);
      }
      aliasToSlug.set(person.nameJp, person.slug);
      aliasToSlug.set(person.nameEn, person.slug);
    }

    return { bySlug, aliasToSlug };
  }

  async recordJobStart(startedAt: Date = new Date()) {
    return this.prisma.ingestJobRun.create({
      data: {
        startedAt,
        inserted: 0,
        deduped: 0,
        errors: 0,
        skipped: 0,
        fetched: 0,
      },
    } as Prisma.IngestJobRunCreateArgs);
  }

  async completeJobRun(
    id: bigint,
    stats: { inserted: number; deduped: number; errors: number; skipped: number; fetched: number },
  ) {
    return this.prisma.ingestJobRun.update({
      where: { id },
      data: {
        finishedAt: new Date(),
        inserted: stats.inserted,
        deduped: stats.deduped,
        errors: stats.errors,
        skipped: stats.skipped,
        fetched: stats.fetched,
      },
    } as Prisma.IngestJobRunUpdateArgs);
  }

  async saveArticleResult(input: SaveArticleInput): Promise<SaveArticleOutcome> {
    const normalized = normalizeUrl(input.url);

    const existingId = await this.findExistingArticleId(normalized, input.contentHash);

    if (existingId) {
      return { status: 'duplicate', articleId: existingId };
    }

    return await this.executeWithTransaction(async (client) => {
      const createData = {
        urlOriginal: input.url,
        urlNormalized: normalized,
        sourceDomain: input.sourceDomain,
        title: input.title,
        description: input.description ?? undefined,
        content: input.content ?? undefined,
        contentHash: input.contentHash ?? undefined,
        imageUrl: input.imageUrl ?? undefined,
        publishedAt: input.publishedAt ?? undefined,
        fetchedAt: input.fetchedAt,
      } satisfies Prisma.ArticleCreateInput;

      const result = await client.article.createMany({
        data: [createData],
        skipDuplicates: true,
      } as Prisma.ArticleCreateManyArgs);

      // 重複（既存）
      if (result.count === 0) {
        // 競合があっても直後のクエリでコミット済み行が見える（READ COMMITTED）前提で取得
        const byUrl = await client.article.findUnique({
          where: { urlNormalized: normalized },
          select: { id: true },
        } as Prisma.ArticleFindUniqueArgs);

        if (byUrl) {
          return { status: 'duplicate', articleId: byUrl.id as unknown as bigint };
        }

        if (input.contentHash) {
          const byHash = await client.article.findUnique({
            where: { contentHash: input.contentHash },
            select: { id: true },
          } as Prisma.ArticleFindUniqueArgs);
          if (byHash) {
            return { status: 'duplicate', articleId: byHash.id as unknown as bigint };
          }
        }

        // 念のためのフォールバック（極めて稀）
        const fallbackId = await this.findExistingArticleId(normalized, input.contentHash);
        if (fallbackId) {
          return { status: 'duplicate', articleId: fallbackId };
        }

        throw new Error('Duplicate detected but existing article not found');
      }

      // 新規作成（createMany は行を返さないため、ID を取得）
      const created = await client.article.findUnique({
        where: { urlNormalized: normalized },
        select: { id: true },
      } as Prisma.ArticleFindUniqueArgs);

      if (!created) {
        throw new Error('Article created but not found by urlNormalized');
      }

      const articleId = created.id as unknown as bigint;

      if (input.summaryText) {
        await client.summary.upsert({
          where: { articleId: created.id },
          update: { text: input.summaryText },
          create: {
            articleId: created.id,
            text: input.summaryText,
          },
        } as Prisma.SummaryUpsertArgs);
      }

      await client.articlePerson.deleteMany({
        where: { articleId: created.id },
      } as Prisma.ArticlePersonDeleteManyArgs);

      if (input.persons.length > 0) {
        await client.articlePerson.createMany({
          data: input.persons.map((person) => ({
            articleId: created.id,
            personId: person.id,
          })),
          skipDuplicates: true,
        } as Prisma.ArticlePersonCreateManyArgs);
      }

      return { status: 'inserted', articleId };
    });
  }

  async isDuplicateArticle(url: string, contentHash?: string | null): Promise<{ status: 'duplicate'; articleId: bigint } | null> {
    const normalized = url.startsWith('http') ? normalizeUrl(url) : url;

    const existingId = await this.findExistingArticleId(normalized, contentHash);

    if (existingId) {
      return { status: 'duplicate', articleId: existingId };
    }

    return null;
  }

  private async executeWithTransaction<T>(
    callback: (client: TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(async (tx: Prisma.TransactionClient) =>
        callback(tx),
      );
    }
    return callback(this.prisma as unknown as TransactionClient);
  }

  private async findExistingArticleId(
    normalizedUrl: string,
    contentHash?: string | null,
  ): Promise<bigint | null> {
    const existingByUrl = await this.prisma.article.findUnique({
      where: { urlNormalized: normalizedUrl },
      select: { id: true },
    } as Prisma.ArticleFindUniqueArgs);

    if (existingByUrl) {
      return existingByUrl.id as unknown as bigint;
    }

    if (contentHash) {
      const existingByHash = await this.prisma.article.findUnique({
        where: { contentHash },
        select: { id: true },
      } as Prisma.ArticleFindUniqueArgs);

      if (existingByHash) {
        return existingByHash.id as unknown as bigint;
      }
    }

    return null;
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
