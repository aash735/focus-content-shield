/**
 * Schedule Engine
 * Evaluates recurring time-based website protection schedules.
 * Supports days of week, start/end times, timezone evaluation, and overnight midnight windows.
 */

export class ScheduleEngine {
  /**
   * Checks if a single schedule item is active at a target timestamp / Date object.
   *
   * Schedule Item Schema:
   * {
   *   id: string,
   *   name: string,
   *   enabled: boolean,
   *   days: number[], // [0=Sun, 1=Mon, ..., 6=Sat]
   *   startTime: string, // "09:00"
   *   endTime: string,   // "17:00" or overnight "22:00" -> "06:00"
   *   blockCategories: string[],
   *   blockDomains: string[],
   *   blockKeywords: string[]
   * }
   */
  static isScheduleActive(schedule, date = new Date()) {
    if (!schedule || schedule.enabled === false) return false;
    if (!Array.isArray(schedule.days) || schedule.days.length === 0) return false;
    if (!schedule.startTime || !schedule.endTime) return false;

    const currentDay = date.getDay(); // 0 to 6
    const currentMinutes = date.getHours() * 60 + date.getMinutes();

    const [startH, startM] = schedule.startTime.split(':').map(Number);
    const [endH, endM] = schedule.endTime.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Standard same-day window (e.g., 09:00 -> 17:00)
      if (!schedule.days.includes(currentDay)) return false;
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight window across midnight (e.g., 22:00 -> 06:00)
      // If current time is >= 22:00, today must be in days.
      // If current time is < 06:00, yesterday (previous day) must be in days.
      if (currentMinutes >= startMinutes) {
        return schedule.days.includes(currentDay);
      } else if (currentMinutes < endMinutes) {
        const previousDay = (currentDay + 6) % 7;
        return schedule.days.includes(previousDay);
      }
      return false;
    }
  }

  /**
   * Evaluates all stored schedules against current time.
   * Returns active state summary and aggregated target rule collections.
   */
  static evaluateSchedules(schedules = [], date = new Date()) {
    const activeSchedules = [];
    const activeCategories = new Set();
    const activeDomains = new Set();
    const activeKeywords = new Set();

    if (!Array.isArray(schedules)) {
      return { active: false, activeSchedules, activeCategories: [], activeDomains: [], activeKeywords: [] };
    }

    for (const schedule of schedules) {
      if (this.isScheduleActive(schedule, date)) {
        activeSchedules.push(schedule);

        (schedule.blockCategories || []).forEach((c) => activeCategories.add(c));
        (schedule.blockDomains || []).forEach((d) => activeDomains.add(d));
        (schedule.blockKeywords || []).forEach((k) => activeKeywords.add(k));
      }
    }

    return {
      active: activeSchedules.length > 0,
      activeSchedules,
      activeCategories: Array.from(activeCategories),
      activeDomains: Array.from(activeDomains),
      activeKeywords: Array.from(activeKeywords)
    };
  }
}

export default ScheduleEngine;
