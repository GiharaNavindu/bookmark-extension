# 📚 BookMind – Smart Bookmark Manager

> AI-powered Chrome extension that organizes bookmarks by topic, reminds you of forgotten ones, and creates learning guides.

---

## Features

| Feature             | Description                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| **AI Organization** | Automatically clusters all your bookmarks into meaningful topic groups |
| **Guide Builder**   | Select any bookmarks → AI generates a structured learning guide        |
| **Smart Reminders** | Background notifications surface bookmarks you've forgotten            |
| **Rediscover**      | Randomly resurfaces old bookmarks you saved but never revisited        |
| **Search**          | Instant search across titles, URLs, and AI-assigned topics             |

---

## Installation

### Step 1 – Unzip the extension

Extract the `bookmind-extension/` folder to a permanent location on your computer  
_(Do NOT delete this folder — Chrome loads the extension from it)_

### Step 2 – Load in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the `bookmind-extension/` folder
5. BookMind appears in your extensions bar

### Step 3 – Pin the extension

Click the Extensions puzzle icon → Click the pin next to **BookMind**

### Step 4 – Set your API Key

1. Click the BookMind icon
2. Click the Settings icon (top-right of popup)
3. Paste your **Anthropic API key** (get one free at [console.anthropic.com](https://console.anthropic.com))
4. Click **Save Settings**

---

## How to Use

### Organize Bookmarks with AI
1. Open BookMind popup
2. Click the **✦ star icon** in the header (or go to Topics tab → "Organize with AI")
3. Wait ~10-20 seconds while AI analyzes your bookmarks
4. Your bookmarks are now grouped into topics!

### Create a Learning Guide
1. Go to the **Guides** tab
2. Click **+ Create Guide**
3. Check the bookmarks you want to include (2–15 recommended)
4. Click **✦ Generate Guide**
5. AI creates a structured guide with sections, key points, and takeaways

### Rediscover Forgotten Bookmarks
- Click the **Rediscover** tab to see bookmarks older than 2 weeks
- Click **↺ Shuffle** to get a fresh random set
- Bookmark reminders will also notify you in the background

### Search
- Use the search bar (top of popup) to filter by title, domain, or topic

---

## Settings Reference

| Setting | Description |
|--------|-------------|
| **API Key** | Your Anthropic API key (stored locally, never sent to any server other than Anthropic) |
| **Enable reminders** | Toggle background bookmark reminders on/off |
| **Reminder frequency** | How often to receive reminder notifications (6h – weekly) |
| **Guide style** | Comprehensive / Concise / Technical / Beginner-friendly |
| **Guide language** | Language for AI-generated guide text |

