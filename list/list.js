import { html, reactive } from '../arrow.mjs'
import { formatDate, timeAgo } from '../date.js';
import { showToast } from "../toast.js";

const data = reactive({
  feedId: null,
  groupUnreadItemsByFeedId: {},
  openMenuFeedId: null,
  feeds: [],
  feed: null,
  items: [],
  rect: null
})

const domain = (url) => new URL(url).hostname;

html`<div class="feed-title">
  ${() => data.feed && html`
    <img src="https://www.google.com/s2/favicons?domain=${domain(data.feed.url)}" height="16">
    <span>${data.feed.alt || data.feed.title}</span>`}
   </div>`(document.querySelector('.feed-wrapper'));

html`<div class="feeds">
    ${() => data.feeds.map(feed =>
  html`<div class="${() => feed.id === data.feedId ? 'feed-item active' : 'feed-item'}" data-id="${feed.id}">
      <div class="feed"  @click="${() => displayItems(feed.id)}">
        <div class="unread">${() => data.groupUnreadItemsByFeedId[feed.id] ? data.groupUnreadItemsByFeedId[feed.id] : ''}</div>
      <div class="title">
        <img src="https://www.google.com/s2/favicons?domain=${domain(feed.url)}" height="16">
        <span>${feed.alt || feed.title}</span>
      </div>
        <div class="url">${feed.url}</div>
      </div>
      <div class="feed-menu-btn" @click="${(e) => openMenu(e, feed.id)}">⋮</div>
    </div>`)}
  </div>`(document.querySelector('.feeds-wrapper'));

html`${() => data.openMenuFeedId && html`<div class="feed-menu" style="left: 150px;  bottom: ${document.body.clientHeight - data.rect.y - data.rect.height +10}px;">
        <button @click="${() => editFeed(data.openMenuFeedId)}">✏️ Edit Feed Name</button>
        <button @click="${() => clearFeed(data.openMenuFeedId)}">🧹 Clear Feed</button>
         ${() => data.groupUnreadItemsByFeedId[data.openMenuFeedId] && html`<button @click = "${() => markFeedAsRead(data.openMenuFeedId)}" >👀 Mark Feed as Read</button>`} 
        <button @click="${() => deleteFeed(data.openMenuFeedId)}">❌ Delete Feed</button>
      </div>`}`(document.body);

document.addEventListener('click', (e) => {
  if (!e.target.classList.contains('feed-menu-btn') && data.openMenuFeedId) {
    data.openMenuFeedId = null;
  }
})

function openMenu(e, id) {
  data.rect = e.target.parentElement.getBoundingClientRect();
  data.openMenuFeedId = id;
}

async function deleteFeed(id) {
  if (!confirm('Are you sure you want to delete this feed?')) return;
  data.groupUnreadItemsByFeedId[id] = 0;
  const { success, error } = await chrome.runtime.sendMessage({ type: 'deleteFeed', id });
  if (success) {
    showToast('Feed deleted successfully', 'success');
    data.feeds = data.feeds.filter(f => f.id !== id);
  } else {
    showToast(error, 'error');
  }
}

async function clearFeed(id) {
  const { success, error } = await chrome.runtime.sendMessage({ type: 'clearFeed', id });
  if (success) {
    showToast('Feed cleared successfully', 'success');
    document.querySelector('.items').innerHTML = '';
    data.groupUnreadItemsByFeedId[id] = 0;
  } else {
    showToast(error || 'Error clearing feed', 'error');
  }
}

async function editFeed(id) {
  const feed = data.feeds.find(f => f.id === id);
  const promptResult = prompt('Enter a new title for the feed:', feed.alt || feed.title);
  if (promptResult) {
    const updatedFeeds = data.feeds.map(f => f.id === feed.id ? { ...f, alt: promptResult } : f);
    await chrome.storage.local.set({ feeds: updatedFeeds });
    data.feeds = updatedFeeds;
    showToast('Feed title updated successfully', 'success');
  }
}

async function markFeedAsRead(id) {
  const { success, error } = await chrome.runtime.sendMessage({ type: 'markFeedAsRead', id });
  if (success) {
    showToast('Feed marked as read successfully', 'success');
    data.groupUnreadItemsByFeedId[id] = 0;
  } else {
    showToast(error || 'Error marking feed as read', 'error');
  }
}

function renderMedia(media) {
  if (media.url.includes('youtube.com') || media.url.includes('youtu.be')) {
    const iframeVideoId = new URL(media.url).searchParams.get('v') || new URL(media.url).pathname.split('/').pop();

    return html`<iframe width="${media.width}" height="${media.height}" src="${`https://www.youtube.com/embed/${iframeVideoId}`}"
      title="YouTube video player" frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen>
          </iframe >`
  }

  if (!media.type || media.type?.startsWith("image/")) {
    return html`<img src="${media.url}" width="${media.width}" height="${media.height}" /> `;
  }

  if (media.type?.startsWith("video/")) {
    return html`<video controls width = "${media.width}" height = "${media.height}">
        <source src="${media.url}" type="${media.type}" />
      </video>`;
  }

  if (media.type?.startsWith("audio/")) {
    return html`<audio controls >
        <source src="${media.url}" type="${media.type}" />
      </audio > `;
  }

  return null;
}

html`<div>
        ${() => data.items.map(item =>
  html`<div class="item ${item.isRead === 0 ? 'unread' : ''}" data-id="${item.id}" data-read="${item.isRead}">
        <div class="item-details">
         <div class="date">${formatDate(item.dateTs)}</div>
         <div class="actions">
          <div class="delete" @click="${() => deleteItem(item.id)}">
           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><!-- Icon from Tabler Icons by Paweł Kuna - https://github.com/tabler/tabler-icons/blob/master/LICENSE --><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>
          </div>
         </div>
        </div>
        <a class="item-title" href="${item.link}" target="_blank">${item.title}</a>
        ${item.media ? html`<div class="media">${renderMedia(item.media)}</div>` : ''}
        <div class="description">${item.description || ''}</div>
        <div class="content">${item.content || ''}</div>
      </div>
    `)}
    </div>`(document.querySelector('.items'));

function deleteItem(id) {
  const item = document.querySelector(`.item[data-id="${id}"]`);
  item.remove();
  chrome.runtime.sendMessage({ type: 'deleteItems', ids: [id] });
}

async function displayItems(feedId, itemId) {
  document.querySelector('.items').scrollIntoView();
  data.feed = feedId ? data.feeds.find(f => f.id === feedId) : null;
  data.feedId = feedId;
  if (itemId) {
    const { data: item } = await chrome.runtime.sendMessage({ type: 'getItems', filters: { id: itemId } });
    data.items = [item];
    chrome.storage.local.set({ selectedItem: null });
  } else {
    const { data: items } = await chrome.runtime.sendMessage({ type: 'getItems', filters: { feedId } });
    data.items = items.sort((a, b) => b.dateTs - a.dateTs);
  }

  let batch = [];
  let timeout;
  function markAsReadBatch(itemId) {
    if (!batch.includes(itemId)) {
      batch.push(itemId);
    }
    clearTimeout(timeout);
    timeout = setTimeout(sendBatch, 500);
  }

  function sendBatch() {
    chrome.runtime.sendMessage({ type: 'markItemsAsRead', ids: batch });
    if (data.groupUnreadItemsByFeedId[data.feedId]) {
      data.groupUnreadItemsByFeedId[data.feedId] -= batch.length;
    }
    batch = [];
  }
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const itemId = entry.target.dataset.id;
        markAsReadBatch(itemId);
        obs.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    threshold: 0
  });

  setTimeout(() => {
    document.querySelectorAll('.item').forEach(item => {
      if (item.dataset.read === '0') {
        observer.observe(item);
      }
    });
  }, 500);
}

document.addEventListener('DOMContentLoaded', async () => {
  const { feeds: allFeeds } = await chrome.storage.local.get({ feeds: [] });
  data.feeds = allFeeds;
  const { data: groupUnreadItemsByFeedId } = await chrome.runtime.sendMessage({ type: 'getUnreadItemsCountByFeeds' });
  data.groupUnreadItemsByFeedId = groupUnreadItemsByFeedId;
  await chrome.storage.local.get({ selectedItem: null }).then(({ selectedItem }) => {
    if (selectedItem) {
      const { id, feedId } = selectedItem;
      displayItems(feedId, id);
    }
  });
});

document.querySelector('.refresh').addEventListener('click', async () => {
  if (!navigator.onLine) {
    showToast('You are offline', 'error');
    return;
  }
  const refreshButton = document.querySelector('.refresh');
  refreshButton.classList.add('loading');
  const { success, error } = await chrome.runtime.sendMessage({ type: 'fetchFeeds' });
  if (success) {
    showToast('Feeds refreshed successfully', 'success');
    const { data: groupUnreadItemsByFeedId } = await chrome.runtime.sendMessage({ type: 'getUnreadItemsCountByFeeds' });
    data.groupUnreadItemsByFeedId = groupUnreadItemsByFeedId;
    if (data.feedId) {
      displayItems(data.feedId);
    }
  } else {
    showToast(error || 'Error refreshing feeds', 'error');
  }
  refreshButton.classList.remove('loading');
});

document.querySelector('.delete-all').addEventListener('click', async () => {
  if (!confirm('Are you sure you want to delete all items?')) return;
  const { success, error } = await chrome.runtime.sendMessage({ type: 'deleteAllItems' });
  if (success) {
    showToast('All items deleted successfully', 'success');
    document.querySelector('.items').innerHTML = '';
    data.groupUnreadItemsByFeedId = {};
  } else {
    showToast(error || 'Error deleting all items', 'error');
  }
});

document.querySelector('.options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});



