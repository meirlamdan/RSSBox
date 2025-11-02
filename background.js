import { findRssFeed } from './find-feed/index.js';
async function createOffscreenDocument() {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["DOM_PARSER"],
      justification: "Need to parse XML for RSS feed"
    });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await createOffscreenDocument();
  if (navigator.onLine) {
    await fetchFeeds()
  }
  await countUnreadItems();
  await deleteOldItems();
});

chrome.storage.local.get({ fetchFeedsIntervalMinutes: 45 }).then(({ fetchFeedsIntervalMinutes }) => {
  chrome.alarms.create('fetch-feeds', { periodInMinutes: Number(fetchFeedsIntervalMinutes) });
})

chrome.alarms.create('delete-old-items', { periodInMinutes: 24 * 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'fetch-feeds') {
    if (navigator.onLine) {
      fetchFeeds();
    } else {
      chrome.storage.local.set({ pendingFetch: true });
      chrome.alarms.create('check-online', { periodInMinutes: 3 });
    }
  } else if (alarm.name === 'check-online') {
    if (navigator.onLine) {
      chrome.storage.local.get('pendingFetch', (result) => {
        if (result.pendingFetch) {
          fetchFeeds();
          chrome.storage.local.set({ pendingFetch: false });
        }
      });
      chrome.alarms.clear('check-online');
    }
  } else if (alarm.name === 'delete-old-items') {
    deleteOldItems();
  }
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'subscribe') {
    fetchFeeds();
  }
});

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

const insertData = async (items, feedId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["items"], "readwrite");
    const store = tx.objectStore("items");

    for (const item of items) {
      const { guid, title, link, description, content, media, pubDate } = item;
      const newItem = { id: guid, feedId, title, link, description, content, media, pubDate, dateTs: new Date(pubDate).getTime(), createdAt: Date.now(), isRead: 0 };
      store.put(newItem);
    }
    tx.oncomplete = () => resolve(true);
    tx.onerror = (event) => reject(event.target.error);
  });
};

const selectData = async (filters = {}) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readonly");
    const store = tx.objectStore("items");
    let request;
    if (filters.id) {
      request = store.get(filters.id);
    } else if (filters?.feedId) {
      const index = store.index("feedId");
      request = index.getAll(IDBKeyRange.only(filters.feedId));
    } else {
      request = store.getAll();
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
        resolve(true);
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

const deleteItems = async (ids) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    if (ids) {
      ids.forEach(id => {
        store.delete(id);
      });
    } else {
      store.clear();
    }
    tx.oncomplete = () => {
      countUnreadItems();
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

const deleteOldItems = async () => {
  const days = (await chrome.storage.local.get({ deleteOldItemsIntervalDays: 30 })).deleteOldItemsIntervalDays;
  const timeAgo = Date.now() - days * 24 * 60 * 60 * 1000;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    const index = store.index("createdAt");
    const cursorRequest = index.openCursor();
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && cursor.value.dateTs < timeAgo) {
        const id = cursor.value.id;
        store.delete(id);
        cursor.continue();
      } else {
        resolve(true);
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}
async function deleteFeed(id) {
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
        store.delete(id);
        cursor.continue();
      } else {
        countUnreadItems();
        resolve(true);
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}
async function fetchFeeds() {
  const { feeds } = await chrome.storage.local.get({ feeds: [] });
  for (const feed of feeds) {
    feed.lastChecked = Date.now();
    try {
      const headers = {};
      if (feed.etag) headers["If-None-Match"] = feed.etag;
      if (feed.lastModified) headers["If-Modified-Since"] = feed.lastModified;

      const response = await fetch(feed.url, {
        headers
      })
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

      if (parsedData.error) {
        console.error("Error parsing RSS:", parsedData.error);
        continue;
      }
      let items = feed.lastItemDate ? parsedData.data.filter(item => new Date(item.pubDate) > new Date(feed.lastItemDate)) : parsedData.data.slice(0, 50);
      if (items?.length) {
        await insertData(items, feed.id)
        feed.lastItemDate = items.map(item => item.pubDate).sort((a, b) => new Date(b) - new Date(a))[0];
      }
    } catch (error) {
      console.error('Error fetching feed:', error.message);
    }
  }
  chrome.storage.local.set({ feeds });
  countUnreadItems();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'getItems') {
      try {
        const items = await selectData(message.filters);
        sendResponse({ success: true, data: items });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }
    else if (message.type === 'getLastItems') {
      try {
        const items = await getLatestItemsNotRead();
        sendResponse({ success: true, data: items });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }
    else if (message.type === 'markItemsAsRead') {
      try {
        const items = await updatePostsAsRead(message.ids);
        sendResponse({ success: true, data: items });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }
    else if (message.type === 'markFeedAsRead') {
      try {
        const items = await updateFeedAsRead(message.id);
        sendResponse({ success: true, data: items });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }
    else if (message.type === 'getUnreadItemsCountByFeeds') {
      try {
        const data = await groupUnreadItemsByFeedId();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    } else if (message.type === 'findRSSFeeds') {
      try {
        const data = await findRssFeed(message.url);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    } else if (message.type === 'deleteItems') {
      try {
        const data = await deleteItems(message.ids);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    } else if (message.type === 'deleteAllItems') {
      try {
        const data = await deleteItems();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    } else if (message.type === 'deleteFeed') {
      try {
        const id = message.id;
        const feeds = await chrome.storage.local.get({ feeds: [] });
        await chrome.storage.local.set({ feeds: feeds.feeds.filter(feed => feed.id !== id) });
        const data = await deleteFeed(id);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    } else if (message.type === 'clearFeed') {
      try {
        const data = await deleteFeed(message.id);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    } else if (message.type === 'fetchFeeds') {
      try {
        const data = await fetchFeeds();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }
  })();
  return true;
})


