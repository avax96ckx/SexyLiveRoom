import { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, ExternalLink } from 'lucide-react';

interface InAppBrowserProps {
  url: string;
  title?: string;
  onClose: () => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Build proxy URL — anon key passed as query param since iframes can't set headers
function getProxyUrl(url: string): string {
  return `${SUPABASE_URL}/functions/v1/proxy-browser?apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}&url=${encodeURIComponent(url)}`;
}

// Normalize URL — only add https:// if missing, no other validation
function normalizeUrl(url: string): string {
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return 'https://' + url;
  return url;
}

// Detect embed-compatible URLs (no proxy needed)
function getEmbedUrl(url: string): string | null {
  try {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`;

    const twitchChannel = url.match(/twitch\.tv\/([^/?#]+)$/);
    if (twitchChannel) return `https://player.twitch.tv/?channel=${twitchChannel[1]}&parent=${window.location.hostname}&autoplay=true`;

    const twitchVod = url.match(/twitch\.tv\/videos\/(\d+)/);
    if (twitchVod) return `https://player.twitch.tv/?video=${twitchVod[1]}&parent=${window.location.hostname}&autoplay=true`;

    const dmMatch = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
    if (dmMatch) return `https://www.dailymotion.com/embed/video/${dmMatch[1]}?autoplay=1`;

    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;

    return null;
  } catch {
    return null;
  }
}

export default function InAppBrowser({ url, title, onClose }: InAppBrowserProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedUrl = normalizeUrl(url);
  const embedUrl = getEmbedUrl(normalizedUrl);
  const isEmbed = embedUrl !== null;
  // For non-embed URLs, always route through proxy
  const iframeSrc = embedUrl || getProxyUrl(normalizedUrl);

  // Prevent body scroll while browser is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Handle hardware back button
  useEffect(() => {
    const handler = (e: PopStateEvent) => { e.preventDefault(); onClose(); };
    window.history.pushState({ inBrowser: true }, '');
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [onClose]);

  // Listen for messages from proxied page
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'slr_open_external' && e.data.url) {
        window.open(e.data.url, '_blank', 'noopener,noreferrer');
      }
      // Fallback page asked to reload with a different URL (e.g. stripchat homepage)
      if (e.data?.type === 'slr_reload_url' && e.data.url) {
        const newSrc = getProxyUrl(normalizeUrl(e.data.url));
        if (iframeRef.current) {
          iframeRef.current.src = newSrc;
          setLoading(true);
          setBlocked(false);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Set loading timeout — proxy takes time for large sites
  useEffect(() => {
    setLoading(true);
    setBlocked(false);
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    // 60s timeout — stripchat SPA takes time to hydrate
    loadTimeoutRef.current = setTimeout(() => setLoading(false), 60000);
    return () => { if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current); };
  }, [iframeKey, normalizedUrl]);

  const handleLoad = () => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    setLoading(false);
    // Don't check content — let whatever the proxy returned show
  };

  const handleError = () => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    setLoading(false);
    setBlocked(true);
  };

  const reload = () => {
    setLoading(true);
    setBlocked(false);
    setIframeKey(k => k + 1);
  };

  const openExternal = () => window.open(normalizedUrl, '_blank', 'noopener,noreferrer');

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: '#000' }}>

      {/* ── Minimal Top Bar — only SEXY LIVE ROOM branding ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4"
        style={{
          height: '52px',
          background: 'rgba(8,3,12,0.97)',
          borderBottom: '1px solid rgba(255,20,147,0.15)',
          zIndex: 10,
        }}>

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
          style={{ background: 'rgba(255,20,147,0.12)', border: '1px solid rgba(255,20,147,0.25)' }}>
          <X className="w-4 h-4 text-primary" />
        </button>

        {/* Center branding */}
        <div className="flex flex-col items-center">
          <span
            className="font-black text-base tracking-widest"
            style={{
              color: '#FF1493',
              textShadow: '0 0 16px rgba(255,20,147,0.7), 0 0 32px rgba(255,20,147,0.3)',
              letterSpacing: '4px',
            }}>
            SEXY
          </span>
          <span className="text-[9px] text-gray-500 tracking-[5px] -mt-0.5 font-semibold">LIVE ROOM</span>
        </div>

        {/* Reload button */}
        <button
          onClick={reload}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 relative overflow-hidden" style={{ background: '#000' }}>

        {/* Loading overlay */}
        {loading && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            style={{ background: 'radial-gradient(ellipse at center, #1a0028 0%, #080010 60%, #000 100%)' }}>
            <div className="relative flex items-center justify-center" style={{ width: '120px', height: '120px' }}>
              {/* Outer spinning ring */}
              <div
                className="absolute inset-0 rounded-full animate-spin"
                style={{
                  background: 'conic-gradient(from 0deg, #FF1493, #C2185B, transparent, transparent)',
                  padding: '3px',
                }}>
                <div className="w-full h-full rounded-full" style={{ background: '#080010' }} />
              </div>
              {/* Inner ring (counter-rotate) */}
              <div
                className="absolute inset-2 rounded-full animate-spin"
                style={{
                  background: 'conic-gradient(from 180deg, #7B2FBE, transparent, transparent)',
                  padding: '2px',
                  animationDirection: 'reverse',
                  animationDuration: '1.5s',
                }}>
                <div className="w-full h-full rounded-full" style={{ background: '#080010' }} />
              </div>
              {/* Center */}
              <span className="relative z-10 text-2xl" style={{ textShadow: '0 0 20px rgba(255,20,147,0.8)' }}>💋</span>
            </div>

            <div className="mt-6 flex flex-col items-center gap-1">
              <span className="text-white font-black text-sm tracking-widest"
                style={{ textShadow: '0 0 12px rgba(255,20,147,0.5)' }}>
                INAFUNGUA...
              </span>
              <div className="flex gap-1 mt-2">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    style={{ animation: `_slrBounce 1.2s ease-in-out infinite`, animationDelay: `${i * 0.2}s`, opacity: 0.7 }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Blocked fallback */}
        {blocked && !loading && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6"
            style={{ background: 'radial-gradient(ellipse at center, #1a0028 0%, #080010 60%, #000 100%)' }}>
            <div className="text-5xl mb-5">🌐</div>
            <h3 className="text-white font-black text-xl mb-2 text-center">Imeshindwa Kufungua</h3>
            <p className="text-gray-400 text-sm text-center mb-8 leading-relaxed max-w-xs">
              Tovuti hii haiwezi kufunguliwa ndani ya app. Jaribu tena au fungua kwenye browser.
            </p>
            <button
              onClick={reload}
              className="w-full max-w-xs py-4 rounded-2xl gradient-pink text-white font-black text-base flex items-center justify-center gap-3 active:scale-95 transition-transform mb-3"
              style={{ boxShadow: '0 4px 32px rgba(255,20,147,0.45)' }}>
              <RefreshCw className="w-5 h-5" /> Jaribu Tena
            </button>
            <button
              onClick={openExternal}
              className="w-full max-w-xs py-3 rounded-2xl text-gray-400 font-semibold text-sm flex items-center justify-center gap-2 border border-gray-700">
              <ExternalLink className="w-4 h-4" /> Fungua Browser
            </button>
          </div>
        )}

        {/* iframe — shifted up to hide site's own navbar behind our top bar */}
        {!blocked && (
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={iframeSrc}
              onLoad={handleLoad}
              onError={handleError}
              title={title || 'SEXY LIVE ROOM'}
              allow="camera; microphone; autoplay; fullscreen; payment; geolocation; accelerometer; gyroscope; picture-in-picture; clipboard-write; encrypted-media; web-share"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-pointer-lock allow-top-navigation-by-user-activation allow-downloads allow-modals allow-presentation allow-popups-to-escape-sandbox allow-orientation-lock"
              style={{
                width: '100%',
                // Extend beyond visible area to hide site's header (usually 50-80px)
                height: isEmbed ? '100%' : 'calc(100% + 80px)',
                border: 'none',
                display: 'block',
                // Shift upward so site's top navbar is hidden under our bar
                marginTop: isEmbed ? '0' : '-80px',
                background: '#000',
                background: '#000',
              }}
            />
          </div>
        )}
      </div>

      {/* Bottom close strip */}
      <div
        className="flex-shrink-0 flex items-center justify-center py-2"
        style={{
          background: 'rgba(8,3,12,0.97)',
          borderTop: '1px solid rgba(255,20,147,0.08)',
          minHeight: '36px',
        }}>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-5 py-1 rounded-full text-gray-600 text-xs font-semibold"
          style={{ background: 'rgba(255,20,147,0.05)' }}>
          <X className="w-3 h-3" /> Funga
        </button>
      </div>

      <style>{`
        @keyframes _slrBounce {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
