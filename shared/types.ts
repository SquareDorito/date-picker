export type Borough = 'Manhattan' | 'Brooklyn' | 'Queens' | 'Multi-Borough';

export type ActivityCategory =
  | 'limited-time'
  | 'deals-specials'
  | 'hands-on'
  | 'unique-experiences';

export type PriceTier = '$' | '$$' | '$$$';

export type TimeWindow = 'early-evening' | 'evening' | 'late-night' | 'anytime';

export interface Activity {
  id: string;
  title: string;
  description: string;
  borough: Borough;
  neighborhood: string;
  category: ActivityCategory;
  priceTier: PriceTier;
  priceEstimate?: string; // e.g. "~$85/person" or "Free"
  availableTimes?: string; // e.g. "Fri–Sat 7pm–9pm" or "Mon–Fri 4pm–7pm"
  dealOrHighlight?: string;
  bestDays?: string[]; // e.g. ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  bestTimeWindows?: TimeWindow[];
  isLimitedTime?: boolean;
  expiresAt?: string;
  url?: string;
  source: 'curated' | 'live' | 'custom';
  sourceName?: string;
  bookmarked?: boolean;
  done?: boolean;
  createdAt: string;
}

export interface DateNight {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm (24h)
  title: string;
  source: 'gcal' | 'manual';
  gcalEventId?: string;
  assignedActivityId?: string;
  notes?: string;
}

export interface GCalConfig {
  calendarId: string;
  keywords: string[];
  daysAhead: number;
}

export interface GCalStatus {
  hasCredentials: boolean;
  isConnected: boolean;
  config: GCalConfig;
  lastSyncedAt?: string;
  calendars?: Array<{ id: string; summary: string; primary?: boolean }>;
}

export interface ActivityMatch {
  activity: Activity;
  score: number;
  reasons: string[];
}
