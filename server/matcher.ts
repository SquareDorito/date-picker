import type { Activity, ActivityMatch, DateNight, TimeWindow } from '../shared/types.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function getDayOfWeek(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dt = new Date(year, month - 1, day);
  return DAY_NAMES[dt.getDay()];
}

export function getTimeWindow(startTime: string): TimeWindow {
  const [hourStr] = startTime.split(':');
  const hour = Number(hourStr);
  if (Number.isNaN(hour)) return 'evening';
  if (hour < 18 || (hour === 18 && Number(startTime.split(':')[1] ?? 0) < 30)) {
    return 'early-evening';
  }
  if (hour < 21) return 'evening';
  return 'late-night';
}

export function matchActivitiesForDateNight(
  dateNight: DateNight,
  activities: Activity[],
): ActivityMatch[] {
  const day = getDayOfWeek(dateNight.date);
  const timeWindow = getTimeWindow(dateNight.startTime);

  const results: ActivityMatch[] = [];

  for (const activity of activities) {
    if (activity.done) continue;

    let score = 0;
    const reasons: string[] = [];

    if (activity.bestDays && activity.bestDays.length > 0) {
      if (activity.bestDays.includes(day)) {
        score += 35;
        reasons.push(`Great for ${day}`);
      } else {
        score -= 20;
      }
    } else {
      score += 10;
    }

    if (activity.bestTimeWindows && activity.bestTimeWindows.length > 0) {
      if (
        activity.bestTimeWindows.includes(timeWindow) ||
        activity.bestTimeWindows.includes('anytime')
      ) {
        score += 30;
        reasons.push(
          timeWindow === 'early-evening'
            ? 'Fits early evening / happy hour'
            : timeWindow === 'late-night'
              ? 'Open for late night'
              : 'Fits evening start',
        );
      } else {
        score -= 10;
      }
    } else {
      score += 10;
    }

    if (activity.isLimitedTime) {
      score += 20;
      reasons.push('Limited-time offering');
    }

    if (activity.category === 'hands-on' || activity.category === 'unique-experiences') {
      score += 10;
    }

    if (activity.bookmarked) {
      score += 15;
      reasons.push('Saved to wishlist');
    }

    results.push({ activity, score, reasons });
  }

  return results.sort((a, b) => b.score - a.score);
}
