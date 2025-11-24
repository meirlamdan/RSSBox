import { html } from '../arrow.mjs'
import { formatDate, timeAgo } from '../date.js';

const domain = (url) => new URL(url).hostname;

const HeaderFeed = (data) => {
  return html`<div class="feed">
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
     <span>last update: <b>${() => formatDate(data.feed?.lastItemDate)}</b></span>
     <span>last check: <b>${() => formatDate(data.feed?.lastChecked)}</b></span>
    </div>
  </div>`}
  ${() => data.showAllItems && html`<div class="feed-title">All items</div>
    <div class="feed-meta">
     <span>items: <b>${() => data.count}</b></span> 
     <span>unread: <b>${() => Object.values(data.groupUnreadItemsByFeedId).reduce((a, b) => a + b, 0)}</b></span>
     <span>last update: <b>${() => formatDate(data.feeds.filter(f => f.lastItemDate).map(f => new Date(f.lastItemDate).getTime()).sort((a, b) => b - a)[0])}</b></span>
     <span>last check: <b>${() => formatDate(data.feeds.filter(f => f.lastChecked).map(f => new Date(f.lastChecked).getTime()).sort((a, b) => b - a)[0])}</b></span>
    </div>
    <div class="filters">
       <div class="filter"><input id="unreadOnly" type="checkbox" checked="${() => data.unreadOnly}" name="unreadOnly" @change="${() => data.unreadOnly = !data.unreadOnly}"> <label for="unreadOnly" >unread only</label> </div>
       <div class="filter"><input id="starredOnly" type="checkbox" checked="${() => data.starredOnly}" name="unreadOnly" @change="${() => data.starredOnly = !data.starredOnly}"> <label for="starredOnly" >starred only</label> </div>
    </div>
    `}
   </div>`(document.querySelector('.feed-wrapper'));
}

export default HeaderFeed