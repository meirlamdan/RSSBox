import redditFeeds from "./reddit.js";
import youTubeFeeds from "./youtube.js";
import githubFeeds from "./github.js";

export async function findRssFeed(url) {
  const domain = new URL(url).origin
  const feeds = [];
  try {
    const currentPage = await getPageContent()
    // check if current page is a feed
    const checkFeed = await chrome.runtime.sendMessage({
      type: "checkForRssFeed",
      data: currentPage.content
    });

    if (checkFeed.data) {
      return [{
        title: checkFeed.data.title || currentPage.title,
        url: currentPage.url,
      }]
    } else {
      // check for links in page
      const links = await chrome.runtime.sendMessage({
        type: "checkForRssLinks",
        data: currentPage.content
      });
      if (links.data) {
        links.data.forEach(link => {
          if (!link.url.startsWith(domain)) {
            link.url = domain + link.url
          }
          feeds.push(link);
        });
      }
    }

    // youTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      feeds.push(...await youTubeFeeds(url));
    }
    //reddit
    if (url.startsWith('https://www.reddit.com/')) {
      feeds.push(...redditFeeds(url));
    }
    // github
    if (url.startsWith('https://github.com/')) {
      feeds.push(...githubFeeds(url));
    }

    if (feeds.length) {
      return uniqueFeeds(feeds);
    }

    if (new URL(url).pathname !== '/' && new URL(url).pathname !== '') {
      // check in home page
      const page = await fetch(domain);
      const homePageContent = await page.text();
      const links = await chrome.runtime.sendMessage({
        type: "checkForRssLinks",
        data: homePageContent
      });

      if (links.data) {
        links.data.forEach(link => {
          if (!link.url.startsWith(domain)) {
            link.url = domain + link.url
          }
          feeds.push(link);
        });
        return uniqueFeeds(feeds);
      }
      if (links.error) {
        console.error(links.error);
      }
    }

    // check common paths
    const commonPaths = [
      '/feed',
      '/rss',
      '/rss.xml',
      '/feed.xml',
      '/atom.xml',
      '/feeds',
      '/feeds/all.atom.xml',
      '/rss/feed',
      '/blog/feed',
      '/blog/rss',
      '/news/rss',
      '/news/feed',
      '/index.xml',
      '/feed/',
      '/rss/',
      '/?feed=rss',
      '/?feed=rss2',
      '/?feed=atom',
      '/wp-rss.php',
      '/wp-rss2.php',
      '/wp-atom.php',
      '/wp-rdf.php'
    ];

    const promises = commonPaths.map(path => checkFeedUrl(domain + path));
    const results = await Promise.allSettled(promises);

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        feeds.push(result.value);
      }
    });


    // 3. checking robots.txt
    // try {
    //   const robotsFeeds = await findFeedsInRobots(domain);
    //   robotsFeeds.forEach(feed => {
    //     if (!foundUrls.has(feed.url)) {
    //       foundUrls.add(feed.url);
    //       feeds.push(feed);
    //     }
    //   });
    // } catch (error) {
    //   console.log('Could not check robots.txt:', error.message);
    // }

    // 4. checking sitemap
    //   try {
    //     const sitemapFeeds = await findFeedsInSitemap(domain);
    //     sitemapFeeds.forEach(feed => {
    //       if (!foundUrls.has(feed.url)) {
    //         foundUrls.add(feed.url);
    //         feeds.push(feed);
    //       }
    //     });
    //   } catch (error) {
    //     console.log('Could not check sitemap:', error.message);
    //   }

  } catch (error) {
    console.error('Error in findRSSFeeds:', error);
  }

  return uniqueFeeds(feeds);
}

async function checkFeedUrl(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }
    clearTimeout(timeoutId);
    const checkFeed = await chrome.runtime.sendMessage({
      type: "checkForRssFeed",
      data: await response.text()
    });

    if (checkFeed.data) {
      return {
        title: checkFeed.data.title,
        url,
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}


async function findFeedsInRobots(domain) {
  const feeds = [];

  try {
    const response = await fetch(domain + '/robots.txt');
    if (!response.ok) return feeds;

    const text = await response.text();
    const lines = text.split('\n');

    lines.forEach(line => {
      if (line.toLowerCase().includes('rss') || line.toLowerCase().includes('feed') || line.toLowerCase().includes('xml')) {
        const urlMatch = line.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          feeds.push({
            title: 'RSS Feed (from robots.txt)',
            url: urlMatch[0],
            type: 'application/rss+xml',
            source: 'robots.txt'
          });
        }
      }
    });

  } catch (error) {
    // not all sites have robots
  }

  return feeds;
}

async function findFeedsInSitemap(domain) {
  const feeds = [];

  try {
    const response = await fetch(domain + '/sitemap.xml');
    if (!response.ok) return feeds;

    const text = await response.text();

    const urlRegex = /<loc>([^<]*(?:rss|feed|atom)[^<]*)<\/loc>/gi;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      feeds.push({
        title: 'RSS Feed (from sitemap)',
        url: match[1],
        type: 'application/rss+xml',
        source: 'sitemap'
      });
    }

  } catch (error) {
    // not all sites have sitemap
  }

  return feeds;
}

async function getPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      return {
        content: document.documentElement.outerHTML,
        title: document.title,
        url: document.URL
      }
    },
  });
  return results[0].result;
}

function uniqueFeeds(feeds) {
  const seenUrls = new Set();
  return feeds.filter(feed => {
    if (seenUrls.has(feed.url)) {
      return false;
    }
    seenUrls.add(feed.url);
    return true;
  });
}
