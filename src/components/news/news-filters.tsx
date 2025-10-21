import { PersonFilter } from './person-filter';

interface NewsFiltersProps {
  persons: Array<{
    slug: string;
    nameJp: string;
    institution: {
      code: string;
      nameJp: string;
      nameEn?: string;
    };
  }>;
  currentFilters: {
    person?: string;
    media?: string;
    from?: string;
    to?: string;
  };
  mediaOptions: string[];
}

export function NewsFilters({ persons, currentFilters, mediaOptions }: NewsFiltersProps) {
  const mediaSet = new Set(mediaOptions);
  const normalizedMediaOptions =
    currentFilters.media && !mediaSet.has(currentFilters.media)
      ? [currentFilters.media, ...mediaOptions]
      : mediaOptions;

  return (
    <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-5" method="get">
      <label className="flex flex-col text-sm font-medium text-slate-700">
        <span
          id="news-person-filter-label"
          className="mb-1"
        >
          人物
        </span>
        <PersonFilter
          ariaLabelledBy="news-person-filter-label"
          name="person"
          persons={persons}
          initialValue={currentFilters.person}
        />
      </label>

      <label className="flex flex-col text-sm font-medium text-slate-700">
        <span className="mb-1">媒体ドメイン</span>
        <select
          name="media"
          defaultValue={currentFilters.media ?? ''}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900"
        >
          <option value="">
            すべての媒体
          </option>
          {normalizedMediaOptions.map((domain) => (
            <option
              key={domain}
              value={domain}
            >
              {domain}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-sm font-medium text-slate-700">
        <span className="mb-1">開始日 (JST)</span>
        <input
          type="date"
          name="from"
          defaultValue={currentFilters.from ?? ''}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900"
        />
      </label>

      <label className="flex flex-col text-sm font-medium text-slate-700">
        <span className="mb-1">終了日 (JST)</span>
        <input
          type="date"
          name="to"
          defaultValue={currentFilters.to ?? ''}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900"
        />
      </label>

      <div className="flex items-end">
        <button
          type="submit"
          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          フィルター適用
        </button>
      </div>
    </form>
  );
}
