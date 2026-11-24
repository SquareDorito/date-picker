import type {
  Activity,
  ActivityMatch,
  Borough,
  DateNight,
  GCalConfig,
  GCalStatus,
} from '../../shared/types';

export interface AuthUser {
  email: string;
  name?: string;
  picture?: string;
}

export interface AuthMeResponse {
  authRequired: boolean;
  user: AuthUser | null;
}

export interface AppStateResponse {
  activities: Activity[];
  dateNights: DateNight[];
  gcalStatus: GCalStatus;
  lastFeedRefreshAt?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getAuthMe: () => request<AuthMeResponse>('/api/auth/me'),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  getState: () => request<AppStateResponse>('/api/state'),
  addActivity: (data: Partial<Activity>) =>
    request<Activity>('/api/activities', { method: 'POST', body: JSON.stringify(data) }),
  updateActivity: (id: string, data: Partial<Activity>) =>
    request<Activity>(`/api/activities/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteActivity: (id: string) =>
    request<{ ok: boolean }>(`/api/activities/${id}`, { method: 'DELETE' }),
  refreshFeeds: () =>
    request<{
      newlyAdded: number;
      totalLiveFetched: number;
      feedStats: Array<{ name: string; count: number; error?: string }>;
      lastFeedRefreshAt: string;
    }>('/api/activities/refresh', { method: 'POST' }),
  agySearch: (params: {
    query?: string;
    borough?: Borough | 'All';
    dateNightId?: string;
  }) =>
    request<{
      newlyAdded: number;
      foundCount: number;
      activities: Activity[];
    }>('/api/activities/agy-search', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  addDateNight: (data: { date: string; startTime: string; title?: string }) =>
    request<DateNight>('/api/date-nights', { method: 'POST', body: JSON.stringify(data) }),
  updateDateNight: (id: string, data: Partial<DateNight>) =>
    request<DateNight>(`/api/date-nights/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDateNight: (id: string) =>
    request<{ ok: boolean }>(`/api/date-nights/${id}`, { method: 'DELETE' }),
  getMatches: (dateNightId: string) =>
    request<ActivityMatch[]>(`/api/date-nights/${dateNightId}/matches`),

  saveGCalCredentials: (clientId: string, clientSecret: string) =>
    request<{ ok: boolean }>('/api/gcal/credentials', {
      method: 'POST',
      body: JSON.stringify({ clientId, clientSecret }),
    }),
  updateGCalConfig: (config: Partial<GCalConfig>) =>
    request<GCalConfig>('/api/gcal/config', { method: 'PATCH', body: JSON.stringify(config) }),
  getGCalAuthUrl: () => request<{ url: string }>('/api/gcal/auth-url'),
  syncGCal: () =>
    request<{ dateNights: DateNight[]; lastSyncedAt: string }>('/api/gcal/sync', {
      method: 'POST',
    }),
  disconnectGCal: () => request<{ ok: boolean }>('/api/gcal/disconnect', { method: 'POST' }),
};
