// kffleague.kz беттерінің жазбалары мен жалған жүктегіш (сайтқа сұраусыз тесттер үшін)
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { PoliteFetcher } from '../../kffleague/src/fetcher.js';

export const matchPage = (id: number): string =>
  gunzipSync(fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'kffleague', 'test', 'fixtures', `match-${id}.html.gz`))).toString('utf-8');

export type Page = { status: number; body: string } | (() => { status: number; body: string });

export function fakeFetcher(pages: Record<string, Page>): PoliteFetcher & { paths: string[] } {
  const paths: string[] = [];
  return {
    paths,
    async get(p: string) {
      paths.push(p);
      const page = pages[p];
      if (typeof page === 'function') return page();
      return page ?? { status: 404, body: 'not found' };
    },
    requestCount: () => paths.length
  };
}

export const sitemapXml = (entries: [number, string][]): string =>
  `<urlset>${entries.map(([id, date]) => `<url><loc>https://kffleague.kz/matches/${id}</loc><lastmod>${date}T00:00:00.000Z</lastmod></url>`).join('')}</urlset>`;
