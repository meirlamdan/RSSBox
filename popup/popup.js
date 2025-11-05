import { html, reactive } from "../arrow.mjs";
import { formatDate } from "../date.js";
import { showToast } from "../toast.js";

const data = reactive({
  feedsResults: [],
  feeds: []
});

document.querySelector('.find-feeds:not(.active)').addEventListener('click', async () => {
  if (data.feedsResults.length) {
    return;
  }
  if (!navigator.onLine) {
    showToast('You are offline', 'error');
    return;
  }
  document.querySelector('.find-feeds').classList.add('active');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.runtime.sendMessage({
    type: 'findRSSFeeds',
    url: tab.url
  });
  if (response.success) {
    if (!response.data?.length) {
      showToast('No feeds found', 'error');
    } else {
      data.feedsResults = response.data;
      displayResults();
    }
  } else {
    showToast(response.error || 'Error finding feeds', 'error');
  }
  document.querySelector('.find-feeds').classList.remove('active');
});

function displayResults() {
  const feeds = data.feedsResults;
  const feedsContainer = document.querySelector('.feeds-container');
  const t = html`<div class="feeds">
   ${feeds.map(feed => html`<div class="feed">
    <div class="title">
    <input type="text" name="title" value="${() => feed.alt || feed.title}" @input="${(e) => feed.alt = e.target.value}">
    <div class="url">${feed.url}</div>
    </div>
    <input type="checkbox" name="feed"  @change="${(e) => handleFeedSelection(e, feed)}">
   </div>`)}
   <button class="save-feeds-button" @click="${saveFeeds}" disabled="${() => !data.feeds.length}">Save Feeds ${() => data.saveFeedsInProgress ? loadingSvg : ''}</button>
  </div>`;
  t(feedsContainer);
}

function handleFeedSelection(e, feed) {
  if (e.target.checked && !data.feeds.map(f => f.url).includes(feed.url)) {
    data.feeds.push(feed);
  } else {
    data.feeds = data.feeds.filter(f => f.url !== feed.url);
  }
}
async function saveFeeds() {
  const feeds = data.feeds.map(feed => ({ url: feed.url, title: feed.title, id: crypto.randomUUID(), createdAt: Date.now(), alt: feed.alt || '' }));
  const { feeds: existingFeeds } = await chrome.storage.local.get({ feeds: [] });
  if (existingFeeds.map(feed => feed.url).includes(feeds.map(feed => feed.url)[0])) {
    showToast('Feed already exists', 'error');
    return;
  }
  await chrome.storage.local.set({ feeds: [...existingFeeds, ...feeds] }).then(() => {
    showToast('Feeds saved successfully', 'success');
    document.querySelector('.feeds-container').innerHTML = '';
    data.feeds = [];
    data.feedsResults = [];
  }).catch(error => {
    showToast(error || 'Error saving feeds', 'error');
  })
  chrome.runtime.sendMessage({ type: 'subscribe' });
}

async function displayLatestUpdates() {
  const { data } = await chrome.runtime.sendMessage({ type: 'getLastItems' });
  const { feeds } = await chrome.storage.local.get({ feeds: [] });
  const getFeed = (id) => feeds.find(feed => feed.id === id);
  const domain = (url) => new URL(url).hostname;
  const updatesContainer = document.getElementById('latest-updates');
  const t = html`
        <div class="items">
          ${data.map(item => html`
              <div class="item" data-id="${item.id}">
               <div class="date-and-actions">
                <div class="date">${formatDate(item.dateTs)}</div>
                <div class="actions">
                 <div class="delete" @click="${() => markAsRead(item.id)}" title="Mark as Read">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"><!-- Icon from Tabler Icons by Paweł Kuna - https://github.com/tabler/tabler-icons/blob/master/LICENSE --><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0"/><path d="m9 12l2 2l4-4"/></g></svg>               
                 </div>
                 <div class="delete" @click="${() => deleteItem(item.id)}" title="Delete">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"><!-- Icon from Tabler Icons by Paweł Kuna - https://github.com/tabler/tabler-icons/blob/master/LICENSE --><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>
                </div>
              </div>
              </div>
              <div class="feed" title="${getFeed(item.feedId)?.url}">
                 <img src="https://www.google.com/s2/favicons?domain=${domain(getFeed(item.feedId)?.url)}" height="14">
                 <span>${getFeed(item.feedId)?.alt || getFeed(item.feedId)?.title}</span>
              </div>
                 <div class="title" @click="${() => openItem(item.id, item.feedId)}">${item.title}</div>
              </div>
            `)}
        </div>`;
  t(updatesContainer);
}

async function openItem(id, feedId) {
  await chrome.storage.local.set({ selectedItem: { id, feedId } });
  chrome.tabs.create({ url: chrome.runtime.getURL('list/list.html') });
}

function deleteItem(id) {
  const item = document.querySelector(`.item[data-id="${id}"]`);
  item.remove();
  chrome.runtime.sendMessage({ type: 'deleteItems', ids: [id] });
}


function markAsRead(id) {
  const item = document.querySelector(`.item[data-id="${id}"]`);
  item.remove();
  chrome.runtime.sendMessage({ type: 'markItemsAsRead', ids: [id] });
}

document.addEventListener('DOMContentLoaded', async () => {
  displayLatestUpdates();

  //disable find RSS Feeds button if current tab is not a valid url
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const findRSSFeeds = document.querySelector('.find-feeds');
  if (!tab.url || !tab.url.startsWith('http')) {
    findRSSFeeds.style.display = 'none';
  }
});