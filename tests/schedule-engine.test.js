import test from 'node:test';
import assert from 'node:assert/strict';
import { ScheduleEngine } from '../src/engine/schedule-engine.js';

test('ScheduleEngine - same-day active schedule evaluation', () => {
  const schedule = {
    id: 's1',
    name: 'Work',
    enabled: true,
    days: [1, 2, 3, 4, 5], // Mon-Fri
    startTime: '09:00',
    endTime: '17:00',
    blockCategories: ['social']
  };

  // Monday 10:30 AM
  const mondayWork = new Date('2026-09-07T10:30:00'); // Mon
  assert.equal(ScheduleEngine.isScheduleActive(schedule, mondayWork), true);

  // Monday 18:00 PM (After work)
  const mondayEvening = new Date('2026-09-07T18:00:00');
  assert.equal(ScheduleEngine.isScheduleActive(schedule, mondayEvening), false);

  // Sunday 11:00 AM (Weekend)
  const sunday = new Date('2026-09-06T11:00:00'); // Sun
  assert.equal(ScheduleEngine.isScheduleActive(schedule, sunday), false);
});

test('ScheduleEngine - overnight schedule evaluation across midnight', () => {
  const schedule = {
    id: 's2',
    name: 'Night Lockdown',
    enabled: true,
    days: [1, 2, 3, 4, 5], // Mon-Fri nights
    startTime: '22:00',
    endTime: '06:00',
    blockCategories: ['entertainment']
  };

  // Monday 23:00 PM
  const mondayLate = new Date('2026-09-07T23:00:00');
  assert.equal(ScheduleEngine.isScheduleActive(schedule, mondayLate), true);

  // Tuesday 02:30 AM (Morning after Monday night)
  const tuesdayEarly = new Date('2026-09-08T02:30:00');
  assert.equal(ScheduleEngine.isScheduleActive(schedule, tuesdayEarly), true);

  // Tuesday 12:00 PM (Midday)
  const tuesdayNoon = new Date('2026-09-08T12:00:00');
  assert.equal(ScheduleEngine.isScheduleActive(schedule, tuesdayNoon), false);
});
