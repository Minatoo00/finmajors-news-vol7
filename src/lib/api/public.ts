import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type {
  ArticleDetailResponse,
  ArticleListItem,
  ArticlesListQuery,
  ArticlesListResponse,
  PersonResponseItem,
  PersonsResponse,
} from '../types/api';

type PrismaArticleClient = Pick<
  PrismaClient,
  'article'
>;

type PrismaPersonClient = Pick<
  PrismaClient,
  'person'
>;

type PublicPrisma = PrismaArticleClient & PrismaPersonClient;

const articleSelect = {
  id: true,
  title: true,
  urlOriginal: true,
  sourceDomain: true,
  imageUrl: true,
  publishedAt: true,
  summary: {
    select: {
      text: true,
      createdAt: true,
    },
  },
  persons: {
    select: {
      person: {
        select: {
          slug: true,
          nameJp: true,
          nameEn: true,
          role: true,
          active: true,
          institution: {
            select: {
              code: true,
              nameJp: true,
              nameEn: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ArticleSelect;

function parseTimestamp(value: string): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00+09:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().min(1).optional());

const optionalCursor = z.preprocess((value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().min(1).optional());

const optionalTimestamp = z.preprocess((value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return parseTimestamp(trimmed) ?? undefined;
}, z.date().optional());

const articlesListQuerySchema = z.object({
  person: optionalNonEmptyString,
  from: optionalTimestamp,
  to: optionalTimestamp,
  media: optionalNonEmptyString,
  cursor: optionalCursor,
  limit: z
    .preprocess((value) => {
      if (typeof value === 'string' && value.trim() === '') {
        return undefined;
      }
      return value;
    }, z.coerce.number().int().min(1).max(50).default(20)),
});

export type ParsedArticlesListQuery = Omit<ArticlesListQuery, 'from' | 'to' | 'limit'> & {
  from?: Date;
  to?: Date;
  limit: number;
};

export function parseArticlesListQuery(
  input: Record<string, unknown>,
): ParsedArticlesListQuery {
  const parsed = articlesListQuerySchema.parse(input);
  return parsed as ParsedArticlesListQuery;
}

export interface ArticlesCursorPayload {
  publishedAt: Date;
  articleId: bigint;
}

export function encodeArticlesCursor(payload: ArticlesCursorPayload): string {
  const encoded = Buffer.from(
    JSON.stringify({
      publishedAt: payload.publishedAt.toISOString(),
      articleId: payload.articleId.toString(),
    }),
    'utf8',
  );
  return encoded.toString('base64url');
}

export function decodeArticlesCursor(cursor: string): ArticlesCursorPayload {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const data = JSON.parse(decoded) as {
    publishedAt: string;
    articleId: string;
  };
  return {
    publishedAt: new Date(data.publishedAt),
    articleId: BigInt(data.articleId),
  };
}

type ArticleWithRelations = Prisma.ArticleGetPayload<{
  select: typeof articleSelect;
}>;

type PersonWithInstitution = Prisma.PersonGetPayload<{
  include: {
    institution: true;
  };
}>;

export async function buildPersonsResponse(
  prisma: PrismaPersonClient,
): Promise<PersonsResponse> {
  const persons = (await prisma.person.findMany({
    include: {
      institution: true,
    },
    orderBy: [
      { institution: { code: 'asc' } },
      { slug: 'asc' },
    ],
  } as Prisma.PersonFindManyArgs)) as PersonWithInstitution[];

  const items: PersonResponseItem[] = persons.map((person) => ({
    slug: person.slug,
    nameJp: person.nameJp,
    nameEn: person.nameEn,
    institution: {
      code: person.institution.code,
      nameJp: person.institution.nameJp,
      nameEn: person.institution.nameEn,
    },
    role: person.role,
    active: person.active,
  }));

  return {
    items,
    updatedAt: new Date().toISOString(),
  };
}

function buildCursorFilter(cursor: string): Prisma.ArticleWhereInput {
  const payload = decodeArticlesCursor(cursor);
  return {
    OR: [
      {
        publishedAt: {
          lt: payload.publishedAt,
        },
      },
      {
        AND: [
          {
            publishedAt: {
              equals: payload.publishedAt,
            },
          },
          {
            id: {
              lt: payload.articleId,
            },
          },
        ],
      },
    ],
  };
}

function mapArticleToListItem(article: ArticleWithRelations): ArticleListItem {
  return {
    id: article.id,
    title: article.title,
    url: article.urlOriginal,
    sourceDomain: article.sourceDomain,
    imageUrl: article.imageUrl ?? null,
    publishedAt: article.publishedAt
      ? article.publishedAt.toISOString()
      : null,
    summary: {
      text: article.summary?.text ?? '',
    },
    persons: article.persons.map(({ person }) => ({
      slug: person.slug,
      nameJp: person.nameJp,
      nameEn: person.nameEn,
      institution: {
        code: person.institution.code,
        nameJp: person.institution.nameJp,
        nameEn: person.institution.nameEn,
      },
    })),
  };
}

export async function buildArticlesListResponse(
  prisma: PrismaArticleClient,
  query: ParsedArticlesListQuery,
): Promise<ArticlesListResponse> {
  const where: Prisma.ArticleWhereInput = {};

  if (query.person) {
    where.persons = {
      some: {
        person: {
          slug: query.person,
        },
      },
    };
  }

  if (query.media) {
    where.sourceDomain = query.media;
  }

  if (query.from || query.to) {
    where.publishedAt = {};
    if (query.from) {
      where.publishedAt.gte = query.from;
    }
    if (query.to) {
      where.publishedAt.lte = query.to;
    }
  }

  if (query.cursor) {
    Object.assign(where, buildCursorFilter(query.cursor));
  }

  const take = query.limit + 1;

  const articles = await prisma.article.findMany({
    where,
    orderBy: [
      { publishedAt: 'desc' },
      { id: 'desc' },
    ],
    select: articleSelect,
    take,
  }) as ArticleWithRelations[];

  const hasMore = articles.length > query.limit;
  const sliced = hasMore ? articles.slice(0, query.limit) : articles;
  const items: ArticleListItem[] = sliced.map(mapArticleToListItem);

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = sliced[sliced.length - 1];
    if (last.publishedAt) {
      nextCursor = encodeArticlesCursor({
        publishedAt: last.publishedAt,
        articleId: last.id as unknown as bigint,
      });
    }
  }

  return {
    items,
    nextCursor,
  };
}

export async function buildArticleDetailResponse(
  prisma: PrismaArticleClient,
  id: bigint,
): Promise<ArticleDetailResponse | null> {
  const article = (await prisma.article.findUnique({
    where: { id },
    select: articleSelect,
  } as Prisma.ArticleFindUniqueArgs)) as ArticleWithRelations | null;

  if (!article) {
    return null;
  }

  return {
    id: article.id,
    title: article.title,
    url: article.urlOriginal,
    sourceDomain: article.sourceDomain,
    imageUrl: article.imageUrl ?? null,
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
    summary: article.summary
      ? {
          text: article.summary.text,
          createdAt: article.summary.createdAt?.toISOString?.() ?? undefined,
        }
      : null,
    persons: article.persons.map(({ person }) => ({
      slug: person.slug,
      nameJp: person.nameJp,
      nameEn: person.nameEn,
      institution: {
        code: person.institution.code,
        nameJp: person.institution.nameJp,
        nameEn: person.institution.nameEn,
      },
      role: person.role,
      active: person.active,
    })),
  };
}
