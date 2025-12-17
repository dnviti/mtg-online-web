import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker
const updateSW = registerSW({
  onNeedRefresh() {
    // We could show a prompt here, but for now we'll just log or auto-reload
    console.log("New content available, auto-updating...");
    updateSW(true);
  },
  onOfflineReady() {
    console.log("App ready for offline use.");
  },
});

// Capture install prompt early
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  // Store the event so it can be triggered later.
  // We attach it to valid window property or custom one
  (window as any).deferredInstallPrompt = e;
  // Dispatch a custom event to notify components if they are already mounted
  window.dispatchEvent(new Event('deferred-prompt-ready'));
  console.log("Captured beforeinstallprompt event");
});

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      {/* <CubeManager /> is now part of App */}
      <App />
    </React.StrictMode>
  );
}
