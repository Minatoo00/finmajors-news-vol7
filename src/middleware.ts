import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { verifyAdminAccess } from './lib/api/admin';
import { getEnv, type AppEnv } from './lib/env';

export function shouldProtect(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
}

function buildClientIp(request: NextRequest) {
  return (
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    undefined
  );
}

export function createAdminMiddleware(env: AppEnv) {
  return (request: NextRequest) => {
    if (!shouldProtect(request.nextUrl.pathname)) {
      return NextResponse.next();
    }

    const authorized = verifyAdminAccess({
      authorizationHeader: request.headers.get('authorization') ?? undefined,
      clientIp: buildClientIp(request),
      env,
    });

    if (authorized) {
      return NextResponse.next();
    }

    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin Area"',
      },
    });
  };
}

const defaultMiddleware = createAdminMiddleware(getEnv());

export function middleware(request: NextRequest) {
  return defaultMiddleware(request);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
