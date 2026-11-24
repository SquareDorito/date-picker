import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { ActivityCategory, Borough, PriceTier } from '../../../shared/types';
import { api } from '../api';

interface AddActivityModalProps {
  onClose: () => void;
  onCreated: () => Promise<void>;
}

export function AddActivityModal({ onClose, onCreated }: AddActivityModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [borough, setBorough] = useState<Borough>('Brooklyn');
  const [neighborhood, setNeighborhood] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('unique-experiences');
  const [priceTier, setPriceTier] = useState<PriceTier>('$$');
  const [priceEstimate, setPriceEstimate] = useState('');
  const [availableTimes, setAvailableTimes] = useState('');
  const [dealOrHighlight, setDealOrHighlight] = useState('');
  const [url, setUrl] = useState('');
  const [isLimitedTime, setIsLimitedTime] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.addActivity({
        title,
        description,
        borough,
        neighborhood: neighborhood || borough,
        category,
        priceTier,
        priceEstimate,
        availableTimes,
        dealOrHighlight,
        url,
        isLimitedTime,
      });
      await onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-rose-600" />
            <h2 className="text-lg font-semibold text-stone-900">Add NYC Date Idea</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-700">Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Sunset Pottery Wheel Night at Choplet"
              className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Borough</label>
              <select
                value={borough}
                onChange={(e) => setBorough(e.target.value as Borough)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
              >
                <option value="Manhattan">Manhattan</option>
                <option value="Brooklyn">Brooklyn</option>
                <option value="Queens">Queens</option>
                <option value="Multi-Borough">Multi-Borough</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Neighborhood</label>
              <input
                type="text"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="e.g., Astoria, Williamsburg, LES"
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ActivityCategory)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
              >
                <option value="unique-experiences">Unique Experience</option>
                <option value="hands-on">Hands-On &amp; Creative</option>
                <option value="deals-specials">Deals &amp; Specials</option>
                <option value="limited-time">Limited-Time Offering</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Price Tier</label>
              <select
                value={priceTier}
                onChange={(e) => setPriceTier(e.target.value as PriceTier)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
              >
                <option value="$">$ (Budget / Free–$30)</option>
                <option value="$$">$$ (Moderate)</option>
                <option value="$$$">$$$ (Splurge)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">
                Price Estimate (optional)
              </label>
              <input
                type="text"
                value={priceEstimate}
                onChange={(e) => setPriceEstimate(e.target.value)}
                placeholder="e.g. ~$85/person or Free"
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">
                Available Times (optional)
              </label>
              <input
                type="text"
                value={availableTimes}
                onChange={(e) => setAvailableTimes(e.target.value)}
                placeholder="e.g. Fri–Sat 7–9 PM"
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-700">
              Deal / Special / Highlight
            </label>
            <input
              type="text"
              value={dealOrHighlight}
              onChange={(e) => setDealOrHighlight(e.target.value)}
              placeholder="e.g., Happy Hour 5-7pm $1.50 oysters, or Ends Dec 15"
              className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-700">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why it's fun / what to expect..."
              className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-700">Link (optional)</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={isLimitedTime}
              onChange={(e) => setIsLimitedTime(e.target.checked)}
              className="rounded border-stone-300 text-rose-600 focus:ring-rose-500"
            />
            Limited-time / seasonal offering
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Save Idea
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
