import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { X, Download, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward, PictureInPicture2, Sun } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────
interface MediaItem {
  url: string;
  type: 'image' | 'video';
  title?: string;
}

interface MediaViewerContextType {
  openMedia: (items: MediaItem | MediaItem[], startIndex?: number) => void;
  openImage: (url: string, title?: string) => void;
  openVideo: (url: string, title?: string, urls?: string[]) => void;
  closeMedia: () => void;
}

const MediaViewerContext = createContext<MediaViewerContextType | null>(null);

export function useMediaViewer() {
  const ctx = useContext(MediaViewerContext);
  if (!ctx) throw new Error('useMediaViewer must be used within MediaViewerProvider');
  return ctx;
}

// ─── VLC-Style Video Player (used inside GlobalMediaViewer only) ─────────────
function VLCVideoPlayer({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [showBrightness, setShowBrightness] = useState(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user, profile } = useAuth();
  const isPrivileged = profile?.is_vip || profile?.is_business || profile?.is_admin;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => setDuration(v.duration || 0);
    const onTime = () => {
      setCurrentTime(v.currentTime);
      if (v.duration) setProgress((v.currentTime / v.duration) * 100);
      if (v.buffered.length > 0 && v.duration) setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    const onPipEnter = () => setIsPip(true);
    const onPipLeave = () => setIsPip(false);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('durationchange', onMeta);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnd);
    document.addEventListener('enterpictureinpicture', onPipEnter);
    document.addEventListener('leavepictureinpicture', onPipLeave);
    return () => {
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('durationchange', onMeta);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnd);
      document.removeEventListener('enterpictureinpicture', onPipEnter);
      document.removeEventListener('leavepictureinpicture', onPipLeave);
    };
  }, [url]);

  const resetControlsTimer = () => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3500);
  };

  const togglePlay = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    resetControlsTimer();
    if (v.paused) { try { await v.play(); } catch {} }
    else v.pause();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * v.duration;
    setProgress(pct * 100);
    resetControlsTimer();
  };

  const skip = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + sec));
    resetControlsTimer();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !muted;
    setMuted(!muted);
    resetControlsTimer();
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    const val = parseFloat(e.target.value);
    if (v) { v.volume = val; v.muted = val === 0; }
    setVolume(val);
    setMuted(val === 0);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
    resetControlsTimer();
  };

  // TRUE PiP - works properly
  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPip(false);
      } else if ('pictureInPictureEnabled' in document && (document as any).pictureInPictureEnabled) {
        if (v.paused) { await v.play().catch(() => {}); }
        await v.requestPictureInPicture();
        setIsPip(true);
      } else if ((v as any).webkitSetPresentationMode) {
        (v as any).webkitSetPresentationMode(
          (v as any).webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture'
        );
        setIsPip(true);
      } else {
        toast.info('PiP haifanyi kazi kwenye browser hii. Jaribu Chrome au Safari.');
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        toast.info('Bonyeza play kwanza kisha jaribu PiP tena');
      } else if (err.name === 'InvalidStateError') {
        toast.info('PiP haiwezi kufanya kazi sasa hivi');
      } else {
        toast.info('PiP haifanyi kazi kwenye device hii');
      }
    }
    resetControlsTimer();
  };

  // Download without navigating away
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { toast.info('Ingia akaunti kwanza'); return; }
    if (!isPrivileged) {
      // Show notification only - no redirect
      toast.info('Download inahitaji VIP au Business Account. Nenda kwenye Huduma kulipia.');
      return;
    }
    try {
      const { triggerDownload } = await import('@/pages/Downloads');
      triggerDownload({ url, name: title || 'video', type: 'video', userId: user.id });
      toast.success('⬇️ Download imeanza!');
    } catch {
      const a = document.createElement('a');
      a.href = url; a.download = title || 'video'; a.target = '_blank'; a.click();
    }
  };

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-[500] bg-black flex flex-col"
      onClick={() => togglePlay()}
      onMouseMove={resetControlsTimer}
      onTouchStart={resetControlsTimer}>
      <video
        ref={videoRef}
        src={url}
        className="flex-1 w-full object-contain"
        style={{ filter: `brightness(${brightness})` }}
        playsInline
        preload="auto"
        autoPlay
        onClick={e => e.stopPropagation()}
        onDoubleClick={() => skip(10)}
      />

      {/* Top bar */}
      <div className={`absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-3 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center flex-shrink-0">
          <X className="w-5 h-5 text-white" />
        </button>
        {title && <p className="text-white font-semibold text-sm flex-1 truncate">{title}</p>}
        {/* PiP button - works properly */}
        <button onClick={togglePip}
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 ${isPip ? 'bg-primary' : 'bg-black/50'}`}
          title={isPip ? 'Toka PiP' : 'Picture-in-Picture'}>
          <PictureInPicture2 className="w-4 h-4 text-white" />
        </button>
        {/* Download */}
        <button onClick={handleDownload} className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center flex-shrink-0 active:scale-90">
          <Download className="w-4 h-4 text-white" />
        </button>
      </div>

      {!playing && showControls && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-20 h-20 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="w-10 h-10 text-white ml-1.5" />
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className={`absolute bottom-0 left-0 right-0 z-10 px-4 pb-8 pt-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}
        onClick={e => e.stopPropagation()}>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-white/80 text-xs font-mono w-10 text-right flex-shrink-0">{fmt(currentTime)}</span>
          <div className="flex-1 relative h-5 flex items-center cursor-pointer" onClick={handleSeek}>
            <div className="absolute inset-y-1.5 left-0 right-0 rounded-full bg-white/20" />
            <div className="absolute inset-y-1.5 left-0 rounded-full bg-white/35 transition-all" style={{ width: `${buffered}%` }} />
            <div className="absolute inset-y-1.5 left-0 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            <div className="absolute w-4 h-4 rounded-full bg-white shadow-lg transition-all"
              style={{ left: `calc(${progress}% - 8px)` }} />
          </div>
          <span className="text-white/80 text-xs font-mono w-10 flex-shrink-0">{fmt(duration)}</span>
        </div>

        {/* Buttons row */}
        <div className="flex items-center justify-between">
          {/* Left: volume + brightness */}
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 active:scale-90">
              {muted || volume === 0 ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
            </button>
            <div className="relative">
              <button onClick={() => setShowBrightness(v => !v)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 active:scale-90">
                <Sun className="w-5 h-5 text-white" />
              </button>
              {showBrightness && (
                <div className="absolute bottom-12 left-0 bg-black/90 rounded-xl p-3 flex flex-col gap-2 border border-white/10" style={{ width: '48px', height: '120px' }}
                  onClick={e => e.stopPropagation()}>
                  <input type="range" min="0.2" max="2" step="0.05" value={brightness}
                    onChange={e => setBrightness(parseFloat(e.target.value))}
                    style={{ writingMode: 'vertical-lr', direction: 'rtl', height: '80px', accentColor: '#FF1493' }} />
                  <span className="text-white text-[10px] text-center">{Math.round(brightness * 100)}%</span>
                </div>
              )}
            </div>
          </div>

          {/* Center: skip + play */}
          <div className="flex items-center gap-4">
            <button onClick={() => skip(-10)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 active:scale-90">
              <SkipBack className="w-5 h-5 text-white" />
            </button>
            <button onClick={e => togglePlay(e)} className="w-14 h-14 rounded-full gradient-pink flex items-center justify-center shadow-2xl active:scale-90 transition-transform">
              {playing ? <Pause className="w-7 h-7 text-white" /> : <Play className="w-7 h-7 text-white ml-1" />}
            </button>
            <button onClick={() => skip(10)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 active:scale-90">
              <SkipForward className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Right: fullscreen */}
          <button onClick={toggleFullscreen} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 active:scale-90">
            <Maximize className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Gallery Image Viewer ────────────────────────────────────────────────────
function GalleryViewer({ items, startIndex, onClose }: { items: MediaItem[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [showVipModal, setShowVipModal] = useState(false);
  const [planSettings, setPlanSettings] = useState<any>({});
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const current = items[index];
  const { user, profile } = useAuth();
  const isPrivileged = profile?.is_vip || profile?.is_business || profile?.is_admin;

  useEffect(() => {
    // Load settings for VIP modal
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.from('app_settings').select('*').then(({ data }) => {
        const m: any = {};
        (data || []).forEach((r: any) => { m[r.key] = r.value; });
        setPlanSettings(m);
      });
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < items.length - 1) { setIndex(i => i + 1); setScale(1); }
      if (e.key === 'ArrowLeft' && index > 0) { setIndex(i => i - 1); setScale(1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, items.length, onClose]);

  const handleTap = () => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current); tapTimer.current = null;
      setScale(s => s > 1 ? 1 : 2.5);
    } else {
      tapTimer.current = setTimeout(() => { tapTimer.current = null; setShowControls(c => !c); }, 220);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    const dy = Math.abs(touchStartY.current - e.changedTouches[0].clientY);
    if (Math.abs(dx) > 60 && dy < 80) {
      if (dx > 0 && index < items.length - 1) { setIndex(i => i + 1); setScale(1); }
      else if (dx < 0 && index > 0) { setIndex(i => i - 1); setScale(1); }
    }
  };

  // Download with VIP check
  const handleDownload = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) { toast.info('Ingia akaunti kwanza'); return; }
    if (!isPrivileged) {
      // Show VIP plan picker
      setShowVipModal(true);
      return;
    }
    const url = current.url;
    const isVideo = current.type === 'video';
    try {
      const { triggerDownload } = await import('@/pages/Downloads');
      triggerDownload({ url, name: current.title || (isVideo ? 'video' : 'picha'), type: isVideo ? 'video' : 'image', userId: user.id });
      toast.success('⬇️ Download imeanza!');
    } catch {
      const a = document.createElement('a');
      a.href = url; a.download = current.title || 'media'; a.target = '_blank'; a.click();
    }
  };

  if (current.type === 'video') {
    return <VLCVideoPlayer url={current.url} title={current.title} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-[500] bg-black flex flex-col"
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}>

      {/* Top controls */}
      {showControls && (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-3"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}
          onClick={e => e.stopPropagation()}>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <X className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            {current.title && <p className="text-white font-semibold text-sm truncate">{current.title}</p>}
            {items.length > 1 && <p className="text-white/60 text-xs">{index + 1} / {items.length}</p>}
          </div>
          {/* Download with VIP check - shows plan picker for non-VIP */}
          <button onClick={handleDownload} className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <Download className="w-4 h-4 text-white" />
          </button>
        </div>
      )}

      {/* Image */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <img
          src={current.url}
          alt={current.title || ''}
          className="max-w-full max-h-full object-contain select-none"
          style={{ transform: `scale(${scale})`, transition: 'transform 0.2s ease', touchAction: 'none' }}
          draggable={false}
        />
      </div>

      {/* Navigation arrows */}
      {items.length > 1 && showControls && (
        <>
          {index > 0 && (
            <button onClick={e => { e.stopPropagation(); setIndex(i => i - 1); setScale(1); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 flex items-center justify-center z-10">
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
          )}
          {index < items.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setIndex(i => i + 1); setScale(1); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 flex items-center justify-center z-10">
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          )}
        </>
      )}

      {/* Bottom: thumbnails strip */}
      {items.length > 1 && showControls && (
        <div className="absolute bottom-0 left-0 right-0 p-3 flex justify-center gap-1 overflow-x-auto"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}
          onClick={e => e.stopPropagation()}>
          {items.map((item, i) => (
            <div key={i} onClick={() => { setIndex(i); setScale(1); }}
              className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer border-2 transition-all ${i === index ? 'border-primary' : 'border-transparent opacity-60'}`}>
              {item.type === 'video'
                ? <div className="w-full h-full bg-gray-800 flex items-center justify-center"><Play className="w-4 h-4 text-white" /></div>
                : <img src={item.url} alt="" className="w-full h-full object-cover" />}
            </div>
          ))}
        </div>
      )}

      {/* VIP Plan Picker Modal for non-VIP download */}
      {showVipModal && (
        <VipPlanPickerInline
          settings={planSettings}
          onClose={() => setShowVipModal(false)}
        />
      )}
    </div>
  );
}

// ─── Inline VIP Plan Picker — clicking plan opens PaymentModal ────────────────
function VipPlanPickerInline({ settings, onClose }: { settings: any; onClose: () => void }) {
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<{ amount: number; name: string; type: string } | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.from('vip_plans').select('*').eq('is_active', true).order('display_order').then(({ data }) => {
        setPlans(data || []);
      });
    });
  }, []);

  // If a plan is selected, show PaymentModal
  if (selectedPlan) {
    return (
      <PaymentModalWrapper
        amount={selectedPlan.amount}
        planName={selectedPlan.name}
        type={selectedPlan.type}
        settings={settings}
        onClose={() => { setSelectedPlan(null); onClose(); }}
        onSuccess={() => { setSelectedPlan(null); onClose(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[600] bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto slide-up"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-black text-lg">🔒 Download inahitaji VIP</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <p className="text-gray-400 text-sm mb-4">Download picha na video inahitaji VIP au Business Account</p>
        <div className="space-y-3">
          {plans.map((plan: any) => (
            <button key={plan.id} onClick={() => {
              // Open PaymentModal for this plan directly
              setSelectedPlan({ amount: plan.price, name: plan.name, type: 'vip' });
            }} className="w-full content-box p-4 flex items-center justify-between active:scale-[0.98] transition-transform">
              <div className="text-left">
                <p className="text-white font-bold">👑 {plan.name}</p>
                <p className="text-gray-400 text-xs">Siku {plan.duration_days}</p>
              </div>
              <p className="text-primary font-black text-lg">TZS {plan.price?.toLocaleString()}</p>
            </button>
          ))}
          <button onClick={() => {
            setSelectedPlan({ amount: parseInt(settings.business_price_monthly || '10000'), name: 'Business Account', type: 'business' });
          }} className="w-full content-box p-4 flex items-center justify-between active:scale-[0.98] transition-transform">
            <div className="text-left">
              <p className="text-white font-bold">💼 Business Account</p>
              <p className="text-gray-400 text-xs">Upload na Download bila kikwazo</p>
            </div>
            <p className="text-primary font-black text-lg">TZS {parseInt(settings.business_price_monthly || '10000').toLocaleString()}</p>
          </button>
        </div>
        <button onClick={onClose} className="w-full mt-3 py-3 rounded-xl border border-gray-600 text-gray-400 font-semibold">Ghairi</button>
      </div>
    </div>
  );
}

// ─── PaymentModal wrapper (lazy loaded) ─────────────────────────────────────
function PaymentModalWrapper({ amount, planName, type, settings, onClose, onSuccess }: {
  amount: number; planName: string; type: string; settings: any;
  onClose: () => void; onSuccess: () => void;
}) {
  const [PaymentModal, setPaymentModal] = useState<any>(null);
  useEffect(() => {
    import('@/components/features/PaymentModal').then(m => setPaymentModal(() => m.default));
  }, []);
  if (!PaymentModal) return null;
  return <PaymentModal amount={amount} planName={planName} type={type} settings={settings} onClose={onClose} onSuccess={onSuccess} />;
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function MediaViewerProvider({ children }: { children: React.ReactNode }) {
  const [mediaState, setMediaState] = useState<{ items: MediaItem[]; index: number } | null>(null);

  const openMedia = useCallback((items: MediaItem | MediaItem[], startIndex = 0) => {
    const arr = Array.isArray(items) ? items : [items];
    setMediaState({ items: arr, index: startIndex });
  }, []);

  const openImage = useCallback((url: string, title?: string) => {
    setMediaState({ items: [{ url, type: 'image', title }], index: 0 });
  }, []);

  const openVideo = useCallback((url: string, title?: string, urls?: string[]) => {
    if (urls && urls.length > 1) {
      const items: MediaItem[] = urls.map(u => ({
        url: u,
        type: /\.(mp4|webm|mov|avi|mkv)/i.test(u) ? 'video' : 'image',
        title,
      }));
      setMediaState({ items, index: 0 });
    } else {
      setMediaState({ items: [{ url, type: 'video', title }], index: 0 });
    }
  }, []);

  const closeMedia = useCallback(() => setMediaState(null), []);

  return (
    <MediaViewerContext.Provider value={{ openMedia, openImage, openVideo, closeMedia }}>
      {children}
      {mediaState && (
        <GalleryViewer
          items={mediaState.items}
          startIndex={mediaState.index}
          onClose={closeMedia}
        />
      )}
    </MediaViewerContext.Provider>
  );
}
