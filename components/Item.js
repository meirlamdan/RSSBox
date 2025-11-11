import { html } from '../arrow.mjs';
import { formatDate, timeAgo } from '../date.js';
import Svg from './Svg.js';

export default function Item(item, data) {
  function deleteItem(id) {
    data.items = data.items.filter(i => i.id !== id);
    chrome.runtime.sendMessage({ type: 'deleteItems', ids: [id] });
  }

  function shareItem(item) {
    const shareData = {
      title: item.title,
      text: item.description || item.content.replace(/<[^>]+>/g, '').slice(0, 100),
      url: item.link,
    };
    navigator.share(shareData);
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




  return html`<div class="item ${item.isRead === 0 ? 'unread' : ''}" data-id="${item.id}" data-read="${item.isRead}">
          <div class="item-details">
           <div class="date">${formatDate(item.dateTs)}</div>
           <div class="actions">
            <div class="delete" @click="${() => deleteItem(item.id)}">
              ${Svg('delete')}
            </div>
            <div class="share" @click="${() => shareItem(item)}">
              ${Svg('share')}
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