export function parseFeed(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "application/xml");

  if (xml.querySelector("parsererror")) {
    throw new Error("Error parsing RSS feed");
  }

  const isRSS = xml.querySelector("rss") !== null;
  const isAtom = xml.querySelector("feed") !== null;

  const text = (el, tag) => {
    const node = el.getElementsByTagName(tag)?.[0];
    if (node) {
      return node.textContent?.trim();
    }
    return null;
  }


  function extractMedia(el) {
    const media = el.getElementsByTagName("media:content")?.[0] || el.getElementsByTagName("media:thumbnail")?.[0];
    if (media) {
      return {
        url: media.getAttribute("url"),
        type: media.getAttribute("type"),
        width: media.getAttribute("width"),
        height: media.getAttribute("height"),
        media: media.getAttribute("media")
      };
    }
    return null;
  }

  if (isRSS) {
    const items = Array.from(xml.querySelectorAll("item"));
    return items.map(item => ({
      title: text(item, "title"),
      link: text(item, "link"),
      pubDate: text(item, "pubDate") || text(item, "dc:date"),
      guid: text(item, "guid"),
      description: text(item, "description"),
      content: text(item, "content:encoded"),
      media: extractMedia(item)
    }));
  }

  if (isAtom) {
    const entries = Array.from(xml.querySelectorAll("entry"));
    return entries.map(entry => ({
      title: text(entry, "title"),
      link:
        entry.querySelector("link[rel='alternate']")?.getAttribute("href") ||
        entry.querySelector("link")?.getAttribute("href") ||
        "",
      pubDate: text(entry, "published") || text(entry, "updated"),
      guid: text(entry, "id"),
      description: text(entry, "summary") || text(entry, "media:description"),
      content: text(entry, "content"),
      media: extractMedia(entry)
    }));
  }

  throw new Error("Unsupported feed format");
}

/**
 * Extract feed title from XML document
 */

export function checkForRssFeed(content) { //content is = document.documentElement.innerHTM
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');
  function isRSSFeed(doc) {
    return !!(
      doc.querySelector('rss channel') ||
      doc.querySelector('rdf channel') ||
      doc.querySelector('feed[xmlns*="atom"]') ||
      doc.querySelector('channel title') ||
      doc.querySelector('feed title')
    );
  }

  function extractFeedTitle(doc) {
    const selectors = ['title', 'channel > title', 'feed > title'];
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element) {
        return element.textContent.trim();
      }
    }
    return null;
  }

  if (isRSSFeed(doc)) {
    return {
      title: extractFeedTitle(doc),
      type: 'application/rss+xml'
    }
  }

  return null;
}

export function checkForRssLinks(content) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const rssLinks = [];
  const rssLinkElements = doc.querySelectorAll('link[type="application/rss+xml"], link[type="application/atom+xml"], link[type="application/rdf+xml"]');
  rssLinkElements.forEach(link => {
    const href = link.getAttribute('href');
    const title = link.getAttribute('title');
    if (href) {
      rssLinks.push({
        title: title,
        url: href,
        type: link.getAttribute('type'),
      });
    }
  });
  return rssLinks.length ? rssLinks : null;
}


