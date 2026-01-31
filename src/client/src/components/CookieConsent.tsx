import React, { useState, useEffect } from 'react';
import { Cookie, X } from 'lucide-react';

const CONSENT_KEY = 'mtgate_cookie_consent';

interface CookieConsentProps {
  onAccept?: () => void;
  onDecline?: () => void;
}

export const CookieConsent: React.FC<CookieConsentProps> = ({ onAccept, onDecline }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setIsVisible(false);
    onAccept?.();
  };

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    setIsVisible(false);
    onDecline?.();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9998] p-4 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 shadow-lg">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-4">
        <div className="flex items-start gap-3 flex-1">
          <Cookie className="w-6 h-6 text-purple-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-300">
            <p className="font-medium text-white mb-1">We use cookies</p>
            <p>
              This site uses cookies to improve your experience and show personalized ads.
              By continuing to browse, you accept the use of cookies.{' '}
              <a
                href="https://policies.google.com/technologies/ads"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 underline"
              >
                Learn more
              </a>
            </p>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleDecline}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 text-sm font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
          >
            Accept
          </button>
        </div>

        <button
          onClick={handleDecline}
          className="absolute top-2 right-2 sm:hidden text-slate-500 hover:text-white"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export const useCookieConsent = (): boolean => {
  const [hasConsent, setHasConsent] = useState(() => {
    return localStorage.getItem(CONSENT_KEY) === 'accepted';
  });

  useEffect(() => {
    const handleStorageChange = () => {
      setHasConsent(localStorage.getItem(CONSENT_KEY) === 'accepted');
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return hasConsent;
};
