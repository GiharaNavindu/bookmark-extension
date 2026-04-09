/**
 * BookMind – background.js (Service Worker)
 * Handles: periodic bookmark reminders, notification clicks, alarm scheduling.
 */

import { clusterBookmarks } from './utils/ai.js';

const ALARM_NAME = 'bookmind-reminder';

// ══════════════════════════════════════════════════════
// MESSAGE LISTENER (AI TASKS)
// ══════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'organizeBookmarks') {
    // Perform clustering in background
    (async () => {
      try {
        const result = await clusterBookmarks(message.bookmarks);
        // The popup expects { topics: { "Topic Name": ["id1", "id2"] } } 
        // OR the full objects. Let's see what popup expects.
        // It expects { topics: { "Name": ["id"...] } } from the LLM prompt.
        // But here we can return the structure directly.
        // Let's modify the popup to handle { "Topic Name": [bookmarkObj...] } directly
        // OR map it.
        
        // Let's return the grouped object: { "Topic A": [b1, b2], "Topic B": [b3] }
        sendResponse({ success: true, data: result });
      } catch (error) {
        console.error('Clustering error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
  }
});

// ══════════════════════════════════════════════════════
// INSTALL / STARTUP
// ══════════════════════════════════════════════════════
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('[BookMind] Extension installed – setting up alarms');
    scheduleReminder();

    // Open options page on first install so user sets API key
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(() => {
  scheduleReminder();
});

// ══════════════════════════════════════════════════════
// ALARM SCHEDULING
// ══════════════════════════════════════════════════════
async function scheduleReminder() {
  // Read reminder interval from settings (default: every 24 hours)
  const settings = await getSettings();
  const intervalHours = settings.reminderInterval || 24;

  // Clear old alarm and reschedule
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: intervalHours * 60,
      periodInMinutes: intervalHours * 60,
    });
    console.log(`[BookMind] Reminder scheduled every ${intervalHours}h`);
  });
}

// Listen for settings changes to reschedule
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.reminderInterval) {
    scheduleReminder();
  }
});

// ══════════════════════════════════════════════════════
// ALARM FIRED → SEND NOTIFICATION
// ══════════════════════════════════════════════════════
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const settings = await getSettings();
  if (!settings.remindersEnabled) {
    console.log('[BookMind] Reminders disabled, skipping notification');
    return;
  }

  const bookmarks = await getRandomOldBookmarks();
  if (bookmarks.length === 0) return;

  const pick = bookmarks[0];
  const extras = bookmarks.length > 1 ? ` (+${bookmarks.length - 1} more waiting)` : '';

  chrome.notifications.create(`bookmind-reminder-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: '📚 BookMind Reminder',
    message: `You bookmarked: "${truncate(pick.title, 60)}"${extras}`,
    contextMessage: extractDomain(pick.url),
    buttons: [
      { title: '↗ Open Bookmark' },
      { title: '📂 Open BookMind' },
    ],
    requireInteraction: false,
  });

  // Store the notified bookmark url so notification click can open it
  chrome.storage.session?.set?.({ lastReminderUrl: pick.url });
});

// ══════════════════════════════════════════════════════
// NOTIFICATION CLICK HANDLERS
// ══════════════════════════════════════════════════════
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (!notificationId.startsWith('bookmind-reminder-')) return;

  if (buttonIndex === 0) {
    // Open the bookmarked URL
    chrome.storage.session?.get?.(['lastReminderUrl'], result => {
      if (result.lastReminderUrl) {
        chrome.tabs.create({ url: result.lastReminderUrl });
      }
    });
  } else if (buttonIndex === 1) {
    // Open the extension popup in a new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  }

  chrome.notifications.clear(notificationId);
});

chrome.notifications.onClicked.addListener(notificationId => {
  if (!notificationId.startsWith('bookmind-reminder-')) return;
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  chrome.notifications.clear(notificationId);
});

// ══════════════════════════════════════════════════════
// BOOKMARK HELPERS
// ══════════════════════════════════════════════════════
async function getRandomOldBookmarks() {
  return new Promise(resolve => {
    chrome.bookmarks.getTree(tree => {
      const all = flattenBookmarks(tree);

      // Pick bookmarks older than 7 days
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - sevenDays;
      const old = all.filter(b => b.dateAdded < cutoff);

      if (old.length === 0) {
        resolve(all.slice(0, 3)); // fallback to newest
        return;
      }

      // Random selection (up to 3)
      const shuffled = [...old].sort(() => Math.random() - 0.5);
      resolve(shuffled.slice(0, 3));
    });
  });
}

function flattenBookmarks(nodes, results = []) {
  for (const node of nodes) {
    if (node.url) results.push(node);
    if (node.children) flattenBookmarks(node.children, results);
  }
  return results;
}

// ══════════════════════════════════════════════════════
// STORAGE HELPERS
// ══════════════════════════════════════════════════════
function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ['reminderInterval', 'remindersEnabled'],
      result => resolve({
        reminderInterval:  result.reminderInterval || 24,
        remindersEnabled:  result.remindersEnabled !== false, // default true
      })
    );
  });
}

// ══════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}
