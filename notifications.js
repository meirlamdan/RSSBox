/**
 * Notifications module for RSSBox
 * Handles desktop notifications for new feed items
 */

// Default notification settings
export const DEFAULT_GLOBAL_NOTIFICATIONS = {
  enabled: true,
  maxPerBatch: 5,
  grouping: true,
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "08:00"
  }
};

export const DEFAULT_FEED_NOTIFICATIONS = {
  enabled: false,
  priority: 'normal'
};

/**
 * Check if we're in quiet hours
 */
export function isInQuietHours(quietHours) {
  if (!quietHours || !quietHours.enabled) {
    return false;
  }
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const startTime = timeToMinutes(quietHours.start);
  const endTime = timeToMinutes(quietHours.end);

  if (startTime <= endTime) {
    // Normal range (e.g., 22:00 to 08:00)
    return currentTime >= startTime && currentTime < endTime;
  } else {
    // Overnight range (e.g., 22:00 to 08:00 across midnight)
    return currentTime >= startTime || currentTime < endTime;
  }
}

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Create a notification for new feed items
 */
export async function createFeedNotification(feed, items, globalSettings) {

  if (!globalSettings.enabled || !feed.notifications || !feed.notifications.enabled || isInQuietHours(globalSettings.quietHours)) {
    return;
  }

  // Don't show notifications if list page is active
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const listUrl = chrome.runtime.getURL('list/list.html');
    if (activeTab?.url?.startsWith(listUrl)) {
      return;
    }
  } catch (e) {
    // Ignore errors (e.g., no active tab)
  }

  // Limit number of items to show
  const itemsToShow = items.slice(0, globalSettings.maxPerBatch);

  // Create notification message
  const feedName = feed.alt || feed.title || new URL(feed.url).hostname;

  let message;
  let itemId = null;
  if (globalSettings.grouping && items.length > 1) {
    message = `${items.length} new items`;
  } else {
    message = itemsToShow[0]?.title || 'New item';
    itemId = itemsToShow[0]?.guid || null;
  }

  // Create notification - ID format: feed::{feedId}::item::{itemId}::{timestamp}
  // Using :: as separator to avoid conflicts with IDs containing -
  const notificationId = `feed::${feed.id}::item::${itemId || 'none'}::${Date.now()}`;

  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('images/icon128.png'),
      title: feedName,
      message: message,
      priority: feed.notifications.priority === 'high' ? 2 : 1,
      eventTime: Date.now()
    });
  } catch (error) {
    console.error('[Notifications] Failed to create notification:', error);
  }
}

/**
 * Create a test notification
 */
export async function createTestNotification() {
  const notificationId = `test-${Date.now()}`;
  try {
    if (!chrome.notifications?.create) {
      console.error('[Notifications] chrome.notifications API not available');
      return false;
    }

    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('images/icon128.png'),
      title: 'RSSBox Test Notification',
      message: 'Notifications are working correctly!',
      priority: 1,
      eventTime: Date.now()
    });

    return true;
  } catch (error) {
    console.error('[Notifications] Failed to create test notification:', error);
    return false;
  }
}

/**
 * Initialize notification settings for existing feeds
 */
export async function initializeNotificationSettings() {
  const { feeds = [], globalNotifications } = await chrome.storage.local.get(['feeds', 'globalNotifications']);

  // Initialize global settings if not present
  if (!globalNotifications) {
    await chrome.storage.local.set({
      globalNotifications: DEFAULT_GLOBAL_NOTIFICATIONS
    });
  }

  // Add notification settings to feeds that don't have them
  let needsUpdate = false;
  const updatedFeeds = feeds.map(feed => {
    if (!feed.notifications) {
      needsUpdate = true;
      return {
        ...feed,
        notifications: { ...DEFAULT_FEED_NOTIFICATIONS }
      };
    }
    return feed;
  });

  if (needsUpdate) {
    await chrome.storage.local.set({ feeds: updatedFeeds });
  }

  return { feeds: updatedFeeds, globalNotifications: globalNotifications || DEFAULT_GLOBAL_NOTIFICATIONS };
}
