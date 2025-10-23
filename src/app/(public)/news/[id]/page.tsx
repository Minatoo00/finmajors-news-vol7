import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { buildArticleDetailResponse } from '../../../../lib/api/public';
import { formatJstDateTime } from '../../../../lib/formatting/time';
import { getPrisma } from '../../../../lib/prisma';

interface PageProps {
  params: {
    id: string;
  };
}

export default async function NewsDetailPage({ params }: PageProps) {
  let articleId: bigint;
  try {
    articleId = BigInt(params.id);
  } catch {
    notFound();
  }

  const prisma = getPrisma();
  const detail = await buildArticleDetailResponse(prisma, articleId);

  if (!detail) {
    notFound();
  }

  const timestamp = formatJstDateTime(detail.publishedAt ?? null);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 lg:px-0">
      <Link href="/news" className="text-sm text-indigo-600 hover:text-indigo-500">
        ← ニュース一覧に戻る
      </Link>

      <article className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {detail.sourceDomain}
          </p>
          <h1 className="text-2xl font-bold text-slate-900">{detail.title}</h1>
          <p className="text-sm text-slate-600">{timestamp}</p>
        </header>

        {detail.imageUrl && (
          <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            <Image
              src={detail.imageUrl}
              alt={detail.title}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 768px, 100vw"
              unoptimized
              priority={false}
            />
          </div>
        )}

        {detail.summary ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">要約</h2>
            <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-slate-700">
              {detail.summary.text}
            </p>
            {detail.summary.createdAt && (
              <p className="mt-4 text-xs text-slate-500">
                作成日時: {formatJstDateTime(detail.summary.createdAt)}
              </p>
            )}
          </section>
        ) : (
          <p className="text-sm text-slate-500">要約はまだ生成されていません。</p>
        )}

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            関連人物
          </h2>
          {detail.persons.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {detail.persons.map((person) => (
                <li key={person.slug}>
                  {person.nameJp}
                  {'（'}
                  {person.institution.nameJp}
                  {' / '}
                  {person.role}
                  {'）'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2">関連人物は特定されませんでした。</p>
          )}
        </section>

        <a
          href={detail.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          元記事を開く
          <span aria-hidden>↗</span>
        </a>
      </article>
    </main>
  );
}
