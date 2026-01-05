// Theme management
import { getTheme, setTheme } from '../shared/theme.js';

const themeSelect = document.querySelector('#themeSelect');
const savedTheme = await getTheme();
themeSelect.value = savedTheme;

themeSelect.addEventListener('change', async () => {
  await setTheme(themeSelect.value);
});

// Delete old items settings
const deleteOldItemsInput = document.querySelector('#deleteOldItems');
deleteOldItemsInput.value = (await chrome.storage.local.get({ deleteOldItemsIntervalDays: 30 })).deleteOldItemsIntervalDays;
deleteOldItemsInput.addEventListener('change', async () => {
  await chrome.storage.local.set({ deleteOldItemsIntervalDays: deleteOldItemsInput.value });
})

// Fetch feeds settings
const fetchFeedsInput = document.querySelector('#fetchFeeds');
fetchFeedsInput.value = (await chrome.storage.local.get({ fetchFeedsIntervalMinutes: 45 })).fetchFeedsIntervalMinutes;
fetchFeedsInput.addEventListener('change', async () => {
  await chrome.storage.local.set({ fetchFeedsIntervalMinutes: fetchFeedsInput.value });
})

// Version and update check
const version = document.querySelector('#version');
version.textContent = chrome.runtime.getManifest().version;
document.getElementById("checkUpdate").addEventListener("click", () => {
  const statusEl = document.querySelector("#status");
  statusEl.textContent = "Checking for updates...";

  chrome.runtime.requestUpdateCheck((status, details) => {
    if (status === "update_available") {
      statusEl.textContent = "New version found: " + details.version + " | Reloading...";
      setTimeout(() => chrome.runtime.reload(), 1000);
    } else if (status === "no_update") {
      statusEl.textContent = "No updates available (you already have the latest version).";
    } else if (status === "throttled") {
      statusEl.textContent = "You've checked too many times. Please try again later.";
    }
  });
});
