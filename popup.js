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
  currentTab: 'all',
  searchQuery: '',
  rediscoverPool: [],
  guideSelectedIds: new Set(),
};

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
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
// Removed API key loading since we are local-only

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
    banner.style.display = 'flex';
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
// AI – ORGANIZE BOOKMARKS (LOCAL)
// ══════════════════════════════════════════════════════
async function organizeWithAI() {
  if (State.allBookmarks.length === 0) {
    showToast('No bookmarks to organize');
    return;
  }

  // Check if we have enough bookmarks for meaningful clustering
  const count = State.allBookmarks.length;
  showLoading(`Analyzing ${count} bookmarks locally...`);

  // Prepare data - we can send all or slice. Local processing is fast.
  // 500 is a safe batch.
  const sample = State.allBookmarks.slice(0, 500).map(b => ({
    id: b.id,
    title: b.title,
    url: b.url,
  }));

  // Send to background script for processing
  chrome.runtime.sendMessage({ 
    action: 'organizeBookmarks', 
    bookmarks: sample 
  }, (response) => {
    hideLoading();

    if (chrome.runtime.lastError) {
      console.error('Runtime error:', chrome.runtime.lastError);
      showToast('Error: ' + chrome.runtime.lastError.message);
      return;
    }

    if (response && response.success) {
      const grouped = response.data; // { "Topic": [ {id, title...} ] }
      
      // Re-map to full bookmark objects
      const topicsWithData = {};
      let total = 0;
      
      for (const [topic, items] of Object.entries(grouped)) {
        // Enforce a minimum cluster size of 2 to avoid noise
        if (items.length < 2) continue;

        const fullItems = items
          .map(i => State.allBookmarks.find(b => b.id === i.id))
          .filter(Boolean);
            
        if (fullItems.length > 0) {
          topicsWithData[topic] = fullItems;
          total += fullItems.length;
        }
      }

      // Handle orphans or small clusters if you want, or just ignore.
      
      saveTopics(topicsWithData);
      showToast(`✓ Organized ${total} bookmarks into ${Object.keys(topicsWithData).length} topics`);
      renderTopicsTab();
      updateStats();
    } else {
      showToast('Organization failed. See console.');
      console.error('Cluster error:', response?.error);
    }
  });
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
  const selectedBookmarks = State.allBookmarks
    .filter(b => State.guideSelectedIds.has(b.id));

  if (selectedBookmarks.length < 2) {
    showToast('Select at least 2 bookmarks');
    return;
  }

  closeModal('guide-modal');
  showLoading('Creating guide...');

  // Simple local guide generation (No LLM)
  const guide = {
    id: Date.now().toString(),
    title: `Guide: ${selectedBookmarks[0].title.slice(0, 20)}... and more`,
    overview: `A collection of ${selectedBookmarks.length} resources curated from your bookmarks.`,
    tags: ["collection"],
    sections: selectedBookmarks.map(b => ({
      heading: b.title,
      description: "",
      url: b.url,
      keyPoints: []
    })),
    createdAt: Date.now(),
    bookmarkCount: selectedBookmarks.length,
    takeaways: [],
    learningPath: "Review these items in order."
  };
  
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
}

function formatGuideToHTML(guide, bookmarks) {
  let html = `<h1>${escapeHtml(guide.title)}</h1>`;
  html += `<div class="guide-overview">${escapeHtml(guide.overview)}</div>`;

  html += `<h2>📚 Resources</h2>`;
  (guide.sections || []).forEach(section => {
    html += `
      <div class="section-block">
        <h3>${escapeHtml(section.heading)}</h3>
        <a class="guide-link" href="${escapeHtml(section.url)}" target="_blank">↗ Open resource</a>
      </div>
    `;
  });

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

// AI Functions Removed - Local Only
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
