export const runtime = 'nodejs';

import 'server-only';
import { NextRequest } from 'next/server';
import { resolveOriginalUrl } from '@/lib/gn';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const url = typeof body?.url === 'string' ? body.url : null;
  if (!url) {
    return new Response('bad request', { status: 400 });
  }

  const result = await resolveOriginalUrl(url);
  return Response.json(result);
}

