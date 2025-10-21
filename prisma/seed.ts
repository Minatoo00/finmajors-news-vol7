import { PrismaClient } from '@prisma/client';
import { aliases, institutions, persons } from './seed-data.ts';

const prisma = new PrismaClient();

async function upsertInstitutions() {
  for (const institution of institutions) {
    await prisma.institution.upsert({
      where: { code: institution.code },
      update: {
        nameJp: institution.nameJp,
        nameEn: institution.nameEn,
      },
      create: {
        code: institution.code,
        nameJp: institution.nameJp,
        nameEn: institution.nameEn,
      },
    });
  }
}

async function upsertPersons() {
  const aliasBySlug = new Map(aliases.map((entry) => [entry.personSlug, entry.texts]));

  for (const person of persons) {
    const record = await prisma.person.upsert({
      where: { slug: person.slug },
      update: {
        nameJp: person.nameJp,
        nameEn: person.nameEn,
        role: person.role,
        active: person.active ?? true,
        institution: { connect: { code: person.institutionCode } },
      },
      create: {
        slug: person.slug,
        nameJp: person.nameJp,
        nameEn: person.nameEn,
        role: person.role,
        active: person.active ?? true,
        institution: { connect: { code: person.institutionCode } },
      },
    });

    const aliasTexts = new Set(
      (aliasBySlug.get(person.slug) ?? []).map((text) => text.trim()).filter(Boolean),
    );

    await prisma.alias.deleteMany({ where: { personId: record.id } });
    if (aliasTexts.size > 0) {
      await prisma.alias.createMany({
        data: Array.from(aliasTexts).map((text) => ({
          personId: record.id,
          text,
        })),
      });
    }
  }
}

async function main() {
  await upsertInstitutions();
  await upsertPersons();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('✅ Seed completed');
  })
  .catch(async (error) => {
    console.error('Seed failed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
