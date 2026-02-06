import { connect } from "./connection.js";

// Start connection when extension loads
connect();

// Also try to connect when service worker wakes up
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
