const jstFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function pad(value: string | number) {
  return value.toString().padStart(2, '0');
}

export function formatJstDateTime(
  input: string | Date | null | undefined,
): string {
  if (!input) return 'N/A';

  const date = typeof input === 'string' ? new Date(input) : input;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  const parts = jstFormatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  const year = lookup.year ?? '';
  const month = pad(lookup.month ?? '');
  const day = pad(lookup.day ?? '');
  const hour = pad(lookup.hour ?? '00');
  const minute = pad(lookup.minute ?? '00');

  if (!year || !month || !day) {
    return 'N/A';
  }

  return `${year}-${month}-${day} ${hour}:${minute} JST`;
}
