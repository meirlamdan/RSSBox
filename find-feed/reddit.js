export default function redditFeeds(url) {
  const urlObj = new URL(url);
  const cleanPath = urlObj.pathname.replace(/\/$/, ''); 
  const feeds = [];
  if (cleanPath.includes('/r/')) {
    // Subreddit
    const subredditMatch = cleanPath.match(/\/r\/([^\/]+)/);
    if (subredditMatch) {
      const subreddit = subredditMatch[1];
      feeds.push(
        { title: `r/${subreddit} - All Posts`, url: `https://www.reddit.com/r/${subreddit}.rss` },
        { title: `r/${subreddit} - Hot Posts`, url: `https://www.reddit.com/r/${subreddit}/hot.rss` },
        { title: `r/${subreddit} - New Posts`, url: `https://www.reddit.com/r/${subreddit}/new.rss` },
        { title: `r/${subreddit} - Top Posts`, url: `https://www.reddit.com/r/${subreddit}/top.rss` },
        { title: `r/${subreddit} - Rising Posts`, url: `https://www.reddit.com/r/${subreddit}/rising.rss` }
      );
    }
  } else if (cleanPath.includes('/u/') || cleanPath.includes('/user/')) {
    // User
    const userMatch = cleanPath.match(/\/(u|user)\/([^\/]+)/);
    if (userMatch) {
      const username = userMatch[2];
      feeds.push(
        { name: `u/${username} - All Activity`, url: `https://www.reddit.com/u/${username}.rss` },
        { name: `u/${username} - Submitted Posts`, url: `https://www.reddit.com/u/${username}/submitted.rss` },
        { name: `u/${username} - Comments`, url: `https://www.reddit.com/u/${username}/comments.rss` }
      );
    }
  } else if (cleanPath === '' || cleanPath === '/') {
    // Front Page 
    feeds.push(
      { name: 'Reddit - Front Page', url: 'https://www.reddit.com/.rss' },
      { name: 'Reddit - Hot Posts', url: 'https://www.reddit.com/hot.rss' },
      { name: 'Reddit - New Posts', url: 'https://www.reddit.com/new.rss' },
      { name: 'Reddit - Top Posts', url: 'https://www.reddit.com/top.rss' },
      { name: 'Reddit - Rising Posts', url: 'https://www.reddit.com/rising.rss' }
    );
  } else {
    // Other
    const baseUrl = `${url.protocol}//${url.hostname}${cleanPath}`;
    feeds.push(
      { name: 'General Feed', url: `${baseUrl}.rss` }
    );
  }

  return feeds;
}
