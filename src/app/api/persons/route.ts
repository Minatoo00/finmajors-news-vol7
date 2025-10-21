import { NextResponse } from 'next/server';

import { buildPersonsResponse } from '../../../lib/api/public';
import { getPrisma } from '../../../lib/prisma';

type PrismaPersonClient = Parameters<typeof buildPersonsResponse>[0];

export async function getPersonsResponse(prisma: PrismaPersonClient) {
  return buildPersonsResponse(prisma);
}

export function createPersonsHandler(prisma: PrismaPersonClient) {
  return async function handlePersonsRequest() {
    try {
      const response = await getPersonsResponse(prisma);
      return NextResponse.json(response);
    } catch (error) {
      console.error('Failed to build persons response', error);
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 },
      );
    }
  };
}

let cachedHandler: ReturnType<typeof createPersonsHandler> | null = null;

function getDefaultHandler() {
  if (!cachedHandler) {
    cachedHandler = createPersonsHandler(getPrisma());
  }
  return cachedHandler;
}

export const GET = (_request?: unknown) => getDefaultHandler()();
