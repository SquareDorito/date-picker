import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Calendar,
  Check,
  Clock,
  Dices,
  ExternalLink,
  Flame,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import type {
  Activity,
  ActivityCategory,
  ActivityMatch,
  Borough,
  DateNight,
  GCalStatus,
} from '../../shared/types';
import { api, type AuthUser } from './api';
import { AddActivityModal } from './components/AddActivityModal';
import { GCalModal } from './components/GCalModal';

type SortOption =
  | 'recommended'
  | 'price-asc'
  | 'price-desc'
  | 'limited-first'
  | 'borough'
  | 'category'
  | 'saved-first';

function getNumericPriceScore(activity: Activity): number {
  const tierBase: Record<Activity['priceTier'], number> = {
    $: 100,
    $$: 200,
    $$$: 300,
  };
  const est = activity.priceEstimate?.toLowerCase() ?? '';
  if (est.includes('free')) return 0;
  const match = est.match(/\$(\d+(?:\.\d+)?)/);
  if (match) return Number(match[1]);
  return tierBase[activity.priceTier];
}

const CATEGORY_META: Record<
  ActivityCategory,
  { label: string; badgeClass: string }
> = {
  'limited-time': {
    label: 'Limited-Time',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  'deals-specials': {
    label: 'Deals & Specials',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  'hands-on': {
    label: 'Hands-On & Creative',
    badgeClass: 'bg-violet-100 text-violet-800 border-violet-200',
  },
  'unique-experiences': {
    label: 'Unique Experiences',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
  },
};

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime12h(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function App() {
  const [authRequired, setAuthRequired] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [dateNights, setDateNights] = useState<DateNight[]>([]);
  const [gcalStatus, setGcalStatus] = useState<GCalStatus | null>(null);
  const [lastFeedRefreshAt, setLastFeedRefreshAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const [selectedDateNightId, setSelectedDateNightId] = useState<string | null>(null);
  const [visibleDateNightsCount, setVisibleDateNightsCount] = useState(4);
  const [matchesByActivityId, setMatchesByActivityId] = useState<Map<string, ActivityMatch>>(
    new Map(),
  );

  // Filters & Sorting
  const [boroughFilter, setBoroughFilter] = useState<Borough | 'All'>('All');
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [hideDone, setHideDone] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('recommended');

  // Quick Add Date Night form
  const [newDate, setNewDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); // Next Friday
    return d.toISOString().slice(0, 10);
  });
  const [newTime, setNewTime] = useState('19:00');
  const [newTitle, setNewTitle] = useState('');

  // Modals & Banners
  const [showGCalModal, setShowGCalModal] = useState(false);
  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [refreshingFeeds, setRefreshingFeeds] = useState(false);
  const [searchingAgy, setSearchingAgy] = useState(false);
  const [useAgySearch, setUseAgySearch] = useState(false);
  const [syncingGCal, setSyncingGCal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadAll = useCallback(async () => {
    const auth = await api.getAuthMe();
    setAuthRequired(auth.authRequired);
    setAuthUser(auth.user);
    if (auth.authRequired && !auth.user) {
      setLoading(false);
      return;
    }
    const data = await api.getState();
    setActivities(data.activities);
    setDateNights(data.dateNights);
    setGcalStatus(data.gcalStatus);
    setLastFeedRefreshAt(data.lastFeedRefreshAt);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
    const params = new URLSearchParams(window.location.search);
    if (params.get('gcal') === 'connected') {
      showToast('Google Calendar connected & synced!');
      window.history.replaceState({}, '', '/');
    }
    const err = params.get('auth_error');
    if (err) {
      setAuthError(
        err === 'unauthorized'
          ? 'That Google account is not on the allowed list.'
          : 'Google sign-in failed. Please try again.',
      );
      window.history.replaceState({}, '', '/');
    }
  }, [loadAll, showToast]);

  useEffect(() => {
    if (!selectedDateNightId) {
      setMatchesByActivityId(new Map());
      return;
    }
    api.getMatches(selectedDateNightId).then((matches) => {
      const map = new Map<string, ActivityMatch>();
      for (const m of matches) {
        map.set(m.activity.id, m);
      }
      setMatchesByActivityId(map);
    });
  }, [selectedDateNightId, activities]);

  const selectedDateNight = useMemo(
    () => dateNights.find((d) => d.id === selectedDateNightId) ?? null,
    [dateNights, selectedDateNightId],
  );

  const activityById = useMemo(
    () => new Map(activities.map((a) => [a.id, a])),
    [activities],
  );

  const filteredActivities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = activities.filter((a) => {
      if (hideDone && a.done) return false;
      if (savedOnly && !a.bookmarked) return false;
      if (boroughFilter !== 'All' && a.borough !== boroughFilter) return false;
      if (categoryFilter !== 'All' && a.category !== categoryFilter) return false;
      if (q) {
        const hay =
          `${a.title} ${a.description} ${a.neighborhood} ${a.borough} ${a.dealOrHighlight ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':
          return getNumericPriceScore(a) - getNumericPriceScore(b);
        case 'price-desc':
          return getNumericPriceScore(b) - getNumericPriceScore(a);
        case 'limited-first':
          return Number(Boolean(b.isLimitedTime)) - Number(Boolean(a.isLimitedTime));
        case 'borough':
          return a.borough.localeCompare(b.borough) || a.neighborhood.localeCompare(b.neighborhood);
        case 'category':
          return a.category.localeCompare(b.category);
        case 'saved-first':
          return Number(Boolean(b.bookmarked)) - Number(Boolean(a.bookmarked));
        case 'recommended':
        default: {
          if (selectedDateNightId && matchesByActivityId.size > 0) {
            const sa = matchesByActivityId.get(a.id)?.score ?? 0;
            const sb = matchesByActivityId.get(b.id)?.score ?? 0;
            return sb - sa;
          }
          return 0;
        }
      }
    });

    return sorted;
  }, [
    activities,
    hideDone,
    savedOnly,
    boroughFilter,
    categoryFilter,
    searchQuery,
    sortBy,
    selectedDateNightId,
    matchesByActivityId,
  ]);

  const handleAddDateNight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !newTime) return;
    const created = await api.addDateNight({
      date: newDate,
      startTime: newTime,
      title: newTitle.trim() || 'Date Night',
    });
    setNewTitle('');
    await loadAll();
    setSelectedDateNightId(created.id);
    showToast(`Added ${formatDateLabel(created.date)} at ${formatTime12h(created.startTime)}`);
  };

  const handleRefreshFeeds = async () => {
    setRefreshingFeeds(true);
    try {
      const res = await api.refreshFeeds();
      await loadAll();
      showToast(`Live NYC feeds refreshed: ${res.newlyAdded} new ideas added!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Feed refresh failed');
    } finally {
      setRefreshingFeeds(false);
    }
  };

  const handleAgySearch = async (customQuery?: string) => {
    setSearchingAgy(true);
    try {
      const res = await api.agySearch({
        query: customQuery ?? searchQuery,
        borough: boroughFilter,
        dateNightId: selectedDateNightId ?? undefined,
      });
      await loadAll();
      showToast(
        `agy found ${res.foundCount} ideas (${res.newlyAdded} new saved to your list)!`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'agy search failed');
    } finally {
      setSearchingAgy(false);
    }
  };

  const handleSyncGCal = async () => {
    if (!gcalStatus?.isConnected) {
      setShowGCalModal(true);
      return;
    }
    setSyncingGCal(true);
    try {
      const res = await api.syncGCal();
      await loadAll();
      showToast(`Synced ${res.dateNights.length} date night(s) from Google Calendar.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Google Calendar sync failed');
    } finally {
      setSyncingGCal(false);
    }
  };

  const handleAssignActivity = async (dateNightId: string, activityId: string | undefined) => {
    await api.updateDateNight(dateNightId, { assignedActivityId: activityId });
    await loadAll();
    if (activityId) {
      const act = activityById.get(activityId);
      showToast(`Assigned "${act?.title}" to your date night!`);
    }
  };

  const handleSurpriseMe = () => {
    const pool = filteredActivities.filter((a) => !a.done);
    if (pool.length === 0) {
      showToast('No matching activities in current filter!');
      return;
    }
    const topSlice = pool.slice(0, Math.min(6, pool.length));
    const pick = topSlice[Math.floor(Math.random() * topSlice.length)];
    if (selectedDateNight) {
      handleAssignActivity(selectedDateNight.id, pick.id);
    } else {
      setSearchQuery(pick.title.split('—')[0].trim());
      showToast(`Surprise pick: ${pick.title}`);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-stone-500">
        Loading DateNight NYC...
      </div>
    );
  }

  if (authRequired && !authUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-xs">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900">DateNight NYC</h1>
          <p className="mt-1.5 text-xs text-stone-500">
            Sign in with Google to view and plan date nights.
          </p>
          {authError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {authError}
            </div>
          )}
          <a
            href="/api/auth/google"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
          >
            Sign in with Google
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Toast */}
      {toast && (
        <div className="fixed right-5 bottom-5 z-50 rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-stone-900">
                DateNight NYC
              </h1>
              <p className="text-xs text-stone-500">
                Manhattan · Brooklyn · Queens — Beyond normal dinner &amp; drinks
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRefreshFeeds}
              disabled={refreshingFeeds}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              title={
                lastFeedRefreshAt
                  ? `Last refreshed ${new Date(lastFeedRefreshAt).toLocaleString()}`
                  : 'Fetch live limited-time events & specials'
              }
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingFeeds ? 'animate-spin' : ''}`} />
              {refreshingFeeds ? 'Refreshing NYC...' : 'Refresh Live NYC Feeds'}
            </button>

            <button
              onClick={handleSyncGCal}
              disabled={syncingGCal}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                gcalStatus?.isConnected
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <Calendar className={`h-3.5 w-3.5 ${syncingGCal ? 'animate-spin' : ''}`} />
              {gcalStatus?.isConnected ? 'Sync GCal' : 'Connect Google Calendar'}
            </button>

            {gcalStatus?.isConnected && (
              <button
                onClick={() => setShowGCalModal(true)}
                className="rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
              >
                GCal Settings
              </button>
            )}

            <button
              onClick={() => setShowAddActivityModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-rose-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Idea
            </button>

            {authUser && (
              <button
                onClick={async () => {
                  await api.logout();
                  setAuthUser(null);
                }}
                title={`Signed in as ${authUser.email}`}
                className="rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-xs font-medium text-stone-500 hover:bg-stone-50"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12">
        {/* Left Sidebar: Upcoming Date Nights */}
        <section className="space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-900">
                Upcoming Date Nights
              </h2>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                {dateNights.length}
              </span>
            </div>

            {/* Quick Add Date Night */}
            <form
              onSubmit={handleAddDateNight}
              className="mb-4 space-y-2 rounded-xl border border-stone-100 bg-stone-50 p-3"
            >
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs focus:border-rose-400 focus:outline-none"
                />
                <input
                  type="time"
                  required
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs focus:border-rose-400 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Label (optional, e.g. Date Night)"
                  className="flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs focus:border-rose-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </form>

            {dateNights.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-200 p-5 text-center">
                <Calendar className="mx-auto mb-2 h-6 w-6 text-stone-300" />
                <p className="text-xs font-medium text-stone-600">
                  No upcoming date nights yet
                </p>
                <p className="mt-1 text-[11px] text-stone-400">
                  Add a date &amp; start time above, or connect Google Calendar to import them automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {dateNights.slice(0, visibleDateNightsCount).map((dn) => {
                  const isSelected = dn.id === selectedDateNightId;
                  const assigned = dn.assignedActivityId
                    ? activityById.get(dn.assignedActivityId)
                    : undefined;

                  return (
                    <div
                      key={dn.id}
                      onClick={() =>
                        setSelectedDateNightId(isSelected ? null : dn.id)
                      }
                      className={`cursor-pointer rounded-xl border p-3 transition ${
                        isSelected
                          ? 'border-rose-400 bg-rose-50/50 ring-1 ring-rose-300'
                          : 'border-stone-200 bg-white hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-stone-900">
                              {formatDateLabel(dn.date)}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-700">
                              <Clock className="h-3 w-3" />
                              {formatTime12h(dn.startTime)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-stone-500">
                            {dn.title}{' '}
                            {dn.source === 'gcal' && (
                              <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                GCal
                              </span>
                            )}
                          </p>
                        </div>

                        {dn.source === 'manual' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              api.deleteDateNight(dn.id).then(loadAll);
                              if (isSelected) setSelectedDateNightId(null);
                            }}
                            className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600"
                            title="Remove date night"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {assigned ? (
                        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-xs ring-1 ring-stone-200">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-stone-800">
                              {assigned.title}
                            </p>
                            <p className="text-[11px] text-stone-500">
                              {assigned.neighborhood}, {assigned.borough}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAssignActivity(dn.id, undefined);
                            }}
                            className="shrink-0 text-[11px] font-medium text-stone-400 hover:text-stone-700"
                          >
                            Clear
                          </button>
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] font-medium text-rose-600">
                          {isSelected
                            ? 'Showing best matches on the right →'
                            : 'Click to match activities for this night'}
                        </p>
                      )}
                    </div>
                  );
                })}

                {dateNights.length > 4 && (
                  <div className="flex items-center justify-between pt-1">
                    {visibleDateNightsCount < dateNights.length ? (
                      <button
                        onClick={() => setVisibleDateNightsCount((c) => c + 4)}
                        className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100"
                      >
                        Show more ({dateNights.length - visibleDateNightsCount} remaining)
                      </button>
                    ) : (
                      <button
                        onClick={() => setVisibleDateNightsCount(4)}
                        className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100"
                      >
                        Show fewer
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right Main Area: Discover NYC Activities */}
        <section className="space-y-4 lg:col-span-8">
          {/* Active Date Match Banner */}
          {selectedDateNight && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                  Matching for {formatDateLabel(selectedDateNight.date)} ·{' '}
                  {formatTime12h(selectedDateNight.startTime)}
                </p>
                <p className="text-xs text-rose-900/80">
                  Activities are ranked by day-of-week fit, start time, and limited-time urgency.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAgySearch()}
                  disabled={searchingAgy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${searchingAgy ? 'animate-pulse' : ''}`} />
                  {searchingAgy ? 'Searching...' : 'Find with agy'}
                </button>
                <button
                  onClick={handleSurpriseMe}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                >
                  <Dices className="h-3.5 w-3.5" />
                  Surprise Pick
                </button>
                <button
                  onClick={() => setSelectedDateNightId(null)}
                  className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-rose-200 hover:bg-rose-100/50"
                >
                  Exit Match
                </button>
              </div>
            </div>
          )}

          {/* Search Area */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (useAgySearch) {
                handleAgySearch(searchQuery);
              }
            }}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs"
          >
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pottery, oysters, jazz, Astoria, pop-up..."
                className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pr-3 pl-9 text-sm focus:border-rose-400 focus:bg-white focus:outline-none"
              />
            </div>

            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2 text-xs font-medium text-violet-800">
              <input
                type="checkbox"
                checked={useAgySearch}
                onChange={(e) => setUseAgySearch(e.target.checked)}
                className="rounded border-violet-300 text-violet-600 focus:ring-violet-500"
              />
              <Sparkles className="h-3.5 w-3.5 text-violet-600" />
              agy web search
            </label>

            {useAgySearch && (
              <button
                type="submit"
                disabled={searchingAgy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {searchingAgy ? 'Searching NYC...' : 'Search'}
              </button>
            )}
          </form>

          {/* Filters & Sort Area */}
          <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
            {/* Location (Borough) Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                Borough
              </span>
              {(['All', 'Manhattan', 'Brooklyn', 'Queens'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBoroughFilter(b)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    boroughFilter === b
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>

            {/* Category (Vibe) Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                Type
              </span>
              <button
                onClick={() => setCategoryFilter('All')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  categoryFilter === 'All'
                    ? 'bg-rose-600 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                All Vibes
              </button>
              {(Object.keys(CATEGORY_META) as ActivityCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    categoryFilter === cat
                      ? 'bg-rose-600 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {CATEGORY_META[cat].label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={savedOnly}
                    onChange={(e) => setSavedOnly(e.target.checked)}
                    className="rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                  />
                  Saved wishlist only
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={hideDone}
                    onChange={(e) => setHideDone(e.target.checked)}
                    className="rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                  />
                  Hide already done
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  aria-label="Sort activities"
                  className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700 focus:border-rose-400 focus:outline-none"
                >
                  <option value="recommended">Sort: Recommended</option>
                  <option value="price-asc">Sort: Price (Low → High)</option>
                  <option value="price-desc">Sort: Price (High → Low)</option>
                  <option value="limited-first">Sort: Limited-Time First</option>
                  <option value="saved-first">Sort: Saved First</option>
                  <option value="borough">Sort: Borough (A–Z)</option>
                  <option value="category">Sort: Category</option>
                </select>

                {!selectedDateNight && (
                  <button
                    type="button"
                    onClick={handleSurpriseMe}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                  >
                    <Dices className="h-3.5 w-3.5 text-rose-600" />
                    Surprise Me
                  </button>
                )}

                <span className="ml-1 text-stone-400">
                  {filteredActivities.length} ideas
                </span>
              </div>
            </div>
          </div>

          {/* Activity Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredActivities.map((activity) => {
              const catMeta = CATEGORY_META[activity.category];
              const match = matchesByActivityId.get(activity.id);

              return (
                <article
                  key={activity.id}
                  className={`flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-2xs transition hover:shadow-sm ${
                    activity.done ? 'border-stone-200 opacity-60' : 'border-stone-200'
                  }`}
                >
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${catMeta.badgeClass}`}
                        >
                          {catMeta.label}
                        </span>
                        {activity.isLimitedTime && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                            <Flame className="h-3 w-3" />
                            Limited
                          </span>
                        )}
                        {activity.source === 'live' && (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                            {activity.sourceName}
                          </span>
                        )}
                      </div>
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">
                        {activity.priceEstimate || activity.priceTier}
                      </span>
                    </div>

                    <h3 className="text-base font-semibold leading-snug text-stone-900">
                      {activity.title}
                    </h3>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-stone-400" />
                        {activity.neighborhood}
                        {activity.neighborhood !== activity.borough
                          ? `, ${activity.borough}`
                          : ''}
                      </span>
                      {(activity.availableTimes || (activity.bestDays && activity.bestDays.length > 0)) && (
                        <span className="inline-flex items-center gap-1 text-stone-500">
                          <Clock className="h-3.5 w-3.5 text-stone-400" />
                          {activity.availableTimes || `Best: ${activity.bestDays?.join('/')}`}
                        </span>
                      )}
                    </div>

                    {activity.dealOrHighlight && (
                      <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                        <Tag className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span>{activity.dealOrHighlight}</span>
                      </div>
                    )}

                    <p className="mt-2.5 text-xs leading-relaxed text-stone-600">
                      {activity.description}
                    </p>

                    {match && match.reasons.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {match.reasons.map((r) => (
                          <span
                            key={r}
                            className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700"
                          >
                            ✓ {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          api
                            .updateActivity(activity.id, { bookmarked: !activity.bookmarked })
                            .then(loadAll)
                        }
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${
                          activity.bookmarked
                            ? 'bg-rose-50 text-rose-600'
                            : 'text-stone-500 hover:bg-stone-100'
                        }`}
                        title="Save to wishlist"
                      >
                        <Bookmark
                          className={`h-3.5 w-3.5 ${activity.bookmarked ? 'fill-rose-600' : ''}`}
                        />
                        Save
                      </button>

                      <button
                        onClick={() =>
                          api
                            .updateActivity(activity.id, { done: !activity.done })
                            .then(loadAll)
                        }
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${
                          activity.done
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'text-stone-500 hover:bg-stone-100'
                        }`}
                        title="Mark as done"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {activity.done ? 'Done' : 'Did it'}
                      </button>

                      {activity.url && (
                        <a
                          href={activity.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                        >
                          Info <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    {selectedDateNight ? (
                      <button
                        onClick={() =>
                          handleAssignActivity(selectedDateNight.id, activity.id)
                        }
                        className="rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
                      >
                        Pick for {formatDateLabel(selectedDateNight.date)}
                      </button>
                    ) : (
                      dateNights.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssignActivity(e.target.value, activity.id);
                            }
                          }}
                          className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                        >
                          <option value="">Assign to date...</option>
                          {dateNights.map((dn) => (
                            <option key={dn.id} value={dn.id}>
                              {formatDateLabel(dn.date)} ({formatTime12h(dn.startTime)})
                            </option>
                          ))}
                        </select>
                      )
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {showGCalModal && gcalStatus && (
        <GCalModal
          status={gcalStatus}
          onClose={() => setShowGCalModal(false)}
          onUpdated={loadAll}
        />
      )}

      {showAddActivityModal && (
        <AddActivityModal
          onClose={() => setShowAddActivityModal(false)}
          onCreated={loadAll}
        />
      )}
    </div>
  );
}
