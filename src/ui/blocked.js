import { browserCompat } from '../utils/browser-compat.js';

const MOTIVATIONAL_QUOTES = [
  '"Focus is a muscle. Every time you turn away from a distraction, you build mental strength."',
  '"Deep work is the ability to focus without distraction on a cognitively demanding task."',
  '"Your future self will thank you for staying focused right now."',
  '"Distraction is the enemy of direction."',
  '"Protect your time — it is your most valuable asset."'
];

document.addEventListener('DOMContentLoaded', async () => {
  const reasonTextEl = document.getElementById('block-reason-text');
  const quoteEl = document.getElementById('motivational-quote');
  const timerBox = document.getElementById('timer-box');
  const timerDisplay = document.getElementById('timer-display');

  const backSafetyBtn = document.getElementById('back-safety-btn');
  const closeTabBtn = document.getElementById('close-tab-btn');
  const goDashboardBtn = document.getElementById('go-dashboard-btn');

  // Random quote
  if (quoteEl) {
    const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
    quoteEl.textContent = MOTIVATIONAL_QUOTES[randomIndex];
  }

  // Parse URL search params for reason
  const urlParams = new URLSearchParams(window.location.search);
  const reasonParam = urlParams.get('reason');

  try {
    const response = await browserCompat.runtime.sendMessage({ action: 'GET_STATUS' });
    if (response && response.success && response.state) {
      const state = response.state;

      // Determine precise reason
      let reasonLabel = 'Protected Website / Content';

      const wordParam = urlParams.get('word') || urlParams.get('pattern');

      if (state.focusSession?.active && state.focusSession.endTime > Date.now()) {
        reasonLabel = '⚡ Active Focus Mode Session';
        startTimer(state.focusSession.endTime);
      } else if (reasonParam === 'adult') {
        reasonLabel = '🔞 Adult Content Protection';
      } else if (reasonParam === 'word' || reasonParam === 'keyword') {
        reasonLabel = wordParam ? `🔍 Protected Word: "${wordParam}"` : '🔍 Protected Word Intercepted';
      } else if (reasonParam === 'schedule') {
        reasonLabel = '📅 Scheduled Focus Window';
      } else if (reasonParam === 'domain') {
        reasonLabel = '🔒 Permanent Protected Website';
      }

      if (reasonTextEl) reasonTextEl.textContent = reasonLabel;

      // Increment stats
      browserCompat.runtime.sendMessage({
        action: 'INCREMENT_BLOCKED_COUNT',
        domain: null,
        category: reasonParam || 'domain'
      }).catch(() => {});
    }
  } catch {
    if (reasonTextEl) reasonTextEl.textContent = 'Protected Content Intercepted';
  }

  function startTimer(endTime) {
    if (!timerBox || !timerDisplay) return;
    timerBox.classList.remove('hidden');

    function update() {
      const remainingMs = endTime - Date.now();
      if (remainingMs <= 0) {
        timerDisplay.textContent = '00:00';
        return;
      }
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    update();
    setInterval(update, 1000);
  }

  // Actions
  if (backSafetyBtn) {
    backSafetyBtn.addEventListener('click', () => {
      window.history.back();
      setTimeout(() => {
        window.location.href = 'https://www.google.com';
      }, 500);
    });
  }

  if (closeTabBtn) {
    closeTabBtn.addEventListener('click', () => {
      try {
        if (browserCompat.api?.tabs) {
          browserCompat.api.tabs.getCurrent((tab) => {
            if (tab && tab.id) {
              browserCompat.api.tabs.remove(tab.id);
            } else {
              window.close();
            }
          });
        } else {
          window.close();
        }
      } catch {
        window.close();
      }
    });
  }

  if (goDashboardBtn) {
    goDashboardBtn.addEventListener('click', () => {
      window.location.href = browserCompat.runtime.getURL('src/ui/dashboard.html');
    });
  }
});
