import crypto from 'node:crypto';
import path from 'node:path';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import type { Activity, Borough, DateNight } from '../shared/types.js';
import { searchDateIdeasWithAgy } from './agy-search.js';
import {
  clearSessionCookie,
  getLoginAuthUrl,
  getSessionUser,
  handleLoginCallback,
  isAuthEnabled,
  requireAuth,
  setSessionCookie,
} from './auth.js';
import {
  disconnectGCal,
  getAuthUrl,
  getGCalStatus,
  handleOAuthCallback,
  saveCredentials,
  syncDateNightsFromGCal,
} from './gcal.js';
import { matchActivitiesForDateNight } from './matcher.js';
import { fetchLiveNYCActivities } from './scrapers.js';
import { loadState, saveState } from './store.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3045);

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// --- Auth ---
app.get('/api/auth/me', (req, res) => {
  res.json({
    authRequired: isAuthEnabled(),
    user: getSessionUser(req),
  });
});

app.get('/api/auth/google', (_req, res) => {
  try {
    res.redirect(getLoginAuthUrl());
  } catch (err) {
    res.status(400).send(err instanceof Error ? err.message : 'OAuth error');
  }
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.use('/api', requireAuth);

// --- State & Activities ---
app.get('/api/state', async (_req, res) => {
  const state = loadState();
  const gcalStatus = await getGCalStatus(state.gcalConfig, state.lastSyncedAt);
  res.json({
    activities: state.activities,
    dateNights: state.dateNights,
    gcalStatus,
    lastFeedRefreshAt: state.lastFeedRefreshAt,
  });
});

app.post('/api/activities', (req, res) => {
  const state = loadState();
  const body = req.body as Partial<Activity>;
  if (!body.title || !body.borough || !body.category) {
    res.status(400).json({ error: 'title, borough, and category are required.' });
    return;
  }

  const newActivity: Activity = {
    id: `custom-${crypto.randomUUID().slice(0, 8)}`,
    title: body.title.trim(),
    description: body.description?.trim() || '',
    borough: body.borough,
    neighborhood: body.neighborhood?.trim() || body.borough,
    category: body.category,
    priceTier: body.priceTier || '$$',
    priceEstimate: body.priceEstimate?.trim() || undefined,
    availableTimes: body.availableTimes?.trim() || undefined,
    dealOrHighlight: body.dealOrHighlight?.trim() || undefined,
    bestDays: body.bestDays,
    bestTimeWindows: body.bestTimeWindows || ['early-evening', 'evening'],
    isLimitedTime: Boolean(body.isLimitedTime),
    url: body.url?.trim() || undefined,
    source: 'custom',
    sourceName: 'Custom',
    bookmarked: true,
    done: false,
    createdAt: new Date().toISOString(),
  };

  state.activities.unshift(newActivity);
  saveState(state);
  res.status(201).json(newActivity);
});

app.patch('/api/activities/:id', (req, res) => {
  const state = loadState();
  const idx = state.activities.findIndex((a) => a.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Activity not found.' });
    return;
  }

  const updates = req.body as Partial<Activity>;
  state.activities[idx] = { ...state.activities[idx], ...updates, id: state.activities[idx].id };
  saveState(state);
  res.json(state.activities[idx]);
});

app.delete('/api/activities/:id', (req, res) => {
  const state = loadState();
  state.activities = state.activities.filter((a) => a.id !== req.params.id);
  saveState(state);
  res.json({ ok: true });
});

app.post('/api/activities/refresh', async (_req, res) => {
  const state = loadState();
  const { activities: liveItems, feedStats } = await fetchLiveNYCActivities();
  const existingById = new Map(state.activities.map((a) => [a.id, a]));

  let newlyAdded = 0;
  for (const item of liveItems) {
    if (!existingById.has(item.id)) {
      state.activities.unshift(item);
      newlyAdded++;
    }
  }

  state.lastFeedRefreshAt = new Date().toISOString();
  saveState(state);
  res.json({
    newlyAdded,
    totalLiveFetched: liveItems.length,
    feedStats,
    lastFeedRefreshAt: state.lastFeedRefreshAt,
  });
});

app.post('/api/activities/agy-search', async (req, res) => {
  try {
    const state = loadState();
    const { query, borough, dateNightId } = req.body as {
      query?: string;
      borough?: Borough | 'All';
      dateNightId?: string;
    };

    const dn = dateNightId
      ? state.dateNights.find((d) => d.id === dateNightId)
      : undefined;

    const found = await searchDateIdeasWithAgy({
      query,
      borough,
      date: dn?.date,
      startTime: dn?.startTime,
      count: 5,
    });

    const existingIds = new Set(state.activities.map((a) => a.id));
    let newlyAdded = 0;
    for (const item of found) {
      if (!existingIds.has(item.id)) {
        state.activities.unshift(item);
        newlyAdded++;
      }
    }

    saveState(state);
    res.json({ newlyAdded, foundCount: found.length, activities: found });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'agy search failed',
    });
  }
});

// --- Date Nights ---
app.post('/api/date-nights', (req, res) => {
  const state = loadState();
  const body = req.body as Partial<DateNight>;
  if (!body.date || !body.startTime) {
    res.status(400).json({ error: 'date and startTime are required.' });
    return;
  }

  const newNight: DateNight = {
    id: `manual-${crypto.randomUUID().slice(0, 8)}`,
    date: body.date,
    startTime: body.startTime,
    title: body.title?.trim() || 'Date Night',
    source: 'manual',
    assignedActivityId: body.assignedActivityId,
    notes: body.notes,
  };

  state.dateNights.push(newNight);
  state.dateNights.sort((a, b) =>
    `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`),
  );
  saveState(state);
  res.status(201).json(newNight);
});

app.patch('/api/date-nights/:id', (req, res) => {
  const state = loadState();
  const idx = state.dateNights.findIndex((d) => d.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Date night not found.' });
    return;
  }

  const updates = req.body as Partial<DateNight>;
  state.dateNights[idx] = { ...state.dateNights[idx], ...updates, id: state.dateNights[idx].id };
  saveState(state);
  res.json(state.dateNights[idx]);
});

app.delete('/api/date-nights/:id', (req, res) => {
  const state = loadState();
  state.dateNights = state.dateNights.filter((d) => d.id !== req.params.id);
  saveState(state);
  res.json({ ok: true });
});

app.get('/api/date-nights/:id/matches', (req, res) => {
  const state = loadState();
  const dn = state.dateNights.find((d) => d.id === req.params.id);
  if (!dn) {
    res.status(404).json({ error: 'Date night not found.' });
    return;
  }
  const matches = matchActivitiesForDateNight(dn, state.activities);
  res.json(matches);
});

// --- Google Calendar OAuth ---
app.get('/api/gcal/status', async (_req, res) => {
  const state = loadState();
  res.json(await getGCalStatus(state.gcalConfig, state.lastSyncedAt));
});

app.post('/api/gcal/credentials', (req, res) => {
  const { clientId, clientSecret } = req.body as { clientId?: string; clientSecret?: string };
  if (!clientId || !clientSecret) {
    res.status(400).json({ error: 'clientId and clientSecret are required.' });
    return;
  }
  saveCredentials(clientId, clientSecret);
  res.json({ ok: true });
});

app.patch('/api/gcal/config', (req, res) => {
  const state = loadState();
  state.gcalConfig = { ...state.gcalConfig, ...req.body };
  saveState(state);
  res.json(state.gcalConfig);
});

app.get('/api/gcal/auth-url', (_req, res) => {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'OAuth error' });
  }
});

app.get('/api/gcal/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  const oauthState = req.query.state as string | undefined;
  const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173';

  if (!code) {
    res.status(400).send('Missing OAuth code.');
    return;
  }

  if (oauthState === 'login') {
    try {
      const user = await handleLoginCallback(code);
      setSessionCookie(res, user);
      res.redirect(`${baseUrl}/`);
    } catch (err) {
      const reason = err instanceof Error && err.message === 'unauthorized' ? 'unauthorized' : 'failed';
      res.redirect(`${baseUrl}/?auth_error=${reason}`);
    }
    return;
  }

  try {
    await handleOAuthCallback(code);
    // Automatically sync on first connect
    const state = loadState();
    state.dateNights = await syncDateNightsFromGCal(state.gcalConfig, state.dateNights);
    state.lastSyncedAt = new Date().toISOString();
    saveState(state);

    res.redirect(`${baseUrl}/?gcal=connected`);
  } catch (err) {
    res.status(500).send(`OAuth callback failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

app.post('/api/gcal/sync', async (_req, res) => {
  try {
    const state = loadState();
    state.dateNights = await syncDateNightsFromGCal(state.gcalConfig, state.dateNights);
    state.lastSyncedAt = new Date().toISOString();
    saveState(state);
    res.json({ dateNights: state.dateNights, lastSyncedAt: state.lastSyncedAt });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
});

app.post('/api/gcal/disconnect', (_req, res) => {
  disconnectGCal();
  res.json({ ok: true });
});

// Serve built frontend in production, or redirect to Vite dev server in development
if (process.env.NODE_ENV === 'production') {
  const clientDir = path.resolve(process.cwd(), 'dist/client');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.redirect('http://localhost:5173');
  });
}

app.listen(PORT, () => {
  console.log(`DateNight NYC API listening on http://localhost:${PORT}`);
});
