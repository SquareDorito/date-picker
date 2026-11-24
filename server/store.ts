import fs from 'node:fs';
import path from 'node:path';
import type { Activity, DateNight, GCalConfig } from '../shared/types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_PATH = path.join(DATA_DIR, 'app-state.json');
const SEED_PATH = path.join(DATA_DIR, 'seed-activities.json');

export interface AppState {
  activities: Activity[];
  dateNights: DateNight[];
  gcalConfig: GCalConfig;
  lastSyncedAt?: string;
  lastFeedRefreshAt?: string;
}

const DEFAULT_GCAL_CONFIG: GCalConfig = {
  calendarId: 'primary',
  keywords: ['date', 'date night', 'anniversary'],
  daysAhead: 60,
};

function loadSeedActivities(): Activity[] {
  if (!fs.existsSync(SEED_PATH)) return [];
  const raw = fs.readFileSync(SEED_PATH, 'utf-8');
  return JSON.parse(raw) as Activity[];
}

export function loadState(): AppState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const seeds = loadSeedActivities();

  if (!fs.existsSync(STATE_PATH)) {
    const initial: AppState = {
      activities: seeds,
      dateNights: [],
      gcalConfig: DEFAULT_GCAL_CONFIG,
    };
    saveState(initial);
    return initial;
  }

  const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as Partial<AppState>;
  const existing = parsed.activities ?? [];
  const seedById = new Map(seeds.map((s) => [s.id, s]));
  const existingIds = new Set(existing.map((a) => a.id));

  // Merge any newly added seed activities and backfill new metadata fields without overwriting user flags
  const mergedActivities = existing.map((act) => {
    const seed = seedById.get(act.id);
    if (!seed) return act;
    return {
      ...act,
      priceEstimate: act.priceEstimate ?? seed.priceEstimate,
      availableTimes: act.availableTimes ?? seed.availableTimes,
    };
  });

  for (const seed of seeds) {
    if (!existingIds.has(seed.id)) {
      mergedActivities.push(seed);
    }
  }

  return {
    activities: mergedActivities,
    dateNights: parsed.dateNights ?? [],
    gcalConfig: { ...DEFAULT_GCAL_CONFIG, ...(parsed.gcalConfig ?? {}) },
    lastSyncedAt: parsed.lastSyncedAt,
    lastFeedRefreshAt: parsed.lastFeedRefreshAt,
  };
}

export function saveState(state: AppState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}
