import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import type { Prisma } from '@prisma/client';

import {
  buildAdminPersonsResponse,
  createAdminPerson,
  parseCreatePersonPayload,
  parseUpdatePersonPayload,
  updateAdminPerson,
  verifyAdminAccess,
} from '../../../../lib/api/admin';
import type { AdminPersonsResponse } from '../../../../lib/api/admin';
import { getEnv, type AppEnv } from '../../../../lib/env';
import { getPrisma } from '../../../../lib/prisma';

type AdminPersonRecord = Prisma.PersonGetPayload<{
  include: {
    institution: true;
    aliases: true;
  };
}>;

function serializeAdminPerson(person: AdminPersonRecord) {
  return {
    id: person.id.toString(),
    slug: person.slug,
    nameJp: person.nameJp,
    nameEn: person.nameEn,
    role: person.role,
    active: person.active,
    institution: {
      code: person.institution.code,
      nameJp: person.institution.nameJp,
      nameEn: person.institution.nameEn,
    },
    aliases: person.aliases.map((alias) => alias.text),
  };
}

function serializeAdminPersonsResponse(
  response: AdminPersonsResponse,
) {
  return {
    items: response.items.map((item) => ({
      ...item,
      id: item.id.toString(),
    })),
    updatedAt: response.updatedAt,
  };
}

function getClientIp(request: NextRequest) {
  return (
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    undefined
  );
}

function unauthorizedResponse() {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Admin Area"',
    },
  });
}

function ensureAuthorized(request: NextRequest, env: AppEnv): AppEnv | NextResponse {
  const authorized = verifyAdminAccess({
    authorizationHeader: request.headers.get('authorization') ?? undefined,
    clientIp: getClientIp(request),
    env,
  });

  if (!authorized) {
    return unauthorizedResponse();
  }
  return env;
}

type PrismaClientInstance = ReturnType<typeof getPrisma>;

async function fetchAdminPerson(
  prisma: PrismaClientInstance,
  prismaId: bigint,
) {
  const person = await prisma.person.findUnique({
    where: { id: prismaId },
    include: {
      institution: true,
      aliases: true,
    },
  });
  return person as AdminPersonRecord | null;
}

interface AdminHandlerDeps {
  prisma: PrismaClientInstance;
  env: AppEnv;
}

function createHandlers({ prisma, env }: AdminHandlerDeps) {
  const authorize = (request: NextRequest) => ensureAuthorized(request, env);

  return {
    GET: async (request: NextRequest) => {
      const auth = authorize(request);
      if (auth instanceof NextResponse) {
        return auth;
      }

      try {
        const response = await buildAdminPersonsResponse(prisma);
        return NextResponse.json(serializeAdminPersonsResponse(response));
      } catch (error) {
        console.error('Failed to fetch admin persons', error);
        return NextResponse.json(
          { error: 'Internal Server Error' },
          { status: 500 },
        );
      }
    },
    POST: async (request: NextRequest) => {
      const auth = authorize(request);
      if (auth instanceof NextResponse) {
        return auth;
      }

      let payload;
      try {
        const json = await request.json();
        payload = parseCreatePersonPayload(json);
      } catch (error) {
        if (error instanceof ZodError) {
          return NextResponse.json(
            { error: 'Invalid request', issues: error.issues },
            { status: 400 },
          );
        }
        console.error('Failed to parse create payload', error);
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 },
        );
      }

      try {
        const created = await createAdminPerson(prisma, payload);
        const detailed = await fetchAdminPerson(prisma, created.id as unknown as bigint);
        return NextResponse.json(
          detailed ? serializeAdminPerson(detailed) : { id: created.id.toString() },
          { status: 201 },
        );
      } catch (error) {
        console.error('Failed to create admin person', error);
        return NextResponse.json(
          { error: 'Internal Server Error' },
          { status: 500 },
        );
      }
    },
    PUT: async (request: NextRequest) => {
      const auth = authorize(request);
      if (auth instanceof NextResponse) {
        return auth;
      }

      let payload;
      try {
        const json = await request.json();
        payload = parseUpdatePersonPayload(json);
      } catch (error) {
        if (error instanceof ZodError) {
          return NextResponse.json(
            { error: 'Invalid request', issues: error.issues },
            { status: 400 },
          );
        }
        console.error('Failed to parse update payload', error);
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 },
        );
      }

      try {
        await updateAdminPerson(prisma, payload);
        const detailed = await fetchAdminPerson(prisma, payload.id);
        if (!detailed) {
          return NextResponse.json(
            { error: 'Person not found' },
            { status: 404 },
          );
        }
        return NextResponse.json(serializeAdminPerson(detailed));
      } catch (error) {
        console.error('Failed to update admin person', error);
        return NextResponse.json(
          { error: 'Internal Server Error' },
          { status: 500 },
        );
      }
    },
  };
}

let cachedHandlers: ReturnType<typeof createHandlers> | null = null;

function getDefaultHandlers() {
  if (!cachedHandlers) {
    cachedHandlers = createHandlers({ prisma: getPrisma(), env: getEnv() });
  }
  return cachedHandlers;
}

export const GET = (request: NextRequest) => getDefaultHandlers().GET(request);
export const POST = (request: NextRequest) => getDefaultHandlers().POST(request);
export const PUT = (request: NextRequest) => getDefaultHandlers().PUT(request);

export { createHandlers as createAdminPersonsHandlers };
