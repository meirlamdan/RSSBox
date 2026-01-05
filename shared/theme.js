// Theme Management for RSSBox Extension

const THEME_KEY = 'theme';
const DEFAULT_THEME = 'auto';

// Get saved theme preference
export async function getTheme() {
  const { theme } = await chrome.storage.local.get({ theme: DEFAULT_THEME });
  return theme;
}

// Set theme preference and apply
export async function setTheme(mode) {
  await chrome.storage.local.set({ theme: mode });
  applyTheme(mode);
}

// Determine actual theme to apply based on preference
function getEffectiveTheme(mode) {
  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

// Apply theme to document
function applyTheme(mode) {
  const effectiveTheme = getEffectiveTheme(mode);
  document.documentElement.setAttribute('data-theme', effectiveTheme);
}

// Initialize theme on page load
export async function initTheme() {
  const theme = await getTheme();
  applyTheme(theme);

  // Listen for system theme changes (only when in auto mode)
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', async () => {
    const currentTheme = await getTheme();
    if (currentTheme === 'auto') {
      applyTheme('auto');
    }
  });
}

// Get currently applied theme (light or dark)
export function getCurrentAppliedTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

// Initialize immediately
initTheme();
