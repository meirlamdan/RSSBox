import { html } from '../arrow.mjs'

const Feeds = (data) => {
  const domain = (url) => new URL(url).hostname;

  function openMenu(e, id) {
    data.rect = e.target.parentElement.getBoundingClientRect();
    data.openMenuFeedId = id;
  }

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

  return html`<div class="feeds">
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
      <div class="feed"  @click="${() => data.feedId = feed.id}">
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
}

export default Feeds