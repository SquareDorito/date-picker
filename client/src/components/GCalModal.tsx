import { useState } from 'react';
import { Calendar, CheckCircle2, ExternalLink, KeyRound, RefreshCw, X } from 'lucide-react';
import type { GCalStatus } from '../../../shared/types';
import { api } from '../api';

interface GCalModalProps {
  status: GCalStatus;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}

export function GCalModal({ status, onClose, onUpdated }: GCalModalProps) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [calendarId, setCalendarId] = useState(status.config.calendarId);
  const [keywordsText, setKeywordsText] = useState(status.config.keywords.join(', '));
  const [daysAhead, setDaysAhead] = useState(status.config.daysAhead);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.saveGCalCredentials(clientId, clientSecret);
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    setError(null);
    setBusy(true);
    try {
      const { url } = await api.getGCalAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start OAuth');
      setBusy(false);
    }
  };

  const handleSaveConfig = async () => {
    setError(null);
    setBusy(true);
    try {
      const keywords = keywordsText
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      await api.updateGCalConfig({ calendarId, keywords, daysAhead });
      if (status.isConnected) {
        await api.syncGCal();
      }
      await onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await api.disconnectGCal();
      await onUpdated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Google Calendar Sync</h2>
              <p className="text-xs text-stone-500">
                Reads upcoming date &amp; start time via OAuth
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {!status.hasCredentials ? (
          <form onSubmit={handleSaveCredentials} className="space-y-4">
            <div className="rounded-xl bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
              <p className="font-semibold">Quick Google Cloud OAuth Setup:</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                <li>
                  Open{' '}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium underline"
                  >
                    Google Cloud Credentials <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  and enable the <strong>Google Calendar API</strong>.
                </li>
                <li>
                  Create an <strong>OAuth 2.0 Client ID</strong> (Web application).
                </li>
                <li>
                  Add{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">
                    http://localhost:3045/api/gcal/callback
                  </code>{' '}
                  as an Authorized redirect URI.
                </li>
              </ol>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">
                Google Client ID
              </label>
              <input
                type="text"
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="123456789-abc....apps.googleusercontent.com"
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">
                Google Client Secret
              </label>
              <input
                type="password"
                required
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-..."
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              Save OAuth Credentials
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2
                  className={`h-5 w-5 ${status.isConnected ? 'text-emerald-600' : 'text-stone-400'}`}
                />
                <div>
                  <p className="text-sm font-medium text-stone-900">
                    {status.isConnected ? 'Connected to Google Calendar' : 'Credentials saved'}
                  </p>
                  <p className="text-xs text-stone-500">
                    {status.isConnected
                      ? 'Ready to sync upcoming date nights'
                      : 'Authorize read-only access to your calendar'}
                  </p>
                </div>
              </div>
              {status.isConnected ? (
                <button
                  onClick={handleDisconnect}
                  disabled={busy}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={busy}
                  className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                >
                  Connect Google
                </button>
              )}
            </div>

            {status.calendars && status.calendars.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-700">
                  Calendar to read
                </label>
                <select
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
                >
                  {status.calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.summary} {c.primary ? '(Primary)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">
                Event keyword filter (comma-separated)
              </label>
              <input
                type="text"
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder="date, date night, anniversary"
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-stone-500">
                Leave blank to import all evening events (4:00 PM or later) from the selected calendar.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">
                Look ahead (days)
              </label>
              <input
                type="number"
                min={7}
                max={180}
                value={daysAhead}
                onChange={(e) => setDaysAhead(Number(e.target.value))}
                className="w-28 rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                {status.isConnected ? 'Save & Sync Now' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
