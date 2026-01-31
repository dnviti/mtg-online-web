import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '../contexts/UserContext';

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

const CONSENT_KEY = 'mtgate_cookie_consent';

let adsenseScriptLoaded = false;

function loadAdSenseScript(clientId: string): Promise<void> {
  if (adsenseScriptLoaded) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src*="adsbygoogle"]`);
    if (existingScript) {
      adsenseScriptLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      adsenseScriptLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

interface AdBannerProps {
  slot: string;
  format?: 'auto' | 'rectangle' | 'vertical' | 'horizontal';
  width?: number;
  height?: number;
  className?: string;
}

interface AdPlaceholderProps {
  width?: number;
  height?: number;
}

const AdPlaceholder: React.FC<AdPlaceholderProps> = ({ width = 160, height = 600 }) => (
  <div
    className="bg-slate-800/50 border border-slate-700 rounded-lg flex items-center justify-center"
    style={{ width, height }}
  >
    <div className="text-center text-slate-500 text-xs p-4">
      <div className="w-8 h-8 mx-auto mb-2 rounded bg-slate-700/50 flex items-center justify-center">
        <span className="text-lg">AD</span>
      </div>
      <p>{width}x{height}</p>
      <p className="text-[10px] mt-1 text-slate-600">Ad Space</p>
    </div>
  </div>
);

export const AdBanner: React.FC<AdBannerProps> = ({
  slot,
  format = 'auto',
  width,
  height,
  className = ''
}) => {
  const { isPremium } = useUser();
  const adRef = useRef<HTMLModElement>(null);
  const isAdLoaded = useRef(false);
  const [scriptReady, setScriptReady] = useState(adsenseScriptLoaded);

  const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined;
  const hasConsent = localStorage.getItem(CONSENT_KEY) === 'accepted';

  // Load AdSense script when consent is given
  useEffect(() => {
    if (!clientId || isPremium || !hasConsent) return;

    loadAdSenseScript(clientId)
      .then(() => setScriptReady(true))
      .catch((e) => console.error('Failed to load AdSense script:', e));
  }, [clientId, isPremium, hasConsent]);

  // Push ad when script is ready
  useEffect(() => {
    if (!scriptReady || !clientId || isPremium || isAdLoaded.current || !hasConsent) return;

    try {
      if (adRef.current && adRef.current.innerHTML === '') {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        isAdLoaded.current = true;
      }
    } catch (e) {
      console.error('AdSense error:', e);
    }
  }, [scriptReady, clientId, isPremium, hasConsent]);

  // Hide ads for premium users
  if (isPremium) {
    return null;
  }

  // Show placeholder if AdSense is not configured or no consent
  if (!clientId || !hasConsent) {
    return <AdPlaceholder width={width} height={height} />;
  }

  return (
    <ins
      ref={adRef}
      className={`adsbygoogle ${className}`}
      style={{
        display: 'block',
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined
      }}
      data-ad-client={clientId}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
};

export { AdPlaceholder };
