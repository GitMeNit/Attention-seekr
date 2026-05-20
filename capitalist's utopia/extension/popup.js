
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const autoStartToggle = document.getElementById('autoStartToggle');
const connectionStatus = document.getElementById('connectionStatus');
const connectionIndicator = document.getElementById('connectionIndicator');
const trackingStatus = document.getElementById('trackingStatus');
const trackingIndicator = document.getElementById('trackingIndicator');
const gazeStatus = document.getElementById('gazeStatus');

// Update UI based on current status
async function updateUI() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('youtube.com')) {
      connectionStatus.textContent = 'Not on YouTube';
      connectionIndicator.classList.remove('on');
      connectionIndicator.classList.add('off');
      startBtn.disabled = true;
      startBtn.textContent = 'Open YouTube First';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        connectionStatus.textContent = 'Extension Loading...';
        connectionIndicator.classList.remove('on');
        connectionIndicator.classList.add('off');
        return;
      }

      // Update connection status
      if (response.isConnected) {
        connectionStatus.textContent = 'Connected';
        connectionIndicator.classList.add('on');
        connectionIndicator.classList.remove('off');
      } else {
        connectionStatus.textContent = 'Disconnected';
        connectionIndicator.classList.remove('on');
        connectionIndicator.classList.add('off');
      }

      // Update tracking status
      if (response.isTracking) {
        trackingStatus.textContent = 'Active';
        trackingIndicator.classList.add('on');
        trackingIndicator.classList.remove('off');
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
      } else {
        trackingStatus.textContent = 'Inactive';
        trackingIndicator.classList.remove('on');
        trackingIndicator.classList.add('off');
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
      }

      // Update gaze status
      if (response.isTracking) {
        if (response.isAdPlaying) {
          if (response.isLookingAway) {
            gazeStatus.textContent = 'Looking Away (Ad Paused)';
          } else {
            gazeStatus.textContent = ' Looking at Screen';
          }
        } else {
          gazeStatus.textContent = ' No Ad Playing';
        }
      } else {
        gazeStatus.textContent = '-';
      }

      startBtn.disabled = false;
    });
  } catch (error) {
    console.error('Error updating UI:', error);
  }
}

// Start tracking
startBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { action: 'startTracking' }, (response) => {
    if (response && response.success) {
      updateUI();
    }
  });
});

// Stop tracking
stopBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { action: 'stopTracking' }, (response) => {
    if (response && response.success) {
      updateUI();
    }
  });
});

// Handle auto-start toggle
autoStartToggle.addEventListener('change', () => {
  chrome.storage.local.set({ autoStart: autoStartToggle.checked });
});

// Load auto-start preference
chrome.storage.local.get(['autoStart'], (result) => {
  autoStartToggle.checked = result.autoStart !== false;
});

// Update UI periodically
updateUI();
setInterval(updateUI, 1000);