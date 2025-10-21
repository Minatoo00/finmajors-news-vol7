'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface PersonFilterProps {
  persons: Array<{
    slug: string;
    nameJp: string;
    institution: {
      code: string;
      nameJp: string;
      nameEn?: string;
    };
  }>;
  initialValue?: string;
  name: string;
  ariaLabelledBy?: string;
}

interface PersonOption {
  slug: string;
  label: string;
  searchable: string;
}

export function PersonFilter({ persons, initialValue, name, ariaLabelledBy }: PersonFilterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const options = useMemo<PersonOption[]>(
    () =>
      persons.map((person) => {
        const label = `${person.nameJp} / ${person.institution.code}`;
        return {
          slug: person.slug,
          label,
          searchable: `${person.slug}\n${person.nameJp}\n${person.institution.code}\n${person.institution.nameJp}\n${person.institution.nameEn ?? ''}`.toLowerCase(),
        };
      }),
    [persons],
  );

  const [open, setOpen] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState(initialValue ?? '');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setSelectedSlug(initialValue ?? '');
  }, [initialValue]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current) return;
      if (event.target instanceof Node && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch('');
      searchInputRef.current?.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return options;
    }
    return options.filter((option) => option.searchable.includes(keyword));
  }, [options, search]);

  const selectedOption = options.find((option) => option.slug === selectedSlug) ?? null;

  const buttonLabel = selectedOption ? selectedOption.label : 'すべての人物';

  const handleSelect = (value: string) => {
    setSelectedSlug(value);
    setOpen(false);
  };

  const handleClear = () => {
    setSelectedSlug('');
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      {selectedSlug ? (
        <input
          type="hidden"
          name={name}
          value={selectedSlug}
        />
      ) : null}
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-900 shadow-none focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={ariaLabelledBy}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="truncate pr-3">{buttonLabel}</span>
        <svg
          aria-hidden="true"
          className="h-4 w-4 text-slate-400"
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M5 7l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 px-3 py-2">
            <input
              ref={searchInputRef}
              type="search"
              placeholder="人物名・組織で検索"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200"
            />
          </div>
          <ul
            role="listbox"
            aria-labelledby={ariaLabelledBy}
            className="max-h-60 overflow-y-auto py-1"
          >
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!selectedSlug}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm ${!selectedSlug ? 'bg-indigo-50 text-indigo-700' : 'text-slate-900 hover:bg-slate-100'}`}
                onClick={handleClear}
              >
                <span>すべての人物</span>
                {!selectedSlug ? (
                  <span className="text-xs font-medium uppercase">選択中</span>
                ) : null}
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">該当する人物が見つかりません</li>
            ) : (
              filtered.map((option) => (
                <li key={option.slug}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedSlug === option.slug}
                    className={`flex w-full items-center justify-between px-3 py-2 text-sm ${selectedSlug === option.slug ? 'bg-indigo-50 text-indigo-700' : 'text-slate-900 hover:bg-slate-100'}`}
                    onClick={() => handleSelect(option.slug)}
                  >
                    <span className="truncate pr-2" title={option.label}>{option.label}</span>
                    {selectedSlug === option.slug ? (
                      <span className="text-xs font-medium uppercase">選択中</span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
