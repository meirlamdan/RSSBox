import { html } from '../arrow.mjs';
import { formatDate, timeAgo } from '../date.js';
import Svg from './Svg.js';

const domain = (url) => new URL(url).hostname;

export default function Items(data) {
  function deleteItem(id) {
    data.items = data.items.filter(i => i.id !== id);
    chrome.runtime.sendMessage({ type: 'deleteItems', ids: [id] });
    if (data.showAllItems) data.count -= 1;
  }

  function shareItem(item) {
    const shareData = {
      title: item.title,
      text: item.description || item.content.replace(/<[^>]+>/g, '').slice(0, 100),
      url: item.link,
    };
    navigator.share(shareData);
  }

  function toggleStar(id) {
    const item = data.items.find(i => i.id === id);
    item.isStarred = item.isStarred ? 0 : 1;
    chrome.runtime.sendMessage({ type: 'updateItems', items: [item] });
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
        </audio>`;
    }
    return null;
  }

  function getFeed(feedId) {
    return data.feeds.find(f => f.id === feedId);
  }
  function Item(item) {
    return html`<div class="item ${item.isRead === 0 ? 'unread' : ''}" data-id="${item.id}" data-read="${item.isRead}" dir="auto">
  <div style="display: none">${item.title}</div>
        ${!data.feedId ? html`<div class="feed" dir="ltr"  @click="${() => data.feedId = item.feedId}"> <img src="https://www.google.com/s2/favicons?domain=${domain(getFeed(item.feedId).url)}" height="16">
         <span>${getFeed(item.feedId).alt || getFeed(item.feedId).title}</span></div>` : ''} 
          <div class="item-details">
           <div class="date">${formatDate(item.dateTs)}</div>
           <div class="actions">
           <div class="" @click="${() => toggleStar(item.id)}">
              ${() => item.isStarred ? Svg('star-filled', { size: 14 }) : Svg('star', { size: 14 })}
            </div>
            <div class="delete" @click="${() => deleteItem(item.id)}">
              ${Svg('delete', { size: 14 })}
            </div>
            <div class="share" @click="${() => shareItem(item)}">
              ${Svg('share', { size: 14 })}
             </div>
           </div>
          </div>
          <a class="item-title" href="${item.link}" target="_blank">${item.title}</a>
          ${item.media ? html`<div class="media">${renderMedia(item.media)}</div>` : ''}
          <div class="description">${item.description || ''}</div>
          <div class="content">${item.content || ''}</div>
        </div>
      `;
  }

  return html`<div> ${() => data.items.map(item => Item(item))}
    </div>`(document.querySelector('.items'));

}