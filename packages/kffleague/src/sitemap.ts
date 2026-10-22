// sitemap.xml ішінен матч беттерінің нөмірлері мен күндерін алады (lastmod — матч күні).

export interface SitemapMatch {
  id: number;
  date: string;
}

export function parseSitemapMatches(xml: string): SitemapMatch[] {
  const seen = new Set<number>();
  const out: SitemapMatch[] = [];
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>https?:\/\/[^/]+(?:\/[a-z]{2})?\/matches\/(\d+)<\/loc>/.exec(block);
    const lastmod = /<lastmod>(\d{4}-\d{2}-\d{2})/.exec(block);
    if (!loc || !lastmod) continue;
    const id = Number(loc[1]);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, date: lastmod[1] });
  }
  return out;
}
