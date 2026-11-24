import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { DateNight, GCalConfig, GCalStatus } from '../shared/types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CREDENTIALS_PATH = path.join(DATA_DIR, 'gcal-credentials.json');
const TOKENS_PATH = path.join(DATA_DIR, 'gcal-tokens.json');

function getDefaultRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3045/api/gcal/callback';
}

interface StoredCredentials {
  client_id: string;
  client_secret: string;
  redirect_uri?: string;
}

function getCredentials(): StoredCredentials | null {
  const redirectUri = getDefaultRedirectUri();
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      client_id: process.env.GOOGLE_CLIENT_ID.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET.trim(),
      redirect_uri: redirectUri,
    };
  }

  if (fs.existsSync(CREDENTIALS_PATH)) {
    const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const block = raw.web || raw.installed || raw;
    if (block.client_id && block.client_secret) {
      return {
        client_id: block.client_id,
        client_secret: block.client_secret,
        redirect_uri: redirectUri,
      };
    }
  }

  return null;
}

export function saveCredentials(clientId: string, clientSecret: string): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(
    CREDENTIALS_PATH,
    JSON.stringify(
      {
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        redirect_uri: getDefaultRedirectUri(),
      },
      null,
      2,
    ),
    'utf-8',
  );
}

function createOAuthClient(): OAuth2Client | null {
  const creds = getCredentials();
  if (!creds) return null;

  const client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uri || getDefaultRedirectUri(),
  );

  if (fs.existsSync(TOKENS_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
    client.setCredentials(tokens);
  }

  client.on('tokens', (newTokens) => {
    const existing = fs.existsSync(TOKENS_PATH)
      ? JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'))
      : {};
    fs.writeFileSync(
      TOKENS_PATH,
      JSON.stringify({ ...existing, ...newTokens }, null, 2),
      'utf-8',
    );
  });

  return client;
}

export function getAuthUrl(): string {
  const client = createOAuthClient();
  if (!client) {
    throw new Error('Google Calendar OAuth credentials are not configured.');
  }
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
}

export async function handleOAuthCallback(code: string): Promise<void> {
  const client = createOAuthClient();
  if (!client) {
    throw new Error('Google Calendar OAuth credentials are not configured.');
  }
  const { tokens } = await client.getToken(code);
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
}

export function disconnectGCal(): void {
  if (fs.existsSync(TOKENS_PATH)) {
    fs.unlinkSync(TOKENS_PATH);
  }
}

export async function getGCalStatus(
  config: GCalConfig,
  lastSyncedAt?: string,
): Promise<GCalStatus> {
  const creds = getCredentials();
  const hasCredentials = Boolean(creds);
  const isConnected = hasCredentials && fs.existsSync(TOKENS_PATH);

  let calendars: GCalStatus['calendars'];
  if (isConnected) {
    try {
      const client = createOAuthClient();
      if (client) {
        const cal = google.calendar({ version: 'v3', auth: client });
        const res = await cal.calendarList.list({ minAccessRole: 'reader' });
        calendars = (res.data.items ?? []).map((item) => ({
          id: item.id || 'primary',
          summary: item.summary || 'Calendar',
          primary: Boolean(item.primary),
        }));
      }
    } catch {
      // Token may be revoked or expired without refresh token
    }
  }

  return {
    hasCredentials,
    isConnected,
    config,
    lastSyncedAt,
    calendars,
  };
}

function extractDateAndTime(dateTimeStr?: string | null, dateOnlyStr?: string | null) {
  if (dateTimeStr) {
    // Format: 2026-11-27T19:00:00-05:00
    const [datePart, timePart] = dateTimeStr.split('T');
    const hhmm = (timePart || '19:00').slice(0, 5);
    return { date: datePart, startTime: hhmm };
  }
  if (dateOnlyStr) {
    return { date: dateOnlyStr, startTime: '19:00' };
  }
  return null;
}

export async function syncDateNightsFromGCal(
  config: GCalConfig,
  existingDateNights: DateNight[],
): Promise<DateNight[]> {
  const client = createOAuthClient();
  if (!client || !fs.existsSync(TOKENS_PATH)) {
    throw new Error('Google Calendar is not connected.');
  }

  const calendar = google.calendar({ version: 'v3', auth: client });
  const now = new Date();
  const maxDate = new Date(now.getTime() + config.daysAhead * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: config.calendarId || 'primary',
    timeMin: now.toISOString(),
    timeMax: maxDate.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });

  const events = response.data.items ?? [];
  const keywords = config.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);

  const existingByGcalId = new Map<string, DateNight>();
  for (const dn of existingDateNights) {
    if (dn.gcalEventId) {
      existingByGcalId.set(dn.gcalEventId, dn);
    }
  }

  const syncedGcalNights: DateNight[] = [];

  for (const ev of events) {
    if (!ev.id || ev.status === 'cancelled') continue;
    const summary = ev.summary || 'Date Night';
    const description = ev.description || '';
    const haystack = `${summary} ${description}`.toLowerCase();

    const dt = extractDateAndTime(ev.start?.dateTime, ev.start?.date);
    if (!dt) continue;

    if (keywords.length > 0) {
      const matchesKeyword = keywords.some((kw) => haystack.includes(kw));
      if (!matchesKeyword) continue;
    } else {
      // If no keyword filter, default to evening events (16:00 or later)
      const hour = Number(dt.startTime.split(':')[0]);
      if (hour < 16) continue;
    }

    const prev = existingByGcalId.get(ev.id);
    syncedGcalNights.push({
      id: prev?.id ?? `gcal-${ev.id}`,
      date: dt.date,
      startTime: dt.startTime,
      title: summary,
      source: 'gcal',
      gcalEventId: ev.id,
      assignedActivityId: prev?.assignedActivityId,
      notes: prev?.notes,
    });
  }

  const manualNights = existingDateNights.filter((dn) => dn.source === 'manual');
  return [...manualNights, ...syncedGcalNights].sort((a, b) =>
    `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`),
  );
}
