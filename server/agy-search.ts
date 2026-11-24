import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Activity, ActivityCategory, Borough, PriceTier, TimeWindow } from '../shared/types.js';

const execFileAsync = promisify(execFile);

const ACTIVITY_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    activities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          borough: {
            type: 'string',
            enum: ['Manhattan', 'Brooklyn', 'Queens', 'Multi-Borough'],
          },
          neighborhood: { type: 'string' },
          category: {
            type: 'string',
            enum: ['limited-time', 'deals-specials', 'hands-on', 'unique-experiences'],
          },
          priceTier: { type: 'string', enum: ['$', '$$', '$$$'] },
          priceEstimate: { type: 'string', description: 'e.g. "~$85/person", "$15–$25", or "Free"' },
          availableTimes: { type: 'string', description: 'e.g. "Fri–Sat 7pm–9pm" or "Mon–Fri 4pm–7pm"' },
          dealOrHighlight: { type: 'string' },
          bestDays: {
            type: 'array',
            items: { type: 'string', enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
          },
          bestTimeWindows: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['early-evening', 'evening', 'late-night', 'anytime'],
            },
          },
          isLimitedTime: { type: 'boolean' },
          url: { type: 'string' },
        },
        required: ['title', 'description', 'borough', 'neighborhood', 'category', 'priceTier'],
      },
    },
  },
  required: ['activities'],
});

function resolveAgyBinary(): string {
  if (process.env.AGY_PATH && fs.existsSync(process.env.AGY_PATH)) {
    return process.env.AGY_PATH;
  }
  const localBin = path.join(os.homedir(), '.local', 'bin', 'agy');
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return 'agy';
}

export interface AgySearchParams {
  query?: string;
  borough?: Borough | 'All';
  date?: string;
  startTime?: string;
  count?: number;
}

interface RawAgyActivity {
  title: string;
  description: string;
  borough: Borough;
  neighborhood: string;
  category: ActivityCategory;
  priceTier: PriceTier;
  priceEstimate?: string;
  availableTimes?: string;
  dealOrHighlight?: string;
  bestDays?: string[];
  bestTimeWindows?: TimeWindow[];
  isLimitedTime?: boolean;
  url?: string;
}

export async function searchDateIdeasWithAgy(
  params: AgySearchParams,
): Promise<Activity[]> {
  const count = params.count ?? 5;
  const boroughClause =
    params.borough && params.borough !== 'All'
      ? `specifically in ${params.borough}`
      : 'across Manhattan, Brooklyn, and Queens';

  const dateClause = params.date
    ? `for a date night on ${params.date}${params.startTime ? ` starting around ${params.startTime}` : ''}`
    : 'happening currently or upcoming';

  const topicClause = params.query?.trim()
    ? `Focus on: "${params.query.trim()}".`
    : 'Include a mix of limited-time pop-ups/exhibits, restaurant/bar deals or happy hours, hands-on workshops (like date-night pottery, glassblowing, tufting, cooking), and unique experiences.';

  const prompt = [
    `Search the web for ${count} real, specific, fun date night activities in NYC (${boroughClause}) ${dateClause}.`,
    'Avoid generic "normal dinner and drinks" — prioritize unique experiences, limited-time offerings, good deals/specials, or hands-on workshops.',
    topicClause,
    'Return valid JSON matching the schema with accurate venue names, neighborhoods, and URLs.',
  ].join(' ');

  const agyBin = resolveAgyBinary();

  const { stdout } = await execFileAsync(
    agyBin,
    [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--json-schema',
      ACTIVITY_SCHEMA,
      '--effort',
      'low',
      '--print-timeout',
      '60s',
      '--dangerously-skip-permissions',
    ],
    {
      timeout: 70_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );

  const parsed = JSON.parse(stdout) as {
    structured_output?: { activities?: RawAgyActivity[] };
    response?: string;
  };

  let rawList: RawAgyActivity[] = parsed.structured_output?.activities ?? [];
  if (rawList.length === 0 && parsed.response) {
    try {
      const inner = JSON.parse(parsed.response) as { activities?: RawAgyActivity[] };
      rawList = inner.activities ?? [];
    } catch {
      // ignore fallback parse failure
    }
  }

  return rawList.map((item) => {
    const hash = crypto
      .createHash('sha1')
      .update(`${item.title.toLowerCase()}|${item.neighborhood.toLowerCase()}`)
      .digest('hex')
      .slice(0, 12);

    return {
      id: `agy-${hash}`,
      title: item.title,
      description: item.description,
      borough: item.borough,
      neighborhood: item.neighborhood,
      category: item.category,
      priceTier: item.priceTier,
      priceEstimate: item.priceEstimate,
      availableTimes: item.availableTimes,
      dealOrHighlight: item.dealOrHighlight,
      bestDays: item.bestDays,
      bestTimeWindows: item.bestTimeWindows ?? ['early-evening', 'evening'],
      isLimitedTime: Boolean(item.isLimitedTime),
      url: item.url,
      source: 'live',
      sourceName: 'agy Search',
      createdAt: new Date().toISOString(),
    };
  });
}
