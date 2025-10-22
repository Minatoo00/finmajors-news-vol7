import { Suspense } from 'react';

import {
  buildArticlesListResponse,
  buildPersonsResponse,
  parseArticlesListQuery,
} from '../../../lib/api/public';
import { getPrisma } from '../../../lib/prisma';
import { NewsFilters } from '../../../components/news/news-filters';
import { NewsList } from '../../../components/news/news-list';

type SearchParams = Record<string, string | string[] | undefined>;

function normalizeSearchParams(searchParams?: SearchParams): Record<string, string> {
  if (!searchParams) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      if (value.length > 0) {
        const first = value[0];
        if (typeof first === 'string') {
          const trimmed = first.trim();
          if (trimmed) {
            result[key] = trimmed;
          }
        }
      }
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        result[key] = trimmed;
      }
    }
  }
  return result;
}

function NewsListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex animate-pulse flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="h-4 w-2/3 rounded bg-slate-200" />
          <div className="mt-4 h-3 w-full rounded bg-slate-100" />
          <div className="mt-2 h-3 w-5/6 rounded bg-slate-100" />
          <div className="mt-6 flex flex-wrap gap-2">
            <div className="h-6 w-24 rounded-full bg-slate-200" />
            <div className="h-6 w-24 rounded-full bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function NewsListSection({
  paramsObject,
}: {
  paramsObject: Record<string, string>;
}) {
  const prisma = getPrisma();
  const [personsResponse, mediaRows] = await Promise.all([
    buildPersonsResponse(prisma),
    prisma.article.findMany({
      distinct: ['sourceDomain'],
      select: { sourceDomain: true },
      where: { sourceDomain: { not: '' } },
      orderBy: { sourceDomain: 'asc' },
    }),
  ]);

  const mediaOptions = Array.from(
    new Set(
      mediaRows
        .map((row) => row.sourceDomain?.trim())
        .filter((domain): domain is string => Boolean(domain)),
    ),
  );

  const persons = personsResponse.items.map((person) => ({
    slug: person.slug,
    nameJp: person.nameJp,
    institution: {
      code: person.institution.code,
      nameJp: person.institution.nameJp,
      nameEn: person.institution.nameEn,
    },
  }));

  const query = parseArticlesListQuery(paramsObject);
  const articlesResponse = await buildArticlesListResponse(prisma, query);

  const articles = articlesResponse.items.map((article) => ({
    id: article.id.toString(),
    title: article.title,
    url: article.url,
    sourceDomain: article.sourceDomain,
    imageUrl: article.imageUrl ?? null,
    publishedAt: article.publishedAt ?? null,
    summary: article.summary,
    persons: article.persons.map((person) => ({
      slug: person.slug,
      nameJp: person.nameJp,
      institution: {
        code: person.institution.code,
        nameJp: person.institution.nameJp,
        nameEn: person.institution.nameEn,
      },
    })),
  }));

  return (
    <>
      <NewsFilters
        persons={persons}
        currentFilters={{
          person: paramsObject.person,
          media: paramsObject.media,
          from: paramsObject.from,
          to: paramsObject.to,
        }}
        mediaOptions={mediaOptions}
      />
      <NewsList
        articles={articles}
        nextCursor={articlesResponse.nextCursor ?? undefined}
        searchParams={paramsObject}
      />
    </>
  );
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const paramsObject = normalizeSearchParams(searchParams);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 lg:px-0">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">中央銀行ニュースダイジェスト</h1>
        <p className="text-sm text-slate-600">
          主要中央銀行の要人発言を収集し、JSTでのタイムスタンプとAI要約を添えてお届けします。
        </p>
      </header>
      <Suspense fallback={<NewsListSkeleton />}>
        <NewsListSection paramsObject={paramsObject} />
      </Suspense>
    </main>
  );
}
