// Іздеу: әріп регистрі мен қазақ/орыс әріптерінің айырмасы ескерілмейді («Қайрат» = «кайрат»).
const MAP: Record<string, string> = { қ: 'к', ғ: 'г', ң: 'н', ө: 'о', ұ: 'у', ү: 'у', һ: 'х', і: 'и', ә: 'а', ё: 'е' };

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[қғңөұүһіәё]/g, (c) => MAP[c]).replace(/\s+/g, ' ').trim();
}

export function matches(query: string, fields: (string | null | undefined)[]): boolean {
  const q = normalize(query);
  if (!q) return true;
  const hay = normalize(fields.filter(Boolean).join(' '));
  return q.split(' ').every((word) => hay.includes(word));
}
