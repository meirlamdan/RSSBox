import { html, reactive } from '../arrow.mjs'
import { showToast } from "../toast.js";
import Items from '../components/Items.js';
import Svg from '../components/Svg.js';
import HeaderFeed from '../components/HeaderFeed.js';
import Feeds from '../components/Feeds.js';


const data = reactive({
  feedId: null,
  groupUnreadItemsByFeedId: {},
  openMenuFeedId: null,
  feeds: [],
  feed: null,
  items: [],
  rect: null,
  draggedIndex: null,
  dragOverIndex: null,
  lastItemDate: null,
  showAllItems: false,
  count: 0,
  unreadOnly: true,
  starredOnly: false
})

data.$on('feedId', (feedId) => {
  if (!feedId) return;
  document.querySelector('.all-items-btn').classList.remove('active');
  data.feed = data.feeds.find(f => f.id === feedId);
  data.showAllItems = false;
  data.lastItemDate = null;
  chrome.storage.local.set({ showAllItems: false });
  displayItems();
});

data.$on('showAllItems', (showAllItems) => {
  if (!showAllItems) return;
  data.feedId = null;
  data.feed = null;
  displayItems();
  chrome.storage.local.set({ showAllItems });
  document.querySelector('.all-items-btn').classList.add('active');
});

data.$on('unreadOnly', (unreadOnly) => {
  if (unreadOnly) {
    data.starredOnly = false;
  }
  data.lastItemDate = null;
  displayItems();
})

data.$on('starredOnly', (starredOnly) => {
  if (starredOnly) {
    data.unreadOnly = false;
  }
  data.lastItemDate = null;
  displayItems();
})

const { data: groupUnreadItemsByFeedId } = await chrome.runtime.sendMessage({ type: 'getUnreadItemsCountByFeeds' });
data.groupUnreadItemsByFeedId = groupUnreadItemsByFeedId;
const { feeds: allFeeds, selectedItem, showAllItems } = await chrome.storage.local.get({ feeds: [], selectedItem: null, showAllItems: false });
if (selectedItem) {
  const { id } = selectedItem;
  displayItems(id);
}
else if (showAllItems) {
  data.showAllItems = true;
}
data.feeds = allFeeds;

async function updateDataState() {
  const { feeds: updatedFeeds } = await chrome.storage.local.get({ feeds: [] });
  data.feeds = updatedFeeds
  if (data.feedId) {
    data.feed = data.feeds.find(f => f.id === data.feedId);
  }
  const { data: groupUnreadItemsByFeedId } = await chrome.runtime.sendMessage({ type: 'getUnreadItemsCountByFeeds' });
  data.groupUnreadItemsByFeedId = groupUnreadItemsByFeedId;
}

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === "newItems") {
    const { data: groupUnreadItemsByFeedId } = await chrome.runtime.sendMessage({ type: 'getUnreadItemsCountByFeeds' });
    data.groupUnreadItemsByFeedId = groupUnreadItemsByFeedId;
    if (data.feedId || (data.showAllItems && !data.lastItemDate)) {
      displayItems();
    }
  }
});

HeaderFeed(data);

Feeds(data);

Items(data);


html`${() => data.openMenuFeedId && html`<div class="feed-menu" style=" bottom: ${document.body.clientHeight - data.rect.y - data.rect.height + 50}px;">
        <button @click="${() => editFeed(data.openMenuFeedId)}">${Svg('edit')} <span>Edit Feed Name</span></button>
        <button @click="${() => refresh(data.openMenuFeedId)}">${Svg('refresh')} <span>Check for new items</span></button>
        <button @click="${() => clearFeed(data.openMenuFeedId)}">${Svg('delete')} <span>Delete Feed Items</span></button>
         ${() => data.groupUnreadItemsByFeedId[data.openMenuFeedId] ? html`<button @click = "${() => markFeedAsRead(data.openMenuFeedId)}" >${Svg('read')} <span>Mark as Read</span></button>` : ''} 
        <button @click="${() => deleteFeed(data.openMenuFeedId)}">${Svg('remove')} <span>Delete Feed</span></button>
      </div>`}`(document.body);

document.addEventListener('click', (e) => {
  if (!e.target.classList.contains('feed-menu-btn') && data.openMenuFeedId) {
    data.openMenuFeedId = null;
  }
})

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
    } else if (data.showAllItems) {
      const { data: count } = await chrome.runtime.sendMessage({ type: 'countItems', id });
      console.log({ count });
      data.count = count;
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
      data.items = data.items.filter(i => i.isStarred);
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

async function refresh(id) {
  if (!navigator.onLine) {
    showToast('You are offline', 'error');
    return;
  }
  const refreshButton = document.querySelector('.refresh');
  if (!id) {
    refreshButton.classList.add('loading');
  }

  const { success, error } = await chrome.runtime.sendMessage({ type: 'fetchFeeds', feedId: id || null });

  if (success) {
    showToast(`${id ? `Feed` : `All feeds`} refreshed successfully`, 'success');
    await updateDataState();
  } else {
    showToast(error || 'Error refreshing feed', 'error');
  }
  refreshButton.classList.remove('loading');
}

async function markFeedAsRead(id) {
  const { success, error } = await chrome.runtime.sendMessage({ type: 'markFeedAsRead', id });
  if (success) {
    showToast('Feed marked as read successfully', 'success');
    await updateDataState();
  } else {
    showToast(error || 'Error marking feed as read', 'error');
  }
}

async function displayItems(id) {
  data.items = [];
  if (!data.lastItemDate) {
    document.querySelector('.items').scrollIntoView();
  }
  if (id) {
    const { data: item } = await chrome.runtime.sendMessage({ type: 'getItems', filters: { id } });
    data.items = [item];
    chrome.storage.local.set({ selectedItem: null });
  } else if (data.feedId) {
    const { data: items } = await chrome.runtime.sendMessage({ type: 'getItems', filters: { feedId: data.feedId } });
    data.items = items.sort((a, b) => b.dateTs - a.dateTs);
  } else {
    chrome.storage.local.set({ showAllItems: true });
    const filters = {};
    if (data.lastItemDate) {
      filters.dateTs = data.lastItemDate;
    }
    if (data.unreadOnly) {
      filters.unreadOnly = true;
    }
    if (data.starredOnly) {
      filters.starredOnly = true;
    }
    const { data: itemsAndCount } = await chrome.runtime.sendMessage({ type: 'getItems', filters });
    const { items, count } = itemsAndCount;
    data.count = count;
    data.items = data.lastItemDate ? [...data.items, ...items] : items || [];
    if (items?.length === 20) {
      data.lastItemDate = data.items.at(-1).dateTs;
    } else {
      data.lastItemDate = null;
    }
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
    const feedId = data.items.find(i => i.id === batch[0]).feedId;
    if (data.groupUnreadItemsByFeedId[feedId]) {
      data.groupUnreadItemsByFeedId[feedId] -= batch.length;
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
    const items = document.querySelectorAll('.item');
    items.forEach(item => {
      if (item.dataset.read === '0') {
        observer.observe(item);
      }
    });
  }, 500);

  if (!data.feedId && data.items && data.lastItemDate) {
    const observe = new IntersectionObserver(async (entries, obs) => {
      if (entries[0].isIntersecting) {
        await displayItems();
        obs.unobserve(entries[0].target);
      }
    });

    setTimeout(() => {
      const items = document.querySelectorAll('.item');
      const secondLastItem = items[items.length - 2];
      if (secondLastItem) {
        observe.observe(secondLastItem);
      }
    });
  }
}

document.querySelector('.all-items-btn').addEventListener('click', () => {
  data.showAllItems = true;
  data.lastItemDate = null;
});

document.querySelector('.refresh').addEventListener('click', async () => {
  refresh(null)
});

document.querySelector('.delete-all').addEventListener('click', async () => {
  if (!confirm('Are you sure you want to delete all items?')) return;
  const { success, error } = await chrome.runtime.sendMessage({ type: 'deleteAllItems' });
  if (success) {
    showToast('All items deleted successfully', 'success');
    await updateDataState();
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



