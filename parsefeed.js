export function parseFeed(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "application/xml");

  if (xml.querySelector("parsererror")) {
    throw new Error("Error parsing RSS feed");
  }

  const isRSS = xml.querySelector("rss") !== null;
  const isAtom = xml.querySelector("feed") !== null;

  function extractMedia(el) {
    const media = el.querySelector("media\\:content");
    if (media && media.getAttribute("url")) return media.getAttribute("url");

    const enclosure = el.querySelector("enclosure");
    if (enclosure && enclosure.getAttribute("url")) return enclosure.getAttribute("url");

    const html = (
      el.querySelector("description") ||
      el.querySelector("content\\:encoded") ||
      el.querySelector("summary") ||
      el.querySelector("content")
    )?.textContent;

    if (html) {
      const match = html.match(/<img[^>]+src="([^">]+)"/i);
      if (match) return match[1];
    }

    return null;
  }

  if (isRSS) {
    const items = Array.from(xml.querySelectorAll("item"));
    return items.map(item => ({
      title: item.querySelector("title")?.textContent?.trim() || "",
      link: item.querySelector("link")?.textContent?.trim() || "",
      pubDate:
        item.querySelector("pubDate")?.textContent?.trim() ||
        item.getElementsByTagName("dc:date")[0]?.textContent?.trim() ||
        "",
      guid: item.querySelector("guid")?.textContent?.trim() || "",
      description:
        item.querySelector("description")?.textContent?.trim() || "",
      content: item.getElementsByTagName("content:encoded")[0]?.textContent?.trim() || "",
      mediaUrl: extractMedia(item)
    }));
    console.log(items);

  }

  if (isAtom) {
    const entries = Array.from(xml.querySelectorAll("entry"));
    return entries.map(entry => ({
      title: entry.querySelector("title")?.textContent?.trim() || "",
      link:
        entry.querySelector("link[rel='alternate']")?.getAttribute("href") ||
        entry.querySelector("link")?.getAttribute("href") ||
        "",
      pubDate:
        entry.querySelector("updated")?.textContent?.trim() ||
        entry.querySelector("published")?.textContent?.trim() ||
        "",
      guid: entry.querySelector("id")?.textContent?.trim() || "",
      description:
        entry.querySelector("summary")?.textContent?.trim() ||
        entry.getElementsByTagName("media:description")[0]?.textContent?.trim() || "",
      // entry.querySelector("content")?.textContent?.trim() ||
      // "",
      content: entry.querySelector("content")?.textContent?.trim() || "",
      mediaUrl: extractMedia(entry)
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


