/**
 * Focus Engine
 * Manages active Focus Mode sessions, duration timers, and session state persistence.
 */

export class FocusEngine {
  /**
   * Evaluates current Focus Session state.
   * Focus Session Schema:
   * {
   *   active: boolean,
   *   startTime: number | null,
   *   durationMinutes: number,
   *   endTime: number | null,
   *   blockCategories: string[],
   *   strictLocked: boolean
   * }
   */
  static evaluateFocusSession(focusSessionState, now = Date.now()) {
    if (!focusSessionState || !focusSessionState.active || !focusSessionState.endTime) {
      return {
        active: false,
        remainingSeconds: 0,
        expired: false,
        blockCategories: []
      };
    }

    const remainingMs = focusSessionState.endTime - now;

    if (remainingMs <= 0) {
      return {
        active: false,
        remainingSeconds: 0,
        expired: true,
        blockCategories: []
      };
    }

    return {
      active: true,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      expired: false,
      blockCategories: focusSessionState.blockCategories || [
        'adult', 'social', 'entertainment', 'gaming', 'gambling', 'shopping', 'news', 'video'
      ]
    };
  }

  /**
   * Helper to construct a new Focus Session object.
   */
  static createSession(durationMinutes = 25, blockCategories = null, strictLocked = false, now = Date.now()) {
    const duration = Math.max(1, Math.min(1440, Number(durationMinutes) || 25));
    const endTime = now + duration * 60 * 1000;

    return {
      active: true,
      startTime: now,
      durationMinutes: duration,
      endTime,
      blockCategories: Array.isArray(blockCategories) && blockCategories.length > 0
        ? blockCategories
        : ['adult', 'social', 'entertainment', 'gaming', 'gambling', 'shopping', 'news', 'video'],
      strictLocked: Boolean(strictLocked)
    };
  }
}

export default FocusEngine;
