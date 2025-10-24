"use client";

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { formatJstDateTime } from '../../lib/formatting/time';

interface NewsPerson {
  slug: string;
  nameJp: string;
  institution: {
    code: string;
    nameJp: string;
    nameEn?: string;
  };
}

interface NewsArticle {
  id: string;
  title: string;
  url: string;
  sourceDomain: string;
  imageUrl?: string | null;
  publishedAt: string | null;
  summary: {
    text: string;
  };
  persons: NewsPerson[];
}

interface NewsListProps {
  articles: NewsArticle[];
  nextCursor?: string | null;
  searchParams?: Record<string, string | undefined>;
}

function ArticleCard({ article }: { article: NewsArticle }) {
  const timestamp = formatJstDateTime(article.publishedAt);

  return (
    <article className="flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {article.imageUrl ? (
        <div className="relative h-44 w-full overflow-hidden rounded-t-lg bg-slate-100">
          <Image
            src={article.imageUrl}
            alt={article.title}
            fill
            className="object-cover"
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
            unoptimized
            priority={false}
          />
        </div>
      ) : (
        <div className="h-2 rounded-t-lg bg-slate-200" />
      )}

      <div className="flex flex-1 flex-col p-5">
        <dl className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div>
            <dt className="sr-only">メディア</dt>
            <dd>{article.sourceDomain}</dd>
          </div>
          {timestamp && (
            <div className="text-slate-400">
              <dt className="sr-only">配信日時</dt>
              <dd>{timestamp}</dd>
            </div>
          )}
        </dl>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">
              <Link href={`/news/${article.id}`} className="hover:underline">
                {article.title}
              </Link>
            </h2>
          </div>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            元記事を開く
          </a>
        </div>

        <p className="mt-4 flex-1 text-base leading-relaxed text-slate-700">
          {article.summary.text || '要約は準備中です。'}
        </p>

        {article.persons.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
            {article.persons.map((person) => (
              <li
                key={`${article.id}-${person.slug}`}
                className="rounded-full bg-slate-100 px-3 py-1"
              >
                {person.nameJp}
                {'（'}
                {person.institution.nameJp}
                {'）'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">関連人物は特定されませんでした。</p>
        )}
      </div>
    </article>
  );
}

export function NewsList({ articles, nextCursor, searchParams }: NewsListProps) {
  const [items, setItems] = useState<NewsArticle[]>(articles);
  const [cursor, setCursor] = useState<string | undefined>(nextCursor ?? undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadMore = async () => {
    if (!cursor || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value && key !== 'cursor') {
          params.set(key, value);
        }
      }
    }
    params.set('cursor', cursor);

    const requestUrl = `/api/articles?${params.toString()}`;

    try {
      const response = await fetch(requestUrl, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to load more articles: ${response.status}`);
      }

      const payload = (await response.json()) as {
        items: NewsArticle[];
        nextCursor: string | null;
      };

      setItems((prev) => {
        const existingIds = new Set(prev.map((article) => article.id));
        const merged = payload.items.filter((article) => !existingIds.has(article.id));
        return [...prev, ...merged];
      });
      setCursor(payload.nextCursor ?? undefined);
    } catch (loadError) {
      console.error(loadError);
      setError('ニュースの読み込みに失敗しました。少し時間をおいて再度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreButtonDisabled = isLoading || !cursor;

  return (
    <div className="space-y-8">
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">該当するニュースが見つかりませんでした。</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {items.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {error ? (
        <p className="text-center text-sm text-red-600">{error}</p>
      ) : null}

      {cursor && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadMoreButtonDisabled}
            className={`rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-indigo-600 hover:border-indigo-400 hover:text-indigo-500 ${loadMoreButtonDisabled ? 'cursor-not-allowed opacity-60 hover:border-slate-200 hover:text-indigo-600' : ''}`}
          >
            {isLoading ? '読み込み中…' : 'さらに読み込む'}
          </button>
        </div>
      )}
    </div>
  );
}
