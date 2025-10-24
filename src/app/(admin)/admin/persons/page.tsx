export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { revalidatePath } from 'next/cache';

import {
  buildAdminPersonsResponse,
  createAdminPerson,
  parseCreatePersonPayload,
  parseUpdatePersonPayload,
  updateAdminPerson,
} from '../../../../lib/api/admin';
import { getPrisma } from '../../../../lib/prisma';
import { AdminPersonsTable } from '../../../../components/admin/persons-table';
import { UpdatePersonForm } from '../../../../components/admin/update-person-form';
import { type UpdatePersonFormState } from '../../../../components/admin/update-person-form-state';

function splitAliases(input: FormDataEntryValue | null) {
  if (typeof input !== 'string') return [];
  return input
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

async function createPersonAction(formData: FormData) {
  'use server';
  const prisma = getPrisma();
  const payload = parseCreatePersonPayload({
    institutionCode: formData.get('create-institution') ?? '',
    slug: formData.get('create-slug') ?? '',
    nameJp: formData.get('create-name-jp') ?? '',
    nameEn: formData.get('create-name-en') ?? '',
    role: formData.get('create-role') ?? '',
    active: formData.get('create-active') === 'on',
    aliases: splitAliases(formData.get('create-aliases')),
  });
  await createAdminPerson(prisma, payload);
  revalidatePath('/admin/persons');
}

async function updatePersonAction(
  _prevState: UpdatePersonFormState,
  formData: FormData,
) {
  'use server';
  const prisma = getPrisma();
  const activeValue = formData.get('update-active');
  const active =
    activeValue === 'true' ? true : activeValue === 'false' ? false : undefined;
  const payload = parseUpdatePersonPayload({
    id: formData.get('update-id') ?? '',
    institutionCode: (formData.get('update-institution') as string | null)?.trim() || undefined,
    slug: (formData.get('update-slug') as string | null)?.trim() || undefined,
    nameJp: (formData.get('update-name-jp') as string | null)?.trim() || undefined,
    nameEn: (formData.get('update-name-en') as string | null)?.trim() || undefined,
    role: (formData.get('update-role') as string | null)?.trim() || undefined,
    active,
    aliases: splitAliases(formData.get('update-aliases')),
  });
  await updateAdminPerson(prisma, payload);
  revalidatePath('/admin/persons');
  return {
    status: 'success' as const,
    message: '更新が完了しました',
  };
}

export default async function AdminPersonsPage() {
  const prisma = getPrisma();
  const response = await buildAdminPersonsResponse(prisma);
  const persons = response.items.map((person) => ({
    id: person.id.toString(),
    slug: person.slug,
    nameJp: person.nameJp,
    nameEn: person.nameEn,
    role: person.role,
    aliases: person.aliases,
    active: person.active,
    institution: person.institution,
  }));

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 lg:px-0">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">人物辞書管理</h1>
        <p className="text-sm text-slate-600">
          人物・エイリアス情報を更新して収集精度を保ちます。更新後は即座に公開 API に反映されます。
        </p>
      </header>

      <section>
        <AdminPersonsTable persons={persons} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <form action={createPersonAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">新規人物を追加</h2>
          <div className="grid gap-3">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">所属機関コード</span>
              <input
                name="create-institution"
                required
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="例: FRB"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">スラッグ</span>
              <input
                name="create-slug"
                required
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="jerome-h-powell"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">氏名（日本語）</span>
              <input
                name="create-name-jp"
                required
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">氏名（英語）</span>
              <input
                name="create-name-en"
                required
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">役職</span>
              <input
                name="create-role"
                required
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">エイリアス（改行またはカンマ区切り）</span>
              <textarea
                name="create-aliases"
                rows={3}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="create-active" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              アクティブにする
            </label>
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            追加する
          </button>
        </form>

        <UpdatePersonForm persons={persons} action={updatePersonAction} />
      </section>
    </main>
  );
}
