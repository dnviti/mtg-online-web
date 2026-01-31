import React, { useEffect, useRef } from 'react';
import { useUser } from '../contexts/UserContext';

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

const CONSENT_KEY = 'mtgate_cookie_consent';

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

  // vite-plugin-adsense reads from VITE_ADSENSE_CLIENT
  const clientId = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
  const hasConsent = localStorage.getItem(CONSENT_KEY) === 'accepted';

  // Push ad when component mounts (script is injected by vite-plugin-adsense)
  useEffect(() => {
    if (!clientId || isPremium || isAdLoaded.current || !hasConsent) return;

    // Small delay to ensure the AdSense script is loaded
    const timer = setTimeout(() => {
      try {
        if (adRef.current && adRef.current.innerHTML === '') {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          isAdLoaded.current = true;
        }
      } catch (e) {
        console.error('AdSense error:', e);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [clientId, isPremium, hasConsent]);

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
