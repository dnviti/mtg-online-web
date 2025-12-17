import React, { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 0. Check persistence
    const isDismissed = localStorage.getItem('pwa_prompt_dismissed') === 'true';
    if (isDismissed) return;

    // 1. Check if event was already captured globally
    const globalPrompt = (window as any).deferredInstallPrompt;
    if (globalPrompt) {
      setDeferredPrompt(globalPrompt);
      setIsVisible(true);
    }

    // 2. Listen for future events (if not yet fired)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
      (window as any).deferredInstallPrompt = e; // Sync global just in case
    };

    // 3. Listen for our custom event from main.tsx
    const customHandler = () => {
      const global = (window as any).deferredInstallPrompt;
      if (global) {
        setDeferredPrompt(global);
        setIsVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('deferred-prompt-ready', customHandler);

    // 4. Check for iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isStandalone = ('standalone' in window.navigator) && (window.navigator as any).standalone;

    if (isIOS && !isStandalone) {
      // Delay slightly to start fresh
      setTimeout(() => setIsVisible(true), 1000);
      setShowIOSPrompt(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('deferred-prompt-ready', customHandler);
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('pwa_prompt_dismissed', 'true');
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    setIsVisible(false);
    localStorage.setItem('pwa_prompt_dismissed', 'true'); // Don't ask again after user tries to install
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
    (window as any).deferredInstallPrompt = null;
  };

  if (!isVisible) return null;

  // iOS Specific Prompt
  if (showIOSPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-slate-800 border border-purple-500 rounded-lg shadow-2xl p-4 z-50 flex flex-col gap-3 animate-in slide-in-from-bottom-5">
        <div className="flex justify-between items-start">
          <h3 className="font-bold text-slate-100">Install App</h3>
          <button onClick={handleDismiss} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-slate-300">
          To install this app on your iPhone/iPad:
        </p>
        <ol className="text-sm text-slate-400 list-decimal list-inside space-y-1">
          <li className="flex items-center gap-2">Tap the <Share className="w-4 h-4 inline" /> Share button</li>
          <li>Scroll down and tap <span className="text-slate-200 font-semibold">Add to Home Screen</span></li>
        </ol>
      </div>
    );
  }

  // Android / Desktop Prompt
  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-slate-800 border border-purple-500 rounded-lg shadow-2xl p-4 z-50 flex flex-col gap-3 animate-in slide-in-from-bottom-5">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="bg-purple-600/20 p-2 rounded-lg">
            <Download className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100">Install App</h3>
            <p className="text-xs text-slate-400">Add to Home Screen for better experience</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={handleInstallClick}
        className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-md font-bold text-sm transition-colors shadow-lg shadow-purple-900/20"
      >
        Install Now
      </button>
    </div>
  );
};
