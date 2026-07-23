import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { RoomMessage, UserProfile, AppSettings } from '@/types';
import BlueTick from '@/components/features/BlueTick';
import { ArrowLeft, Send, ImageIcon, Trash2, Reply, X, Mic, Edit2, Check, Bookmark, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { PlanPickerModal } from '@/pages/Services';
import { useMediaViewer } from '@/components/features/GlobalMediaViewer';
import { useApp } from '@/contexts/AppContext';

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function containsRestrictedContent(text: string): boolean {
  return /\d/.test(text) || URL_REGEX.test(text);
}

function renderTextWithLinks(text: string, onMentionClick: (name: string) => void) {
  const parts = text.split(/(@[\w.]+|https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (/^@[\w.]+$/.test(part)) {
      const username = part.slice(1);
      return (
        <button
          key={i}
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onMentionClick(username); }}
          className="text-primary font-bold underline decoration-primary/50 cursor-pointer"
          style={{ WebkitTapHighlightColor: 'transparent', display: 'inline', background: 'none', border: 'none', padding: 0, fontSize: 'inherit' }}
        >
          {part}
        </button>
      );
    }
    if (part.match(/^https?:\/\//)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline break-all">{part}</a>;
    return <span key={i}>{part}</span>;
  });
}

// Compress image to max 1200px, quality 0.85 before upload
async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image')) return file;
  return new Promise(resolve => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w <= MAX && h <= MAX) { resolve(file); return; }
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else { w = Math.round(w * MAX / h); h = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (blob && blob.size < file.size) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        } else {
          resolve(file);
        }
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(file); };
    img.src = objUrl;
  });
}

// Voice note player
function AudioPlayer({ url, isOwn }: { url: string; isOwn?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const fmt = (s: number) =>
    isFinite(s) && s > 0
      ? `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
      : '0:00';
  const bars = Array.from({ length: 28 });

  const updateDuration = () => {
    const a = audioRef.current;
    if (a && isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !isFinite(a.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * a.duration;
  };

  const togglePlay = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (loadError) { setLoadError(false); a.load(); }
    try {
      if (playing) { a.pause(); }
      else { if (a.readyState < 2) a.load(); await a.play(); }
    } catch (err: any) {
      console.error('SexyRoom audio play error:', err?.name, err?.message);
    }
  };

  const sentFrom = (() => { try { const c = JSON.parse(localStorage.getItem('slr_settings_cache') || '{}'); return c.bubble_sent_from || '#FF1493'; } catch { return '#FF1493'; } })();
  const progressColor = isOwn ? 'rgba(255,255,255,0.9)' : sentFrom;
  const trackColor = isOwn ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.22)';

  return (
    <div className="flex items-center gap-2 py-1.5 px-2" style={{ minWidth: '190px', maxWidth: '250px' }}>
      <audio
        ref={audioRef} src={url} preload="metadata"
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a && isFinite(a.duration) && a.duration > 0) {
            setCurrentTime(a.currentTime);
            setProgress((a.currentTime / a.duration) * 100);
          }
        }}
        onDurationChange={updateDuration} onLoadedMetadata={updateDuration}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
        onPlay={() => { setPlaying(true); setLoadError(false); }}
        onPause={() => setPlaying(false)}
        onError={(e) => { console.error('SexyRoom audio error:', e.currentTarget.error?.code); setLoadError(true); }}
        style={{ display: 'none' }}
      />
      <button onClick={togglePlay}
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: isOwn ? 'rgba(255,255,255,0.25)' : `linear-gradient(135deg,${sentFrom},${sentFrom}cc)`, minWidth: '32px' }}>
        {playing
          ? <div className="flex gap-0.5"><div className="w-0.5 h-3 bg-white rounded-sm" /><div className="w-0.5 h-3 bg-white rounded-sm" /></div>
          : <div className="w-0 h-0 border-l-[8px] border-l-white border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <div className="flex items-end gap-px cursor-pointer" style={{ height: '20px' }} onClick={handleSeek as any}>
          {bars.map((_, i) => (
            <div key={i} className="flex-1 rounded-full" style={{
              height: `${20 + Math.abs(Math.sin(i * 0.6 + 1)) * 80}%`,
              minHeight: '2px',
              background: (i / bars.length * 100) <= progress ? progressColor : trackColor,
              transition: 'background 0.08s',
            }} />
          ))}
        </div>
        <div className="flex justify-between">
          <span className="text-white/55 text-[9px]">{fmt(currentTime)}</span>
          <span className="text-white/55 text-[9px]">{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}

// Inline media grid
function MessageMediaGrid({ urls, type, thumbUrl, onOpen }: { urls: string[]; type: string; thumbUrl?: string; onOpen: (url: string, t: string) => void }) {
  const count = urls.length;
  if (count === 0) return null;

  const isVideoUrl = (url: string) => type === 'video' || /\.(mp4|webm|mov)/i.test(url) || url.includes('video');

  const MediaThumb = ({ url, style }: { url: string; style: React.CSSProperties }) => (
    <div className="relative overflow-hidden cursor-pointer flex-shrink-0" style={style}
      onClick={() => onOpen(url, isVideoUrl(url) ? 'video' : 'image')}>
      {isVideoUrl(url) ? (
        <>
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="w-full h-full" style={{ objectFit: 'cover', objectPosition: 'top' }} loading="eager" />
          ) : (
            <div className="w-full h-full bg-[#1a0a1a] flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-black/55 flex items-center justify-center">
                <div className="w-0 h-0 border-l-[12px] border-l-white border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent ml-1" />
              </div>
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-black/55 flex items-center justify-center">
              <div className="w-0 h-0 border-l-[14px] border-l-white border-t-[9px] border-t-transparent border-b-[9px] border-b-transparent ml-1" />
            </div>
          </div>
        </>
      ) : (
        <img src={url} alt="" className="w-full h-full" style={{ objectFit: 'cover', objectPosition: 'top' }} loading="eager" />
      )}
    </div>
  );

  const H1 = 380, HG = 260, halfH = Math.floor(HG / 2);

  if (count === 1) return <MediaThumb url={urls[0]} style={{ width: '100%', height: `${H1}px`, borderRadius: '14px', display: 'block' }} />;
  if (count === 2) return (
    <div className="flex gap-0.5 rounded-xl overflow-hidden" style={{ height: `${HG}px` }}>
      <MediaThumb url={urls[0]} style={{ flex: 1, height: '100%' }} />
      <MediaThumb url={urls[1]} style={{ flex: 1, height: '100%' }} />
    </div>
  );
  if (count === 3) return (
    <div className="flex gap-0.5 rounded-xl overflow-hidden" style={{ height: `${HG}px` }}>
      <MediaThumb url={urls[0]} style={{ flex: '1.2', height: '100%' }} />
      <div className="flex flex-col gap-0.5" style={{ flex: '0.8' }}>
        <MediaThumb url={urls[1]} style={{ width: '100%', height: `${halfH}px` }} />
        <MediaThumb url={urls[2]} style={{ width: '100%', height: `${halfH}px` }} />
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-0.5 rounded-xl overflow-hidden">
      <div className="flex gap-0.5" style={{ height: '130px' }}>
        <MediaThumb url={urls[0]} style={{ flex: 1, height: '100%' }} />
        <MediaThumb url={urls[1]} style={{ flex: 1, height: '100%' }} />
      </div>
      <div className="flex gap-0.5" style={{ height: '130px' }}>
        <MediaThumb url={urls[2]} style={{ flex: 1, height: '100%' }} />
        <div className="relative flex-1" style={{ height: '100%' }}>
          <MediaThumb url={urls[3]} style={{ width: '100%', height: '100%' }} />
          {count > 4 && (
            <div className="absolute inset-0 bg-black/65 flex items-center justify-center cursor-pointer" onClick={() => onOpen(urls[3], 'image')}>
              <span className="text-white font-black text-xl">+{count - 4}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Preview before sending - stable object URLs
function PreviewGrid({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [videoThumbs, setVideoThumbs] = useState<Record<number, string>>({});
  const prevUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    prevUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    const urls = files.map(f => URL.createObjectURL(f));
    prevUrlsRef.current = urls;
    setPreviews(urls);
    setVideoThumbs({});

    files.forEach((f, i) => {
      if (!f.type.startsWith('video')) return;
      const vid = document.createElement('video');
      vid.src = urls[i];
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'metadata';
      vid.currentTime = 0.5;
      const cleanup = () => { try { vid.src = ''; vid.load(); } catch {} };
      vid.onloadeddata = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 320; canvas.height = 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            setVideoThumbs(prev => ({ ...prev, [i]: canvas.toDataURL('image/jpeg', 0.7) }));
          }
        } catch {}
        cleanup();
      };
      vid.onerror = cleanup;
      vid.load();
    });

    return () => {
      prevUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
      prevUrlsRef.current = [];
    };
  }, [files]);

  if (!files.length) return null;
  const count = files.length;
  const totalMB = (files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1);

  const Thumb = ({ i }: { i: number }) => {
    const f = files[i];
    const previewUrl = previews[i] || '';
    return (
      <div className="relative overflow-hidden rounded-xl w-full h-full">
        {f.type.startsWith('image') && previewUrl ? (
          <img src={previewUrl} alt="" className="w-full h-full" style={{ objectFit: 'cover', objectPosition: 'top' }} />
        ) : videoThumbs[i] ? (
          <div className="relative w-full h-full">
            <img src={videoThumbs[i]} alt="" className="w-full h-full" style={{ objectFit: 'cover', objectPosition: 'top' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                <div className="w-0 h-0 border-l-[8px] border-l-white border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent ml-0.5" />
              </div>
            </div>
          </div>
        ) : f.type.startsWith('video') ? (
          <div className="w-full h-full bg-[#1a0a1a] flex flex-col items-center justify-center gap-1">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-primary rounded-full animate-spin" />
            <span className="text-gray-400 text-[10px]">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
          </div>
        ) : (
          <div className="w-full h-full bg-[#1a0a1a] flex items-center justify-center">
            <span className="text-3xl opacity-40">📄</span>
          </div>
        )}
        <button onClick={() => onRemove(i)} className="absolute top-0.5 right-0.5 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center z-10">
          <X className="w-3 h-3 text-white" />
        </button>
      </div>
    );
  };

  return (
    <div className="px-3 py-2 bg-[#06020a]/95">
      <div className="overflow-hidden rounded-xl" style={{ maxWidth: '280px', height: count >= 3 ? '180px' : count === 2 ? '140px' : '200px' }}>
        {count === 1 ? <Thumb i={0} /> :
          count === 3 ? (
            <div className="flex gap-0.5 h-full">
              <div style={{ flex: '1.2' }}><Thumb i={0} /></div>
              <div className="flex flex-col gap-0.5" style={{ flex: '0.8' }}>
                <div className="flex-1"><Thumb i={1} /></div>
                <div className="flex-1"><Thumb i={2} /></div>
              </div>
            </div>
          ) : (
            <div className="grid gap-0.5 h-full grid-cols-2">
              {files.slice(0, 4).map((_, i) => (
                <div key={i} className="relative h-full">
                  <Thumb i={i} />
                  {count > 4 && i === 3 && <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl z-10"><span className="text-white font-black text-xl">+{count - 4}</span></div>}
                </div>
              ))}
            </div>
          )}
      </div>
      <p className="text-gray-500 text-[10px] mt-1">{count} faili • {totalMB} MB</p>
    </div>
  );
}

function playSound(key: string, settings: Record<string, string>) {
  const url = settings[key];
  if (!url) return;
  try {
    const audio = new Audio(url.split('?')[0] + '?t=' + Date.now());
    audio.volume = 0.8;
    audio.play().catch(() => {});
  } catch {}
}

export default function SexyRoom() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [text, setText] = useState('');
  const [settings, setSettings] = useState<AppSettings>({});
  const [usernameFontSize, setUsernameFontSize] = useState(12);
  const [usernameFontFamily, setUsernameFontFamily] = useState('inherit');
  const [usernameFontBold, setUsernameFontBold] = useState(false);
  const [usernameFontItalic, setUsernameFontItalic] = useState('normal');

  const applyUsernameFont = (fontStyle: string, fontSize: string) => {
    const size = Math.max(10, parseInt(fontSize) || 12);
    setUsernameFontSize(size);
    const ff = fontStyle === 'dancing' ? 'Dancing Script, cursive' :
      fontStyle === 'pacifico' ? 'Pacifico, cursive' :
      fontStyle === 'lobster' ? 'Lobster, cursive' : 'inherit';
    setUsernameFontFamily(ff);
    setUsernameFontBold(fontStyle === 'bold');
    setUsernameFontItalic(fontStyle === 'bold' ? 'italic' : 'normal');
  };

  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showOptions, setShowOptions] = useState<string | null>(null);
  const [showGiftModal, setShowGiftModal] = useState<{ userId: string; username: string; preselected?: any } | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [openedViewOnce, setOpenedViewOnce] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('slr_viewed_once') || '[]')); } catch { return new Set(); }
  });

  function markViewOnceOpened(msgId: string) {
    setOpenedViewOnce(prev => {
      const next = new Set([...prev, msgId]);
      try { localStorage.setItem('slr_viewed_once', JSON.stringify([...next].slice(-500))); } catch {}
      return next;
    });
  }

  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [planMsg, setPlanMsg] = useState('');
  const [editingMsg, setEditingMsg] = useState<RoomMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedMB, setUploadedMB] = useState(0);
  const [totalUploadMB, setTotalUploadMB] = useState(0);
  const [uploadSpeedMBs, setUploadSpeedMBs] = useState(0);
  const uploadSpeedRef = useRef<{ bytes: number; time: number }>({ bytes: 0, time: 0 });
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null);
  const [swipedMsgId, setSwipedMsgId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const lastTypingSentRef = useRef<number>(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastMsgCount = useRef(0);
  const playedMsgIds = useRef<Set<string>>(new Set());
  const settingsRef = useRef<AppSettings>({});
  const swipeStartX = useRef<Record<string, number>>({});
  const swipeStartY = useRef<Record<string, number>>({});

  const { openMedia } = useMediaViewer();
  const { t } = useApp();
  const isPrivileged = profile?.is_vip || profile?.is_business || profile?.is_admin;
  const isAdminUser = profile?.is_admin;

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const cached = localStorage.getItem('slr_settings_cache');
        if (cached) {
          const m = JSON.parse(cached) as AppSettings;
          setSettings(m);
          settingsRef.current = m;
          if (m.username_font_size || m.username_font_style) {
            applyUsernameFont(m.username_font_style || 'default', m.username_font_size || '12');
          }
        }
      } catch {}
      await fetchSettings();
    };
    loadSettings();
    fetchMessages();

    let pollTimer: ReturnType<typeof setTimeout>;
    const schedulePoll = () => {
      const delay = document.hidden ? 5000 : 1500;
      pollTimer = setTimeout(() => { fetchMessages(false); schedulePoll(); }, delay);
    };
    schedulePoll();
    const handleVisChange = () => { if (!document.hidden) { clearTimeout(pollTimer); fetchMessages(false); schedulePoll(); } };
    document.addEventListener('visibilitychange', handleVisChange);

    // Poll for typing users every 1.5s
    const pollTyping = async () => {
      const since = new Date(Date.now() - 4000).toISOString();
      const { data } = await supabase.from('room_messages')
        .select('content, user_id')
        .eq('media_type', 'typing')
        .gte('created_at', since)
        .neq('user_id', user?.id || '')
        .order('created_at', { ascending: false });
      if (!data) return;
      // Deduplicate by user_id and collect usernames
      const seenIds = new Set<string>();
      const names: string[] = [];
      for (const m of data) {
        if (!seenIds.has(m.user_id)) {
          seenIds.add(m.user_id);
          const name = m.content || 'Mtu';
          names.push(name);
        }
      }
      setTypingUsers(names.slice(0, 3));
    };
    const typingPollTimer = setInterval(pollTyping, 1500);

    const settingsListener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      setSettings(prev => ({ ...prev, ...detail }));
      settingsRef.current = { ...settingsRef.current, ...detail };
      const style = detail.username_font_style;
      const size = detail.username_font_size;
      if (style !== undefined || size !== undefined) {
        applyUsernameFont(
          style !== undefined ? style : (settingsRef.current.username_font_style || 'default'),
          size !== undefined ? size : (settingsRef.current.username_font_size || '12')
        );
      }
    };
    const storageListener = (e: StorageEvent) => {
      if (e.key === 'slr_settings_cache' && e.newValue) {
        try {
          const m = JSON.parse(e.newValue) as AppSettings;
          setSettings(m);
          settingsRef.current = m;
          applyUsernameFont(m.username_font_style || 'default', m.username_font_size || '12');
        } catch {}
      }
    };
    window.addEventListener('app-settings-updated', settingsListener);
    window.addEventListener('storage', storageListener);
    return () => {
      clearTimeout(pollTimer);
      clearInterval(typingPollTimer);
      document.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('app-settings-updated', settingsListener);
      window.removeEventListener('storage', storageListener);
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0 && isFirstLoad) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      setIsFirstLoad(false);
      const targetMsgId = searchParams.get('msg');
      if (targetMsgId) {
        setTimeout(() => {
          const el = msgRefs.current[targetMsgId];
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightMsgId(targetMsgId);
            setTimeout(() => setHighlightMsgId(null), 2500);
          }
        }, 400);
      }
    }
  }, [messages.length, isFirstLoad]);

  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*');
    const m: AppSettings = {}; data?.forEach(s => { m[s.key] = s.value; });
    setSettings(m);
    settingsRef.current = m;
    try { localStorage.setItem('slr_settings_cache', JSON.stringify(m)); } catch {}
    if (m.username_font_size) applyUsernameFont(m.username_font_style || 'default', m.username_font_size);
    else if (m.username_font_style) applyUsernameFont(m.username_font_style, m.username_font_size || '12');
  }

  async function fetchMessages(scrollToBottom = true) {
    const { data } = await supabase
      .from('room_messages')
      .select('*, user:user_id(id,username,avatar_url,blue_tick,is_vip,is_business,is_admin)')
      .eq('is_deleted', false)
      .order('created_at').limit(200);
    const filtered = (data || []).filter((m: any) =>
      m.media_type !== 'signal' &&
      m.media_type !== 'webrtc_signal' &&
      m.media_type !== 'typing' &&
      !String(m.content || '').startsWith('{"type":"viewer') &&
      !String(m.content || '').startsWith('{"type":"host') &&
      !String(m.content || '').startsWith('{"type":"ice') &&
      !String(m.content || '').startsWith('{"type":"offer') &&
      !String(m.content || '').startsWith('{"type":"answer') &&
      !String(m.content || '').startsWith('{"type":"cohost') &&
      !String(m.content || '').startsWith('{"type":"end')
    );
    const msgs = filtered as RoomMessage[];
    if (lastMsgCount.current > 0 && msgs.length > lastMsgCount.current) {
      const newMsgs = msgs.slice(lastMsgCount.current);
      const trulyNew = newMsgs.filter(m => m.user_id !== user?.id && !playedMsgIds.current.has(m.id));
      if (trulyNew.length > 0) {
        playSound('sound_sexyroom', settingsRef.current);
        trulyNew.forEach(m => playedMsgIds.current.add(m.id));
        if (playedMsgIds.current.size > 500) {
          const arr = Array.from(playedMsgIds.current);
          playedMsgIds.current = new Set(arr.slice(-200));
        }
      }
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    lastMsgCount.current = msgs.length;
    setMessages(msgs);
  }

  function showRestriction(msg: string) { setPlanMsg(msg); setShowPlanPicker(true); }

  async function sendMessage() {
    if (!user || !profile) { navigate('/login'); return; }
    const hasMedia = selectedFiles.length > 0;
    const trimmedText = text.trim();
    const hasContent = trimmedText.length > 0;
    if (!hasMedia && !hasContent) return;

    if (!isPrivileged) {
      if (hasMedia) { showRestriction('Kutuma picha/video unahitaji VIP au Business Account'); return; }
      if (hasContent && containsRestrictedContent(trimmedText)) {
        showRestriction('Kutuma namba au links unahitaji VIP au Business Account'); return;
      }
      if (hasContent && /[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/u.test(trimmedText)) {
        showRestriction('Kutuma emoje unahitaji VIP au Business Account');
        return;
      }
    }

    setSending(true);
    setUploadProgress(0);
    setUploadedMB(0);
    setTotalUploadMB(0);

    try {
      const { uploadFile } = await import('@/lib/supabase');

      if (hasMedia) {
        const uploadedUrls: string[] = [];
        let thumbUrl = '';

        // Compress images first, then calculate total size
        const processedFiles: File[] = [];
        for (const file of selectedFiles) {
          const processed = file.type.startsWith('image') ? await compressImageFile(file) : file;
          processedFiles.push(processed);
        }

        const totalSize = processedFiles.reduce((s, f) => s + f.size, 0);
        setTotalUploadMB(totalSize / 1024 / 1024);
        setUploadSpeedMBs(0);
        uploadSpeedRef.current = { bytes: 0, time: Date.now() };
        let uploadedSoFar = 0;

        for (let i = 0; i < processedFiles.length; i++) {
          const file = processedFiles[i];
          const ext = file.name.split('.').pop() || 'jpg';
          const path = `room/${user.id}/${Date.now()}_${i}.${ext}`;
          try {
            const fileStartBytes = uploadedSoFar;
            const url = await uploadFile('room-media', path, file, (pct) => {
              const bytesThisFile = file.size * pct / 100;
              const totalDone = fileStartBytes + bytesThisFile;
              setUploadProgress(Math.round(totalDone / Math.max(totalSize, 1) * 100));
              setUploadedMB(totalDone / 1024 / 1024);
              // Calculate speed
              const now = Date.now();
              const elapsed = (now - uploadSpeedRef.current.time) / 1000;
              if (elapsed >= 0.5) {
                const bytesDelta = totalDone - uploadSpeedRef.current.bytes;
                const speed = bytesDelta / elapsed / 1024 / 1024;
                setUploadSpeedMBs(Math.max(0, speed));
                uploadSpeedRef.current = { bytes: totalDone, time: now };
              }
            });
            uploadedSoFar += file.size;
            uploadedUrls.push(url);
            // Auto-generate thumbnail for first video
            if (!thumbUrl && file.type.startsWith('video')) {
              try {
                const { generateVideoThumbnail } = await import('@/lib/generateThumbnail');
                const blob = await generateVideoThumbnail(file);
                if (blob) {
                  const thumbFile = new File([blob], `thumb_${Date.now()}.jpg`, { type: 'image/jpeg' });
                  thumbUrl = await uploadFile('room-media', `room/${user.id}/thumb_${Date.now()}.jpg`, thumbFile);
                }
              } catch {}
            }
          } catch { toast.error(`Hitilafu ya kupakia faili ${i + 1}`); }
        }

        if (uploadedUrls.length > 0) {
          const firstFile = processedFiles[0];
          const isVideo = selectedFiles[0].type.startsWith('video');
          const isAudio = selectedFiles[0].type.startsWith('audio');
          await supabase.from('room_messages').insert({
            user_id: user.id, content: trimmedText || null,
            media_url: uploadedUrls[0], media_urls: uploadedUrls,
            media_type: isAudio ? 'audio' : isVideo ? 'video' : 'image',
            reply_to: replyTo?.id,
            view_once: viewOnce,
            ...(thumbUrl ? { thumbnail_url: thumbUrl } : {}),
          } as any);
        }
        // Clear files BEFORE fetchMessages
        setSelectedFiles([]);
      } else {
        await supabase.from('room_messages').insert({ user_id: user.id, content: trimmedText, reply_to: replyTo?.id });
      }

      setText(''); setReplyTo(null); setUploadProgress(0); setUploadedMB(0); setTotalUploadMB(0); setViewOnce(false); setUploadSpeedMBs(0);
      await fetchMessages(true);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch { toast.error('Imeshindwa kutuma'); }
    finally { setSending(false); }
  }

  const isRecordingRef = useRef(false);

  async function startRecording() {
    if (!user) { navigate('/login'); return; }
    if (!isPrivileged) { showRestriction('Voice note inahitaji VIP au Business Account'); return; }
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4', ''];
      const mimeType = mimeTypes.find(mt => { try { return !mt || MediaRecorder.isTypeSupported(mt); } catch { return false; } }) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      const actualMime = recorder.mimeType || 'audio/webm';
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: actualMime });
          await sendVoiceNote(blob, actualMime);
        }
      };
      recorder.start(250);
      setMediaRecorder(recorder);
      setRecording(true);
      setRecordingTime(0);
      recordTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      console.error('Mic error:', err);
      toast.error('Haiwezekani kupiga sauti. Ruhusu mic kwanza.');
    }
  }

  function stopRecording() {
    isRecordingRef.current = false;
    if (mediaRecorder && recording) {
      try { mediaRecorder.stop(); } catch {}
      setRecording(false);
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
      setMediaRecorder(null);
    }
  }

  async function sendVoiceNote(blob: Blob, mimeType: string) {
    if (!user) return;
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    try {
      const { uploadFile } = await import('@/lib/supabase');
      const file = new File([blob], `voice.${ext}`, { type: mimeType });
      const path = `room/${user.id}/voice_${Date.now()}.${ext}`;
      const mediaUrl = await uploadFile('room-media', path, file);
      if (mediaUrl) {
        await supabase.from('room_messages').insert({ user_id: user.id, media_url: mediaUrl, media_type: 'audio' });
        fetchMessages(true);
        toast.success('Sauti imetumwa!');
      }
    } catch (err) {
      console.error('Voice upload error:', err);
      toast.error('Imeshindwa kutuma sauti.');
    }
  }

  async function deleteMessage(msgId: string) {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    if (isAdminUser) {
      const { error } = await supabase.from('room_messages').delete().eq('id', msgId);
      if (error) { toast.error('Hitilafu ya kufuta: ' + error.message); return; }
    } else if (msg.user_id === user?.id) {
      const { error } = await supabase.from('room_messages').update({ is_deleted: true }).eq('id', msgId).eq('user_id', user.id);
      if (error) { toast.error('Hitilafu ya kufuta'); return; }
    } else {
      toast.error('Huna ruhusa ya kufuta ujumbe huu'); return;
    }
    setMessages(prev => prev.filter(m => m.id !== msgId));
    setShowOptions(null);
    toast.success('Ujumbe umefutwa!');
  }

  async function saveEditMessage() {
    if (!editingMsg || !editText.trim()) return;
    const canEdit = isAdminUser || editingMsg.user_id === user?.id;
    if (!canEdit) { toast.error('Huna ruhusa ya kuhariri'); return; }
    const { error } = await supabase.from('room_messages').update({ content: editText.trim() }).eq('id', editingMsg.id);
    if (error) { toast.error('Hitilafu ya kuhariri'); return; }
    setEditingMsg(null); setEditText('');
    fetchMessages(false);
    toast.success('Ujumbe umehaririwa!');
  }

  async function reactToMessage(msgId: string, emoji: string) {
    if (!user) return;
    if (!isPrivileged) {
      setShowOptions(null);
      showRestriction('Kutuma emoje unahitaji VIP au Business Account');
      return;
    }
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    const reactions = { ...(msg.reactions || {}) };
    if (!reactions[emoji]) reactions[emoji] = [];
    const arr = reactions[emoji] as string[];
    if (arr.includes(user.id)) reactions[emoji] = arr.filter(id => id !== user.id);
    else arr.push(user.id);
    await supabase.from('room_messages').update({ reactions }).eq('id', msgId);
    setShowOptions(null); fetchMessages(false);
  }

  const handleTouchStartMsg = (msgId: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeStartX.current[msgId] = touch.clientX;
    swipeStartY.current[msgId] = touch.clientY;
    holdFired.current = false;
    holdTimer.current = setTimeout(() => { holdFired.current = true; setShowOptions(msgId); }, 600);
  };

  const handleTouchMoveMsg = (msgId: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    const startX = swipeStartX.current[msgId] ?? touch.clientX;
    const startY = swipeStartY.current[msgId] ?? touch.clientY;
    if (Math.abs(touch.clientY - startY) > 8 || Math.abs(touch.clientX - startX) > 8) {
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    }
  };

  const handleTouchEndMsg = (msg: RoomMessage, e: React.TouchEvent) => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (holdFired.current) { holdFired.current = false; return; }
    const startX = swipeStartX.current[msg.id];
    const touch = e.changedTouches[0];
    if (startX !== undefined) {
      const diffX = touch.clientX - startX;
      const diffY = Math.abs(touch.clientY - (swipeStartY.current[msg.id] ?? touch.clientY));
      if (diffX > 60 && diffY < 40) {
        setReplyTo(msg); setShowOptions(null);
        setSwipedMsgId(msg.id);
        setTimeout(() => setSwipedMsgId(null), 400);
      }
    }
    delete swipeStartX.current[msg.id];
    delete swipeStartY.current[msg.id];
  };

  const handleMentionClick = async (username: string) => {
    const found = messages.find(m => (m.user as any)?.username?.toLowerCase() === username.toLowerCase());
    if (found) { navigate(`/profile/${found.user_id}`); return; }
    const { data } = await supabase.from('user_profiles').select('id').or(`username.ilike.${username},username_handle.ilike.${username}`).maybeSingle();
    if (data?.id) navigate(`/profile/${data.id}`);
    else toast.info(`Mtumiaji @${username} hajapatikana`);
  };

  const formatRecordTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const roomBg = settings.room_bg_image
    ? `url(${settings.room_bg_image}) center/cover no-repeat`
    : settings.room_color_from
    ? `linear-gradient(135deg, ${settings.room_color_from}, ${settings.room_color_to || '#1a0a2a'})`
    : '#0a030f';
  const roomCover = settings.room_cover;
  const roomName = settings.room_name || 'SEXY LIVE ROOM';
  const hasText = text.trim().length > 0 || selectedFiles.length > 0;
  const selectedMsg = messages.find(m => m.id === showOptions);
  const canDeleteSelected = isAdminUser || selectedMsg?.user_id === user?.id;
  const canEditSelected = (isAdminUser || selectedMsg?.user_id === user?.id) && selectedMsg?.content;

  return (
    <div className="full-screen-page" style={{ background: roomBg }}>
      {/* Floating header */}
      <div className="absolute top-0 left-0 right-0 z-30 px-3 pt-3 pb-2 flex items-center gap-2.5">
        <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg" style={{ background: 'rgba(10,4,14,0.88)', backdropFilter: 'blur(12px)' }}>
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-full min-w-0" style={{ background: 'rgba(10,4,14,0.88)', backdropFilter: 'blur(12px)' }}>
          <div className="w-9 h-9 rounded-full overflow-hidden border border-primary/50 flex-shrink-0">
            {roomCover ? <img src={roomCover} className="w-full h-full object-cover" alt="" /> :
              <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white text-base">💋</span></div>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate leading-tight">{roomName}</p>
            <p className="text-gray-400 text-xs">Live Chat</p>
          </div>
        </div>
        <button onClick={() => { const num = (settings.whatsapp_support || '+255773225088').replace(/\D/g, ''); window.open(`https://wa.me/${num}`, '_blank'); }}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg"
          style={{ background: 'rgba(37,211,102,0.90)', backdropFilter: 'blur(10px)' }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1" style={{ paddingTop: '72px', paddingBottom: '8px' }}>
        {messages.map(msg => {
          const isOwn = msg.user_id === user?.id;
          const msgUser = msg.user as UserProfile;
          const mediaUrls: string[] = ((msg as any).media_urls?.length > 1) ? (msg as any).media_urls : (msg.media_url ? [msg.media_url] : []);
          const hasMedia = mediaUrls.length > 0 && msg.media_type !== 'audio';
          const isSwiped = swipedMsgId === msg.id;
          const isHighlighted = highlightMsgId === msg.id;
          const isViewOnce = !!(msg as any).view_once;
          const isViewOnceOpened = !!(msg as any).view_once_opened;

          return (
            <div
              key={msg.id}
              ref={el => { msgRefs.current[msg.id] = el; }}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'} gap-1.5 items-end group transition-all duration-300 ${isSwiped ? 'translate-x-8' : ''} ${isHighlighted ? 'scale-[1.02]' : ''}`}
              style={{ borderRadius: isHighlighted ? '12px' : undefined, background: isHighlighted ? 'rgba(255,20,147,0.08)' : undefined }}
              onTouchStart={(e) => handleTouchStartMsg(msg.id, e)}
              onTouchMove={(e) => handleTouchMoveMsg(msg.id, e)}
              onTouchEnd={(e) => handleTouchEndMsg(msg, e)}
              onMouseDown={() => { holdFired.current = false; holdTimer.current = setTimeout(() => { holdFired.current = true; setShowOptions(msg.id); }, 600); }}
              onMouseUp={() => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } }}>

              {!isOwn && (
                <button onClick={() => navigate(`/profile/${msg.user_id}`)}
                  className="w-8 h-8 rounded-full overflow-hidden border border-primary/30 flex-shrink-0 self-end mb-1" style={{ padding: 0, minWidth: '32px' }}>
                  {msgUser?.avatar_url ?
                    <img src={msgUser.avatar_url} className="w-full h-full object-cover rounded-full" alt="" /> :
                    <div className="w-full h-full gradient-pink rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">{msgUser?.username?.[0]?.toUpperCase()}</span>
                    </div>}
                </button>
              )}

              <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${hasMedia ? 'flex-1 min-w-0' : 'max-w-[82%]'}`} style={hasMedia ? { maxWidth: 'calc(100vw - 60px)' } : {}}>
                {!isOwn && (
                  <div className="flex items-center gap-1 mb-0.5 px-1">
                    <button onClick={() => navigate(`/profile/${msg.user_id}`)} className="hover:underline" style={{ fontSize: '12px', fontFamily: 'inherit', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{msgUser?.username}</button>
                    {msgUser?.blue_tick && <BlueTick tickId={msgUser.blue_tick} size={11} />}
                    {msgUser?.is_admin && <span className="text-[7px] bg-primary/20 text-primary px-1 rounded-full">ADMIN</span>}
                  </div>
                )}

                <div style={{
                  background: isOwn
                    ? `linear-gradient(135deg,${settings.room_bubble_sent_from || settings.bubble_sent_from || '#7B2FBE'},${settings.room_bubble_sent_to || settings.bubble_sent_to || '#5B1F9E'})`
                    : `linear-gradient(135deg,${settings.room_bubble_recv_from || settings.bubble_recv_from || '#1a0a2a'},${settings.room_bubble_recv_to || settings.bubble_recv_to || '#2d1040'})`,
                  border: isOwn ? 'none' : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: `${settings.room_bubble_radius || '18'}px ${settings.room_bubble_radius || '18'}px ${isOwn ? '4px 18px' : '18px 4px'}`,
                  padding: hasMedia ? '2px' : '4px 10px 2px 10px',
                  overflow: 'hidden',
                  width: hasMedia ? '100%' : undefined,
                  maxWidth: hasMedia ? '100%' : '260px',
                  fontSize: settings.room_bubble_font_size ? `${settings.room_bubble_font_size}px` : '14px',
                  color: isOwn ? (settings.room_bubble_text_color || '#fff') : '#fff',
                  fontFamily: (() => { const f = settings.room_bubble_font_family; return f === 'dancing' ? 'Dancing Script, cursive' : f === 'pacifico' ? 'Pacifico, cursive' : f === 'mono' ? 'monospace' : f === 'serif' ? 'serif' : 'inherit'; })(),
                }}>
                  {msg.reply_to && (() => {
                    const repliedMsg = messages.find(m => m.id === msg.reply_to);
                    const repliedUser = repliedMsg ? (repliedMsg.user as any) : null;
                    return (
                      <div className="border-l-2 border-primary/60 pl-2 mb-1.5 mx-2 mt-1 py-1 rounded-r-lg bg-white/5 cursor-pointer"
                        onClick={() => {
                          const el = msgRefs.current[msg.reply_to!];
                          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setHighlightMsgId(msg.reply_to!); setTimeout(() => setHighlightMsgId(null), 2000); }
                        }}>
                        <p className="text-primary text-[10px] font-bold truncate">{repliedUser?.username ? `@${repliedUser.username}` : '↩ Jibu'}</p>
                        <p className="text-white/60 text-xs truncate">
                          {repliedMsg?.media_url && !repliedMsg.content ? (repliedMsg.media_type === 'video' ? '🎬 Video' : repliedMsg.media_type === 'audio' ? '🎵 Sauti' : '📷 Picha') : repliedMsg?.content ? repliedMsg.content.slice(0, 60) : '↩ Jibu'}
                        </p>
                      </div>
                    );
                  })()}

                  {hasMedia && isViewOnce && !isOwn && !isViewOnceOpened && !openedViewOnce.has(msg.id) && (
                    <div className="relative cursor-pointer" style={{ minHeight: '120px' }}
                      onClick={async () => {
                        const url = mediaUrls[0];
                        const isVid = /\.(mp4|webm|mov)/i.test(url) || msg.media_type === 'video';
                        markViewOnceOpened(msg.id);
                        await supabase.from('room_messages').update({ view_once_opened: true }).eq('id', msg.id);
                        // Always open in overlay — never navigate away
                        openMedia(mediaUrls.map(u => ({
                          url: u,
                          type: (isVid || /\.(mp4|webm|mov)/i.test(u)) ? 'video' as const : 'image' as const
                        })), 0);
                        setTimeout(() => { setMessages(prev => prev.filter(m => m.id !== msg.id)); }, 800);
                      }}>
                      {(msg as any).thumbnail_url || mediaUrls[0] ? (
                        <img src={(msg as any).thumbnail_url || mediaUrls[0]} alt="" className="w-full" style={{ height: '200px', objectFit: 'cover', filter: 'blur(12px)', borderRadius: '14px' }} />
                      ) : (
                        <div className="w-full flex items-center justify-center" style={{ height: '200px', background: '#1a0a1a', borderRadius: '14px' }} />
                      )}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ borderRadius: '14px' }}>
                        <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center"><span className="text-3xl">👁️</span></div>
                        <p className="text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-full">Tazama Mara Moja</p>
                        <p className="text-white/60 text-xs">Itafutwa baada ya kutazama</p>
                      </div>
                    </div>
                  )}
                  {hasMedia && isViewOnce && !isOwn && (isViewOnceOpened || openedViewOnce.has(msg.id)) && (
                    <div className="flex items-center gap-2 px-4 py-3"><span className="text-gray-500">👁️</span><p className="text-gray-500 text-xs italic">Imefutwa baada ya kutazama</p></div>
                  )}
                  {hasMedia && isViewOnce && isOwn && (
                    <div className="flex items-center gap-2 px-4 py-3"><span className="text-blue-400">👁️</span><p className="text-white/70 text-xs">{isViewOnceOpened ? '👁️ Imetazamwa' : '👁️ Tazama Mara Moja'}</p></div>
                  )}

                  {/* ── MEDIA: Always open in GlobalMediaViewer overlay, NEVER navigate away ── */}
                  {hasMedia && !isViewOnce && (
                    <div className="overflow-hidden" style={{ borderRadius: '14px' }}>
                      <MessageMediaGrid
                        urls={mediaUrls}
                        type={msg.media_type || 'image'}
                        thumbUrl={(msg as any).thumbnail_url}
                        onOpen={(url, tp) => {
                          // Build items array with correct types
                          const allItems = mediaUrls.map(u => ({
                            url: u,
                            type: (/\.(mp4|webm|mov)/i.test(u) || tp === 'video' || msg.media_type === 'video')
                              ? 'video' as const
                              : 'image' as const
                          }));
                          const startIdx = Math.max(0, mediaUrls.indexOf(url));
                          // Open in overlay — NO navigate('/play') which causes black screen
                          openMedia(allItems, startIdx);
                        }}
                      />
                    </div>
                  )}

                  {msg.media_type === 'audio' && msg.media_url && <AudioPlayer url={msg.media_url} isOwn={isOwn} />}

                  {msg.content && (
                    editingMsg?.id === msg.id ? (
                      <div className="flex items-center gap-1 px-2 py-1 min-w-[120px]">
                        <input value={editText} onChange={e => setEditText(e.target.value)}
                          className="bg-transparent text-white text-sm flex-1 outline-none border-b border-white/40"
                          onKeyDown={e => e.key === 'Enter' && saveEditMessage()} autoFocus />
                        <button onClick={saveEditMessage}><Check className="w-4 h-4 text-green-400" /></button>
                        <button onClick={() => setEditingMsg(null)}><X className="w-4 h-4 text-gray-400" /></button>
                      </div>
                    ) : (
                      <p className="text-white leading-snug px-2 py-0.5" style={{ fontSize: 'inherit' }}>
                        {renderTextWithLinks(msg.content, handleMentionClick)}
                      </p>
                    )
                  )}

                  <div className="flex items-center justify-end gap-1 px-2 pb-0.5">
                    <span className="text-white/50 text-[9px]">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {Object.keys(msg.reactions || {}).length > 0 && (
                  <div className="flex gap-1 mt-0.5 flex-wrap px-1">
                    {Object.entries(msg.reactions || {}).filter(([, ids]) => (ids as string[]).length > 0).map(([emoji, ids]) => (
                      <span key={emoji} onClick={() => reactToMessage(msg.id, emoji)}
                        className="text-xs bg-black/50 rounded-full px-1.5 py-0.5 cursor-pointer border border-white/10">
                        {emoji} {(ids as string[]).length}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <PreviewGrid files={selectedFiles} onRemove={i => setSelectedFiles(prev => prev.filter((_, j) => j !== i))} />

      {selectedFiles.length > 0 && (
        <div className="px-3 pb-1 flex items-center gap-2" style={{ background: 'rgba(6,2,10,0.97)' }}>
          <button onClick={() => setViewOnce(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              viewOnce ? 'bg-blue-500 text-white' : 'bg-[#1a0a1a] text-gray-400 border border-gray-700'
            }`}>
            👁️ {viewOnce ? 'Tazama Mara Moja (Imewashwa)' : 'Tazama Mara Moja'}
          </button>
        </div>
      )}

      {/* ── Upload Progress Bar ── */}
      {uploadProgress > 0 && uploadProgress < 100 && (
        <div className="px-4 py-2 bg-[#06020a]/97" style={{ borderTop: '1px solid rgba(255,20,147,0.18)' }}>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-gray-300 text-xs font-semibold truncate flex-1 mr-2">
                📁 {selectedFiles.length > 0
                  ? selectedFiles[0].name.slice(0, 24) + (selectedFiles.length > 1 ? ` +${selectedFiles.length - 1} faili` : '')
                  : 'Inapakia...'}
              </span>
              <span className="text-primary text-sm font-black flex-shrink-0 animate-pulse">{uploadProgress}%</span>
            </div>
            <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full gradient-pink rounded-full transition-all duration-200"
                style={{ width: `${Math.max(2, uploadProgress)}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-[10px]">
                {uploadedMB.toFixed(1)} MB / {totalUploadMB.toFixed(1)} MB
              </span>
              <div className="flex items-center gap-2">
                {uploadSpeedMBs > 0.01 && (
                  <span className="text-blue-400 text-[10px] font-bold">
                    ⚡ {uploadSpeedMBs >= 1
                      ? `${uploadSpeedMBs.toFixed(1)} MB/s`
                      : `${(uploadSpeedMBs * 1024).toFixed(0)} KB/s`}
                  </span>
                )}
                {uploadSpeedMBs > 0.01 && totalUploadMB > 0 && uploadProgress < 99 && (() => {
                  const remaining = (totalUploadMB - uploadedMB) / uploadSpeedMBs;
                  if (!isFinite(remaining) || remaining <= 0) return null;
                  return (
                    <span className="text-yellow-400 text-[10px]">
                      ~{remaining < 60 ? `${Math.ceil(remaining)}s` : `${Math.floor(remaining / 60)}m ${Math.ceil(remaining % 60)}s`}
                    </span>
                  );
                })()}
                <span className="text-gray-600 text-[10px]">{selectedFiles.length} faili</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {replyTo && (
        <div className="px-4 py-2 flex items-center gap-2 bg-[#06020a]/97" style={{ borderTop: '1px solid rgba(255,20,147,0.15)' }}>
          <Reply className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-gray-400 text-sm flex-1 truncate">{replyTo.content || 'Media'}</p>
          <button onClick={() => setReplyTo(null)}><X className="w-4 h-4 text-gray-500" /></button>
        </div>
      )}

      {recording && (
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(10,4,14,0.97)', borderTop: '1px solid rgba(255,20,147,0.2)' }}>
          <button onClick={() => {
            isRecordingRef.current = false;
            if (mediaRecorder) { try { mediaRecorder.stop(); } catch {} }
            setRecording(false);
            if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
            setRecordingTime(0); setMediaRecorder(null); chunksRef.current = [];
          }}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(40,40,40,0.9)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-full" style={{ background: 'linear-gradient(135deg, #1565C0, #1976D2)', minHeight: '44px' }}>
            <div className="flex items-end gap-px flex-1" style={{ height: '22px' }}>
              {Array.from({ length: 28 }).map((_, i) => (
                <div key={i} className="flex-1 rounded-full"
                  style={{
                    height: `${30 + Math.abs(Math.sin(i * 0.9)) * 70}%`, minHeight: '3px',
                    background: 'rgba(255,255,255,0.7)',
                    animation: `waveBar ${0.5 + (i % 7) * 0.08}s ease-in-out infinite alternate`,
                    animationDelay: `${(i % 5) * 0.06}s`
                  }} />
              ))}
            </div>
            <span className="text-white font-mono text-sm font-bold flex-shrink-0">{formatRecordTime(recordingTime)}</span>
          </div>
          <button onClick={stopRecording} className="w-10 h-10 gradient-pink rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      )}

      {/* Floating input bar */}
      <div className="px-3 py-3 flex items-end gap-2" style={{ background: 'transparent' }}>
        <label className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg cursor-pointer"
          style={{ background: 'rgba(10,4,14,0.92)', backdropFilter: 'blur(10px)' }}>
          <ImageIcon className="w-5 h-5 text-gray-300" />
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple className="hidden"
            onChange={e => setSelectedFiles(Array.from(e.target.files || []))} />
        </label>

        <textarea value={text} onChange={async e => {
          setText(e.target.value);
          if (!user || !profile) return;
          const now = Date.now();
          if (now - lastTypingSentRef.current > 2000) {
            lastTypingSentRef.current = now;
            await supabase.from('room_messages').insert({
              user_id: user.id,
              content: profile.username || 'Mtu',
              media_type: 'typing',
            });
          }
        }}
          placeholder={user ? 'Andika ujumbe...' : 'Ingia kutuma ujumbe...'}
          className="flex-1 text-white rounded-2xl px-4 py-2.5 text-sm resize-none focus:outline-none"
          style={{ background: 'rgba(10,4,14,0.92)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.12)', minHeight: '44px', maxHeight: '120px' }}
          rows={1}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); user ? sendMessage() : navigate('/login'); } }} />

        {hasText ? (
          <button onClick={user ? sendMessage : () => navigate('/login')} disabled={sending}
            className="w-10 h-10 gradient-pink rounded-full flex items-center justify-center flex-shrink-0 shadow-lg active:scale-90 transition-transform">
            {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4 text-white" />}
          </button>
        ) : (
          <button
            onMouseDown={user ? (e) => { if ((e.nativeEvent as PointerEvent).pointerType !== 'touch') startRecording(); } : undefined}
            onMouseUp={recording ? (e) => { if ((e.nativeEvent as PointerEvent).pointerType !== 'touch') stopRecording(); } : undefined}
            onTouchStart={user ? (e) => { e.preventDefault(); startRecording(); } : undefined}
            onTouchEnd={recording ? (e) => { e.preventDefault(); stopRecording(); } : undefined}
            onClick={!user ? () => navigate('/login') : undefined}
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${recording ? 'bg-red-500 scale-110 animate-pulse' : 'gradient-pink'}`}>
            <Mic className="w-4 h-4 text-white" />
          </button>
        )}
      </div>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-1 flex items-center gap-2" style={{ background: 'transparent' }}>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(10,4,14,0.88)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex gap-0.5 items-center">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary"
                  style={{ animation: `waveBar 0.8s ease-in-out infinite`, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span className="text-gray-300 text-xs">
              {typingUsers.length === 1
                ? `${typingUsers[0]} anaandika...`
                : typingUsers.length === 2
                ? `${typingUsers[0]} na ${typingUsers[1]} wanaandika...`
                : `${typingUsers[0]} na wengine wanaandika...`}
            </span>
          </div>
        </div>
      )}

      {/* Context menu */}
      {showOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowOptions(null)}>
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-4 w-72 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {['❤️', '😂', '😮', '😢', '🔥', '👍', '💋', '😍'].map(e => (
                <button key={e} onClick={() => reactToMessage(showOptions, e)} className="text-2xl p-2 hover:bg-white/10 rounded-xl">{e}</button>
              ))}
            </div>
            {(() => {
              const msg = messages.find(m => m.id === showOptions);
              const msgUser = msg ? (msg.user as any) : null;
              if (!msgUser || msg?.user_id === user?.id) return null;
              return (
                <div className="grid grid-cols-4 gap-2 mb-3 p-2 rounded-xl" style={{ background: 'rgba(255,140,0,0.08)', border: '1px solid rgba(255,140,0,0.2)' }}>
                  {[
                    { emoji: '🌹', label: '100', amount: 100 }, { emoji: '💐', label: '200', amount: 200 },
                    { emoji: '🍫', label: '500', amount: 500 }, { emoji: '💍', label: '1K', amount: 1000 },
                    { emoji: '🧸', label: '2K', amount: 2000 }, { emoji: '💎', label: '5K', amount: 5000 },
                    { emoji: '🏆', label: '10K', amount: 10000 }, { emoji: '🚗', label: '50K', amount: 50000 },
                  ].map(g => (
                    <button key={g.emoji} onClick={() => {
                      setShowOptions(null);
                      setShowGiftModal({ userId: msg!.user_id, username: msgUser.username || 'Mtumiaji', preselected: { emoji: g.emoji, name: g.label, amount: g.amount } });
                    }} className="flex flex-col items-center gap-0.5 p-1.5 hover:bg-white/10 rounded-xl">
                      <span className="text-xl">{g.emoji}</span>
                      <span className="text-[9px] text-orange-400 font-bold">{g.label}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
            <div className="space-y-1">
              <button onClick={() => { if (selectedMsg) { setReplyTo(selectedMsg); setShowOptions(null); } }}
                className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-white">
                <Reply className="w-4 h-4 text-primary" /> Jibu
              </button>
              {canEditSelected && (
                <button onClick={() => { if (selectedMsg) { setEditingMsg(selectedMsg); setEditText(selectedMsg.content || ''); setShowOptions(null); } }}
                  className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-white">
                  <Edit2 className="w-4 h-4 text-blue-400" /> Hariri
                </button>
              )}
              {canDeleteSelected && (
                <button onClick={() => deleteMessage(showOptions!)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-red-400">
                  <Trash2 className="w-4 h-4" /> Futa
                </button>
              )}
              <button onClick={async () => {
                if (!user || !showOptions) return;
                const msg = messages.find(m => m.id === showOptions);
                if (!msg) return;
                await supabase.from('saved_items').insert({
                  user_id: user.id, content_id: msg.id,
                  content_type: msg.media_type === 'video' ? 'room_video' : msg.media_type === 'audio' ? 'audio' : msg.media_url ? 'room_image' : 'text',
                  content_url: msg.media_url || '', content_name: msg.content?.slice(0, 50) || 'Ujumbe wa SexyRoom',
                  thumbnail_url: (msg as any).thumbnail_url || msg.media_url,
                });
                setShowOptions(null);
                toast.success('✅ Ujumbe umehifadhiwa kwenye Saved!');
              }} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-yellow-400">
                <Bookmark className="w-4 h-4" /> Hifadhi
              </button>
              {(() => {
                const msg = messages.find(m => m.id === showOptions);
                const msgUser = msg ? (msg.user as any) : null;
                if (!msgUser || msg?.user_id === user?.id) return null;
                return (
                  <button onClick={() => { setShowOptions(null); setShowGiftModal({ userId: msg!.user_id, username: msgUser.username || 'Mtumiaji' }); }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-orange-400">
                    <Gift className="w-4 h-4" /> Tuma Zawadi 🎁
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {showPlanPicker && (
        <PlanPickerModal onClose={() => setShowPlanPicker(false)} settings={settings} onSuccess={() => setShowPlanPicker(false)} message={planMsg} />
      )}

      {showGiftModal && profile && (
        <RoomGiftModal
          targetUserId={showGiftModal.userId}
          targetUsername={showGiftModal.username}
          myProfile={profile}
          preselected={showGiftModal.preselected}
          onClose={() => setShowGiftModal(null)}
        />
      )}
    </div>
  );
}

// SexyRoom Gift Modal
function RoomGiftModal({ targetUserId, targetUsername, myProfile, onClose, preselected }: {
  targetUserId: string; targetUsername: string; myProfile: any; onClose: () => void; preselected?: any;
}) {
  const DEFAULT_GIFTS = [
    { emoji: '🌹', name: 'Waridi', amount: 100 }, { emoji: '💐', name: 'Maua', amount: 200 },
    { emoji: '🍫', name: 'Chokoleti', amount: 500 }, { emoji: '💍', name: 'Pete', amount: 1000 },
    { emoji: '🧸', name: 'Teddy', amount: 2000 }, { emoji: '💎', name: 'Almasi', amount: 5000 },
    { emoji: '🏆', name: 'Trophy', amount: 10000 }, { emoji: '🚗', name: 'Gari', amount: 50000 },
  ];
  const [GIFTS, setGIFTS] = useState(DEFAULT_GIFTS);
  const [selected, setSelected] = useState<typeof DEFAULT_GIFTS[0] | null>(preselected || null);
  const [walletPass, setWalletPass] = useState('');
  const [sending, setSending] = useState(false);
  const { user, refreshProfile } = useAuth() as any;
  const giftBal = myProfile?.gift_balance || 0;
  const mainBal = myProfile?.balance || 0;

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'gift_options').single().then(({ data }) => {
      if (data?.value) { try { setGIFTS(JSON.parse(data.value)); } catch {} }
    });
  }, []);

  async function handleSend() {
    if (!selected || !user) return;
    const amt = selected.amount;
    const canUseGift = giftBal >= amt;
    if (!canUseGift && mainBal < amt) return toast.error(`Salio halitooshi. Unahitaji TZS ${amt.toLocaleString()}`);
    if (myProfile?.wallet_password && walletPass !== myProfile.wallet_password) return toast.error('Password ya wallet si sahihi!');
    setSending(true);
    try {
      if (canUseGift) {
        await supabase.from('user_profiles').update({ gift_balance: giftBal - amt }).eq('id', user.id);
      } else {
        await supabase.from('user_profiles').update({ balance: mainBal - amt }).eq('id', user.id);
      }
      const { data: recvProf } = await supabase.from('user_profiles').select('gift_balance').eq('id', targetUserId).single();
      await supabase.from('user_profiles').update({ gift_balance: ((recvProf as any)?.gift_balance || 0) + amt }).eq('id', targetUserId);
      await supabase.from('notifications').insert({ user_id: targetUserId, title: `🎁 Umepata Zawadi!`, message: `${myProfile?.username} amekutumia ${selected.emoji} ${selected.name} - TZS ${amt.toLocaleString()} kwenye SexyRoom!`, type: 'gift', link: '/wallet?tab=gifts' });
      await supabase.from('transactions').insert({ user_id: targetUserId, amount: amt, type: 'gift_received', status: 'approved', description: `Zawadi SexyRoom: ${selected.emoji} ${selected.name} kutoka kwa ${myProfile?.username}` });
      await supabase.from('transactions').insert({ user_id: user.id, amount: amt, type: 'gift_sent', status: 'approved', description: `Zawadi kwa ${targetUsername}: ${selected.emoji} ${selected.name}` });
      if (refreshProfile) await refreshProfile();
      toast.success(`🎁 ${selected.emoji} Zawadi imetumwa kwa ${targetUsername}!`);
      onClose();
    } catch { toast.error('Hitilafu ya kutuma zawadi'); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-5 slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-3">
          <h3 className="text-white font-bold flex items-center gap-2"><Gift className="w-5 h-5 text-orange-400" /> Tuma Zawadi kwa {targetUsername}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {GIFTS.map(g => (
            <button key={g.name} onClick={() => setSelected(g)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${selected?.name === g.name ? 'bg-primary/20 border-2 border-primary' : 'bg-[#1a0a1a] border border-transparent'}`}>
              <span className="text-2xl">{g.emoji}</span>
              <span className="text-white text-[9px] font-semibold">{g.name}</span>
              <span className="text-primary text-[9px] font-bold">{g.amount >= 1000 ? `${g.amount / 1000}K` : g.amount}</span>
            </button>
          ))}
        </div>
        {selected && (
          <div className="space-y-3">
            <div className="bg-[#1a0a1a] rounded-xl p-3 flex justify-between items-center">
              <span className="text-gray-400 text-sm">{selected.emoji} {selected.name}</span>
              <span className="text-primary font-bold">TZS {selected.amount.toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#1a0a1a] rounded-lg p-2 text-center"><p className="text-gray-500">Zawadi</p><p className="text-orange-400 font-bold">TZS {giftBal.toLocaleString()}</p></div>
              <div className="bg-[#1a0a1a] rounded-lg p-2 text-center"><p className="text-gray-500">Salio Kuu</p><p className="text-green-400 font-bold">TZS {mainBal.toLocaleString()}</p></div>
            </div>
            {myProfile?.wallet_password && (
              <input value={walletPass} onChange={e => setWalletPass(e.target.value)} placeholder="Password ya wallet" type="password" className="input-field text-sm" />
            )}
            <button onClick={handleSend} disabled={sending} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>{selected.emoji}</span>}
              {sending ? 'Inatuma...' : `Tuma ${selected.emoji} - TZS ${selected.amount.toLocaleString()}`}
            </button>
            <p className="text-gray-600 text-xs text-center">Pesa zitatoka: {giftBal >= selected.amount ? '🎁 Zawadi' : '💰 Salio Kuu'}</p>
          </div>
        )}
      </div>
    </div>
  );
        }
