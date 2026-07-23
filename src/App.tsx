
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import { MediaViewerProvider } from "@/components/features/GlobalMediaViewer";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import EditProfile from "./pages/EditProfile";
import Chat from "./pages/Chat";
import ChatDetail from "./pages/ChatDetail";
import SexyRoom from "./pages/SexyRoom";
import Downloads from "./pages/Downloads";
import Notifications from "./pages/Notifications";
import Wallet from "./pages/Wallet";
import Services from "./pages/Services";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import MalayaSection from "./pages/MalayaSection";
import VideoSection from "./pages/VideoSection";
import LiveSection from "./pages/LiveSection";
import VideoPlayer from "./pages/VideoPlayer";
import Support from "./pages/Support";
import ViewProfile from "./pages/ViewProfile";
import NotFound from "./pages/NotFound";
import Saved from "./pages/Saved";
import Gift from "./pages/Gift";
import TikSexy from "./pages/TikSexy";
import AdminServices from "./pages/AdminServices";
import LiveSetup from "./pages/LiveSetup";
import LiveStream from "./pages/LiveStream";
import LiveDiscover from "./pages/LiveDiscover";
import LiveReplay from "./pages/LiveReplay";

import { Phone, Video, X, PhoneOff, MessageCircle } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60000, gcTime: 300000, refetchOnWindowFocus: false } }
});

// ─── Passcode Lock ─────────────────────────────────────────────────────────
function PasscodeLockScreen({ onUnlock, passcode }: { onUnlock: () => void; passcode: string }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const failedRef = useRef(0);
  const [showHelp, setShowHelp] = useState(false);
  const [failedDisplay, setFailedDisplay] = useState(0);
  const pinLength = passcode?.length || 4;

  function triggerError(newFailed: number) {
    setError(true); setShake(true); setPin('');
    setFailedDisplay(newFailed);
    if (newFailed >= 3) {
      setShowHelp(true);
      supabase.from('user_profiles').select('id').eq('is_admin', true).limit(1).single().then(({ data: adminProf }) => {
        if (adminProf) {
          const username = localStorage.getItem('slr_username') || 'Mtu asiyejulikana';
          supabase.from('notifications').insert({ user_id: adminProf.id, title: '⚠️ Passcode Imeshindwa', message: `${username} amejaribu passcode mara ${newFailed} na ameshindwa. Wasiliana nao ili uwasaidie.`, type: 'system' });
          supabase.from('messages').insert({ sender_id: adminProf.id, receiver_id: adminProf.id, content: `⚠️ TAARIFA: Mtumiaji "${username}" amejaribu passcode mara ${newFailed} na ameshindwa. Huenda anahitaji msaada wa kufungua akaunti yake.` });
        }
      }).catch(() => {});
    }
    setTimeout(() => { setError(false); setShake(false); }, 1200);
  }

  function checkPin(p: string) {
    if (p === passcode) {
      onUnlock();
    } else if (p.length >= pinLength) {
      failedRef.current += 1;
      triggerError(failedRef.current);
    }
  }

  function addDigit(d: string) {
    if (error) return; // ignore input while error animation runs
    const newPin = pin + d;
    setPin(newPin);
    if (newPin.length >= pinLength) setTimeout(() => checkPin(newPin), 80);
  }

  async function requestHelp() {
    try {
      const { data: s } = await supabase.from('app_settings').select('value').eq('key', 'whatsapp_support').single();
      const adminWA = (s?.value || '+255655299602').replace(/\D/g, '');
      const username = localStorage.getItem('slr_username') || localStorage.getItem('slr_user_phone') || 'Sijui';
      const msg = encodeURIComponent(`Habari Admin, nimesahau passcode ya SexyRoom. Jina langu: ${username}`);
      window.open(`https://wa.me/${adminWA}?text=${msg}`, '_blank');
    } catch {
      window.open('https://wa.me/255655299602', '_blank');
    }
  }

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-background" style={{ userSelect: 'none' }}>
      <div className="w-full max-w-sm px-8 text-center">
        <div className={`text-5xl mb-4 ${error ? 'animate-bounce' : ''}`}>🔒</div>
        <h2 className="text-white font-black text-2xl mb-1">Weka Passcode</h2>
        <p className="text-gray-500 text-sm mb-8">Ingiza PIN yako ya kufungua app</p>
        <div className={`flex gap-4 justify-center mb-10 ${shake ? 'animate-pulse' : ''}`}>
          {Array.from({ length: pinLength }).map((_, i) => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              i < pin.length
                ? error ? 'bg-red-500 border-red-500 scale-110' : 'bg-primary border-primary scale-110'
                : error ? 'border-red-500 bg-red-500/20' : 'border-gray-600'
            }`} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} onClick={() => addDigit(d)}
              className="h-16 rounded-2xl text-white font-bold text-xl transition-all active:scale-90 active:bg-primary/30"
              style={{ background: error ? 'rgba(220,38,38,0.15)' : 'rgba(26,10,26,0.9)', border: `1px solid ${error ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
              {d}
            </button>
          ))}
          <div className="h-16" />
          <button onClick={() => addDigit('0')}
            className="h-16 rounded-2xl text-white font-bold text-xl transition-all active:scale-90 active:bg-primary/30"
            style={{ background: error ? 'rgba(220,38,38,0.15)' : 'rgba(26,10,26,0.9)', border: `1px solid ${error ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
            0
          </button>
          <button onClick={() => setPin(p => p.slice(0, -1))}
            className="h-16 rounded-2xl text-white font-bold text-xl transition-all active:scale-90"
            style={{ background: 'rgba(26,10,26,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}>
            ⌫
          </button>
        </div>
        {error && failedDisplay < 3 && <p className="text-red-400 text-sm font-semibold animate-pulse">PIN si sahihi! Majaribio yaliyobaki: {3 - failedDisplay}</p>}
        {error && failedDisplay === 0 && <p className="text-red-400 text-sm font-semibold">PIN si sahihi, jaribu tena</p>}
        {showHelp && (
          <div className="mt-4 space-y-3">
            <p className="text-red-400 text-sm font-semibold">⚠️ Umejaribu mara nyingi mno</p>
            <button onClick={requestHelp}
              className="w-full py-3 rounded-2xl bg-green-600 text-white font-black text-base flex items-center justify-center gap-2 active:scale-95">
              💬 Omba Msaada kwa Admin (WhatsApp)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockedScreen({ whatsapp }: { whatsapp: string }) {
  const { logout } = useAuth();
  const handleChangeAccount = async () => {
    try { await logout(); } catch {}
    window.location.replace('/login');
  };
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-24 h-24 rounded-full bg-red-600/20 border-2 border-red-500 flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl">🚫</span>
        </div>
        <h1 className="text-white font-black text-2xl mb-3">Akaunti Imezuiwa</h1>
        <p className="text-gray-400 text-base mb-2 leading-relaxed">Akaunti yako imezuiwa na Admin. Huwezi kutumia huduma zetu kwa sasa.</p>
        <p className="text-gray-500 text-sm mb-6">Kama umefanya kosa au unahitaji msaada, wasiliana na Admin moja kwa moja kupitia WhatsApp.</p>
        <button onClick={() => {
          const num = (whatsapp || '+255655299602').replace(/\D/g, '');
          window.open(`https://wa.me/${num}?text=${encodeURIComponent('Habari Admin, akaunti yangu imezuiwa. Naomba msaada.')}`, '_blank');
        }} className="w-full py-4 rounded-2xl bg-green-600 text-white font-black text-lg flex items-center justify-center gap-3 active:scale-95 transition-transform mb-3">
          <MessageCircle className="w-6 h-6" /> Piga WhatsApp Admin
        </button>
        <button onClick={handleChangeAccount}
          className="w-full py-4 rounded-2xl bg-[#1a0a1a] border border-primary/40 text-primary font-black text-lg flex items-center justify-center gap-3 active:scale-95 transition-transform">
          🔄 Badilisha Akaunti
        </button>
      </div>
    </div>
  );
}

// ─── Push Notification Permission Request ───────────────────────────────────
function PushPermissionRequester() {
  const { user } = useAuth();
  const didInit = useRef(false);

  useEffect(() => {
    // Listen for SW → App navigation messages (from notification click)
    if (!('serviceWorker' in navigator)) return;
    const navHandler = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        console.log('[SW→App] Navigate to:', event.data.url);
        window.location.href = event.data.url;
      }
    };
    navigator.serviceWorker.addEventListener('message', navHandler);
    return () => navigator.serviceWorker.removeEventListener('message', navHandler);
  }, []);

  useEffect(() => {
    if (!user || didInit.current) return;
    didInit.current = true;

    const init = async () => {
      // Step 1: Register SW (must happen before permission request)
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js');
          console.log('[SW] Registered, scope:', reg.scope);
          // Force activate if waiting
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        } catch (e) {
          console.warn('[SW] Registration failed:', e);
        }
      }

      // Step 2: Request notification permission after 2.5s (give user time to settle)
      setTimeout(async () => {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'default') {
          console.log('[Push] Permission already:', Notification.permission);
          return;
        }
        try {
          const result = await Notification.requestPermission();
          console.log('[Push] Permission result:', result);
          // If granted, ensure SW is active (controller available)
          if (result === 'granted' && 'serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration('/sw.js');
            if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        } catch (e) {
          console.warn('[Push] Permission request error:', e);
        }
      }, 2500);
    };

    init();
  }, [user]);

  return null;
}

// ─── Block Guard ─────────────────────────────────────────────────────────────
function BlockGuard({ children }: { children: React.ReactNode }) {
  const { profile, user, refreshProfile } = useAuth() as any;
  const [adminWhatsapp, setAdminWhatsapp] = useState('+255655299602');
  const [isBlocked, setIsBlocked] = useState(false);
  const wasEverBlocked = useRef(false);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'whatsapp_support').single()
      .then(({ data }) => { if (data?.value) setAdminWhatsapp(data.value); });
  }, []);

  useEffect(() => {
    if (profile && (profile.is_blocked || profile.account_status === 'blocked')) {
      setIsBlocked(true);
      wasEverBlocked.current = true;
    }
  }, [profile?.id, profile?.is_blocked, profile?.account_status]);

  useEffect(() => {
    if (!user) return;
    const checkBlocked = async () => {
      const { data } = await supabase.from('user_profiles').select('is_blocked,account_status').eq('id', user.id).single();
      if (data && (data.is_blocked || data.account_status === 'blocked')) {
        setIsBlocked(true);
        wasEverBlocked.current = true;
        if (refreshProfile) refreshProfile();
      } else if (!wasEverBlocked.current) {
        setIsBlocked(false);
      }
    };
    checkBlocked();
    const interval = setInterval(checkBlocked, 4000);
    return () => clearInterval(interval);
  }, [user?.id]);

  if (isBlocked || wasEverBlocked.current) return <BlockedScreen whatsapp={adminWhatsapp} />;
  return <>{children}</>;
}

// ─── Passcode Timeout Guard ────────────────────────────────────────────────
function PasscodeGuard({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth() as any;
  const [locked, setLocked] = useState(false);
  const [activePasscode, setActivePasscode] = useState<string | null>(null);
  const [passcodeReady, setPasscodeReady] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch passcode from DB to ensure admin changes sync
  useEffect(() => {
    const initPasscode = async () => {
      // Start with localStorage value
      let passcode: string | null = null;
      try { passcode = localStorage.getItem('slr_app_passcode'); } catch {}

      if (user?.id) {
        // Fetch from DB - admin may have changed it
        try {
          const { data } = await supabase.from('user_profiles').select('app_passcode,username').eq('id', user.id).single();
          if (data) {
            const dbPasscode = data.app_passcode || null;
            // Update localStorage to match DB
            if (dbPasscode) {
              try { localStorage.setItem('slr_app_passcode', dbPasscode); localStorage.setItem('slr_username', data.username || ''); } catch {}
              passcode = dbPasscode;
            } else {
              // Passcode cleared in DB (admin disabled it)
              try { localStorage.removeItem('slr_app_passcode'); } catch {}
              passcode = null;
            }
          }
        } catch {}
      }

      setActivePasscode(passcode);

      if (passcode) {
        // Lock mode: '0' = on every page load/screen-on (default), '9999' = never
        const mode = (() => { try { return localStorage.getItem('slr_passcode_timeout') || '0'; } catch { return '0'; } })();
        if (mode !== '9999') {
          const lastSeen = (() => { try { return parseInt(localStorage.getItem('slr_last_active') || '0'); } catch { return 0; } })();
          const elapsed = lastSeen > 0 ? Date.now() - lastSeen : 999999;
          const timeoutMs = mode === '0' ? 0 : parseInt(mode) * 60 * 1000;
          if (timeoutMs === 0 || elapsed > timeoutMs) {
            setLocked(true);
          }
        }
      }
      setPasscodeReady(true);
    };
    initPasscode();
  }, [user?.id]);

  // Poll DB every 30s to sync passcode changes from admin
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.from('user_profiles').select('app_passcode').eq('id', user.id).single();
        const dbPasscode = data?.app_passcode || null;
        const current = (() => { try { return localStorage.getItem('slr_app_passcode'); } catch { return null; } })();
        if (dbPasscode !== current) {
          if (dbPasscode) {
            try { localStorage.setItem('slr_app_passcode', dbPasscode); } catch {}
            setActivePasscode(dbPasscode);
          } else {
            try { localStorage.removeItem('slr_app_passcode'); } catch {}
            setActivePasscode(null);
            setLocked(false);
          }
        }
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Visibility change - lock when screen turns off / tab switches
  useEffect(() => {
    if (!activePasscode) return;
    const handleVisibility = () => {
      const mode = (() => { try { return localStorage.getItem('slr_passcode_timeout') || '0'; } catch { return '0'; } })();
      if (mode === '9999') return;
      if (!document.hidden) {
        // Returning - check elapsed
        const lastSeen = (() => { try { return parseInt(localStorage.getItem('slr_last_active') || '0'); } catch { return 0; } })();
        const elapsed = lastSeen > 0 ? Date.now() - lastSeen : 999999;
        const timeoutMs = mode === '0' ? 0 : parseInt(mode) * 60 * 1000;
        if (timeoutMs === 0 || elapsed > timeoutMs) setLocked(true);
      } else {
        try { localStorage.setItem('slr_last_active', String(Date.now())); } catch {}
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [activePasscode]);

  if (!passcodeReady) return <>{children}</>;

  if (locked && activePasscode) {
    return <PasscodeLockScreen passcode={activePasscode} onUnlock={() => {
      setLocked(false);
      try { localStorage.setItem('slr_last_active', String(Date.now())); } catch {}
    }} />;
  }
  return <>{children}</>;
}

// Incoming Call Overlay
function IncomingCallOverlay() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState<{
    callerId: string; callerName: string; callerAvatar?: string; isVideo: boolean; channel: string;
  } | null>(null);
  const processedSignals = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !profile) return;
    const checkIncomingCalls = async () => {
      const since = new Date(Date.now() - 10000).toISOString();
      const { data } = await supabase.from('room_messages').select('*, user:user_id(username,avatar_url)').eq('media_type', 'signal').gte('created_at', since).order('created_at', { ascending: false }).limit(20);
      for (const msg of (data || [])) {
        if (msg.user_id === user.id) continue;
        if (processedSignals.current.has(msg.id)) continue;
        try {
          const signal = JSON.parse(msg.content || '');
          if (signal.type === 'offer' && signal.channel?.includes(user.id)) {
            processedSignals.current.add(msg.id);
            const callerUser = (msg as any).user;
            setIncomingCall({ callerId: msg.user_id, callerName: callerUser?.username || 'Mtu', callerAvatar: callerUser?.avatar_url, isVideo: signal.isVideo === true, channel: signal.channel });
            if (processedSignals.current.size > 100) {
              const arr = Array.from(processedSignals.current);
              processedSignals.current = new Set(arr.slice(-50));
            }
            break;
          }
        } catch {}
      }
    };
    const interval = setInterval(checkIncomingCalls, 2000);
    return () => clearInterval(interval);
  }, [user, profile]);

  async function acceptCall() {
    if (!incomingCall) return;
    navigate(`/profile/${incomingCall.callerId}`);
    setIncomingCall(null);
  }

  async function declineCall() {
    if (!incomingCall || !user) return;
    await supabase.from('room_messages').insert({ user_id: user.id, content: JSON.stringify({ type: 'end', channel: incomingCall.channel }), media_type: 'signal' });
    setIncomingCall(null);
  }

  if (!incomingCall) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[500] flex justify-center pt-4 px-4" style={{ pointerEvents: 'none' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(10,3,15,0.97), rgba(30,8,30,0.97))', border: '1px solid rgba(255,20,147,0.5)', backdropFilter: 'blur(20px)', pointerEvents: 'auto', animation: 'slideDown 0.3s ease' }}>
        <div className="p-4 flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-primary">
              {incomingCall.callerAvatar ? <img src={incomingCall.callerAvatar} className="w-full h-full object-cover" alt="" /> :
                <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-black text-xl">{incomingCall.callerName[0]?.toUpperCase()}</span></div>}
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-50" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-base truncate">{incomingCall.callerName}</p>
            <p className="text-gray-400 text-sm flex items-center gap-1">
              {incomingCall.isVideo ? <Video className="w-3 h-3 text-blue-400" /> : <Phone className="w-3 h-3 text-green-400" />}
              {incomingCall.isVideo ? 'Video Call' : 'Simu ya Sauti'} inaingia...
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={declineCall} className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center active:scale-90 transition-transform" style={{ boxShadow: '0 4px 15px rgba(220,38,38,0.5)' }}>
              <PhoneOff className="w-5 h-5 text-white" />
            </button>
            <button onClick={acceptCall} className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center active:scale-90 transition-transform" style={{ boxShadow: '0 4px 15px rgba(34,197,94,0.5)' }}>
              {incomingCall.isVideo ? <Video className="w-5 h-5 text-white" /> : <Phone className="w-5 h-5 text-white" />}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideDown { from { transform: translateY(-120%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}

// Back button guard - only prevents leaving the site when at the root page
function BackButtonHandler() {
  const location = useLocation();

  useEffect(() => {
    // Only interfere at the root - push a duplicate entry so back stays on home
    if (location.pathname === '/') {
      window.history.pushState(null, '', '/');
    }
  }, [location.pathname]);

  useEffect(() => {
    const handlePopState = () => {
      // If we ended up at the root via back, push again to stay
      if (window.location.pathname === '/') {
        window.history.pushState(null, '', '/');
      }
      // Otherwise let React Router handle it naturally - don't call navigate(-1)
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return null;
}

// ─── Global App Settings (font/color) ───────────────────────────────────────
function GlobalAppSettings() {
  useEffect(() => {
    // Prevent browser context menu (right-click/long-press) on images and videos
    // This blocks browser download options from appearing
    const preventContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' || target.tagName === 'VIDEO' || target.closest('video') || target.closest('img')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };
    // Block right-click on images/videos on all browsers
    document.addEventListener('contextmenu', preventContextMenu, true);

    // Screenshot protection - comprehensive multi-layer approach
    const applyScreenshotProtection = (enabled: boolean) => {
      // Remove existing protection styles
      document.getElementById('slr-screenshot-protection')?.remove();
      document.querySelectorAll('.slr-media-overlay').forEach(el => el.remove());
      if (enabled) {
        // Layer 1: CSS - disable selection and touch callout globally
        const el = document.createElement('style');
        el.id = 'slr-screenshot-protection';
        el.textContent = `
          * { -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; }
          img, video, canvas {
            -webkit-user-drag: none !important;
            -khtml-user-drag: none !important;
            -moz-user-drag: none !important;
            user-drag: none !important;
            -webkit-touch-callout: none !important;
          }
          input, textarea, button, a, select, [contenteditable] { 
            -webkit-user-select: text !important; 
            user-select: text !important; 
            pointer-events: auto !important; 
          }
        `;
        document.head.appendChild(el);

        // Layer 2: CSS pointer-events on media (lightweight, no DOM overlay spam)
        // The CSS already handles most cases via user-select:none
      } else {
        // Clean up overlay observer
        (window as any)._slrScreenshotObs?.disconnect();
        delete (window as any)._slrScreenshotObs;
      }
    };

    // Check screenshot setting from DB
    supabase.from('app_settings').select('value').eq('key', 'block_screenshots').single()
      .then(({ data }) => { if (data?.value === 'true') applyScreenshotProtection(true); });

    // Listen for admin toggle
    const screenshotListener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.block_screenshots !== undefined) applyScreenshotProtection(detail.block_screenshots === 'true');
    };
    window.addEventListener('app-settings-updated', screenshotListener);

    // Block keyboard shortcuts for screenshots
    const blockScreenshotKeys = (e: KeyboardEvent) => {
      const isBlockEnabled = document.getElementById('slr-screenshot-protection');
      if (!isBlockEnabled) return;
      // Block Print Screen, F12 screenshot combos, Ctrl+S, Ctrl+P
      if (e.key === 'PrintScreen' || (e.ctrlKey && (e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P'))) {
        e.preventDefault();
        e.stopPropagation();
        // Flash black overlay briefly
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:black;z-index:999999;pointer-events:none;';
        document.body.appendChild(overlay);
        setTimeout(() => overlay.remove(), 300);
      }
    };
    document.addEventListener('keydown', blockScreenshotKeys, true);

    // Block long-press on touch devices (prevents mobile browser download menu)
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    const preventLongPress = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' || target.tagName === 'VIDEO' || target.closest('video') || target.closest('img')) {
        longPressTimer = setTimeout(() => {
          e.preventDefault();
          e.stopPropagation();
        }, 300);
      }
    };
    const clearLongPress = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    };
    document.addEventListener('touchstart', preventLongPress, { passive: false, capture: true });
    document.addEventListener('touchend', clearLongPress, { capture: true });
    document.addEventListener('touchcancel', clearLongPress, { capture: true });

    // Block drag (another way to save images)
    const preventDrag = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' || target.tagName === 'VIDEO') {
        e.preventDefault();
        return false;
      }
    };
    document.addEventListener('dragstart', preventDrag, true);

    const applySettings = (s: Record<string, string>) => {
      const root = document.documentElement;
      if (s.app_font_size) root.style.setProperty('--app-font-size', s.app_font_size + 'px');
      if (s.app_text_color) root.style.setProperty('--app-text-color', s.app_text_color);
      if (s.primary_color) {
        root.style.setProperty('--app-primary-color', s.primary_color);
        // Update CSS --primary variable for Tailwind
        const hex = s.primary_color;
        if (hex.startsWith('#') && hex.length >= 7) {
          const r = parseInt(hex.slice(1,3),16);
          const g = parseInt(hex.slice(3,5),16);
          const b = parseInt(hex.slice(5,7),16);
          root.style.setProperty('--primary', `${r} ${g} ${b}`);
        }
      }
      const ff = s.app_font_family;
      if (ff && ff !== 'default') {
        const map: Record<string,string> = {
          dancing: 'Dancing Script, cursive',
          pacifico: 'Pacifico, cursive',
          lobster: 'Lobster, cursive',
          inter: 'Inter, system-ui, sans-serif',
          poppins: 'Poppins, system-ui, sans-serif',
        };
        if (map[ff]) root.style.setProperty('--app-font-family', map[ff]);
      } else if (ff === 'default') {
        root.style.removeProperty('--app-font-family');
      }
    };

    // Load from DB
    supabase.from('app_settings').select('key,value')
      .in('key', ['app_font_size','app_text_color','primary_color','app_font_family'])
      .then(({ data }) => {
        const s: Record<string,string> = {};
        (data || []).forEach((r: any) => { s[r.key] = r.value; });
        applySettings(s);
      });

    // Listen for live updates from admin panel
    const listener = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      applySettings(d);
    };
    window.addEventListener('app-settings-updated', listener);
    return () => {
      window.removeEventListener('app-settings-updated', listener);
      window.removeEventListener('app-settings-updated', screenshotListener);
      document.removeEventListener('keydown', blockScreenshotKeys, true);
      document.removeEventListener('contextmenu', preventContextMenu, true);
      document.removeEventListener('touchstart', preventLongPress, true);
      document.removeEventListener('touchend', clearLongPress, true);
      document.removeEventListener('touchcancel', clearLongPress, true);
      document.removeEventListener('dragstart', preventDrag, true);
    };
  }, []);
  return null;
}

function AppRoutes() {
  return (
    <>
      <GlobalAppSettings />
      <ScrollToTop />
      <BackButtonHandler />
      <IncomingCallOverlay />
      <PushPermissionRequester />
      <BlockGuard>
        <PasscodeGuard>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/profile/edit" element={<EditProfile />} />
            <Route path="/profile/:id" element={<ViewProfile />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/chat/:userId" element={<ChatDetail />} />
            <Route path="/sexyroom" element={<SexyRoom />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/services" element={<Services />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/malaya" element={<MalayaSection />} />
            <Route path="/video" element={<VideoSection />} />
            <Route path="/live" element={<LiveSection />} />
            <Route path="/malaya/:id" element={<MalayaSection />} />
            <Route path="/video/:id" element={<VideoSection />} />
            <Route path="/sexyroom/:id" element={<SexyRoom />} />
            <Route path="/live/setup" element={<LiveSetup />} />
            <Route path="/live/discover" element={<LiveDiscover />} />
            <Route path="/live/replay/:id" element={<LiveReplay />} />
            <Route path="/live/:id" element={<LiveStream />} />
            <Route path="/play" element={<VideoPlayer />} />
            <Route path="/support" element={<Support />} />
            <Route path="/saved" element={<Saved />} />
            <Route path="/gift" element={<Gift />} />
            <Route path="/tiksexy" element={<TikSexy />} />
            <Route path="/admin-services" element={<AdminServices />} />
            <Route path="/u/:handle" element={<ViewProfile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PasscodeGuard>
      </BlockGuard>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <AppProvider>
          <MediaViewerProvider>
            <Toaster />
            <Sonner position="top-center" toastOptions={{
              style: { background: '#1a0a1a', border: '1px solid #FF1493', color: 'white' }
            }} />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </MediaViewerProvider>
        </AppProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
