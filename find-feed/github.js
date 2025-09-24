export default function githubFeeds(url="https://github.com/") {
  const urlObj = new URL(url);
  const cleanPath = urlObj.pathname.replace(/\/$/, '');
  const feeds = [];

  const parts = cleanPath.split('/').filter(Boolean);

  if (parts.length === 1) {
    // User page
    const username = parts[0];
    feeds.push(
      { title: `${username} - Public Activity`, url: `https://github.com/${username}.atom` }
    );
  } else if (parts.length >= 2) {
    // Repo page
    const [owner, repo] = parts;
    feeds.push(
      { title: `${owner}/${repo} - Commits`, url: `https://github.com/${owner}/${repo}/commits.atom` },
      { title: `${owner}/${repo} - Releases`, url: `https://github.com/${owner}/${repo}/releases.atom` },
      { title: `${owner}/${repo} - Issues`, url: `https://github.com/${owner}/${repo}/issues.atom` },
      { title: `${owner}/${repo} - Pull Requests`, url: `https://github.com/${owner}/${repo}/pulls.atom` }
    );
  } else if (cleanPath === '' || cleanPath === '/') {
    // Homepage
    feeds.push(
      { title: 'GitHub Blog', url: 'https://github.blog/feed/' }
    );
  } else {
    // Fallback
    const baseUrl = `${urlObj.protocol}//${urlObj.hostname}${cleanPath}`;
    feeds.push(
      { title: 'General Feed', url: `${baseUrl}.atom` }
    );
  }

  return feeds;
}
