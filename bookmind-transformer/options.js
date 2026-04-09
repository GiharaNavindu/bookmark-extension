/**
 * BookMind – options.js
 * Settings page logic: reminder settings, data management.
 */

const SETTINGS_KEYS = ['reminderInterval', 'remindersEnabled', 'guideStyle', 'guideLanguage'];

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await updateDataStats();
  bindEvents();
});

// ══════════════════════════════════════════════════════
// LOAD SETTINGS
// ══════════════════════════════════════════════════════
async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(SETTINGS_KEYS, result => {
      if (result.reminderInterval)  el('reminder-interval').value = String(result.reminderInterval);
      if (result.guideStyle)        el('guide-style').value = result.guideStyle;
      if (result.guideLanguage)     el('guide-language').value = result.guideLanguage;

      el('reminders-enabled').checked = result.remindersEnabled !== false;
      toggleIntervalField(el('reminders-enabled').checked);
      
      resolve();
    });
  });
}

// ══════════════════════════════════════════════════════
// SAVE SETTINGS
// ══════════════════════════════════════════════════════
function saveSettings() {
  const settings = {
    reminderInterval: parseInt(el('reminder-interval').value, 10),
    remindersEnabled: el('reminders-enabled').checked,
    guideStyle:       el('guide-style').value,
    guideLanguage:    el('guide-language').value,
  };

  chrome.storage.local.set(settings, () => {
    setStatus('✓ Settings saved', 'success');

    // Tell background to reschedule alarm
    chrome.runtime.sendMessage({ type: 'RESCHEDULE_ALARM' }).catch(() => {
      // Background may not be listening – that's OK, it will pick up on next startup
    });

    setTimeout(() => setStatus(''), 3000);
  });
}

// ══════════════════════════════════════════════════════
// DATA STATS
// ══════════════════════════════════════════════════════
async function updateDataStats() {
  return new Promise(resolve => {
    chrome.storage.local.get(['topics', 'guides'], result => {
      const topicCount   = Object.keys(result.topics || {}).length;
      const bookmarkCount = Object.values(result.topics || {}).reduce((sum, arr) => sum + arr.length, 0);
      const guideCount   = (result.guides || []).length;

      el('data-stats').innerHTML = `
        <div>📊 <strong>${topicCount}</strong> topics · <strong>${bookmarkCount}</strong> organized bookmarks · <strong>${guideCount}</strong> guides stored</div>
        <div style="margin-top:4px;font-size:11px;">All data is stored locally in your browser.</div>
      `;
      resolve();
    });
  });
}

// ══════════════════════════════════════════════════════
// EXPORT DATA
// ══════════════════════════════════════════════════════
function exportData() {
  chrome.storage.local.get(null, data => {
    const exportable = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      topics: data.topics || {},
      guides: data.guides || [],
    };

    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `bookmind-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setStatus('✓ Data exported', 'success');
    setTimeout(() => setStatus(''), 3000);
  });
}

// ══════════════════════════════════════════════════════
// CLEAR DATA
// ══════════════════════════════════════════════════════
function clearTopics() {
  if (!confirm('Clear all topic organization data? Your bookmarks in Chrome will NOT be deleted.')) return;
  chrome.storage.local.remove(['topics'], () => {
    setStatus('✓ Topic data cleared', 'success');
    updateDataStats();
    setTimeout(() => setStatus(''), 3000);
  });
}

function clearAllData() {
  if (!confirm('Clear ALL BookMind data? This includes topics and guides. Bookmarks in Chrome will NOT be deleted.')) return;
  chrome.storage.local.clear(() => {
    setStatus('✓ All data cleared', 'success');
    updateDataStats();

    // Reset fields
    el('reminders-enabled').checked = true;
    el('reminder-interval').value   = '24';
    el('guide-style').value         = 'comprehensive';
    el('guide-language').value      = 'english';

    setTimeout(() => setStatus(''), 3000);
  });
}

// ══════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════
function bindEvents() {
  el('btn-save').addEventListener('click', saveSettings);

  el('reminders-enabled').addEventListener('change', e => {
    toggleIntervalField(e.target.checked);
  });

  el('btn-export').addEventListener('click', exportData);
  el('btn-clear-topics').addEventListener('click', clearTopics);
  el('btn-clear-all').addEventListener('click', clearAllData);
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function el(id) { return document.getElementById(id); }

function setStatus(msg, type = '') {
  const status = el('save-status');
  status.textContent = msg;
  status.className   = 'save-status ' + type;
}

function toggleIntervalField(visible) {
  el('interval-field').style.display = visible ? 'block' : 'none';
}

