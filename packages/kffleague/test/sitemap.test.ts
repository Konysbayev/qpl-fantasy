import { describe, expect, it } from 'vitest';
import { parseSitemapMatches } from '../src/sitemap.js';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url>
<loc>https://kffleague.kz/matches/993</loc>
<xhtml:link rel="alternate" hreflang="ru" href="https://kffleague.kz/ru/matches/993" />
<lastmod>2026-06-21T13:00:00.000Z</lastmod>
</url>
<url>
<loc>https://kffleague.kz/ru/matches/993</loc>
<lastmod>2026-06-21T13:00:00.000Z</lastmod>
</url>
<url>
<loc>https://kffleague.kz/matches/1109</loc>
<lastmod>2026-10-25T13:00:00.000Z</lastmod>
</url>
<url>
<loc>https://kffleague.kz/news/5</loc>
<lastmod>2026-06-21T13:00:00.000Z</lastmod>
</url>
</urlset>`;

describe('parseSitemapMatches', () => {
  it('sitemap: матчи и даты, без дублей и без новостей', () => {
    expect(parseSitemapMatches(xml)).toEqual([
      { id: 993, date: '2026-06-21' },
      { id: 1109, date: '2026-10-25' }
    ]);
  });

  it('матч без lastmod пропускается', () => {
    expect(parseSitemapMatches('<url><loc>https://kffleague.kz/matches/7</loc></url>')).toEqual([]);
  });
});
