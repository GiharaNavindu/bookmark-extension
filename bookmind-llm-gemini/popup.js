/**
 * BookMind – popup.js
 * Main controller for the extension popup.
 * Handles: bookmarks loading, AI organization, guide creation, rediscover.
 */

// ══════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════
const State = {
  allBookmarks: [],        // flat list of all bookmarks
  topics: {},              // { topicName: [bookmark, ...] }
  guides: [],              // saved guides
  apiKey: '',
  aiProvider: 'gemini',
  currentTab: 'all',
  searchQuery: '',
  rediscoverPool: [],
  guideSelectedIds: new Set(),
};

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadBookmarks();
  await loadTopics();
  await loadGuides();

  renderCurrentTab();
  updateStats();
  bindEvents();
  buildRediscoverPool();
});

// ══════════════════════════════════════════════════════
// SETTINGS / STORAGE HELPERS
// ══════════════════════════════════════════════════════
async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['apiKey'], result => {
      State.apiKey = result.apiKey || '';
      State.aiProvider = 'gemini';
      resolve();
    });
  });
}

async function loadTopics() {
  return new Promise(resolve => {
    chrome.storage.local.get(['topics'], result => {
      State.topics = result.topics || {};
      resolve();
    });
  });
}

async function loadGuides() {
  return new Promise(resolve => {
    chrome.storage.local.get(['guides'], result => {
      State.guides = result.guides || [];
      resolve();
    });
  });
}

function saveTopics(topics) {
  State.topics = topics;
  chrome.storage.local.set({ topics });
}

function saveGuides(guides) {
  State.guides = guides;
  chrome.storage.local.set({ guides });
}

// ══════════════════════════════════════════════════════
// BOOKMARKS
// ══════════════════════════════════════════════════════
async function loadBookmarks() {
  return new Promise(resolve => {
    chrome.bookmarks.getTree(tree => {
      State.allBookmarks = flattenBookmarks(tree);
      resolve();
    });
  });
}

function flattenBookmarks(nodes, results = []) {
  for (const node of nodes) {
    if (node.url) {
      results.push({
        id:       node.id,
        title:    node.title || node.url,
        url:      node.url,
        dateAdded: node.dateAdded || Date.now(),
      });
    }
    if (node.children) flattenBookmarks(node.children, results);
  }
  return results;
}

function getBookmarkTopic(id) {
  for (const [topic, items] of Object.entries(State.topics)) {
    if (items.some(b => b.id === id)) return topic;
  }
  return null;
}

function getFaviconUrl(url) {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${origin}&sz=32`;
  } catch { return null; }
}

function formatDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function buildRediscoverPool() {
  // Bookmarks older than 14 days, randomly sampled
  const twoWeeks = 14 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - twoWeeks;
  const old = State.allBookmarks.filter(b => b.dateAdded < cutoff);
  // shuffle
  for (let i = old.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [old[i], old[j]] = [old[j], old[i]];
  }
  State.rediscoverPool = old.slice(0, 12);
}

// ══════════════════════════════════════════════════════
// RENDER – BOOKMARK CARD
// ══════════════════════════════════════════════════════
function createBookmarkCard(bm, opts = {}) {
  const card = document.createElement('div');
  card.className = 'bookmark-card' + (opts.selectable ? ' selectable' : '');
  card.dataset.id = bm.id;

  const topic = getBookmarkTopic(bm.id);
  const favicon = getFaviconUrl(bm.url);
  let domain = '';
  try { domain = new URL(bm.url).hostname.replace('www.', ''); } catch {}

  // 1. Checkbox
  if (opts.selectable) {
    const cb = document.createElement('div');
    cb.className = 'bm-checkbox';
    card.appendChild(cb);
  }

  // 2. Favicon
  if (favicon) {
    const img = document.createElement('img');
    img.className = 'bookmark-favicon';
    img.loading = 'lazy';
    img.src = favicon;
    
    // safe onError handler
    img.onerror = () => { img.style.display = 'none'; };
    
    card.appendChild(img);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'favicon-fallback';
    fallback.textContent = domain.charAt(0).toUpperCase();
    card.appendChild(fallback);
  }

  // 3. Body
  const body = document.createElement('div');
  body.className = 'bookmark-body';
  
  const titleDiv = document.createElement('div');
  titleDiv.className = 'bookmark-title';
  titleDiv.textContent = bm.title;
  body.appendChild(titleDiv);

  const urlDiv = document.createElement('div');
  urlDiv.className = 'bookmark-url';
  urlDiv.textContent = domain;
  body.appendChild(urlDiv);

  const metaDiv = document.createElement('div');
  metaDiv.className = 'bookmark-meta';
  
  if (topic) {
    const topicSpan = document.createElement('span');
    topicSpan.className = 'topic-tag';
    topicSpan.textContent = topic;
    metaDiv.appendChild(topicSpan);
  }
  
  const dateSpan = document.createElement('span');
  dateSpan.className = 'bookmark-date';
  dateSpan.textContent = formatDate(bm.dateAdded);
  metaDiv.appendChild(dateSpan);
  
  body.appendChild(metaDiv);
  card.appendChild(body);

  // 4. Action Button
  if (!opts.selectable) {
    const btn = document.createElement('button');
    btn.className = 'bookmark-open';
    btn.title = 'Open';
    btn.textContent = '↗';
    
    // Add event listener directly to button
    btn.addEventListener('click', e => {
      e.stopPropagation();
      chrome.tabs.create({ url: bm.url });
    });
    
    card.appendChild(btn);
  }

  // 5. Card Click Events
  if (opts.selectable) {
    card.addEventListener('click', () => toggleGuideSelection(card, bm));
  } else {
    card.addEventListener('click', () => chrome.tabs.create({ url: bm.url }));
  }

  return card;
}

// ══════════════════════════════════════════════════════
// RENDER – ALL TAB
// ══════════════════════════════════════════════════════
function renderAllTab(query = '') {
  const list = document.getElementById('all-list');
  const empty = document.getElementById('all-empty');
  list.innerHTML = '';

  let items = State.allBookmarks;
  if (query) {
    const q = query.toLowerCase();
    items = items.filter(b =>
      b.title.toLowerCase().includes(q) ||
      b.url.toLowerCase().includes(q) ||
      (getBookmarkTopic(b.id) || '').toLowerCase().includes(q)
    );
  }

  if (items.length === 0) {
    empty.style.display = 'flex';
    list.style.display = 'none';
  } else {
    empty.style.display = 'none';
    list.style.display = 'flex';
    items.slice(0, 80).forEach(bm => list.appendChild(createBookmarkCard(bm)));
  }
}

// ══════════════════════════════════════════════════════
// RENDER – TOPICS TAB
// ══════════════════════════════════════════════════════
function renderTopicsTab() {
  const banner      = document.getElementById('topics-unorganized');
  const grid        = document.getElementById('topics-list');
  const empty       = document.getElementById('topics-empty');

  grid.innerHTML = '';
  const topicEntries = Object.entries(State.topics);

  if (topicEntries.length === 0) {
    if (!State.apiKey) {
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'flex';
    }
    empty.style.display = 'none';
  } else {
    banner.style.display = 'none';
    empty.style.display = 'none';

    const colors = ['var(--t1)','var(--t2)','var(--t3)','var(--t4)','var(--t5)','var(--t6)','var(--t7)','var(--t8)'];
    topicEntries.forEach(([name, items], idx) => {
      const cluster = document.createElement('div');
      cluster.className = 'topic-cluster';
      cluster.innerHTML = `
        <div class="topic-cluster-header">
          <div class="topic-color-dot" style="background:${colors[idx % colors.length]}"></div>
          <span class="topic-cluster-name">${escapeHtml(name)}</span>
          <span class="topic-count">${items.length}</span>
          <span class="topic-chevron">▾</span>
        </div>
        <div class="topic-cluster-items">
          ${items.map(b => `
            <div class="topic-item" data-url="${escapeHtml(b.url)}">
              <span class="topic-item-title">${escapeHtml(b.title)}</span>
              <span class="topic-item-url">${escapeHtml(b.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 30))}…</span>
            </div>
          `).join('')}
        </div>
      `;
      cluster.querySelector('.topic-cluster-header').addEventListener('click', () => {
        cluster.classList.toggle('open');
      });
      cluster.querySelectorAll('.topic-item').forEach(item => {
        item.addEventListener('click', () => chrome.tabs.create({ url: item.dataset.url }));
      });
      grid.appendChild(cluster);
    });
  }
}

// ══════════════════════════════════════════════════════
// RENDER – GUIDES TAB
// ══════════════════════════════════════════════════════
function renderGuidesTab() {
  const list  = document.getElementById('guides-list');
  const empty = document.getElementById('guides-empty');
  list.innerHTML = '';

  if (State.guides.length === 0) {
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    State.guides.forEach((guide, idx) => {
      const card = document.createElement('div');
      card.className = 'guide-card';
      card.innerHTML = `
        <div class="guide-card-title">${escapeHtml(guide.title)}</div>
        <div class="guide-card-meta">
          <span>📖 ${guide.bookmarkCount} bookmark${guide.bookmarkCount !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>${formatDate(guide.createdAt)}</span>
        </div>
        <div class="guide-card-preview">${escapeHtml(guide.overview || '')}</div>
        <div class="guide-card-tags">
          ${(guide.tags || []).map(t => `<span class="topic-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <button class="guide-delete" data-idx="${idx}">✕ Delete</button>
      `;
      card.addEventListener('click', e => {
        if (!e.target.classList.contains('guide-delete')) openGuideView(guide);
      });
      card.querySelector('.guide-delete').addEventListener('click', e => {
        e.stopPropagation();
        deleteGuide(idx);
      });
      list.appendChild(card);
    });
  }
}

// ══════════════════════════════════════════════════════
// RENDER – REDISCOVER TAB
// ══════════════════════════════════════════════════════
function renderRediscoverTab() {
  const list = document.getElementById('rediscover-list');
  list.innerHTML = '';
  if (State.rediscoverPool.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⏳</div>
      <p>Save more bookmarks and come back to rediscover them!</p>
    </div>`;
    return;
  }
  State.rediscoverPool.forEach(bm => list.appendChild(createBookmarkCard(bm)));
}

// ══════════════════════════════════════════════════════
// RENDER CURRENT TAB
// ══════════════════════════════════════════════════════
function renderCurrentTab() {
  switch (State.currentTab) {
    case 'all':        renderAllTab(State.searchQuery); break;
    case 'topics':     renderTopicsTab(); break;
    case 'guides':     renderGuidesTab(); break;
    case 'rediscover': renderRediscoverTab(); break;
  }
}

// ══════════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════════
function updateStats() {
  document.getElementById('stat-total').textContent  = `${State.allBookmarks.length} bookmarks`;
  document.getElementById('stat-topics').textContent = `${Object.keys(State.topics).length} topics`;
  document.getElementById('stat-guides').textContent = `${State.guides.length} guides`;
}

// ══════════════════════════════════════════════════════
// AI – ORGANIZE BOOKMARKS
// ══════════════════════════════════════════════════════
async function organizeWithAI() {
  if (!State.apiKey) {
    showToast('⚠ Set your API key in Settings first');
    chrome.runtime.openOptionsPage();
    return;
  }
  if (State.allBookmarks.length === 0) {
    showToast('No bookmarks to organize');
    return;
  }

  showLoading('Analyzing your bookmarks with AI…');

  // Prepare bookmark data (limit to 200 for performance)
  const sample = State.allBookmarks.slice(0, 200).map(b => ({
    id: b.id,
    title: b.title,
    url: b.url,
  }));

  const prompt = `You are a bookmark organizer. Given this list of browser bookmarks, group them into meaningful topic clusters (8–15 topics). 
Each topic should have a clear, concise name (2-4 words max).

Respond ONLY with valid JSON in this exact format:
{
  "topics": {
    "Topic Name": ["bookmark_id_1", "bookmark_id_2", ...],
    "Another Topic": ["bookmark_id_3", ...]
  }
}

Bookmarks:
${JSON.stringify(sample, null, 2)}`;

  try {
    const response = await callAI(prompt, 2000);
    const parsed = parseJsonResponse(response);

    if (!parsed.topics) throw new Error('Invalid AI response structure');

    // Convert id arrays back to bookmark objects
    const topicsWithData = {};
    for (const [topic, ids] of Object.entries(parsed.topics)) {
      const bookmarks = ids
        .map(id => State.allBookmarks.find(b => b.id === id))
        .filter(Boolean);
      if (bookmarks.length > 0) {
        topicsWithData[topic] = bookmarks;
      }
    }

    saveTopics(topicsWithData);
    hideLoading();
    showToast(`✓ Organized into ${Object.keys(topicsWithData).length} topics`);
    renderTopicsTab();
    updateStats();
  } catch (err) {
    hideLoading();
    if (isGeminiQuotaError(err)) {
      showToast('Gemini quota exceeded. Check billing/limits and retry.');
    } else {
      showToast('Error organizing bookmarks. Check API key/model access.');
    }
    console.error('AI organize error:', err);
  }
}

// ══════════════════════════════════════════════════════
// GUIDE BUILDER
// ══════════════════════════════════════════════════════
function openGuideModal() {
  State.guideSelectedIds.clear();
  const listEl = document.getElementById('guide-bookmark-list');
  listEl.innerHTML = '';

  const items = State.allBookmarks.slice(0, 150);
  items.forEach(bm => listEl.appendChild(createBookmarkCard(bm, { selectable: true })));

  updateGuideCounter();
  document.getElementById('guide-modal').style.display = 'flex';
}

function toggleGuideSelection(card, bm) {
  if (State.guideSelectedIds.has(bm.id)) {
    State.guideSelectedIds.delete(bm.id);
    card.classList.remove('selected');
    card.querySelector('.bm-checkbox').textContent = '';
  } else {
    if (State.guideSelectedIds.size >= 15) {
      showToast('Max 15 bookmarks per guide');
      return;
    }
    State.guideSelectedIds.add(bm.id);
    card.classList.add('selected');
    card.querySelector('.bm-checkbox').textContent = '✓';
  }
  updateGuideCounter();
}

function updateGuideCounter() {
  const count = State.guideSelectedIds.size;
  document.getElementById('guide-selected-count').textContent = `${count} selected`;
  document.getElementById('btn-generate-guide').disabled = count < 2;
}

async function generateGuide() {
  if (!State.apiKey) {
    showToast('⚠ Set your API key in Settings first');
    return;
  }
  const selectedBookmarks = State.allBookmarks
    .filter(b => State.guideSelectedIds.has(b.id));

  if (selectedBookmarks.length < 2) {
    showToast('Select at least 2 bookmarks');
    return;
  }

  closeModal('guide-modal');
  showLoading('Generating your guide with AI…');

  const bookmarkList = selectedBookmarks.map(b => `- Title: ${b.title}\n  URL: ${b.url}`).join('\n');

  const prompt = `You are a knowledgeable learning guide creator. Given these bookmarked web pages, create a comprehensive, structured learning guide that helps someone understand the topic deeply.

Bookmarks:
${bookmarkList}

Create a guide in this EXACT JSON format:
{
  "title": "A compelling guide title (10 words max)",
  "overview": "2-3 sentence overview of what this guide covers",
  "tags": ["tag1", "tag2", "tag3"],
  "sections": [
    {
      "heading": "Section heading",
      "description": "What this resource covers and why it's important",
      "url": "the exact URL from the bookmarks",
      "keyPoints": ["point 1", "point 2", "point 3"]
    }
  ],
  "takeaways": ["key takeaway 1", "key takeaway 2", "key takeaway 3", "key takeaway 4"],
  "learningPath": "Suggested order and approach for going through these resources (2-3 sentences)"
}

Respond ONLY with valid JSON. No markdown, no extra text.`;

  try {
    const response = await callAI(prompt, 1500);
    const guide = parseJsonResponse(response);

    guide.id          = Date.now().toString();
    guide.createdAt   = Date.now();
    guide.bookmarkCount = selectedBookmarks.length;
    guide.rawMarkdown = formatGuideToHTML(guide, selectedBookmarks);

    const guides = [guide, ...State.guides];
    saveGuides(guides);

    hideLoading();
    updateStats();
    renderGuidesTab();
    switchTab('guides');
    showToast('✓ Guide created!');

    // Open guide immediately
    setTimeout(() => openGuideView(guide), 300);
  } catch (err) {
    hideLoading();
    if (isGeminiQuotaError(err)) {
      showToast('Gemini quota exceeded. Check billing/limits and retry.');
    } else {
      showToast('Error generating guide. Try again.');
    }
    console.error('Guide generation error:', err);
  }
}

function formatGuideToHTML(guide, bookmarks) {
  let html = `<h1>${escapeHtml(guide.title)}</h1>`;
  html += `<div class="guide-overview">${escapeHtml(guide.overview)}</div>`;

  html += `<h2>📚 Resources</h2>`;
  (guide.sections || []).forEach(section => {
    html += `
      <div class="section-block">
        <h3>${escapeHtml(section.heading)}</h3>
        <p>${escapeHtml(section.description)}</p>
        <ul>${(section.keyPoints || []).map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
        <a class="guide-link" href="${escapeHtml(section.url)}" target="_blank">↗ Open resource</a>
      </div>
    `;
  });

  if (guide.learningPath) {
    html += `<h2>🗺 Learning Path</h2><p>${escapeHtml(guide.learningPath)}</p>`;
  }

  if (guide.takeaways?.length) {
    html += `
      <div class="key-takeaways">
        <h2>✦ Key Takeaways</h2>
        <ul>${guide.takeaways.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
      </div>
    `;
  }

  return html;
}

function openGuideView(guide) {
  document.getElementById('guide-view-title').textContent = guide.title;
  document.getElementById('guide-view-body').innerHTML = guide.rawMarkdown || '<p>No content</p>';
  document.getElementById('guide-view-modal').style.display = 'flex';

  // Make links open in new tab
  document.querySelectorAll('#guide-view-body a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      chrome.tabs.create({ url: a.href });
    });
  });
}

function deleteGuide(idx) {
  const guides = [...State.guides];
  guides.splice(idx, 1);
  saveGuides(guides);
  renderGuidesTab();
  updateStats();
  showToast('Guide deleted');
}

// ══════════════════════════════════════════════════════
// AI HELPER
// ══════════════════════════════════════════════════════
async function callAI(prompt, maxTokens = 1000) {
  return callGemini(prompt, maxTokens);
}

let geminiModelsCache = null;

async function callGemini(prompt, maxTokens) {
  const modelsToTry = await getGeminiModelsToTry();

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const modelPath = model.startsWith('models/') ? model : `models/${model}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${State.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.2,
            responseMimeType: 'application/json',
          }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API Error ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return cleanAIOutput(text);

    } catch (err) {
      console.warn(`Gemini model ${model} failed:`, err.message);
      lastError = err;
      if (isGeminiQuotaError(err)) break;
    }
  }

  throw lastError || new Error('All Gemini models failed');
}

async function getGeminiModelsToTry() {
  if (geminiModelsCache) return geminiModelsCache;

  const preferredOrder = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];

  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${State.apiKey}`;
  const listResp = await fetch(listUrl);

  if (!listResp.ok) {
    const errData = await listResp.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gemini model listing failed (${listResp.status})`);
  }

  const data = await listResp.json();
  const models = (data.models || [])
    .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map(m => (m.name || '').replace(/^models\//, ''))
    .filter(Boolean);

  if (models.length === 0) {
    throw new Error('No Gemini models with generateContent support were returned for this API key/project.');
  }

  const ordered = [
    ...preferredOrder.filter(name => models.includes(name)),
    ...models.filter(name => !preferredOrder.includes(name)),
  ];

  geminiModelsCache = Array.from(new Set(ordered));
  return geminiModelsCache;
}

function cleanAIOutput(text) {
  // Strip markdown code fences if present
  return text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
}

function parseJsonResponse(text) {
  const cleaned = cleanAIOutput(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Model returned non-JSON output.');
  }
}

function isGeminiQuotaError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('quota exceeded') || msg.includes('rate limit') || msg.includes('429');
}


// ══════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════
function bindEvents() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Search
  const searchInput = document.getElementById('search-input');
  const clearBtn    = document.getElementById('btn-clear-search');

  searchInput.addEventListener('input', () => {
    State.searchQuery = searchInput.value.trim();
    clearBtn.style.display = State.searchQuery ? 'block' : 'none';
    if (State.currentTab === 'all') renderAllTab(State.searchQuery);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    State.searchQuery = '';
    clearBtn.style.display = 'none';
    renderAllTab('');
  });

  // Header buttons
  document.getElementById('btn-organize').addEventListener('click', organizeWithAI);
  document.getElementById('btn-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

  // Topics organize button
  document.getElementById('btn-run-organize').addEventListener('click', organizeWithAI);

  // Guide builder
  document.getElementById('btn-new-guide').addEventListener('click', openGuideModal);
  document.getElementById('modal-close').addEventListener('click', () => closeModal('guide-modal'));
  document.getElementById('btn-generate-guide').addEventListener('click', generateGuide);

  // Guide view
  document.getElementById('guide-view-close').addEventListener('click', () => closeModal('guide-view-modal'));

  // Rediscover shuffle
  document.getElementById('btn-shuffle').addEventListener('click', () => {
    buildRediscoverPool();
    renderRediscoverTab();
  });

  // Close modal on overlay click
  document.getElementById('guide-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal('guide-modal');
  });
  document.getElementById('guide-view-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal('guide-view-modal');
  });
}

function switchTab(tab) {
  State.currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  renderCurrentTab();
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// ══════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════
function showLoading(msg = 'Processing…') {
  document.getElementById('loading-msg').textContent = msg;
  document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
