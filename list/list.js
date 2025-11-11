import { html, reactive } from '../arrow.mjs'
import { formatDate, timeAgo } from '../date.js';
import { showToast } from "../toast.js";
import Item from '../components/Item.js';
import Svg from '../components/Svg.js';

const data = reactive({
  feedId: null,
  groupUnreadItemsByFeedId: {},
  openMenuFeedId: null,
  feeds: [],
  feed: null,
  items: [],
  rect: null,
  draggedIndex: null,
  dragOverIndex: null
})

const domain = (url) => new URL(url).hostname;

html`<div class="feed">
  ${() => data.feed && html`
    <div class="feed-title">
     <span>${data.feed.alt || data.feed.title}</span>
    </div>
  <div class="feed-url">
    <a href="${data.feed.url}" target="_blank">
      <img src="https://www.google.com/s2/favicons?domain=${domain(data.feed.url)}" height="16">
      <span class="url">${data.feed.url}</span>
    </a>
</div>
  <div>
    <div class="feed-meta">
     <span>items: <b>${() => data.items.length}</b></span> 
     <span>unread: <b>${() => data.groupUnreadItemsByFeedId[data.feedId] || 0}</b></span>
     <span>last update: <b>${formatDate(data.feed?.lastItemDate)}</b></span>
     <span>last check: <b>${formatDate(data.feed?.lastChecked)}</b></span>
    </div>
  </div>`}
   </div>`(document.querySelector('.feed-wrapper'));

html`<div class="feeds">
    ${() => data.feeds.map((feed, index) =>
  html`<div 
      class="${() => feed.id === data.feedId ? 'feed-item active' : 'feed-item'}" 
      data-id="${feed.id}"
      @dragenter="${handleDragEnter(index)}"
      @dragover="${handleDragOver}"
      @dragleave="${handleDragLeave}"
      @drop="${handleDrop(index)}">
     <div class="drag-handle"
       draggable="true"
       @dragstart="${handleDragStart(index)}"
       @dragend="${handleDragEnd}">⋮⋮</div>
      <div class="feed"  @click="${() => displayItems(feed.id)}">
      <div class="unread" style="${() => !data.groupUnreadItemsByFeedId[feed.id] ? 'display: none' : ''}">${() => data.groupUnreadItemsByFeedId[feed.id] ? data.groupUnreadItemsByFeedId[feed.id] : ''}</div>
      <div class="title">
        <img src="https://www.google.com/s2/favicons?domain=${domain(feed.url)}" height="16">
        <span>${feed.alt || feed.title}</span>
      </div>
        <div class="url">${feed.url}</div>
      </div>
      <div class="feed-menu-btn" @click="${(e) => openMenu(e, feed.id)}">⋮</div>
    </div>`)}
  </div>`(document.querySelector('.feeds-wrapper'));

html`${() => data.openMenuFeedId && html`<div class="feed-menu" style=" bottom: ${document.body.clientHeight - data.rect.y - data.rect.height + 10}px;">
        <button @click="${() => editFeed(data.openMenuFeedId)}">${Svg('edit')} <span>Edit Feed Name</span></button>
        <button @click="${() => clearFeed(data.openMenuFeedId)}">${Svg('delete')} <span>Delete Feed Items</span></button>
         ${() => data.groupUnreadItemsByFeedId[data.openMenuFeedId] ? html`<button @click = "${() => markFeedAsRead(data.openMenuFeedId)}" >${Svg('read')} <span>Mark as Read</span></button>` : ''} 
        <button @click="${() => deleteFeed(data.openMenuFeedId)}">${Svg('remove')} <span>Delete Feed</span></button>
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
    if (data.feedId === id) {
      data.feed = null;
      data.items = [];
    }
  } else {
    showToast(error, 'error');
  }
}

async function clearFeed(id) {
  const { success, error } = await chrome.runtime.sendMessage({ type: 'clearFeed', id });
  if (success) {
    showToast('Feed cleared successfully', 'success');
    if (data.feedId === id) {
      data.items = [];
    }
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

// drag and drop
function swapFeeds(fromIndex, toIndex) {
  const newFeeds = [...data.feeds];
  const [movedFeed] = newFeeds.splice(fromIndex, 1);
  newFeeds.splice(toIndex, 0, movedFeed);
  data.feeds = newFeeds;
  chrome.storage.local.set({ feeds: newFeeds });
}

const handleDragStart = (index) => (e) => {
  data.draggedIndex = index;
  const feedElement = e.target.closest('.feed-item');
  feedElement.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setDragImage(feedElement, 10, 10);
  e.dataTransfer.setData('text/plain', index);
};

const handleDragEnd = (e) => {
  const feedElement = e.target.closest('.feed-item');
  feedElement.classList.remove('dragging');

  if (data.draggedIndex !== null && data.dragOverIndex !== null && data.draggedIndex !== data.dragOverIndex) {
    swapFeeds(data.draggedIndex, data.dragOverIndex);
  }

  data.draggedIndex = null;
  data.dragOverIndex = null;

  document.querySelectorAll('.feed-item').forEach(el => {
    el.classList.remove('drag-over');
  });
};

const handleDragEnter = (index) => (e) => {
  e.preventDefault();
  if (data.draggedIndex !== index) {
    data.dragOverIndex = index;
    e.currentTarget.classList.add('drag-over');
  }
};

const handleDragOver = (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
};

const handleDragLeave = (e) => {
  e.currentTarget.classList.remove('drag-over');
};

const handleDrop = () => (e) => {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
};
// end drag and drop 


html`<div> ${() => data.items.map(item => Item(item, data))}
    </div>`(document.querySelector('.items'));

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
    data.items = [];
    data.groupUnreadItemsByFeedId = {};
  } else {
    showToast(error || 'Error deleting all items', 'error');
  }
});

document.querySelector('.mark-all-read').addEventListener('click', async () => {
  const { success, error } = await chrome.runtime.sendMessage({ type: 'markAllAsRead' });
  if (success) {
    showToast('All items marked as read successfully', 'success');
    data.groupUnreadItemsByFeedId = {};
  } else {
    showToast(error || 'Error marking all items as read', 'error');
  }
})

document.querySelector('.options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});



