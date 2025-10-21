import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';

import {
  buildArticlesListResponse,
  parseArticlesListQuery,
} from '../../../lib/api/public';
import type { ArticlesListResponse } from '../../../lib/types/api';
import { getPrisma } from '../../../lib/prisma';

function serializeArticleList(
  input: ArticlesListResponse,
) {
  return {
    items: input.items.map((item) => ({
      ...item,
      id: item.id.toString(),
    })),
    nextCursor: input.nextCursor ?? null,
  };
}

type PrismaArticleClient = Parameters<typeof buildArticlesListResponse>[0];

export function createArticlesHandler(prisma: PrismaArticleClient) {
  return async function handler(request: NextRequest) {
    try {
      const paramsObject = Object.fromEntries(
        request.nextUrl.searchParams.entries(),
      );
      const query = parseArticlesListQuery(paramsObject);
      const response = await buildArticlesListResponse(prisma, query);
      return NextResponse.json(serializeArticleList(response));
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: 'Invalid request',
            issues: error.issues,
          },
          { status: 400 },
        );
      }
      console.error('Failed to build articles list response', error);
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 },
      );
    }
  };
}

let cachedHandler: ReturnType<typeof createArticlesHandler> | null = null;

function getDefaultHandler() {
  if (!cachedHandler) {
    cachedHandler = createArticlesHandler(getPrisma());
  }
  return cachedHandler;
}

export const GET = (request: NextRequest) => getDefaultHandler()(request);
