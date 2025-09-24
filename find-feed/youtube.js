export default  async function findYouTubeFeeds(url) {
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
