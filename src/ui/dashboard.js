import { browserCompat } from '../utils/browser-compat.js';
import { CATEGORY_DEFINITIONS } from '../categories/category-rulesets.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  // Metrics
  const domainsCountEl = document.getElementById('metric-domains-count');
  const keywordsCountEl = document.getElementById('metric-keywords-count');
  const blockedCountEl = document.getElementById('metric-blocked-count');
  const focusTimerMetric = document.getElementById('metric-focus-timer');

  // Badges & Banners
  const protectionBadgeText = document.getElementById('status-badge-text');
  const strictBadgeText = document.getElementById('strict-badge-text');
  const strictBadgeEl = document.getElementById('strict-status-badge');
  const incognitoBanner = document.getElementById('incognito-warning-banner');

  // Forms
  const quickDomainForm = document.getElementById('quick-add-domain-form');
  const quickDomainInput = document.getElementById('quick-domain-input');
  const quickDomainFeedback = document.getElementById('quick-domain-feedback');

  const quickKwForm = document.getElementById('quick-add-keyword-form');
  const quickKwDomain = document.getElementById('quick-kw-domain');
  const quickKwPattern = document.getElementById('quick-kw-pattern');
  const quickKwScope = document.getElementById('quick-kw-scope');
  const quickKwMode = document.getElementById('quick-kw-mode');
  const quickKwAction = document.getElementById('quick-kw-action');
  const quickKwFeedback = document.getElementById('quick-kw-feedback');

  const createSchedForm = document.getElementById('create-schedule-form');
  const schedNameInput = document.getElementById('sched-name');
  const schedStartInput = document.getElementById('sched-start-time');
  const schedEndInput = document.getElementById('sched-end-time');
  const schedFeedback = document.getElementById('sched-feedback');

  // Focus Mode
  const focusTimerBig = document.getElementById('focus-timer-text');
  const focusStatusSub = document.getElementById('focus-status-text');
  const focusControlsActive = document.getElementById('focus-controls-active');
  const focusControlsSetup = document.getElementById('focus-controls-setup');
  const startFocusBtn = document.getElementById('start-focus-btn');
  const stopFocusBtn = document.getElementById('stop-focus-btn');
  const customFocusMins = document.getElementById('custom-focus-mins');
  const focusStrictLock = document.getElementById('focus-strict-lock');

  // Containers
  const categoriesGrid = document.getElementById('categories-grid');
  const domainsListContainer = document.getElementById('domains-list-container');
  const keywordsListContainer = document.getElementById('keywords-list-container');
  const schedulesListContainer = document.getElementById('schedules-list-container');
  const insightsDomainBreakdown = document.getElementById('insights-domain-breakdown');

  // Security
  const setPinForm = document.getElementById('set-pin-form');
  const currentPinGroup = document.getElementById('current-pin-group');
  const currentPinInput = document.getElementById('current-pin-input');
  const newPinInput = document.getElementById('new-pin-input');
  const removePinBtn = document.getElementById('remove-pin-btn');
  const pinStatusLabel = document.getElementById('pin-status-label');
  const pinFeedback = document.getElementById('pin-feedback');

  const strictModeForm = document.getElementById('strict-mode-form');
  const strictDurationSelect = document.getElementById('strict-duration-select');
  const toggleStrictBtn = document.getElementById('toggle-strict-btn');
  const strictFeedback = document.getElementById('strict-feedback');

  // Insights
  const insightsTotalCount = document.getElementById('insights-total-count');
  const insightsTopDomain = document.getElementById('insights-top-domain');
  const clearInsightsBtn = document.getElementById('clear-insights-btn');

  // Import / Export
  const exportJsonBtn = document.getElementById('export-json-btn');
  const importFileInput = document.getElementById('import-file-input');
  const importJsonBtn = document.getElementById('import-json-btn');
  const importFeedback = document.getElementById('import-feedback');

  // PIN Modal
  const pinModal = document.getElementById('pin-modal');
  const modalPinInput = document.getElementById('modal-pin-input');
  const modalPinFeedback = document.getElementById('modal-pin-feedback');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalSubmitBtn = document.getElementById('modal-submit-btn');
  let pendingAuthAction = null;

  let selectedFocusMins = 25;
  let focusIntervalTimer = null;
  let currentSystemState = null;

  // Navigation Tabs
  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      navTabs.forEach((t) => t.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // Load Dashboard Data
  async function loadDashboardData() {
    try {
      const response = await browserCompat.runtime.sendMessage({ action: 'GET_STATUS' });
      if (!response || !response.success) return;

      const { state, incognitoAllowed } = response;
      currentSystemState = state;

      // Metrics
      const permanentDomains = state.permanentDomains || [];
      const protectedKeywords = state.protectedKeywords || [];
      const stats = state.statistics || { totalBlockedAttempts: 0 };

      if (domainsCountEl) domainsCountEl.textContent = permanentDomains.length;
      if (keywordsCountEl) keywordsCountEl.textContent = protectedKeywords.length;
      if (blockedCountEl) blockedCountEl.textContent = stats.totalBlockedAttempts || 0;

      // Incognito Banner
      if (incognitoBanner) {
        if (incognitoAllowed) incognitoBanner.classList.add('hidden');
        else incognitoBanner.classList.remove('hidden');
      }

      // Strict Mode Badge
      if (strictBadgeText && strictBadgeEl) {
        if (state.strictMode?.enabled) {
          strictBadgeText.textContent = 'Strict Lockdown Active';
          strictBadgeEl.className = 'status-badge strict';
        } else {
          strictBadgeText.textContent = 'Normal Mode';
          strictBadgeEl.className = 'status-badge';
        }
      }

      // Security PIN status
      if (pinStatusLabel) {
        if (state.security?.pinEnabled) {
          pinStatusLabel.textContent = 'Enabled (Protected)';
          if (currentPinGroup) currentPinGroup.classList.remove('hidden');
          if (removePinBtn) removePinBtn.classList.remove('hidden');
        } else {
          pinStatusLabel.textContent = 'Disabled';
          if (currentPinGroup) currentPinGroup.classList.add('hidden');
          if (removePinBtn) removePinBtn.classList.add('hidden');
        }
      }

      // Render all sub views
      renderCategories(state.categories || {});
      renderDomainsList(permanentDomains, state);
      renderKeywordsList(protectedKeywords, state);
      renderSchedulesList(state.schedules || [], state);
      renderFocusView(state.focusSession);
      renderInsightsView(state.insights || {});

    } catch (err) {
      console.error('[Dashboard] Error loading state:', err);
    }
  }

  // Render Categories
  function renderCategories(categoriesState) {
    if (!categoriesGrid) return;
    categoriesGrid.textContent = '';

    Object.values(CATEGORY_DEFINITIONS).forEach((cat) => {
      const card = document.createElement('div');
      card.className = 'category-card';

      const isEnabled = categoriesState[cat.id]?.enabled !== false;

      const infoDiv = document.createElement('div');
      infoDiv.className = 'category-info';

      const h3 = document.createElement('h3');
      h3.textContent = cat.name;

      const p = document.createElement('p');
      p.textContent = cat.description;

      infoDiv.appendChild(h3);
      infoDiv.appendChild(p);

      const label = document.createElement('label');
      label.className = 'toggle-switch';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = isEnabled;

      input.addEventListener('change', async () => {
        if (!input.checked && currentSystemState?.security?.pinEnabled) {
          // Require PIN to disable category
          openPinModal(async (pin) => {
            const res = await browserCompat.runtime.sendMessage({
              action: 'UPDATE_CATEGORY_STATE',
              categoryId: cat.id,
              enabled: false,
              pin
            });
            if (res && res.success) {
              await loadDashboardData();
            } else {
              input.checked = true;
              alert(res?.error || 'Failed to update category');
            }
          });
        } else {
          const res = await browserCompat.runtime.sendMessage({
            action: 'UPDATE_CATEGORY_STATE',
            categoryId: cat.id,
            enabled: input.checked
          });
          if (res && res.success) {
            await loadDashboardData();
          } else {
            input.checked = !input.checked;
          }
        }
      });

      const span = document.createElement('span');
      span.className = 'toggle-slider';

      label.appendChild(input);
      label.appendChild(span);

      card.appendChild(infoDiv);
      card.appendChild(label);
      categoriesGrid.appendChild(card);
    });
  }

  // Render Domains List
  function renderDomainsList(domains, state) {
    if (!domainsListContainer) return;
    domainsListContainer.textContent = '';

    if (domains.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'notice-box';
      empty.textContent = 'No custom protected domains added yet. Quick Add a website above to block it.';
      domainsListContainer.appendChild(empty);
      return;
    }

    domains.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'rule-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'rule-name';
      nameSpan.textContent = `🔒 ${item.domain}`;

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'rule-actions';

      const badge = document.createElement('span');
      badge.className = 'rule-badge';
      badge.textContent = 'Permanent Protection';

      actionsDiv.appendChild(badge);

      // Delete action button if strict mode permits
      const isLocked = state.strictMode?.enabled;
      if (!isLocked) {
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn';
        delBtn.textContent = '🗑️';
        delBtn.title = 'Remove Domain';

        delBtn.addEventListener('click', () => {
          if (state.security?.pinEnabled) {
            openPinModal(async (pin) => {
              const res = await browserCompat.runtime.sendMessage({
                action: 'REMOVE_PERMANENT_DOMAIN',
                id: item.id,
                pin
              });
              if (res && res.success) await loadDashboardData();
              else alert(res?.error || 'Failed to remove domain');
            });
          } else {
            (async () => {
              const res = await browserCompat.runtime.sendMessage({
                action: 'REMOVE_PERMANENT_DOMAIN',
                id: item.id
              });
              if (res && res.success) await loadDashboardData();
              else alert(res?.error || 'Failed to remove domain');
            })();
          }
        });
        actionsDiv.appendChild(delBtn);
      }

      row.appendChild(nameSpan);
      row.appendChild(actionsDiv);
      domainsListContainer.appendChild(row);
    });
  }

  // Render Keywords List
  function renderKeywordsList(keywords, state) {
    if (!keywordsListContainer) return;
    keywordsListContainer.textContent = '';

    if (keywords.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'notice-box';
      empty.textContent = 'No protected URL keywords defined yet.';
      keywordsListContainer.appendChild(empty);
      return;
    }

    keywords.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'rule-item';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'rule-name-group';

      const domLabel = item.domain ? item.domain : 'Global (All Domains)';
      const scopeLabel = item.matchScope === 'path_query' ? 'Path + Query' : (item.matchScope === 'hostname' ? 'Hostname' : 'Full URL');
      const actionLabel = item.action === 'block_page' ? 'Block Page' : 'Safe Home Redirect';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'rule-name';
      titleSpan.textContent = `${domLabel} ➔ ${item.pattern}`;

      const subSpan = document.createElement('div');
      subSpan.className = 'rule-desc-sub';
      subSpan.style.fontSize = '0.8rem';
      subSpan.style.color = '#888';
      subSpan.textContent = `Scope: ${scopeLabel} | Action: ${actionLabel}`;

      nameDiv.appendChild(titleSpan);
      nameDiv.appendChild(subSpan);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'rule-actions';

      const badge = document.createElement('span');
      badge.className = 'rule-badge';
      badge.textContent = `URL Protection`;

      actionsDiv.appendChild(badge);

      if (!state.strictMode?.enabled) {
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn';
        delBtn.textContent = '🗑️';
        delBtn.title = 'Remove Keyword';
        delBtn.addEventListener('click', () => {
          if (state.security?.pinEnabled) {
            openPinModal(async (pin) => {
              const res = await browserCompat.runtime.sendMessage({
                action: 'REMOVE_PROTECTED_KEYWORD',
                id: item.id,
                pin
              });
              if (res && res.success) await loadDashboardData();
              else alert(res?.error || 'Failed to remove keyword');
            });
          } else {
            (async () => {
              const res = await browserCompat.runtime.sendMessage({
                action: 'REMOVE_PROTECTED_KEYWORD',
                id: item.id
              });
              if (res && res.success) await loadDashboardData();
              else alert(res?.error || 'Failed to remove keyword');
            })();
          }
        });
        actionsDiv.appendChild(delBtn);
      }

      row.appendChild(nameDiv);
      row.appendChild(actionsDiv);
      keywordsListContainer.appendChild(row);
    });
  }

  // Render Schedules List
  function renderSchedulesList(schedules, state) {
    if (!schedulesListContainer) return;
    schedulesListContainer.textContent = '';

    if (schedules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'notice-box';
      empty.textContent = 'No recurring schedules configured yet. Create one using the form.';
      schedulesListContainer.appendChild(empty);
      return;
    }

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    schedules.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'rule-item';

      const nameDiv = document.createElement('div');
      const h4 = document.createElement('strong');
      h4.textContent = s.name;
      const daysText = (s.days || []).map((d) => dayLabels[d]).join(', ');
      const p = document.createElement('div');
      p.className = 'rule-badge';
      p.textContent = `${daysText} (${s.startTime} → ${s.endTime})`;

      nameDiv.appendChild(h4);
      nameDiv.appendChild(p);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'rule-actions';

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', async () => {
        const res = await browserCompat.runtime.sendMessage({ action: 'DELETE_SCHEDULE', id: s.id });
        if (res && res.success) await loadDashboardData();
      });

      actionsDiv.appendChild(delBtn);
      row.appendChild(nameDiv);
      row.appendChild(actionsDiv);
      schedulesListContainer.appendChild(row);
    });
  }

  // Render Focus View
  function renderFocusView(focusSession) {
    if (!focusTimerBig || !focusStatusSub) return;
    clearInterval(focusIntervalTimer);

    if (focusSession && focusSession.active && focusSession.endTime > Date.now()) {
      if (focusControlsActive) focusControlsActive.classList.remove('hidden');
      if (focusControlsSetup) focusControlsSetup.classList.add('hidden');
      if (focusStatusSub) focusStatusSub.textContent = '⚡ Focus Session Active & Enforced';
      if (focusTimerMetric) focusTimerMetric.textContent = 'Active';

      const updateTimer = () => {
        const remainingMs = focusSession.endTime - Date.now();
        if (remainingMs <= 0) {
          focusTimerBig.textContent = '00:00';
          clearInterval(focusIntervalTimer);
          loadDashboardData();
          return;
        }
        const mins = Math.floor(remainingMs / 60000);
        const secs = Math.floor((remainingMs % 60000) / 1000);
        const text = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        focusTimerBig.textContent = text;
        if (focusTimerMetric) focusTimerMetric.textContent = text;
      };

      updateTimer();
      focusIntervalTimer = setInterval(updateTimer, 1000);
    } else {
      if (focusControlsActive) focusControlsActive.classList.add('hidden');
      if (focusControlsSetup) focusControlsSetup.classList.remove('hidden');
      if (focusTimerBig) focusTimerBig.textContent = '25:00';
      if (focusStatusSub) focusStatusSub.textContent = 'Ready to focus';
      if (focusTimerMetric) focusTimerMetric.textContent = 'Inactive';
    }
  }

  // Render Insights View
  function renderInsightsView(insights) {
    if (insightsTotalCount) insightsTotalCount.textContent = insights.totalBlockedAttempts || 0;

    const domainCounts = insights.domainBlockCounts || {};
    const entries = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);

    if (insightsTopDomain) {
      insightsTopDomain.textContent = entries.length > 0 ? entries[0][0] : 'None';
    }

    if (insightsDomainBreakdown) {
      insightsDomainBreakdown.textContent = '';
      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'notice-box';
        empty.textContent = 'No interception attempts recorded yet.';
        insightsDomainBreakdown.appendChild(empty);
      } else {
        entries.slice(0, 10).forEach(([dom, count]) => {
          const row = document.createElement('div');
          row.className = 'rule-item';

          const spanName = document.createElement('span');
          spanName.className = 'rule-name';
          spanName.textContent = dom;

          const spanCount = document.createElement('span');
          spanCount.className = 'rule-badge';
          spanCount.textContent = `${count} Interception${count > 1 ? 's' : ''}`;

          row.appendChild(spanName);
          row.appendChild(spanCount);
          insightsDomainBreakdown.appendChild(row);
        });
      }
    }
  }

  // Handle Quick Add Domain
  if (quickDomainForm) {
    quickDomainForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFeedback(quickDomainFeedback, '', '');

      const domain = quickDomainInput.value.trim();
      if (!domain) return;

      const res = await browserCompat.runtime.sendMessage({ action: 'ADD_PERMANENT_DOMAIN', domain });
      if (res && res.success) {
        setFeedback(quickDomainFeedback, `Domain "${res.entry.domain}" locked under protection.`, 'success');
        quickDomainInput.value = '';
        await loadDashboardData();
      } else {
        setFeedback(quickDomainFeedback, res?.error || 'Failed to add domain.', 'error');
      }
    });
  }

  // Handle Quick Add Word Rule
  if (quickKwForm) {
    quickKwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFeedback(quickKwFeedback, '', '');

      const pattern = quickKwPattern.value.trim();
      const domain = quickKwDomain ? quickKwDomain.value.trim() : '';
      const matchScope = quickKwScope ? quickKwScope.value : 'path_query';
      const wordMatchMode = quickKwMode ? quickKwMode.value : 'contains';
      const actionType = quickKwAction ? quickKwAction.value : 'block_page';
      if (!pattern) return;

      const res = await browserCompat.runtime.sendMessage({
        action: 'ADD_PROTECTED_KEYWORD',
        pattern,
        matchScope,
        wordMatchMode,
        actionType,
        domain
      });

      if (res && res.success) {
        setFeedback(quickKwFeedback, `Word "${res.entry.pattern}" protected successfully.`, 'success');
        quickKwPattern.value = '';
        if (quickKwDomain) quickKwDomain.value = '';
        await loadDashboardData();
      } else {
        setFeedback(quickKwFeedback, res?.error || 'Failed to add word rule.', 'error');
      }
    });
  }

  // Focus preset buttons
  document.querySelectorAll('.focus-start-btn, .focus-dur-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      document.querySelectorAll('.focus-dur-btn').forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');

      const mins = Number(e.target.getAttribute('data-duration') || e.target.getAttribute('data-mins'));
      if (mins) {
        selectedFocusMins = mins;
        if (e.target.classList.contains('focus-start-btn')) {
          await startFocus(mins);
        }
      }
    });
  });

  if (startFocusBtn) {
    startFocusBtn.addEventListener('click', async () => {
      const customMins = customFocusMins && customFocusMins.value ? Number(customFocusMins.value) : selectedFocusMins;
      const isStrict = focusStrictLock ? focusStrictLock.checked : false;
      await startFocus(customMins, isStrict);
    });
  }

  async function startFocus(durationMinutes, strictLocked = false) {
    const res = await browserCompat.runtime.sendMessage({
      action: 'START_FOCUS_SESSION',
      durationMinutes,
      strictLocked
    });
    if (res && res.success) {
      await loadDashboardData();
    } else {
      alert(res?.error || 'Failed to start focus session.');
    }
  }

  if (stopFocusBtn) {
    stopFocusBtn.addEventListener('click', () => {
      if (currentSystemState?.focusSession?.strictLocked || currentSystemState?.security?.pinEnabled) {
        openPinModal(async (pin) => {
          const res = await browserCompat.runtime.sendMessage({ action: 'STOP_FOCUS_SESSION', pin });
          if (res && res.success) await loadDashboardData();
          else alert(res?.error || 'Failed to stop focus session.');
        });
      } else {
        (async () => {
          const res = await browserCompat.runtime.sendMessage({ action: 'STOP_FOCUS_SESSION' });
          if (res && res.success) await loadDashboardData();
        })();
      }
    });
  }

  // Create Schedule
  if (createSchedForm) {
    createSchedForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFeedback(schedFeedback, '', '');

      const name = schedNameInput.value.trim();
      const startTime = schedStartInput.value;
      const endTime = schedEndInput.value;

      const dayCheckboxes = document.querySelectorAll('.day-picker input:checked');
      const days = Array.from(dayCheckboxes).map((cb) => Number(cb.value));

      const catCheckboxes = document.querySelectorAll('.category-checkboxes input:checked');
      const blockCategories = Array.from(catCheckboxes).map((cb) => cb.value);

      if (!name || days.length === 0) {
        setFeedback(schedFeedback, 'Please enter a name and select at least one day.', 'error');
        return;
      }

      const res = await browserCompat.runtime.sendMessage({
        action: 'SAVE_SCHEDULE',
        schedule: { name, days, startTime, endTime, blockCategories }
      });

      if (res && res.success) {
        setFeedback(schedFeedback, 'Schedule saved successfully.', 'success');
        schedNameInput.value = '';
        await loadDashboardData();
      } else {
        setFeedback(schedFeedback, res?.error || 'Failed to save schedule.', 'error');
      }
    });
  }

  // PIN Setup & Removal
  if (setPinForm) {
    setPinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFeedback(pinFeedback, '', '');

      const currentPin = currentPinInput ? currentPinInput.value.trim() : null;
      const newPin = newPinInput ? newPinInput.value.trim() : null;

      if (!newPin || newPin.length < 4) {
        setFeedback(pinFeedback, 'PIN must be at least 4 digits.', 'error');
        return;
      }

      const res = await browserCompat.runtime.sendMessage({
        action: 'SET_PIN',
        newPin,
        currentPin
      });

      if (res && res.success) {
        setFeedback(pinFeedback, 'Security PIN set successfully.', 'success');
        if (newPinInput) newPinInput.value = '';
        if (currentPinInput) currentPinInput.value = '';
        await loadDashboardData();
      } else {
        setFeedback(pinFeedback, res?.error || 'Failed to set PIN.', 'error');
      }
    });
  }

  if (removePinBtn) {
    removePinBtn.addEventListener('click', () => {
      openPinModal(async (pin) => {
        const res = await browserCompat.runtime.sendMessage({ action: 'REMOVE_PIN', currentPin: pin });
        if (res && res.success) await loadDashboardData();
        else alert(res?.error || 'Failed to remove PIN');
      });
    });
  }

  // Strict Mode Form
  if (strictModeForm) {
    strictModeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFeedback(strictFeedback, '', '');

      const hours = Number(strictDurationSelect.value) || 0;

      if (currentSystemState?.security?.pinEnabled) {
        openPinModal(async (pin) => {
          const res = await browserCompat.runtime.sendMessage({
            action: 'SET_STRICT_MODE',
            enabled: true,
            durationHours: hours,
            pin
          });
          if (res && res.success) {
            setFeedback(strictFeedback, 'Strict Mode activated successfully.', 'success');
            await loadDashboardData();
          } else {
            setFeedback(strictFeedback, res?.error || 'Failed to enable Strict Mode.', 'error');
          }
        });
      } else {
        const res = await browserCompat.runtime.sendMessage({
          action: 'SET_STRICT_MODE',
          enabled: true,
          durationHours: hours
        });
        if (res && res.success) {
          setFeedback(strictFeedback, 'Strict Mode activated successfully.', 'success');
          await loadDashboardData();
        } else {
          setFeedback(strictFeedback, res?.error || 'Failed to enable Strict Mode.', 'error');
        }
      }
    });
  }

  // Clear Insights
  if (clearInsightsBtn) {
    clearInsightsBtn.addEventListener('click', async () => {
      const res = await browserCompat.runtime.sendMessage({ action: 'CLEAR_INSIGHTS' });
      if (res && res.success) await loadDashboardData();
    });
  }

  // Export JSON
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', async () => {
      const res = await browserCompat.runtime.sendMessage({ action: 'EXPORT_CONFIG' });
      if (res && res.success && res.jsonConfig) {
        const blob = new Blob([res.jsonConfig], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `focus-shield-config-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  }

  // Import JSON
  if (importJsonBtn) {
    importJsonBtn.addEventListener('click', async () => {
      setFeedback(importFeedback, '', '');
      const file = importFileInput ? importFileInput.files[0] : null;
      if (!file) {
        setFeedback(importFeedback, 'Please select a configuration JSON file to import.', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target.result;
        const res = await browserCompat.runtime.sendMessage({ action: 'IMPORT_CONFIG', jsonString: content });
        if (res && res.success) {
          setFeedback(importFeedback, 'Configuration imported successfully!', 'success');
          await loadDashboardData();
        } else {
          setFeedback(importFeedback, res?.error || 'Import failed dynamic rule validation.', 'error');
        }
      };
      reader.readAsText(file);
    });
  }

  // Modal helpers
  function openPinModal(onSuccess) {
    if (!pinModal) return;
    pendingAuthAction = onSuccess;
    if (modalPinInput) modalPinInput.value = '';
    setFeedback(modalPinFeedback, '', '');
    pinModal.classList.remove('hidden');
  }

  function closePinModal() {
    if (!pinModal) return;
    pinModal.classList.add('hidden');
    pendingAuthAction = null;
  }

  if (modalCancelBtn) modalCancelBtn.addEventListener('click', closePinModal);

  if (modalSubmitBtn) {
    modalSubmitBtn.addEventListener('click', async () => {
      const pin = modalPinInput ? modalPinInput.value.trim() : '';
      if (!pin) return;

      const verifyRes = await browserCompat.runtime.sendMessage({ action: 'VERIFY_PIN', pin });
      if (verifyRes && verifyRes.valid) {
        const action = pendingAuthAction;
        closePinModal();
        if (typeof action === 'function') await action(pin);
      } else {
        setFeedback(modalPinFeedback, 'Incorrect PIN.', 'error');
      }
    });
  }

  function setFeedback(element, text, type) {
    if (!element) return;
    element.textContent = text;
    element.className = `feedback-msg ${type}`;
  }

  loadDashboardData();
});
