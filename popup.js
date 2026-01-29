document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('downloadToggle').addEventListener('change', saveOptions);
document.getElementById('autoUploadToggle').addEventListener('change', saveOptions);
document.getElementById('blockErrorToggle').addEventListener('change', saveOptions);

function saveOptions() {
    const cleanDownloads = document.getElementById('downloadToggle').checked;
    const autoCleanUploads = document.getElementById('autoUploadToggle').checked;
    const blockOnError = document.getElementById('blockErrorToggle').checked;

    chrome.storage.local.set({
        cleanDownloads: cleanDownloads,
        autoCleanUploads: autoCleanUploads,
        blockOnError: blockOnError
    });
}

function restoreOptions() {
    // Global options
    chrome.storage.local.get({
        cleanDownloads: true,
        autoCleanUploads: true,
        blockOnError: false, // Default false (Fail-safe)
        statsFilesCleaned: 0
    }, async (items) => {
        document.getElementById('downloadToggle').checked = items.cleanDownloads;
        document.getElementById('autoUploadToggle').checked = items.autoCleanUploads;
        document.getElementById('blockErrorToggle').checked = items.blockOnError;
        document.getElementById('statsCount').textContent = items.statsFilesCleaned;
    });
}
