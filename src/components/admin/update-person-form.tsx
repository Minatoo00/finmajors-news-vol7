'use client';

import { useActionState } from 'react';

import {
  initialUpdatePersonFormState,
  type UpdatePersonFormState,
} from './update-person-form-state';

interface UpdatePersonFormProps {
  persons: Array<{
    id: string;
    slug: string;
    nameJp: string;
    nameEn: string;
    role: string;
    aliases: string[];
    active: boolean;
    institution: {
      code: string;
      nameJp: string;
      nameEn: string;
    };
  }>;
  action: (
    prevState: UpdatePersonFormState,
    formData: FormData,
  ) => Promise<UpdatePersonFormState>;
}

export function UpdatePersonForm({ persons, action }: UpdatePersonFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialUpdatePersonFormState,
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-slate-900">既存人物を更新</h2>
      <div className="grid gap-3">
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">対象人物</span>
          <select
            name="update-id"
            required
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            disabled={pending}
          >
            {persons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.nameJp} ({person.slug})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">所属機関コード</span>
          <input
            name="update-institution"
            placeholder="変更が必要な場合のみ入力"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            disabled={pending}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">スラッグ</span>
          <input
            name="update-slug"
            placeholder="変更しない場合は空欄"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            disabled={pending}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">氏名（日本語）</span>
          <input
            name="update-name-jp"
            placeholder="変更しない場合は空欄"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            disabled={pending}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">氏名（英語）</span>
          <input
            name="update-name-en"
            placeholder="変更しない場合は空欄"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            disabled={pending}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">役職</span>
          <input
            name="update-role"
            placeholder="変更しない場合は空欄"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            disabled={pending}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">
            エイリアス（改行またはカンマ区切り）
          </span>
          <textarea
            name="update-aliases"
            rows={3}
            placeholder="空欄の場合は変更しません"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            disabled={pending}
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">
            アクティブ状態
          </legend>
          <div className="flex flex-col gap-2 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="update-active"
                value="unchanged"
                defaultChecked
                className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                disabled={pending}
              />
              変更しない
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="update-active"
                value="true"
                className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                disabled={pending}
              />
              アクティブに設定
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="update-active"
                value="false"
                className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                disabled={pending}
              />
              非アクティブに設定
            </label>
          </div>
        </fieldset>
      </div>
      {state.status === 'success' ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        className="w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-500"
        disabled={pending}
      >
        {pending ? '更新中…' : '更新する'}
      </button>
    </form>
  );
}

