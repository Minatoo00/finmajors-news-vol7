import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

type AdminPrisma = Pick<PrismaClient, 'person' | 'alias'>;

const aliasArray = z
  .array(z.string())
  .default([])
  .transform((values) =>
    Array.from(
      new Set(
        values
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    ),
  );

const createPersonSchema = z.object({
  institutionCode: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'slug must contain lowercase letters, numbers, or hyphen'),
  nameJp: z.string().trim().min(1),
  nameEn: z.string().trim().min(1),
  role: z.string().trim().min(1),
  active: z.coerce.boolean().default(true),
  aliases: aliasArray,
});

const updatePersonSchema = z
  .object({
    id: z
      .union([z.string(), z.number(), z.bigint()])
      .transform((value) => BigInt(value)),
    institutionCode: z.string().trim().min(1).optional(),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/, 'slug must contain lowercase letters, numbers, or hyphen')
      .optional(),
    nameJp: z.string().trim().min(1).optional(),
    nameEn: z.string().trim().min(1).optional(),
    role: z.string().trim().min(1).optional(),
    active: z.coerce.boolean().optional(),
    aliases: z
      .array(z.string())
      .optional()
      .transform((values) =>
        values
          ? Array.from(
              new Set(
                values
                  .map((value) => value.trim())
                  .filter((value) => value.length > 0),
              ),
            )
          : undefined,
      ),
  })
  .refine(
    (value) =>
      value.nameJp ||
      value.nameEn ||
      value.role ||
      value.active !== undefined ||
      value.aliases ||
      value.slug ||
      value.institutionCode,
    'update payload must include at least one mutable field',
  );

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;

export function parseCreatePersonPayload(
  input: unknown,
): CreatePersonInput {
  return createPersonSchema.parse(input);
}

export function parseUpdatePersonPayload(
  input: unknown,
): UpdatePersonInput {
  return updatePersonSchema.parse(input);
}

export interface VerifyAdminAccessOptions {
  authorizationHeader?: string;
  clientIp?: string | null;
  env: {
    BASIC_AUTH_USER: string;
    BASIC_AUTH_PASS: string;
    ALLOWED_ADMIN_IPS?: string[];
  };
}

export function verifyAdminAccess(options: VerifyAdminAccessOptions): boolean {
  const { authorizationHeader, clientIp, env } = options;
  if (!authorizationHeader || !authorizationHeader.startsWith('Basic ')) {
    return false;
  }

  const decoded = Buffer.from(authorizationHeader.slice(6), 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    return false;
  }
  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (username !== env.BASIC_AUTH_USER || password !== env.BASIC_AUTH_PASS) {
    return false;
  }

  const allowedIps = env.ALLOWED_ADMIN_IPS ?? [];
  if (allowedIps.length === 0) {
    return true;
  }

  if (!clientIp) {
    return false;
  }
  const candidateIps = clientIp.split(',').map((ip) => ip.trim()).filter(Boolean);
  return candidateIps.some((ip) => allowedIps.includes(ip));
}

type AdminPersonWithRelations = Prisma.PersonGetPayload<{
  include: {
    institution: true;
    aliases: true;
  };
}>;

export interface AdminPersonsResponse {
  items: Array<{
    id: bigint;
    slug: string;
    nameJp: string;
    nameEn: string;
    role: string;
    active: boolean;
    institution: {
      code: string;
      nameJp: string;
      nameEn: string;
    };
    aliases: string[];
  }>;
  updatedAt: string;
}

export async function buildAdminPersonsResponse(
  prisma: Pick<PrismaClient, 'person'>,
): Promise<AdminPersonsResponse> {
  const persons = (await prisma.person.findMany({
    include: {
      institution: true,
      aliases: true,
    },
    orderBy: [
      { institution: { code: 'asc' } },
      { slug: 'asc' },
    ],
  } as Prisma.PersonFindManyArgs)) as AdminPersonWithRelations[];

  return {
    items: persons.map((person) => ({
      id: person.id as unknown as bigint,
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
    })),
    updatedAt: new Date().toISOString(),
  };
}

export async function createAdminPerson(
  prisma: AdminPrisma,
  payload: CreatePersonInput,
) {
  const person = await prisma.person.create({
    data: {
      institution: {
        connect: {
          code: payload.institutionCode,
        },
      },
      slug: payload.slug,
      nameJp: payload.nameJp,
      nameEn: payload.nameEn,
      role: payload.role,
      active: payload.active,
    },
  } as Prisma.PersonCreateArgs);

  if (payload.aliases.length > 0) {
    await prisma.alias.createMany({
      data: payload.aliases.map((alias) => ({
        personId: person.id,
        text: alias,
      })),
      skipDuplicates: true,
    } as Prisma.AliasCreateManyArgs);
  }

  return person;
}

export async function updateAdminPerson(
  prisma: AdminPrisma,
  payload: UpdatePersonInput,
) {
  const data: Prisma.PersonUpdateInput = {};

  if (payload.nameJp) data.nameJp = payload.nameJp;
  if (payload.nameEn) data.nameEn = payload.nameEn;
  if (payload.role) data.role = payload.role;
  if (payload.active !== undefined) data.active = payload.active;
  if (payload.slug) data.slug = payload.slug;
  if (payload.institutionCode) {
    data.institution = {
      connect: {
        code: payload.institutionCode,
      },
    };
  }

  const person = await prisma.person.update({
    where: { id: payload.id },
    data,
  } as Prisma.PersonUpdateArgs);

  if (payload.aliases) {
    const existing = await prisma.alias.findMany({
      where: { personId: payload.id },
    } as Prisma.AliasFindManyArgs);

    const existingTexts = new Set(existing.map((alias) => alias.text));
    const desired = new Set(payload.aliases);

    const toDelete = existing
      .filter((alias) => !desired.has(alias.text))
      .map((alias) => alias.id);
    const toCreate = payload.aliases.filter((alias) => !existingTexts.has(alias));

    if (toDelete.length > 0) {
      await prisma.alias.deleteMany({
        where: {
          id: { in: toDelete },
        },
      } as Prisma.AliasDeleteManyArgs);
    }

    if (toCreate.length > 0) {
      await prisma.alias.createMany({
        data: toCreate.map((alias) => ({
          personId: payload.id,
          text: alias,
        })),
        skipDuplicates: true,
      } as Prisma.AliasCreateManyArgs);
    }
  }

  return person;
}
