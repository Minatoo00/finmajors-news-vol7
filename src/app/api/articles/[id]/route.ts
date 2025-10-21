import { NextResponse, type NextRequest } from 'next/server';

import { buildArticleDetailResponse } from '../../../../lib/api/public';
import { getPrisma } from '../../../../lib/prisma';

type ArticleDetail = Awaited<ReturnType<typeof buildArticleDetailResponse>>;

function serializeArticleDetail(detail: ArticleDetail) {
  if (!detail) return null;
  return {
    ...detail,
    id: detail.id.toString(),
  };
}

type PrismaArticleClient = Parameters<typeof buildArticleDetailResponse>[0];

export function createArticleDetailHandler(prisma: PrismaArticleClient) {
  return async function handler(
    _request: NextRequest,
    context: { params: { id: string } },
  ) {
    const { id } = context.params;
    let articleId: bigint;
    try {
      articleId = BigInt(id);
    } catch {
      return NextResponse.json(
        { error: 'Invalid article id' },
        { status: 400 },
      );
    }

    try {
      const detail = await buildArticleDetailResponse(prisma, articleId);
      if (!detail) {
        return NextResponse.json(
          { error: 'Article not found' },
          { status: 404 },
        );
      }

      return NextResponse.json(serializeArticleDetail(detail));
    } catch (error) {
      console.error('Failed to build article detail response', error);
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 },
      );
    }
  };
}

let cachedHandler: ReturnType<typeof createArticleDetailHandler> | null = null;

function getDefaultHandler() {
  if (!cachedHandler) {
    cachedHandler = createArticleDetailHandler(getPrisma());
  }
  return cachedHandler;
}

export const GET = (request: NextRequest, context: { params: { id: string } }) =>
  getDefaultHandler()(request, context);
