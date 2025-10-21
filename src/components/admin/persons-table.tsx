interface AdminPerson {
  id: string;
  slug: string;
  nameJp: string;
  nameEn: string;
  role: string;
  institution: {
    code: string;
    nameJp: string;
    nameEn?: string;
  };
  aliases: string[];
  active: boolean;
}

interface AdminPersonsTableProps {
  persons: AdminPerson[];
}

export function AdminPersonsTable({ persons }: AdminPersonsTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">人物</th>
            <th className="px-4 py-3">役職</th>
            <th className="px-4 py-3">所属</th>
            <th className="px-4 py-3">エイリアス</th>
            <th className="px-4 py-3">状態</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {persons.map((person) => (
            <tr key={person.id} className="text-slate-700">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{person.nameJp}</div>
                <div className="text-xs text-slate-500">{person.nameEn}</div>
                <div className="text-xs text-slate-400">{person.slug}</div>
              </td>
              <td className="px-4 py-3">{person.role}</td>
              <td className="px-4 py-3">
                {person.institution.nameJp}
                {' / '}
                {person.institution.code}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {person.aliases.length > 0 ? person.aliases.join(', ') : '—'}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    person.active
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {person.active ? 'アクティブ' : '非アクティブ'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
