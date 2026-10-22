// kffleague.kz беттерін сыпайы жүктеу: өз User-Agent, сұраулар арасында үзіліс, robots.txt жапқан жолдарға тыйым.

export const USER_AGENT = 'Mozilla/5.0 (compatible; QPLFantasyBot/0.1; +https://github.com/Konysbayev/qpl-fantasy)';
export const BASE_URL = 'https://kffleague.kz';

// robots.txt: Disallow /api/ және /_next/
const FORBIDDEN = ['/api/', '/_next/'];

export class ForbiddenPathError extends Error {}
export class RequestLimitError extends Error {}

export interface PoliteFetcher {
  get(path: string): Promise<{ status: number; body: string }>;
  requestCount(): number;
}

export function createPoliteFetcher(opts: {
  minIntervalMs?: number;
  maxRequests?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRequest?: () => void | Promise<void>;
} = {}): PoliteFetcher {
  const minInterval = opts.minIntervalMs ?? 3000;
  const maxRequests = opts.maxRequests ?? Infinity;
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let count = 0;
  let last: number | null = null;

  async function get(path: string) {
    const url = new URL(path, BASE_URL);
    if (url.origin !== BASE_URL || FORBIDDEN.some((p) => url.pathname.startsWith(p))) {
      throw new ForbiddenPathError(`Запрещённый путь: ${url.pathname}`);
    }
    if (count >= maxRequests) throw new RequestLimitError(`Достигнут лимит ${maxRequests} запросов`);

    if (last !== null) {
      const wait = minInterval - (now() - last);
      if (wait > 0) await sleep(wait);
    }
    last = now();
    count++;
    await opts.onRequest?.();
    try {
      const res = await doFetch(url.toString(), { headers: { 'user-agent': USER_AGENT, 'accept-language': 'ru' } });
      return { status: res.status, body: await res.text() };
    } catch (err) {
      return { status: 0, body: err instanceof Error ? err.message : String(err) };
    }
  }

  return { get, requestCount: () => count };
}
