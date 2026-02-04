// Content script - runs in page context
// Most commands are executed via chrome.scripting.executeScript from background.js
// This script is available for more complex interactions if needed

console.log('[SiteCheck] Content script loaded on', window.location.href);
