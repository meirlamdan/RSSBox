import { parseFeed, checkForRssFeed, checkForRssLinks } from './parsefeed.js';

const handlers = {
  parseFeed,
  checkForRssFeed,
  checkForRssLinks,
};


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type in handlers) {
    const result = handlers[message.type](message.data);
    if (result) {
      sendResponse({ type: message.type, data: result });
    } else {
      sendResponse({ error: 'No data found' });
    }
  }

});

