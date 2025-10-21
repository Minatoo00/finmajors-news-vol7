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
        result[key] = value[0];
      }
    } else if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

function NewsListSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="h-4 w-2/3 rounded bg-slate-200" />
          <div className="mt-4 h-3 w-full rounded bg-slate-100" />
          <div className="mt-2 h-3 w-5/6 rounded bg-slate-100" />
          <div className="mt-6 flex gap-2">
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
  let query;
  try {
    query = parseArticlesListQuery(paramsObject);
  } catch (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        フィルター条件が正しくありません。日時は ISO 形式または YYYY-MM-DD で指定してください。
      </div>
    );
  }
  const [personsResponse, articlesResponse] = await Promise.all([
    buildPersonsResponse(prisma),
    buildArticlesListResponse(prisma, query),
  ]);

  const persons = personsResponse.items.map((person) => ({
    slug: person.slug,
    nameJp: person.nameJp,
    institution: {
      code: person.institution.code,
      nameJp: person.institution.nameJp,
      nameEn: person.institution.nameEn,
    },
  }));

  const articles = articlesResponse.items.map((article) => ({
    id: article.id.toString(),
    title: article.title,
    url: article.url,
    sourceDomain: article.sourceDomain,
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
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 lg:px-0">
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
