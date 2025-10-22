import type { Prisma, PrismaClient } from '@prisma/client';
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
  imageUrl?: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  persons: Array<{ id: bigint; slug: string }>;
  summaryText: string | null;
}

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
      },
    } as Prisma.IngestJobRunCreateArgs);
  }

  async completeJobRun(
    id: bigint,
    stats: { inserted: number; deduped: number; errors: number },
  ) {
    return this.prisma.ingestJobRun.update({
      where: { id },
      data: {
        finishedAt: new Date(),
        inserted: stats.inserted,
        deduped: stats.deduped,
        errors: stats.errors,
      },
    } as Prisma.IngestJobRunUpdateArgs);
  }

  async saveArticleResult(input: SaveArticleInput): Promise<SaveArticleOutcome> {
    const normalized = normalizeUrl(input.url);

    const existing = await this.prisma.article.findUnique({
      where: { urlNormalized: normalized },
    } as Prisma.ArticleFindUniqueArgs);

    if (existing) {
      return { status: 'duplicate', articleId: existing.id as unknown as bigint };
    }

    return this.executeWithTransaction(async (client) => {
      const article = await client.article.create({
        data: {
          urlOriginal: input.url,
          urlNormalized: normalized,
          sourceDomain: input.sourceDomain,
          title: input.title,
          description: input.description ?? undefined,
          imageUrl: input.imageUrl ?? undefined,
          publishedAt: input.publishedAt ?? undefined,
          fetchedAt: input.fetchedAt,
        },
      } as Prisma.ArticleCreateArgs);

      if (input.summaryText) {
        await client.summary.upsert({
          where: { articleId: article.id },
          update: { text: input.summaryText },
          create: {
            articleId: article.id,
            text: input.summaryText,
          },
        } as Prisma.SummaryUpsertArgs);
      }

      await client.articlePerson.deleteMany({
        where: { articleId: article.id },
      } as Prisma.ArticlePersonDeleteManyArgs);

      if (input.persons.length > 0) {
        await client.articlePerson.createMany({
          data: input.persons.map((person) => ({
            articleId: article.id,
            personId: person.id,
          })),
          skipDuplicates: true,
        } as Prisma.ArticlePersonCreateManyArgs);
      }

      return { status: 'inserted', articleId: article.id as unknown as bigint };
    });
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
}
