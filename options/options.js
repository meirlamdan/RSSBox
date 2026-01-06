// Theme management
import { getTheme, setTheme } from '../shared/theme.js';
import { showToast } from '../toast.js';

const themeSelect = document.querySelector('#themeSelect');
const savedTheme = await getTheme();
themeSelect.value = savedTheme;

themeSelect.addEventListener('change', async () => {
  await setTheme(themeSelect.value);
});

// Delete old items settings
const deleteOldItemsInput = document.querySelector('#deleteOldItems');
deleteOldItemsInput.value = (await chrome.storage.local.get({ deleteOldItemsIntervalDays: 30 })).deleteOldItemsIntervalDays;
deleteOldItemsInput.addEventListener('change', async () => {
  await chrome.storage.local.set({ deleteOldItemsIntervalDays: deleteOldItemsInput.value });
})

// Fetch feeds settings
const fetchFeedsInput = document.querySelector('#fetchFeeds');
fetchFeedsInput.value = (await chrome.storage.local.get({ fetchFeedsIntervalMinutes: 45 })).fetchFeedsIntervalMinutes;
fetchFeedsInput.addEventListener('change', async () => {
  await chrome.storage.local.set({ fetchFeedsIntervalMinutes: fetchFeedsInput.value });
})

// Version and update check
const version = document.querySelector('#version');
version.textContent = chrome.runtime.getManifest().version;
document.getElementById("checkUpdate").addEventListener("click", () => {
  const statusEl = document.querySelector("#status");
  statusEl.textContent = "Checking for updates...";

  chrome.runtime.requestUpdateCheck((status, details) => {
    if (status === "update_available") {
      statusEl.textContent = "New version found: " + details.version + " | Reloading...";
      setTimeout(() => chrome.runtime.reload(), 1000);
    } else if (status === "no_update") {
      statusEl.textContent = "No updates available (you already have the latest version).";
    } else if (status === "throttled") {
      statusEl.textContent = "You've checked too many times. Please try again later.";
    }
  });
});

// ===================
// Import/Export Logic
// ===================

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Export OPML
document.getElementById('exportOpml').addEventListener('click', async () => {
  const { feeds } = await chrome.storage.local.get({ feeds: [] });

  if (!feeds.length) {
    showToast('No feeds to export', 'error');
    return;
  }

  const outlines = feeds.map(feed => {
    const title = escapeXml(feed.alt || feed.title || feed.url);
    return `    <outline text="${title}" title="${title}" type="rss" xmlUrl="${escapeXml(feed.url)}"/>`;
  }).join('\n');

  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>RSSBox Feed Export</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>`;

  downloadFile(opml, 'rssbox-feeds.opml', 'application/xml');
  showToast(`Exported ${feeds.length} feed(s)`, 'success');
});

// Export JSON
document.getElementById('exportJson').addEventListener('click', async () => {
  const { feeds } = await chrome.storage.local.get({ feeds: [] });

  if (!feeds.length) {
    showToast('No feeds to export', 'error');
    return;
  }

  const backup = {
    version: 1,
    exportDate: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    feeds: feeds
  };

  const json = JSON.stringify(backup, null, 2);
  downloadFile(json, 'rssbox-backup.json', 'application/json');
  showToast(`Exported ${feeds.length} feed(s)`, 'success');
});

// Import: trigger file input
document.getElementById('importButton').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

function parseOpmlImport(content) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid OPML file');
  }

  const outlines = doc.querySelectorAll('outline[xmlUrl]');
  const feeds = [];

  outlines.forEach(outline => {
    const url = outline.getAttribute('xmlUrl');
    if (url) {
      feeds.push({
        url: url.trim(),
        title: outline.getAttribute('title') || outline.getAttribute('text') || url,
        alt: ''
      });
    }
  });

  return feeds;
}

function parseJsonImport(content) {
  const data = JSON.parse(content);

  let feedsArray;
  if (Array.isArray(data)) {
    feedsArray = data;
  } else if (data.feeds && Array.isArray(data.feeds)) {
    feedsArray = data.feeds;
  } else {
    throw new Error('Invalid JSON format');
  }

  return feedsArray.map(feed => {
    if (!feed.url) {
      throw new Error('Feed missing required URL');
    }
    return {
      url: feed.url,
      title: feed.title || feed.url,
      alt: feed.alt || '',
      lastChecked: feed.lastChecked,
      lastItemDate: feed.lastItemDate,
      etag: feed.etag,
      lastModified: feed.lastModified
    };
  });
}

async function importFeeds(importedFeeds) {
  if (!importedFeeds || !importedFeeds.length) {
    showToast('No feeds found in file', 'error');
    return;
  }

  const { feeds: existingFeeds } = await chrome.storage.local.get({ feeds: [] });
  const existingUrls = new Set(existingFeeds.map(f => f.url));

  let addedCount = 0;
  let skippedCount = 0;
  const newFeeds = [];

  for (const feed of importedFeeds) {
    if (existingUrls.has(feed.url)) {
      skippedCount++;
      continue;
    }

    newFeeds.push({
      url: feed.url,
      title: feed.title,
      alt: feed.alt || '',
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      ...(feed.lastChecked && { lastChecked: feed.lastChecked }),
      ...(feed.lastItemDate && { lastItemDate: feed.lastItemDate }),
      ...(feed.etag && { etag: feed.etag }),
      ...(feed.lastModified && { lastModified: feed.lastModified })
    });
    addedCount++;
    existingUrls.add(feed.url);
  }

  if (addedCount === 0) {
    showToast('All feeds already exist', 'error');
    return;
  }

  await chrome.storage.local.set({
    feeds: [...existingFeeds, ...newFeeds]
  });

  chrome.runtime.sendMessage({ type: 'subscribe' });

  let message = `Imported ${addedCount} feed(s)`;
  if (skippedCount > 0) {
    message += `, ${skippedCount} skipped`;
  }
  showToast(message, 'success');
}

// File input handler
document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const content = await file.text();
    const extension = file.name.split('.').pop().toLowerCase();

    let importedFeeds;
    if (extension === 'json') {
      importedFeeds = parseJsonImport(content);
    } else if (extension === 'opml' || extension === 'xml') {
      importedFeeds = parseOpmlImport(content);
    } else {
      // Auto-detect format
      if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        importedFeeds = parseJsonImport(content);
      } else {
        importedFeeds = parseOpmlImport(content);
      }
    }

    await importFeeds(importedFeeds);
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }

  e.target.value = '';
});
