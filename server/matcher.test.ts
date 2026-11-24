import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Activity, DateNight } from '../shared/types.js';
import { getDayOfWeek, getTimeWindow, matchActivitiesForDateNight } from './matcher.js';

test('getDayOfWeek and getTimeWindow compute expected values', () => {
  // 2026-11-27 is a Friday
  assert.equal(getDayOfWeek('2026-11-27'), 'Fri');
  assert.equal(getTimeWindow('17:30'), 'early-evening');
  assert.equal(getTimeWindow('19:00'), 'evening');
  assert.equal(getTimeWindow('21:30'), 'late-night');
});

test('matchActivitiesForDateNight ranks Friday evening & non-done activities higher', () => {
  const dateNight: DateNight = {
    id: 'dn-1',
    date: '2026-11-27',
    startTime: '19:00',
    title: 'Date Night',
    source: 'manual',
  };

  const activities: Activity[] = [
    {
      id: 'a1',
      title: 'Monday Happy Hour',
      description: 'Happy hour',
      borough: 'Manhattan',
      neighborhood: 'LES',
      category: 'deals-specials',
      priceTier: '$',
      bestDays: ['Mon'],
      bestTimeWindows: ['early-evening'],
      source: 'curated',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'a2',
      title: 'Friday Pottery Wheel Night',
      description: 'Pottery',
      borough: 'Brooklyn',
      neighborhood: 'Williamsburg',
      category: 'hands-on',
      priceTier: '$$',
      bestDays: ['Fri', 'Sat'],
      bestTimeWindows: ['evening'],
      source: 'curated',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'a3',
      title: 'Already Done Spot',
      description: 'Done',
      borough: 'Queens',
      neighborhood: 'Astoria',
      category: 'unique-experiences',
      priceTier: '$',
      done: true,
      source: 'curated',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const matches = matchActivitiesForDateNight(dateNight, activities);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].activity.id, 'a2');
  assert.ok(matches[0].score > matches[1].score);
});
