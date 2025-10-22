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
            sizes="(min-width: 1280px) 360px, (min-width: 768px) 320px, 100vw"
            priority={false}
            unoptimized
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

function buildCursorHref(
  nextCursor: string,
  searchParams?: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== 'cursor') {
        params.set(key, value);
      }
    }
  }
  params.set('cursor', nextCursor);
  const queryString = params.toString();
  return `?${queryString}`;
}

export function NewsList({ articles, nextCursor, searchParams }: NewsListProps) {
  return (
    <div className="space-y-8">
      {articles.length === 0 ? (
        <p className="text-sm text-slate-500">該当するニュースが見つかりませんでした。</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Link
            href={buildCursorHref(nextCursor, searchParams)}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-indigo-600 hover:border-indigo-400 hover:text-indigo-500"
          >
            さらに読み込む
          </Link>
        </div>
      )}
    </div>
  );
}
