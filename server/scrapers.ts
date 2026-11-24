import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import type { Activity, ActivityCategory, Borough } from '../shared/types.js';

interface FeedSource {
  name: string;
  url: string;
  defaultCategory: ActivityCategory;
}

const NYC_FEEDS: FeedSource[] = [
  {
    name: 'Secret NYC',
    url: 'https://secretnyc.co/feed/',
    defaultCategory: 'unique-experiences',
  },
  {
    name: 'The Skint',
    url: 'https://theskint.com/feed/',
    defaultCategory: 'deals-specials',
  },
  {
    name: 'Eater NY',
    url: 'https://ny.eater.com/rss/index.xml',
    defaultCategory: 'deals-specials',
  },
  {
    name: 'Time Out NY',
    url: 'https://www.timeout.com/newyork/rss.xml',
    defaultCategory: 'limited-time',
  },
];

const BOROUGH_KEYWORDS: Array<{ borough: Borough; neighborhood: string; patterns: string[] }> = [
  { borough: 'Brooklyn', neighborhood: 'Williamsburg', patterns: ['williamsburg'] },
  { borough: 'Brooklyn', neighborhood: 'Greenpoint', patterns: ['greenpoint'] },
  { borough: 'Brooklyn', neighborhood: 'Bushwick', patterns: ['bushwick'] },
  { borough: 'Brooklyn', neighborhood: 'DUMBO', patterns: ['dumbo'] },
  { borough: 'Brooklyn', neighborhood: 'Park Slope', patterns: ['park slope'] },
  { borough: 'Brooklyn', neighborhood: 'Gowanus', patterns: ['gowanus'] },
  { borough: 'Brooklyn', neighborhood: 'Cobble Hill / Carroll Gardens', patterns: ['cobble hill', 'carroll gardens', 'boerum hill'] },
  { borough: 'Brooklyn', neighborhood: 'Fort Greene', patterns: ['fort greene', 'clinton hill'] },
  { borough: 'Brooklyn', neighborhood: 'Brooklyn', patterns: ['brooklyn', 'bklyn'] },
  { borough: 'Queens', neighborhood: 'Astoria', patterns: ['astoria'] },
  { borough: 'Queens', neighborhood: 'Long Island City', patterns: ['long island city', 'lic'] },
  { borough: 'Queens', neighborhood: 'Flushing', patterns: ['flushing'] },
  { borough: 'Queens', neighborhood: 'Jackson Heights', patterns: ['jackson heights'] },
  { borough: 'Queens', neighborhood: 'Sunnyside / Woodside', patterns: ['sunnyside', 'woodside'] },
  { borough: 'Queens', neighborhood: 'Ridgewood', patterns: ['ridgewood'] },
  { borough: 'Queens', neighborhood: 'Queens', patterns: ['queens'] },
  { borough: 'Manhattan', neighborhood: 'West Village', patterns: ['west village'] },
  { borough: 'Manhattan', neighborhood: 'Greenwich Village', patterns: ['greenwich village'] },
  { borough: 'Manhattan', neighborhood: 'Lower East Side', patterns: ['lower east side', 'les'] },
  { borough: 'Manhattan', neighborhood: 'East Village', patterns: ['east village'] },
  { borough: 'Manhattan', neighborhood: 'SoHo', patterns: ['soho'] },
  { borough: 'Manhattan', neighborhood: 'Tribeca', patterns: ['tribeca'] },
  { borough: 'Manhattan', neighborhood: 'Chelsea', patterns: ['chelsea'] },
  { borough: 'Manhattan', neighborhood: 'Chinatown', patterns: ['chinatown'] },
  { borough: 'Manhattan', neighborhood: 'Midtown', patterns: ['midtown', 'bryant park', 'times square'] },
  { borough: 'Manhattan', neighborhood: 'Upper West / East Side', patterns: ['upper west side', 'upper east side', 'uws', 'ues'] },
  { borough: 'Manhattan', neighborhood: 'Harlem', patterns: ['harlem'] },
  { borough: 'Manhattan', neighborhood: 'Manhattan', patterns: ['manhattan', 'nyc'] },
];

const INCLUDE_SIGNALS = [
  'pop-up',
  'popup',
  'limited time',
  'limited-time',
  'happy hour',
  'special',
  'deal',
  'free',
  'discount',
  'pottery',
  'ceramic',
  'workshop',
  'class',
  'tasting',
  'speakeasy',
  'listening bar',
  'jazz',
  'comedy',
  'museum',
  'night market',
  'exhibit',
  'installation',
  'immersive',
  'opening',
  'rooftop',
  'oyster',
  'prix fixe',
  'date',
];

const EXCLUDE_SIGNALS = [
  'subway delay',
  'nypd',
  'arrested',
  'lawsuit',
  'weather forecast',
  'mta fare',
  'election',
  'mayor ',
];

function stripHtml(html: string): string {
  const $ = cheerio.load(html || '');
  return $.text().replace(/\s+/g, ' ').trim();
}

function detectLocation(text: string): { borough: Borough; neighborhood: string } {
  const lower = text.toLowerCase();
  for (const entry of BOROUGH_KEYWORDS) {
    if (entry.patterns.some((p) => new RegExp(`\\b${p}\\b`, 'i').test(lower))) {
      return { borough: entry.borough, neighborhood: entry.neighborhood };
    }
  }
  return { borough: 'Multi-Borough', neighborhood: 'NYC' };
}

function detectCategory(text: string, fallback: ActivityCategory): ActivityCategory {
  const lower = text.toLowerCase();
  if (/pottery|ceramic|workshop|class|tufting|glassblowing|cooking|painting|craft/.test(lower)) {
    return 'hands-on';
  }
  if (/happy hour|deal|free|discount|\$\d+|oyster|prix fixe|special/.test(lower)) {
    return 'deals-specials';
  }
  if (/pop-up|popup|limited|closing|final week|through |festival|seasonal|holiday/.test(lower)) {
    return 'limited-time';
  }
  return fallback;
}

export async function fetchLiveNYCActivities(): Promise<{
  activities: Activity[];
  feedStats: Array<{ name: string; count: number; error?: string }>;
}> {
  const parser = new XMLParser({ ignoreAttributes: false });
  const discovered: Activity[] = [];
  const feedStats: Array<{ name: string; count: number; error?: string }> = [];

  await Promise.all(
    NYC_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': 'DateNightNYC/1.0 (local personal tool)' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          feedStats.push({ name: feed.name, count: 0, error: `HTTP ${res.status}` });
          return;
        }
        const xml = await res.text();
        const parsed = parser.parse(xml);

        const rawItems =
          parsed?.rss?.channel?.item ??
          parsed?.feed?.entry ??
          [];
        const items = Array.isArray(rawItems) ? rawItems : [rawItems];

        let added = 0;
        for (const item of items.slice(0, 20)) {
          const title = stripHtml(String(item.title?.['#text'] ?? item.title ?? ''));
          const rawDesc = String(
            item.description ?? item.summary?.['#text'] ?? item.summary ?? item.content?.['#text'] ?? '',
          );
          const description = stripHtml(rawDesc).slice(0, 260);
          const link = String(
            item.link?.['@_href'] ?? item.link ?? '',
          ).trim();

          if (!title || !link) continue;

          const combined = `${title} ${description}`.toLowerCase();
          if (EXCLUDE_SIGNALS.some((bad) => combined.includes(bad))) continue;
          if (!INCLUDE_SIGNALS.some((good) => combined.includes(good))) continue;

          const { borough, neighborhood } = detectLocation(`${title} ${description}`);
          const category = detectCategory(combined, feed.defaultCategory);
          const isLimitedTime =
            category === 'limited-time' ||
            /pop-up|popup|limited|through|this weekend|this week/.test(combined);

          const hash = crypto.createHash('sha1').update(link).digest('hex').slice(0, 12);

          discovered.push({
            id: `live-${hash}`,
            title,
            description: description || `Discovered via ${feed.name}`,
            borough,
            neighborhood,
            category,
            priceTier: /free|\$1|\$2|happy hour|deal/.test(combined) ? '$' : '$$',
            dealOrHighlight: isLimitedTime ? `Fresh from ${feed.name} · Limited-Time` : `Via ${feed.name}`,
            bestTimeWindows: ['early-evening', 'evening'],
            isLimitedTime,
            url: link,
            source: 'live',
            sourceName: feed.name,
            createdAt: new Date().toISOString(),
          });
          added++;
        }

        feedStats.push({ name: feed.name, count: added });
      } catch (err) {
        feedStats.push({
          name: feed.name,
          count: 0,
          error: err instanceof Error ? err.message : 'Fetch failed',
        });
      }
    }),
  );

  return { activities: discovered, feedStats };
}
