// YouTube Ad Gaze Controller - Content Script
(function() {
  'use strict';

  const API_URL = 'http://localhost:5000/gaze_status';
  const CHECK_INTERVAL = 100; // Check every 100ms
  const CONNECTION_CHECK_INTERVAL = 5000; // Check connection every 5s
  
  let isTracking = false;
  let isLookingAway = false;
  let wasAdPaused = false;
  let checkInterval = null;
  let connectionCheckInterval = null;
  let isConnected = false;
  let statusIndicator = null;

  // Create status indicator
  function createStatusIndicator() {
    statusIndicator = document.createElement('div');
    statusIndicator.id = 'gaze-tracker-status';
    statusIndicator.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(statusIndicator);
  }

  // Update status indicator
  function updateStatus(message, color) {
    if (!statusIndicator) return;
    statusIndicator.textContent = message;
    statusIndicator.style.background = color;
    statusIndicator.style.display = 'block';
  }

  // Hide status indicator
  function hideStatus() {
    if (statusIndicator) {
      statusIndicator.style.display = 'none';
    }
  }

  // Get YouTube video player
  function getYouTubePlayer() {
    return document.querySelector('video.html5-main-video');
  }

  // Check if an ad is currently playing
  function isAdPlaying() {
    // Multiple methods to detect ads
    const adModule = document.querySelector('.video-ads.ytp-ad-module');
    const adShowing = document.querySelector('.ad-showing');
    const skipButton = document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button');
    const adText = document.querySelector('.ytp-ad-text');
    const adPlayerOverlay = document.querySelector('.ytp-ad-player-overlay');
    
    return Boolean(
      (adModule && adModule.children.length > 0) ||
      adShowing ||
      skipButton ||
      adText ||
      adPlayerOverlay
    );
  }

  // Pause YouTube ad
  function pauseAd() {
    const player = getYouTubePlayer();
    if (player && isAdPlaying() && !player.paused) {
      player.pause();
      wasAdPaused = true;
      console.log('Ad paused - user looked away');
      updateStatus('👀 Ad Paused (Looking Away)', 'rgba(220, 38, 38, 0.9)');
    }
  }

  // Resume YouTube ad
  function resumeAd() {
    const player = getYouTubePlayer();
    if (player && isAdPlaying() && player.paused && wasAdPaused) {
      player.play().catch(err => console.log('Play error:', err));
      wasAdPaused = false;
      console.log('Ad resumed - user looking at screen');
      updateStatus('✅ Ad Playing (Looking)', 'rgba(34, 197, 94, 0.9)');
      
      // Hide status after 2 seconds
      setTimeout(hideStatus, 2000);
    }
  }

  // Check gaze status from Python server
  async function checkGazeStatus() {
    if (!isTracking) return;

    try {
      const response = await fetch(API_URL, {
        method: 'GET',
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      
      if (!isConnected) {
        isConnected = true;
        console.log('Connected to eye tracker');
        updateStatus('🔗 Eye Tracker Connected', 'rgba(34, 197, 94, 0.9)');
        setTimeout(hideStatus, 3000);
      }

      // Only control ads, not regular video content
      if (!isAdPlaying()) {
        if (wasAdPaused) {
          wasAdPaused = false;
        }
        return;
      }

      const lookingAtScreen = data.looking_at_screen;

      if (!lookingAtScreen && !isLookingAway) {
        // User just looked away
        isLookingAway = true;
        pauseAd();
      } else if (lookingAtScreen && isLookingAway) {
        // User is looking back
        isLookingAway = false;
        resumeAd();
      }

    } catch (error) {
      if (isConnected) {
        isConnected = false;
        console.error('Lost connection to eye tracker:', error);
        updateStatus('⚠️ Eye Tracker Disconnected', 'rgba(239, 68, 68, 0.9)');
      }
    }
  }

  // Check if Python server is running
  async function checkConnection() {
    try {
      const response = await fetch('http://localhost:5000/health', {
        method: 'GET',
        mode: 'cors'
      });
      
      if (response.ok && !isConnected) {
        isConnected = true;
        console.log('Eye tracker server is running');
      }
    } catch (error) {
      if (isConnected) {
        isConnected = false;
        console.log('Eye tracker server not reachable');
      }
    }
  }

  // Start tracking
  function startTracking() {
    if (isTracking) return;
    
    isTracking = true;
    console.log('Gaze tracking started');
    
    // Start checking gaze status
    checkInterval = setInterval(checkGazeStatus, CHECK_INTERVAL);
    
    // Start checking connection
    connectionCheckInterval = setInterval(checkConnection, CONNECTION_CHECK_INTERVAL);
    checkConnection(); // Initial check
    
    updateStatus('🎯 Gaze Tracking Active', 'rgba(59, 130, 246, 0.9)');
    setTimeout(hideStatus, 3000);
  }

  // Stop tracking
  function stopTracking() {
    if (!isTracking) return;
    
    isTracking = false;
    isLookingAway = false;
    wasAdPaused = false;
    
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    
    if (connectionCheckInterval) {
      clearInterval(connectionCheckInterval);
      connectionCheckInterval = null;
    }
    
    console.log('Gaze tracking stopped');
    hideStatus();
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startTracking') {
      startTracking();
      sendResponse({ success: true });
    } else if (request.action === 'stopTracking') {
      stopTracking();
      sendResponse({ success: true });
    } else if (request.action === 'getStatus') {
      sendResponse({ 
        isTracking, 
        isConnected,
        isLookingAway,
        isAdPlaying: isAdPlaying()
      });
    }
    return true;
  });

  // Initialize
  function init() {
    createStatusIndicator();
    
    // Check if tracking should be enabled by default
    chrome.storage.local.get(['autoStart'], (result) => {
      if (result.autoStart !== false) {
        // Auto-start after a short delay to ensure page is loaded
        setTimeout(startTracking, 2000);
      }
    });
  }

  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();