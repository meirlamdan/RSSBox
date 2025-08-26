const deleteOldItemsInput = document.querySelector('#deleteOldItems');
deleteOldItemsInput.value = (await chrome.storage.local.get({ deleteOldItemsIntervalDays: 30 })).deleteOldItemsIntervalDays;
deleteOldItemsInput.addEventListener('change', async () => {
  await chrome.storage.local.set({ deleteOldItemsIntervalDays: deleteOldItemsInput.value });
})

const fetchFeedsInput = document.querySelector('#fetchFeeds');
fetchFeedsInput.value = (await chrome.storage.local.get({ fetchFeedsIntervalMinutes: 30 })).fetchFeedsIntervalMinutes;
fetchFeedsInput.addEventListener('change', async () => {
  await chrome.storage.local.set({ fetchFeedsIntervalMinutes: fetchFeedsInput.value });
})

