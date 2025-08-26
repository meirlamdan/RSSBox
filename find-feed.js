export async function findRssFeed(url) {
  const domain = new URL(url).origin

  const feeds = [];
  const foundUrls = new Set();
  try {
    // youTube
    if (isYouTubeUrl(url)) {
      const youtubeFeeds = await findYouTubeFeeds(url);
      youtubeFeeds.forEach(feed => {
        if (!foundUrls.has(feed.url)) {
          foundUrls.add(feed.url);
          feeds.push(feed);
        }
      });
      return feeds;
    }

    const currentPage = await getPageContent()

    // current page
    const checkFeed = await chrome.runtime.sendMessage({
      type: "checkForRssFeed",
      data: currentPage.content
    });

    if (checkFeed.data) {
      return [{
        title: checkFeed.data.title || currentPage.title,
        url: currentPage.url,
        // type: checkFeed.data.type,
      }]
    }

    // check in home page
    const page = await fetch(domain);
    const homePageContent = await page.text();
    const links = await chrome.runtime.sendMessage({
      type: "checkForRssLinks",
      data: homePageContent
    });

    if (links.data) {
      links.data.forEach(link => {
        if (!link.url.startsWith(url)) {
          link.url = url + link.url
        }
        if (!foundUrls.has(link.url)) {
          foundUrls.add(link.url);
          feeds.push(link);
        }
      });
      return feeds;
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
        if (!foundUrls.has(result.value.url)) {
          foundUrls.add(result.value.url);
          feeds.push(result.value);
        }
      }
    });


    // 3. בדיקת robots.txt לקישורים לפידים
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

    // 4. בדיקת sitemap.xml לפידים
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

  return feeds;
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
    // שגיאה רגילה - לא כל האתרים יש robots.txt
  }

  return feeds;
}

async function findFeedsInSitemap(domain) {
  const feeds = [];

  try {
    const response = await fetch(domain + '/sitemap.xml');
    if (!response.ok) return feeds;

    const text = await response.text();

    // חיפוש URLs שמכילים rss או feed
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
    // שגיאה רגילה - לא כל האתרים יש sitemap
  }

  return feeds;
}


// youtube functions
function isYouTubeUrl(url) {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

async function findYouTubeFeeds(url) {
  const feeds = [];

  try {
    // זיהוי סוג הדף ביוטיוב
    if (url.includes('/channel/')) {
      const channelId = extractYouTubeChannelId(url);
      if (channelId) {
        const channelInfo = await getYouTubeChannelInfo(url);
        feeds.push({
          title: `${channelInfo.name || 'YouTube Channel'} - RSS Feed`,
          url: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
          type: 'application/rss+xml',
          source: 'youtube-channel',
        });
      }
    } else if (url.includes('/c/') || url.includes('/@')) {
      // ערוץ עם שם משתמש או handle
      const channelInfo = await getYouTubeChannelInfo(url);
      if (channelInfo.channelId) {
        feeds.push({
          title: `${channelInfo.name || 'YouTube Channel'} - RSS Feed`,
          url: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelInfo.channelId}`,
          type: 'application/rss+xml',
          source: 'youtube-channel',
        });
      }
    } else if (url.includes('/user/')) {
      // ערוץ משתמש ישן
      const username = extractYouTubeUsername(url);
      if (username) {
        const channelInfo = await getYouTubeChannelInfo(url);
        if (channelInfo.channelId) {
          feeds.push({
            title: `${channelInfo.name || username} - RSS Feed`,
            url: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelInfo.channelId}`,
            type: 'application/rss+xml',
            source: 'youtube-user',
          });
        }
      }
    } else if (url.includes('/playlist')) {
      // פלייליסט
      const playlistId = extractYouTubePlaylistId(url);
      if (playlistId) {
        feeds.push({
          title: 'YouTube Playlist - RSS Feed',
          url: `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`,
          type: 'application/rss+xml',
          source: 'youtube-playlist',
        });
      }
    }

    // אם זה עמוד הבית של יוטיוב, נציע פידים כלליים
    if (url === 'https://www.youtube.com' || url === 'https://www.youtube.com/') {
      feeds.push({
        title: 'YouTube Trending - RSS Feed',
        url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCF0pVplsI8R5kcAqgtoRqoA',
        type: 'application/rss+xml',
        source: 'youtube-trending',
      });
    }

  } catch (error) {
    console.log('Error finding YouTube feeds:', error.message);
  }

  return feeds;
}

function extractYouTubeChannelId(url) {
  const match = url.match(/\/channel\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function extractYouTubeUsername(url) {
  const match = url.match(/\/user\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function extractYouTubePlaylistId(url) {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function getYouTubeChannelInfo(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return { name: null, channelId: null };

    const html = await response.text();

    // חיפוש שם הערוץ
    let channelName = null;
    const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/) ||
      html.match(/<title>([^<]+)<\/title>/);
    if (nameMatch) {
      channelName = nameMatch[1].replace(' - YouTube', '');
    }

    // חיפוש channel ID
    let channelId = null;
    const channelIdMatch = html.match(/"channelId":"([^"]+)"/) ||
      html.match(/channel_id=([a-zA-Z0-9_-]+)/) ||
      html.match(/"externalId":"([^"]+)"/);
    if (channelIdMatch) {
      channelId = channelIdMatch[1];
    }

    // אם לא מצאנו channel ID, ננסה לחלץ מ-canonical URL
    if (!channelId) {
      const canonicalMatch = html.match(/<link rel="canonical" href="[^"]*\/channel\/([^"\/]+)"/);
      if (canonicalMatch) {
        channelId = canonicalMatch[1];
      }
    }

    return { name: channelName, channelId: channelId };

  } catch (error) {
    console.log('Error getting YouTube channel info:', error.message);
    return { name: null, channelId: null };
  }
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
