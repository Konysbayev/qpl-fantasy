// Supabase Management API (HTTPS): SQL сұраулары мен функцияларды жариялау. Токен хабарламаларға түспейді.

export interface ManagementOpts {
  projectRef: string;
  // Бос болса, Authorization жіберілмейді: оны орта проксиі қояды
  token: string;
  fetchImpl?: typeof fetch;
}

const API = 'https://api.supabase.com/v1';

export async function managementFetch(opts: ManagementOpts, pathname: string, init: RequestInit, what: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (opts.token) headers.set('Authorization', `Bearer ${opts.token}`);
  const res = await (opts.fetchImpl ?? fetch)(`${API}/projects/${opts.projectRef}${pathname}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    const safe = opts.token ? text.split(opts.token).join('***') : text;
    throw new Error(`${what}: HTTP ${res.status} ${safe}`);
  }
  return res;
}

export async function runQuery<T = Record<string, unknown>>(opts: ManagementOpts, query: string, what = 'SQL'): Promise<T[]> {
  const res = await managementFetch(opts, '/database/query', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }) }, what);
  const text = await res.text();
  return text ? (JSON.parse(text) as T[]) : [];
}

// SQL жолдық литералы: тырнақшалар екі еселенеді
export function literal(value: string): string {
  return `'${value.split("'").join("''")}'`;
}

export function envOpts(): ManagementOpts {
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!projectRef) throw new Error('Нет SUPABASE_PROJECT_REF');
  return { projectRef, token: process.env.SUPABASE_ACCESS_TOKEN ?? '' };
}
