import { findRssFeed } from './find-feed/index.js';
import { initializeNotificationSettings, createFeedNotification, createTestNotification, DEFAULT_GLOBAL_NOTIFICATIONS } from './notifications.js';

async function createOffscreenDocument() {
  try {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["DOM_PARSER"],
        justification: "Need to parse XML for RSS feed"
      });
    }
  } catch (err) {
    console.warn('createOffscreenDocument failed:', err);
  }
}

const openDB = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("feedsRss", 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const objectStore = db.createObjectStore("items", { keyPath: "id" });

      objectStore.createIndex("link", "link", { unique: false });
      objectStore.createIndex("dateTs", "dateTs", { unique: false });
      objectStore.createIndex("isRead", "isRead", { unique: false });
      objectStore.createIndex("isStarred", "isStarred", { unique: false });
      objectStore.createIndex("feedId", "feedId", { unique: false });
      objectStore.createIndex("createdAt", "createdAt", { unique: false });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

/* -----------------------
   Data operations
   ----------------------- */
const insertData = async (items, feedId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["items"], "readwrite");
    const store = tx.objectStore("items");

    for (const item of items) {
      const { guid, title, link, description, content, media, pubDate } = item;
      const newItem = {
        id: guid,
        feedId,
        title,
        link,
        description,
        content,
        media,
        pubDate,
        dateTs: new Date(pubDate).getTime(),
        createdAt: Date.now(),
        isRead: 0,
        isStarred: 0
      };
      store.put(newItem);
    }
    tx.oncomplete = () => resolve(true);
    tx.onerror = (event) => reject(event.target.error);
  });
};

const selectData = async ({ id, feedId, dateTs, limit = 20, unreadOnly, starredOnly } = {}) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readonly");
    const store = tx.objectStore("items");
    let request;
    if (id) {
      request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else if (feedId) {
      const index = store.index("feedId");
      request = index.getAll(IDBKeyRange.only(feedId));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      const index = store.index("dateTs");
      const range = dateTs ? IDBKeyRange.upperBound(dateTs, true) : null;
      const items = [];
      const countRequest = index.count();
      countRequest.onsuccess = (event) => {
        const cursorRequest = index.openCursor(range, 'prev');
        cursorRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor && items.length < limit) {
            if ((!unreadOnly || (unreadOnly && !cursor.value.isRead)) && (!starredOnly || (starredOnly && cursor.value.isStarred))) {
              items.push(cursor.value);
            }
            cursor.continue();
          } else {
            resolve({ items, count: countRequest.result });
          }
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      }
      countRequest.onerror = () => reject(countRequest.error);
    }
  });
};

const getLatestItemsNotRead = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readonly");
    const index = tx.objectStore("items").index("dateTs");
    const items = [];
    const cursorRequest = index.openCursor(null, 'prev');
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && items.length < 20) {
        const item = cursor.value;
        if (item.isRead === 0) {
          items.push(item);
        }
        cursor.continue();
      } else {
        resolve(items);
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

const countItems = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readonly");
    const store = tx.objectStore("items");
    const countRequest = store.count();
    countRequest.onsuccess = () => resolve(countRequest.result);
    countRequest.onerror = () => reject(countRequest.error);
  });
};

const countUnreadItems = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readonly");
    const index = tx.objectStore("items").index("isRead");

    const countRequest = index.count(IDBKeyRange.only(0));

    countRequest.onsuccess = () => {
      const count = countRequest.result;
      if (!count) {
        chrome.action.setBadgeText({ text: '' });
      } else {
        chrome.action.setBadgeText({ text: String(count) });
        chrome.action.setBadgeBackgroundColor({ color: 'blue' });
      }
      resolve(count);
    };

    countRequest.onerror = () => {
      reject(countRequest.error);
    };
  });
};

const groupUnreadItemsByFeedId = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readonly");
    const index = tx.objectStore("items").index("isRead");
    const groupRequest = index.getAll(IDBKeyRange.only(0));
    groupRequest.onsuccess = () => {
      const group = groupRequest.result.reduce((acc, item) => {
        if (acc[item.feedId]) {
          acc[item.feedId]++;
        } else {
          acc[item.feedId] = 1;
        }
        return acc;
      }, {});
      resolve(group);
    };

    groupRequest.onerror = () => {
      reject(groupRequest.error);
    };
  });
}

const updatePostsAsRead = async (ids) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    ids.forEach(id => {
      const getReq = store.get(id);
      getReq.onsuccess = (event) => {
        const item = event.target.result;
        if (item) {
          item.isRead = 1;
          store.put(item);
        }
      }
    });
    tx.oncomplete = () => {
      countUnreadItems();
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

const updateFeedAsRead = async (id) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    const index = store.index("feedId");
    const cursorRequest = index.openCursor(IDBKeyRange.only(id));
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;
        item.isRead = 1;
        store.put(item);
        cursor.continue();
      } else {
        countUnreadItems();
        resolve(true);
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

const updateAllFeedAsRead = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    const index = store.index("isRead");
    const cursorRequest = index.openCursor(IDBKeyRange.only(0));
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;
        item.isRead = 1;
        store.put(item);
        cursor.continue();
      } else {
        countUnreadItems();
        resolve(true);
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

const deleteItems = async (ids) => {
  if (ids?.length >= 2) {
    const itemsStarred = await selectData({ starredOnly: true, limit: null });
    ids = ids.filter(id => !itemsStarred.find(i => i.id === id));
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    if (ids) {
      ids.forEach(id => {
        store.delete(id);
        tx.oncomplete = () => {
          countUnreadItems();
          resolve(true);
        };
        tx.onerror = () => reject(tx.error);
      });
    } else {
      const index = store.index("isStarred");
      const cursorRequest = index.openCursor(IDBKeyRange.only(0));
      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const item = cursor.value;
          store.delete(item.id);
          cursor.continue();
        } else {
          countUnreadItems();
          resolve(true);
        }
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    }
  });
}

const deleteOldItems = async () => {
  const { deleteOldItemsIntervalDays: days } = await chrome.storage.local.get({ deleteOldItemsIntervalDays: 30 });
  const timeAgo = Date.now() - days * 24 * 60 * 60 * 1000;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    const index = store.index("createdAt");
    const cursorRequest = index.openCursor();
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if ((cursor.value.dateTs < timeAgo) && !cursor.value.isStarred) {
          const id = cursor.value.id;
          store.delete(id);
        }
        cursor.continue();
      } else {
        resolve(true);
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

async function deleteFeedItems(id, alsoStarred) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    const index = store.index("feedId");
    const cursorRequest = index.openCursor(IDBKeyRange.only(id));
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const id = cursor.value.id;
        if (alsoStarred || !cursor.value.isStarred) {
          store.delete(id);
        }
        cursor.continue();
      } else {
        countUnreadItems();
        resolve(true);
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

const updateItems = async (items) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    items.forEach(item => {
      store.put(item);
    });
    tx.oncomplete = () => {
      // countUnreadItems();
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function fetchFeeds(feedId) {
  const { feeds, globalNotifications } = await chrome.storage.local.get({
    feeds: [],
    globalNotifications: DEFAULT_GLOBAL_NOTIFICATIONS
  });
  let isNewItems = false;
  for (const feed of feeds) {
    feed.lastChecked = Date.now();
    try {
      const headers = {};
      if (feed.etag) headers["If-None-Match"] = feed.etag;
      if (feed.lastModified) headers["If-Modified-Since"] = feed.lastModified;
      const response = await fetch(feed.url, {
        headers
      });
      if (response.status === 304 || !response.ok) {
        continue;
      }
      const xmlText = await response.text();
      const currentEtag = response.headers.get("ETag");
      const currentLastModified = response.headers.get("Last-Modified");
      if (currentEtag) feed.etag = currentEtag;
      if (currentLastModified) feed.lastModified = currentLastModified;
      const parsedData = await chrome.runtime.sendMessage({
        type: "parseFeed",
        data: xmlText
      });

      if (parsedData?.error) {
        console.error("Error parsing RSS:", parsedData.error);
        continue;
      }
      let items = feed.lastItemDate ? parsedData.data.filter(item => new Date(item.pubDate) > new Date(feed.lastItemDate)) : parsedData.data.slice(0, 50);
      if (items?.length) {
        await insertData(items, feed.id)
        feed.lastItemDate = items.map(item => item.pubDate).sort((a, b) => new Date(b) - new Date(a))[0];
        isNewItems = true;
        if (globalNotifications.enabled && feed.notifications?.enabled) {
          await createFeedNotification(feed, items, globalNotifications);
        }
      }
    } catch (error) {
      console.error('Error fetching feed:', error?.message || error);
    }
  }
  if (isNewItems) {
    chrome.runtime.sendMessage({
      type: "newItems",
      data: feeds
    });
  }
  await chrome.storage.local.set({ feeds });
  await countUnreadItems();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'getItems') {
        const items = await selectData(message.filters);
        sendResponse({ success: true, data: items });
      }
      else if (message.type === 'getLastItems') {
        const items = await getLatestItemsNotRead();
        sendResponse({ success: true, data: items });
      }
      else if (message.type === 'markItemsAsRead') {
        const items = await updatePostsAsRead(message.ids);
        sendResponse({ success: true, data: items });
      }
      else if (message.type === 'markFeedAsRead') {
        const items = await updateFeedAsRead(message.id);
        sendResponse({ success: true, data: items });
      }
      else if (message.type === 'markAllAsRead') {
        const items = await updateAllFeedAsRead();
        sendResponse({ success: true, data: items });
      }
      else if (message.type === 'getUnreadItemsCountByFeeds') {
        const data = await groupUnreadItemsByFeedId();
        sendResponse({ success: true, data });
      } else if (message.type === 'findRSSFeeds') {
        const data = await findRssFeed(message.url);
        sendResponse({ success: true, data });
      } else if (message.type === 'deleteItems') {
        const data = await deleteItems(message.ids);
        sendResponse({ success: true, data });
      } else if (message.type === 'deleteAllItems') {
        const data = await deleteItems();
        sendResponse({ success: true, data });
      } else if (message.type === 'deleteFeed') {
        const id = message.id;
        const stored = await chrome.storage.local.get({ feeds: [] });
        const feeds = stored.feeds || [];
        await chrome.storage.local.set({ feeds: feeds.filter(feed => feed.id !== id) });
        const data = await deleteFeedItems(id, true);
        sendResponse({ success: true, data });
      } else if (message.type === 'clearFeed') {
        const data = await deleteFeedItems(message.id);
        sendResponse({ success: true, data });
      } else if (message.type === 'updateItems') {
        const data = await updateItems(message.items);
        sendResponse({ success: true, data });
      } else if (message.type === 'fetchFeeds') {
        await fetchFeeds(message.feedId);
        sendResponse({ success: true });
      } else if (message.type === 'countItems') {
        const data = await countItems();
        sendResponse({ success: true, data });
      } else if (message.type === 'subscribe') {
        await fetchFeeds();
        sendResponse({ success: true });
      } else if (message.type === 'testNotification') {
        const success = await createTestNotification();
        sendResponse({ success });
      } else {
        sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ success: false, error: err?.message || String(err) });
    }
  })();
  return true; // keep message channel open for async sendResponse
});

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.alarms.clearAll();
    await createOffscreenDocument();
    await initializeNotificationSettings();

    if (navigator.onLine) {
      await fetchFeeds();
    }
    await countUnreadItems();
    await deleteOldItems();

    let { fetchFeedsIntervalMinutes } = await chrome.storage.local.get({ fetchFeedsIntervalMinutes: 45 });
    fetchFeedsIntervalMinutes = Number(fetchFeedsIntervalMinutes);

    chrome.alarms.create('fetch-feeds', { periodInMinutes: fetchFeedsIntervalMinutes });
    chrome.alarms.create('delete-old-items', { periodInMinutes: 24 * 60 });
  } catch (err) {
    console.error('onInstalled error:', err);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    await countUnreadItems();
    const all = await chrome.alarms.getAll();
    const hasFetch = all.some(a => a.name === 'fetch-feeds');
    const hasDeleteOld = all.some(a => a.name === 'delete-old-items');

    const { fetchFeedsIntervalMinutes: minutes } = await chrome.storage.local.get({ fetchFeedsIntervalMinutes: 45 });
    const fetchFeedsIntervalMinutes = Number(minutes);

    if (!hasFetch) {
      chrome.alarms.create('fetch-feeds', { periodInMinutes: fetchFeedsIntervalMinutes });
    }
    if (!hasDeleteOld) {
      chrome.alarms.create('delete-old-items', { periodInMinutes: 24 * 60 });
    }

    await createOffscreenDocument();
    await initializeNotificationSettings();
  } catch (err) {
    console.error('onStartup error:', err);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === 'fetch-feeds') {
      if (navigator.onLine) {
        await fetchFeeds();
      } else {
        chrome.alarms.clear('check-online', () => {
          chrome.alarms.create('check-online', { periodInMinutes: 3 });
        });
      }
    } else if (alarm.name === 'check-online') {
      if (navigator.onLine) {
        await fetchFeeds();
        chrome.alarms.clear('check-online');
      }
    } else if (alarm.name === 'delete-old-items') {
      await deleteOldItems();
    }
  } catch (err) {
    console.error('alarms.onAlarm error:', err);
  }
});

chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.fetchFeedsIntervalMinutes) {
    const newInterval = Number(changes.fetchFeedsIntervalMinutes.newValue);
    chrome.alarms.clear('fetch-feeds', () => {
      chrome.alarms.create('fetch-feeds', { periodInMinutes: newInterval });
    });
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener(async (notificationId) => {
  async function openListPage(feedId, itemId) {
    let url = chrome.runtime.getURL('list/list.html');
    // Add query params for feedId and itemId
    const params = new URLSearchParams();
    if (feedId) params.set('feedId', feedId);
    if (itemId && itemId !== 'none') params.set('itemId', itemId);
    const queryString = params.toString();
    if (queryString) url += '?' + queryString;

    const baseUrl = chrome.runtime.getURL('list/list.html');
    const tabs = await chrome.tabs.query({ url: baseUrl + '*' });
    if (tabs.length) {
      const tab = tabs[0];
      await chrome.tabs.update(tab.id, { url, active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return;
    }
    await chrome.tabs.create({ url });
  }

  try {
    // notificationId format: feed::{feedId}::item::{itemId}::{timestamp}
    let feedId = null;
    let itemId = null;

    if (notificationId.startsWith('feed::')) {
      const parts = notificationId.split('::');
      // parts = ['feed', feedId, 'item', itemId, timestamp]
      if (parts.length >= 4) {
        feedId = parts[1];
        itemId = parts[3];
      }
    }

    await openListPage(feedId, itemId);
    chrome.notifications.clear(notificationId);

  } catch (error) {
    console.error('Error handling notification click:', error);
  }
});

chrome.notifications.onClosed.addListener(async (notificationId) => {
  await chrome.storage.local.remove(notificationId);
});

self.onerror = e => console.error("SW ERROR:", e);
self.onunhandledrejection = e => console.error("SW PROMISE ERROR:", e.reason);
