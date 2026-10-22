// API-Football v3 клиенті. Тек стандартты fetch қолданылады: кейін Supabase Edge Functions (Deno) ішінде де жұмыс істейді.

const DEFAULT_BASE_URL = 'https://v3.football.api-sports.io';

export type ApiResult<T> =
  | { ok: true; response: T; results: number; raw: unknown }
  | { ok: false; kind: 'http' | 'api' | 'network'; status?: number; message: string; errorKey?: string; raw?: unknown };

export interface ApiFootballClient {
  get<T>(path: string, params?: Record<string, string | number>): Promise<ApiResult<T>>;
  requestCount(): number;
}

export function createApiFootballClient(opts: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch }): ApiFootballClient {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const doFetch = opts.fetchImpl ?? fetch;
  let count = 0;
  // Кілт ешбір мәтінге (қате, сақталатын жауап) түспеуі керек
  const scrub = (text: string) => (opts.apiKey ? text.split(opts.apiKey).join('***') : text);

  async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<ApiResult<T>> {
    const url = new URL(baseUrl + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

    count++;
    let res: Response;
    try {
      res = await doFetch(url.toString(), { headers: { 'x-apisports-key': opts.apiKey } });
    } catch (err) {
      return { ok: false, kind: 'network', message: scrub(err instanceof Error ? err.message : String(err)) };
    }

    const text = scrub(await res.text());
    if (!res.ok) return { ok: false, kind: 'http', status: res.status, message: `HTTP ${res.status}: ${text.slice(0, 200)}` };

    let body: { errors?: unknown; results?: number; response?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, kind: 'http', status: res.status, message: `Ответ не JSON: ${text.slice(0, 200)}` };
    }

    // API errors-ті бос массив [] немесе бос объект {} ретінде де, толтырылған объект ретінде де қайтарады
    const errors = body.errors;
    const entries: [string, unknown][] = Array.isArray(errors)
      ? errors.map((value, i) => [String(i), value])
      : errors && typeof errors === 'object'
        ? Object.entries(errors)
        : [];
    if (entries.length > 0) {
      return {
        ok: false,
        kind: 'api',
        status: res.status,
        errorKey: entries[0][0],
        message: entries.map(([key, value]) => `${key}: ${String(value)}`).join('; '),
        raw: body
      };
    }
    return { ok: true, response: body.response as T, results: body.results ?? 0, raw: body };
  }

  return { get, requestCount: () => count };
}
