import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Download, Play, Pause, Volume2, VolumeX,
  RotateCcw, RotateCw, Maximize, Minimize, Sun, PictureInPicture2,
  ChevronLeft, ChevronRight, List, Repeat, WifiOff, AlertTriangle
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PlanPickerModal } from '@/pages/Services';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SubTrack { label: string; src: string; srclang: string; }

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

// ─── Resume storage ───────────────────────────────────────────────────────────
function getResume(url: string): number {
  try { return parseFloat(localStorage.getItem('vp_resume_' + btoa(url).slice(0,32)) || '0') || 0; } catch { return 0; }
}
function setResume(url: string, t: number) {
  try { if (t > 3) localStorage.setItem('vp_resume_' + btoa(url).slice(0,32), String(Math.floor(t))); } catch {}
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="relative">
        <div className="w-14 h-14 rounded-full border-4 border-white/10 border-t-[#FF1493] animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-b-white animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.6s' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Seek Thumbnail ───────────────────────────────────────────────────────────
function SeekThumb({ videoEl, progress, duration, visible }: { videoEl: HTMLVideoElement | null; progress: number; duration: number; visible: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbUrl, setThumbUrl] = useState('');
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible || !videoEl || !duration) return;
    if (captureTimer.current) clearTimeout(captureTimer.current);
    captureTimer.current = setTimeout(() => {
      try {
        const c = canvasRef.current; if (!c) return;
        const ctx = c.getContext('2d'); if (!ctx) return;
        c.width = 160; c.height = 90;
        ctx.drawImage(videoEl, 0, 0, 160, 90);
        setThumbUrl(c.toDataURL('image/jpeg', 0.7));
      } catch {}
    }, 80);
    return () => { if (captureTimer.current) clearTimeout(captureTimer.current); };
  }, [progress, visible, duration]);

  if (!visible) return null;
  return (
    <div className="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none z-30"
      style={{ left: `${Math.max(5, Math.min(95, progress))}%` }}>
      <div className="bg-black/80 rounded-lg overflow-hidden border border-white/20 shadow-2xl">
        <canvas ref={canvasRef} className="hidden" />
        {thumbUrl ? <img src={thumbUrl} alt="" style={{ width: 160, height: 90 }} /> :
          <div style={{ width: 160, height: 90 }} className="flex items-center justify-center bg-black/60">
            <span className="text-white text-xs font-mono">{fmt(duration * progress / 100)}</span>
          </div>}
        <div className="text-center py-0.5 bg-black/50">
          <span className="text-white text-[10px] font-mono">{fmt(duration * progress / 100)}</span>
        </div>
      </div>
      <div className="w-0 h-0 mx-auto border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-black/80" />
    </div>
  );
}

// ─── Double Tap Indicator ─────────────────────────────────────────────────────
function TapIndicator({ side, visible }: { side: 'left' | 'right' | null; visible: boolean }) {
  if (!visible || !side) return null;
  return (
    <div className={`absolute top-1/2 -translate-y-1/2 pointer-events-none z-20 flex items-center gap-1 px-4 py-3 rounded-full bg-white/20 backdrop-blur-sm transition-opacity duration-300 ${side === 'left' ? 'left-4' : 'right-4'}`}>
      {side === 'left' ? <><RotateCcw className="w-5 h-5 text-white" /><span className="text-white text-sm font-bold">-10s</span></> : <><span className="text-white text-sm font-bold">+10s</span><RotateCw className="w-5 h-5 text-white" /></>}
    </div>
  );
}

// ─── Main VideoPlayer ─────────────────────────────────────────────────────────
export default function VideoPlayer() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const state = (location.state as any) || {};
  const videoUrls: string[] = state.urls?.length > 0 ? state.urls : state.url ? [state.url] : [];
  const initTitle: string = state.title || 'Video';
  const initThumb: string = state.thumbnail || state.thumbnailUrl || '';

  const [idx, setIdx] = useState(0);
  const url = videoUrls[idx] || '';

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  // Controls hide timer
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CONTROLS_HIDE_DELAY = 4000; // 4 seconds
  // CRITICAL: ref to track current controls visibility state
  // This prevents stale closures in mousemove/touch handlers fighting with tap-toggle
  const showControlsRef = useRef(true);
  // Double-tap detection
  const lastTapTime = useRef<number>(0);
  const lastTapX = useRef<number>(0);
  const swipeStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const playAttemptRef = useRef(0);
  const saveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const hlsRef = useRef<any>(null);
  // Track playing state in ref for use inside callbacks
  const playingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [posterUrl] = useState(initThumb);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [settings] = useState<any>({});
  const [loop, setLoop] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showBrightSlider, setShowBrightSlider] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [tapSide, setTapSide] = useState<'left' | 'right' | null>(null);
  const [tapVisible, setTapVisible] = useState(false);
  const [seekHover, setSeekHover] = useState(false);
  const [seekHoverPct, setSeekHoverPct] = useState(0);

  const isPrivileged = profile?.is_vip || profile?.is_business || profile?.is_admin;
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // ── Synced setter - keeps ref in sync with state ──
  const setShowControlsSynced = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setShowControls(prev => {
      const next = typeof val === 'function' ? (val as (p: boolean) => boolean)(prev) : val;
      showControlsRef.current = next;
      return next;
    });
  }, []);

  // ── Controls: show + start hide timer (for intentional show actions) ──
  const showControlsWithTimer = useCallback(() => {
    showControlsRef.current = true;
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      showControlsRef.current = false;
      setShowControls(false);
    }, CONTROLS_HIDE_DELAY);
  }, []);

  // ── Controls: only extend timer if already visible (for mouse/touch move) ──
  // NEVER force-show - this prevents fighting with tap-toggle
  const extendControlsTimerIfVisible = useCallback(() => {
    if (!showControlsRef.current) return; // Controls hidden - don't show them
    if (!playingRef.current) return; // Not playing - don't auto-hide
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      showControlsRef.current = false;
      setShowControls(false);
    }, CONTROLS_HIDE_DELAY);
  }, []);

  // ── Online/Offline ──
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Fullscreen listener ──
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  // ── PiP listeners ──
  useEffect(() => {
    const enter = () => setIsPip(true);
    const leave = () => setIsPip(false);
    document.addEventListener('enterpictureinpicture', enter);
    document.addEventListener('leavepictureinpicture', leave);
    return () => { document.removeEventListener('enterpictureinpicture', enter); document.removeEventListener('leavepictureinpicture', leave); };
  }, []);

  // ── Orientation listener ──
  useEffect(() => {
    const h = () => {
      const land = window.innerWidth > window.innerHeight || (screen.orientation?.type || '').includes('landscape');
      setIsLandscape(land);
    };
    window.addEventListener('orientationchange', h);
    window.addEventListener('resize', h);
    h();
    return () => { window.removeEventListener('orientationchange', h); window.removeEventListener('resize', h); };
  }, []);

  // ── Load video ──
  useEffect(() => {
    if (!url) { navigate(-1); return; }
    const v = videoRef.current; if (!v) return;
    setIsLoading(true); setIsBuffering(false); setError('');
    setPlaying(false); playingRef.current = false;
    setProgress(0); setCurrentTime(0); setDuration(0); setBuffered(0);
    if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; }
    const resume = getResume(url);
    if (url.includes('.m3u8')) {
      loadHls(url, v, resume);
    } else {
      v.src = url; v.load();
      if (resume > 3) { v.addEventListener('loadedmetadata', () => { if (v) v.currentTime = resume; }, { once: true }); }
    }
    playAttemptRef.current++;
    const attempt = playAttemptRef.current;
    const tryPlay = () => {
      if (attempt !== playAttemptRef.current) return;
      v.muted = false; v.volume = volume;
      v.play().then(() => { setPlaying(true); playingRef.current = true; setMuted(false); }).catch(() => {
        v.muted = true;
        v.play().then(() => { setPlaying(true); playingRef.current = true; setMuted(true); }).catch(() => {
          setIsLoading(false);
          showControlsRef.current = true;
          setShowControls(true);
        });
      });
    };
    v.addEventListener('canplay', tryPlay, { once: true });
    const t = setTimeout(() => {
      if (v && v.readyState < 3) {
        setIsLoading(false);
        showControlsRef.current = true;
        setShowControls(true);
      }
    }, 12000);
    return () => { clearTimeout(t); v.removeEventListener('canplay', tryPlay); };
  }, [url]);

  async function loadHls(src: string, v: HTMLVideoElement, resume: number) {
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src;
      if (resume > 3) v.addEventListener('loadedmetadata', () => { v.currentTime = resume; }, { once: true });
      return;
    }
    try {
      let Hls: any = null;
      try { const mod = await import('hls.js'); Hls = mod.default; } catch {
        await new Promise<void>((resolve, reject) => {
          if ((window as any).Hls) { Hls = (window as any).Hls; resolve(); return; }
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js';
          s.onload = () => { Hls = (window as any).Hls; resolve(); }; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      if (!Hls?.isSupported()) { v.src = src; return; }
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30 });
      hlsRef.current = hls;
      hls.loadSource(src); hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (resume > 3) v.currentTime = resume; });
      hls.on(Hls.Events.ERROR, (_: any, data: any) => {
        if (data.fatal) { setError('Imeshindwa kupakia stream.'); setIsLoading(false); }
      });
    } catch { v.src = src; }
  }

  // ── Save resume ──
  useEffect(() => {
    if (saveInterval.current) clearInterval(saveInterval.current);
    saveInterval.current = setInterval(() => {
      if (videoRef.current && playing) setResume(url, videoRef.current.currentTime);
    }, 3000);
    return () => { if (saveInterval.current) clearInterval(saveInterval.current); };
  }, [url, playing]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const v = videoRef.current; if (!v) return;
      showControlsWithTimer();
      switch (e.key) {
        case ' ': e.preventDefault(); v.paused ? v.play() : v.pause(); break;
        case 'ArrowLeft': e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10); break;
        case 'ArrowRight': e.preventDefault(); v.currentTime = Math.min(v.duration || 0, v.currentTime + 10); break;
        case 'ArrowUp': e.preventDefault(); { const nv = Math.min(1, (v.volume || 0) + 0.1); v.volume = nv; setVolume(nv); } break;
        case 'ArrowDown': e.preventDefault(); { const nv = Math.max(0, (v.volume || 0) - 0.1); v.volume = nv; setVolume(nv); } break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'm': case 'M': { v.muted = !v.muted; setMuted(v.muted); } break;
        case 'Escape': if (isFullscreen) document.exitFullscreen().catch(() => {}); break;
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isFullscreen, showControlsWithTimer]);

  // ── Video event handlers ──
  function onTimeUpdate() {
    const v = videoRef.current; if (!v) return;
    setCurrentTime(v.currentTime);
    setProgress((v.currentTime / (v.duration || 1)) * 100);
    if (v.buffered.length > 0 && v.duration) {
      setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
    }
  }
  function onLoadedMetadata() { if (videoRef.current) setDuration(videoRef.current.duration); }
  function onWaiting() { setIsBuffering(true); }
  function onPlaying() { setIsLoading(false); setIsBuffering(false); setPlaying(true); playingRef.current = true; }
  function onCanPlay() { setIsLoading(false); setIsBuffering(false); }
  function onCanPlayThrough() { setIsLoading(false); setIsBuffering(false); }
  function onLoadedData() { setIsLoading(false); }
  function onPlay() { setPlaying(true); playingRef.current = true; }
  function onPause() { setPlaying(false); playingRef.current = false; setIsBuffering(false); }
  function onEnded() {
    setPlaying(false); playingRef.current = false;
    if (loop) { videoRef.current?.play(); return; }
    if (idx < videoUrls.length - 1) setIdx(i => i + 1);
  }
  function onError() {
    setIsLoading(false); setIsBuffering(false);
    setError('Imeshindwa kupakia video. Angalia muunganisho wako.');
    showControlsRef.current = true;
    setShowControls(true);
  }

  // ── Toggle play/pause ──
  function togglePlay(e?: React.MouseEvent | React.TouchEvent) {
    e?.stopPropagation();
    const v = videoRef.current; if (!v) return;
    if (v.paused) {
      v.muted = false; v.volume = volume;
      v.play().then(() => { setPlaying(true); playingRef.current = true; setMuted(false); }).catch(() => {
        v.muted = true;
        v.play().then(() => { setPlaying(true); playingRef.current = true; setMuted(true); }).catch(() => {});
      });
    } else { v.pause(); }
    showControlsWithTimer();
  }

  // ── Toggle mute ──
  function toggleMute(e?: React.MouseEvent) {
    e?.stopPropagation();
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
    if (!v.muted && volume === 0) { v.volume = 1; setVolume(1); }
    showControlsWithTimer();
  }

  // ── Seek ──
  function seek(clientX: number, rect: DOMRect) {
    const v = videoRef.current; if (!v || !v.duration) return;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    v.currentTime = pct * v.duration;
    showControlsWithTimer();
  }

  // ── Volume change ──
  function handleVolumeChange(val: number) {
    const v = videoRef.current; if (!v) return;
    v.volume = val; v.muted = val === 0;
    setVolume(val); setMuted(val === 0);
  }

  // ── Speed change ──
  function handleSpeed(s: number) {
    const v = videoRef.current; if (!v) return;
    v.playbackRate = s; setSpeed(s); setShowSpeedMenu(false);
    showControlsWithTimer();
  }

  // ── Fullscreen ──
  async function toggleFullscreen(e?: React.MouseEvent) {
    e?.stopPropagation();
    const el = containerRef.current; if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        const screen = window.screen as any;
        if (screen.orientation?.lock) await screen.orientation.lock('landscape').catch(() => {});
      } else {
        await document.exitFullscreen();
        const screen = window.screen as any;
        if (screen.orientation?.unlock) screen.orientation.unlock();
      }
    } catch {}
    showControlsWithTimer();
  }

  // ── Rotate ──
  async function toggleRotate(e?: React.MouseEvent) {
    e?.stopPropagation();
    const screen = window.screen as any;
    try {
      if (isLandscape) {
        if (screen.orientation?.lock) await screen.orientation.lock('portrait-primary').catch(() => {});
        setIsLandscape(false);
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      } else {
        if (screen.orientation?.lock) {
          await screen.orientation.lock('landscape').catch(async () => {
            const el = containerRef.current;
            if (el && !document.fullscreenElement) await el.requestFullscreen().catch(() => {});
          });
        } else {
          const el = containerRef.current;
          if (el && !document.fullscreenElement) await el.requestFullscreen().catch(() => {});
        }
        setIsLandscape(true);
      }
    } catch {}
    showControlsWithTimer();
  }

  // ── PiP ──
  async function togglePip(e?: React.MouseEvent) {
    e?.stopPropagation();
    const v = videoRef.current; if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPip(false); showControlsWithTimer(); return;
      }
      if (typeof (v as any).requestPictureInPicture === 'function' && document.pictureInPictureEnabled) {
        if (v.paused) {
          v.muted = false;
          await v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
          await new Promise(r => setTimeout(r, 150));
        }
        await (v as any).requestPictureInPicture();
        setIsPip(true); showControlsWithTimer(); return;
      }
      if (typeof (v as any).webkitSetPresentationMode === 'function') {
        const mode = (v as any).webkitPresentationMode;
        (v as any).webkitSetPresentationMode(mode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
        showControlsWithTimer(); return;
      }
      toast.info('PiP haifanyi kazi kwenye browser hii');
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'InvalidStateError') {
        toast.info('Bonyeza play kwanza, kisha jaribu tena');
      }
    }
    showControlsWithTimer();
  }

  // ── Download ──
  async function handleDownload(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!url) return;
    if (!user) { navigate('/login'); return; }
    if (!isPrivileged) { setShowPlanPicker(true); return; }
    try {
      const { triggerDownload } = await import('@/pages/Downloads');
      await triggerDownload({ url, name: initTitle || `video_${idx + 1}`, type: 'video', userId: user.id, thumbUrl: initThumb || undefined });
      toast.success('⬇️ Imeongezwa kwenye Downloads!');
    } catch {
      toast.error('Hitilafu ya download');
    }
  }

  // ── Container tap ──
  // CRITICAL FIX: Single tap IMMEDIATELY toggles controls.
  // handleMouseMove NEVER force-shows - only extends timer when controls already visible.
  // This eliminates the "shows then instantly disappears" bug caused by mouse events
  // fighting with the tap-toggle after a touch event.
  function handleContainerClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('[data-controls="true"]')) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const now = Date.now();
    const dt = now - lastTapTime.current;

    if (dt < 300 && dt > 0) {
      // Double tap detected - seek if on side zones
      lastTapTime.current = 0;
      const side = x < rect.width / 3 ? 'left' : x > rect.width * 2 / 3 ? 'right' : null;
      if (side) {
        const v = videoRef.current;
        if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + (side === 'left' ? -10 : 10)));
        setTapSide(side); setTapVisible(true);
        setTimeout(() => setTapVisible(false), 600);
        // Keep controls visible after seek
        showControlsRef.current = true;
        setShowControls(true);
        if (controlsTimer.current) clearTimeout(controlsTimer.current);
        if (playingRef.current) {
          controlsTimer.current = setTimeout(() => {
            showControlsRef.current = false;
            setShowControls(false);
          }, CONTROLS_HIDE_DELAY);
        }
        return;
      }
    }

    // Single tap: IMMEDIATELY toggle controls
    lastTapTime.current = now;
    lastTapX.current = x;
    if (controlsTimer.current) clearTimeout(controlsTimer.current);

    const nextVisible = !showControlsRef.current;
    showControlsRef.current = nextVisible;
    setShowControls(nextVisible);

    // If showing controls and video is playing, start auto-hide timer
    if (nextVisible && playingRef.current) {
      controlsTimer.current = setTimeout(() => {
        showControlsRef.current = false;
        setShowControls(false);
      }, CONTROLS_HIDE_DELAY);
    }
  }

  // ── Touch swipe gestures ──
  function onTouchStart(e: React.TouchEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('[data-controls="true"]')) return;
    const t = e.touches[0];
    swipeStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = swipeStartRef.current; if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xFrac = start.x / rect.width;
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 20) {
      const v = videoRef.current; if (!v || !v.duration) return;
      v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + (dx / rect.width) * v.duration / 8));
      // Only extend timer - don't force show
      extendControlsTimerIfVisible();
    } else if (Math.abs(dy) > 15) {
      if (xFrac < 0.4) {
        setBrightness(b => Math.max(0.1, Math.min(2, b + (-dy / rect.height * 1.5))));
      } else if (xFrac > 0.6) {
        const nv = Math.max(0, Math.min(1, volume + (-dy / rect.height)));
        const v = videoRef.current;
        if (v) { v.volume = nv; v.muted = nv === 0; }
        setVolume(nv); setMuted(nv === 0);
      }
    }
  }

  function onTouchEnd() { swipeStartRef.current = null; }

  function skip(sec: number, e?: React.MouseEvent) {
    e?.stopPropagation();
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.currentTime + sec, v.duration || 0));
    showControlsWithTimer();
  }

  function retry() {
    setError(''); setIsLoading(true);
    const v = videoRef.current; if (!v) return;
    v.load(); v.play().catch(() => {});
  }

  // CRITICAL: Only extend timer - NEVER force-show controls
  // This prevents the "tap to hide → mouseMove immediately shows again" bug
  function handleMouseMove() {
    extendControlsTimerIfVisible();
  }

  const showSpinner = isLoading || isBuffering;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black flex items-center justify-center select-none overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none' }}
      onClick={handleContainerClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseMove={handleMouseMove}
    >
      {/* Poster */}
      {(isLoading || !playing) && posterUrl && (
        <img src={posterUrl} alt="" className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ objectFit: 'contain', zIndex: 1, opacity: playing ? 0 : 1, transition: 'opacity 0.3s' }} />
      )}

      {/* Video */}
      {url && (
        <video
          ref={videoRef} key={url}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: 'contain', filter: `brightness(${brightness})`, zIndex: 2 }}
          playsInline preload="auto"
          poster={posterUrl || undefined} loop={loop}
          onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata}
          onWaiting={onWaiting} onPlaying={onPlaying}
          onCanPlay={onCanPlay} onCanPlayThrough={onCanPlayThrough}
          onLoadedData={onLoadedData} onPlay={onPlay} onPause={onPause}
          onEnded={onEnded} onError={onError}
        />
      )}

      {/* Spinner */}
      {showSpinner && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
          <Spinner />
        </div>
      )}

      <TapIndicator side={tapSide} visible={tapVisible} />

      {/* Offline */}
      {offline && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-600/90 text-white text-sm font-bold px-4 py-2 rounded-full z-20 pointer-events-none">
          <WifiOff className="w-4 h-4" /> Hakuna Muunganisho
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
          <AlertTriangle className="w-16 h-16 text-red-400 mb-3" />
          <p className="text-white text-center font-semibold mb-4 px-6">{error}</p>
          <button onClick={retry} className="pointer-events-auto bg-[#FF1493] text-white font-bold px-6 py-2.5 rounded-full">Jaribu Tena</button>
        </div>
      )}

      {/* Gradient overlays */}
      {showControls && (
        <>
          <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none" style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.85),transparent)', zIndex: 5 }} />
          <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.90),transparent)', zIndex: 5 }} />
        </>
      )}

      {/* ══ CONTROLS ══ */}
      <div
        data-controls="true"
        className="absolute inset-0"
        style={{
          zIndex: 15,
          opacity: showControls ? 1 : 0,
          transition: 'opacity 0.25s ease',
          pointerEvents: showControls ? 'auto' : 'none',
        }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        {/* ── Top Bar ── */}
        <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-4">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(-1); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); navigate(-1); }}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>

          <h1 className="text-white font-bold flex-1 truncate text-sm drop-shadow-md">{initTitle || 'Video'}</h1>
          {videoUrls.length > 1 && (
            <span className="text-white/70 text-xs bg-black/50 px-2 py-1 rounded-full">{idx + 1}/{videoUrls.length}</span>
          )}

          {/* BRIGHTNESS */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowBrightSlider(v => !v); setShowVolumeSlider(false); setShowSpeedMenu(false); showControlsWithTimer(); }}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setShowBrightSlider(v => !v); setShowVolumeSlider(false); setShowSpeedMenu(false); showControlsWithTimer(); }}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Sun className="w-5 h-5 text-white" />
            </button>
            {showBrightSlider && (
              <div className="absolute top-12 right-0 bg-black/90 rounded-2xl p-3 flex flex-col items-center gap-2 border border-white/10 z-30"
                style={{ width: 48, height: 160 }}
                onClick={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}>
                <input type="range" min="0.1" max="2" step="0.05" value={brightness}
                  onChange={e => setBrightness(parseFloat(e.target.value))}
                  style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 100, accentColor: '#FF1493' }} />
                <span className="text-white text-[10px]">{Math.round(brightness * 100)}%</span>
              </div>
            )}
          </div>

          {/* DOWNLOAD */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownload(); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleDownload(); }}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Download className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* ── Center Controls ── */}
        <div className="absolute inset-0 flex items-center justify-center gap-5" style={{ pointerEvents: 'none' }}>
          {videoUrls.length > 1 && idx > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setIdx(i => i - 1); showControlsWithTimer(); }}
              className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center active:scale-90"
              style={{ pointerEvents: 'auto', WebkitTapHighlightColor: 'transparent' }}>
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); skip(-10); }}
            className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center active:scale-90"
            style={{ pointerEvents: 'auto', WebkitTapHighlightColor: 'transparent' }}>
            <RotateCcw className="w-6 h-6 text-white" />
          </button>
          <button type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePlay(); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); togglePlay(); }}
            className="w-18 h-18 rounded-full flex items-center justify-center active:scale-90 shadow-2xl transition-transform"
            style={{ width: 72, height: 72, background: 'linear-gradient(135deg,#FF1493,#C2185B)', boxShadow: '0 0 32px rgba(255,20,147,0.5)', pointerEvents: 'auto', WebkitTapHighlightColor: 'transparent' }}>
            {playing ? <Pause className="w-9 h-9 text-white" /> : <Play className="w-9 h-9 text-white ml-1" fill="white" />}
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); skip(10); }}
            className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center active:scale-90"
            style={{ pointerEvents: 'auto', WebkitTapHighlightColor: 'transparent' }}>
            <RotateCw className="w-6 h-6 text-white" />
          </button>
          {videoUrls.length > 1 && idx < videoUrls.length - 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setIdx(i => i + 1); showControlsWithTimer(); }}
              className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center active:scale-90"
              style={{ pointerEvents: 'auto', WebkitTapHighlightColor: 'transparent' }}>
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          )}
        </div>

        {/* ── Bottom Controls ── */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-6 pt-4 space-y-2">
          {videoUrls.length > 1 && (
            <div className="flex gap-1.5 justify-center mb-1">
              {videoUrls.map((_, i) => (
                <button key={i} type="button" onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                  className={`rounded-full transition-all ${i === idx ? 'w-6 h-2 bg-[#FF1493]' : 'w-2 h-2 bg-white/30 hover:bg-white/50'}`} />
              ))}
            </div>
          )}

          {/* Progress Bar */}
          <div className="relative" onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            <SeekThumb videoEl={videoRef.current} progress={seekHoverPct} duration={duration} visible={seekHover} />
            <div
              ref={progressBarRef}
              className="relative w-full h-5 flex items-center cursor-pointer group"
              onMouseEnter={() => setSeekHover(true)}
              onMouseLeave={() => setSeekHover(false)}
              onMouseMove={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                setSeekHoverPct(((e.clientX - rect.left) / rect.width) * 100);
              }}
              onClick={e => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                seek(e.clientX, rect);
              }}
            >
              <div className="absolute inset-y-1.5 left-0 right-0 rounded-full bg-white/20" />
              <div className="absolute inset-y-1.5 left-0 rounded-full bg-white/30 transition-all duration-300" style={{ width: `${buffered}%` }} />
              <div className="absolute inset-y-1.5 left-0 rounded-full transition-all" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#FF1493,#FF69B4)' }} />
              <div className="absolute w-4 h-4 rounded-full bg-white shadow-lg transition-all group-hover:scale-125" style={{ left: `calc(${progress}% - 8px)`, boxShadow: '0 0 8px rgba(255,20,147,0.8)' }} />
            </div>
          </div>

          <div className="flex items-center justify-between px-1" onClick={e => e.stopPropagation()}>
            <span className="text-white/80 text-xs font-mono">{fmt(currentTime)} / {fmt(duration)}</span>
            {speed !== 1 && <span className="text-[#FF1493] text-xs font-bold bg-[#FF1493]/20 px-2 py-0.5 rounded-full">{speed}x</span>}
          </div>

          <div className="flex items-center justify-between" onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            {/* Volume */}
            <div className="relative">
              <button type="button"
                onClick={(e) => { e.stopPropagation(); setShowVolumeSlider(v => !v); setShowBrightSlider(false); setShowSpeedMenu(false); showControlsWithTimer(); }}
                onTouchEnd={(e) => { e.stopPropagation(); setShowVolumeSlider(v => !v); setShowBrightSlider(false); setShowSpeedMenu(false); showControlsWithTimer(); }}
                className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center active:scale-90"
                style={{ WebkitTapHighlightColor: 'transparent' }}>
                {muted || volume === 0 ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
              </button>
              {showVolumeSlider && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-black/90 rounded-2xl p-3 flex flex-col items-center gap-2 border border-white/10 z-30"
                  style={{ width: 48, height: 160 }}
                  onClick={e => e.stopPropagation()}
                  onTouchStart={e => e.stopPropagation()}>
                  <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                    onChange={e => handleVolumeChange(parseFloat(e.target.value))}
                    style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 100, accentColor: '#FF1493' }} />
                  <span className="text-white text-[10px]">{Math.round((muted ? 0 : volume) * 100)}%</span>
                </div>
              )}
            </div>

            {/* Speed */}
            <div className="relative">
              <button type="button"
                onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(v => !v); setShowVolumeSlider(false); setShowBrightSlider(false); showControlsWithTimer(); }}
                onTouchEnd={(e) => { e.stopPropagation(); setShowSpeedMenu(v => !v); showControlsWithTimer(); }}
                className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center active:scale-90"
                style={{ WebkitTapHighlightColor: 'transparent' }}>
                <span className="text-white text-xs font-black">{speed}x</span>
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-black/95 rounded-2xl p-2 border border-white/10 z-30 min-w-[72px]"
                  onClick={e => e.stopPropagation()}
                  onTouchStart={e => e.stopPropagation()}>
                  {SPEEDS.map(s => (
                    <button key={s} type="button" onClick={() => handleSpeed(s)}
                      className={`w-full text-center py-1.5 text-sm font-bold rounded-xl ${speed === s ? 'text-[#FF1493] bg-[#FF1493]/20' : 'text-white hover:bg-white/10'}`}>
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Loop */}
            <button type="button"
              onClick={(e) => { e.stopPropagation(); setLoop(l => !l); showControlsWithTimer(); }}
              className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 ${loop ? 'bg-[#FF1493]/80' : 'bg-black/40'}`}
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              <Repeat className="w-4 h-4 text-white" />
            </button>

            {/* Playlist */}
            {videoUrls.length > 1 && (
              <button type="button"
                onClick={(e) => { e.stopPropagation(); setShowPlaylist(v => !v); showControlsWithTimer(); }}
                className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center active:scale-90"
                style={{ WebkitTapHighlightColor: 'transparent' }}>
                <List className="w-4 h-4 text-white" />
              </button>
            )}

            {/* Rotate */}
            <button type="button"
              onClick={(e) => { e.stopPropagation(); toggleRotate(); }}
              className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 ${isLandscape ? 'bg-[#FF1493]/80' : 'bg-black/40'}`}
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                {isLandscape
                  ? <><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></>
                  : <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="18" y1="12" x2="18.01" y2="12"/></>}
              </svg>
            </button>

            {/* PiP */}
            <button type="button"
              onClick={(e) => { e.stopPropagation(); togglePip(); }}
              className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 ${isPip ? 'bg-[#FF1493]/80' : 'bg-black/40'}`}
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              <PictureInPicture2 className="w-4 h-4 text-white" />
            </button>

            {/* Fullscreen */}
            <button type="button"
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              onTouchEnd={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center active:scale-90"
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              {isFullscreen ? <Minimize className="w-5 h-5 text-white" /> : <Maximize className="w-5 h-5 text-white" />}
            </button>
          </div>
        </div>
      </div>

      {/* Playlist panel */}
      {showPlaylist && videoUrls.length > 1 && (
        <div className="absolute right-0 top-0 bottom-0 w-64 bg-black/90 backdrop-blur-md z-20 flex flex-col"
          data-controls="true"
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10">
            <List className="w-4 h-4 text-white" />
            <span className="text-white font-bold flex-1">Playlist ({videoUrls.length})</span>
            <button type="button" onClick={() => setShowPlaylist(false)}><ArrowLeft className="w-4 h-4 text-gray-400 rotate-180" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {videoUrls.map((_, i) => (
              <button key={i} type="button" onClick={() => { setIdx(i); setShowPlaylist(false); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${i === idx ? 'bg-[#FF1493]/30 border border-[#FF1493]/50' : 'hover:bg-white/10'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === idx ? 'bg-[#FF1493] text-white' : 'bg-white/20 text-white'}`}>{i + 1}</span>
                <span className="text-white text-sm truncate">{initTitle} {videoUrls.length > 1 ? `(${i + 1})` : ''}</span>
                {i === idx && <div className="w-2 h-2 rounded-full bg-[#FF1493] animate-pulse ml-auto" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {!showControls && !error && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full pointer-events-none" style={{ zIndex: 5 }} />
      )}

      {showPlanPicker && (
        <PlanPickerModal onClose={() => setShowPlanPicker(false)} settings={settings}
          message="Download inahitaji VIP au Business Account" onSuccess={() => setShowPlanPicker(false)} />
      )}
    </div>
  );
}
