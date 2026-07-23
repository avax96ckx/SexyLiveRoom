import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, uploadFile, globalUploadTracker } from '@/lib/supabase';
import { ContentPost, TANZANIA_REGIONS } from '@/types';
import { useMediaViewer } from '@/components/features/GlobalMediaViewer';
import {
  ArrowLeft, Plus, SlidersHorizontal, MapPin, X, Upload,
  Share2, Trash2, Edit3, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Download, Bookmark, Gift, EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import UploadProgress from '@/components/features/UploadProgress';
import { PlanPickerModal } from '@/pages/Services';
import { triggerDownload } from '@/pages/Downloads';
import { generateVideoThumbnail } from '@/lib/generateThumbnail';

// Full-screen gallery
function GalleryModal({ post, initialIndex = 0, onClose }: {
  post: ContentPost & { media_urls?: string[] };
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const mediaUrls: string[] = (post.media_urls && post.media_urls.length > 0)
    ? post.media_urls : (post.media_url ? [post.media_url] : []);
  const isVideo = (url: string) => /\.(mp4|webm|mov|avi|mkv)/i.test(url) || url.includes('video');
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);

  const handleTap = () => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current); tapTimer.current = null;
      setScale(s => s === 1 ? 2.5 : 1);
    } else {
      tapTimer.current = setTimeout(() => { tapTimer.current = null; setShowControls(c => !c); }, 250);
    }
  };
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 60) {
      if (diff > 0 && index < mediaUrls.length - 1) { setIndex(i => i + 1); setScale(1); }
      else if (diff < 0 && index > 0) { setIndex(i => i - 1); setScale(1); }
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < mediaUrls.length - 1) setIndex(i => i + 1);
      if (e.key === 'ArrowLeft' && index > 0) setIndex(i => i - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, mediaUrls.length, onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {showControls && (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 p-4" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center"><X className="w-5 h-5 text-white" /></button>
          <div className="flex-1"><p className="text-white font-bold truncate">{post.title || 'Malaya'}</p>
            {mediaUrls.length > 1 && <p className="text-white/60 text-xs">{index + 1} / {mediaUrls.length}</p>}
          </div>
        </div>
      )}
      <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={handleTap}>
        {isVideo(mediaUrls[index]) ? (
          <video src={mediaUrls[index]} controls autoPlay playsInline className="max-w-full max-h-full" style={{ transform: `scale(${scale})`, transition: 'transform 0.2s' }} />
        ) : (
          <img src={mediaUrls[index]} alt="" className="max-w-full max-h-full object-contain select-none" style={{ transform: `scale(${scale})`, transition: 'transform 0.2s' }} draggable={false} />
        )}
      </div>
      {mediaUrls.length > 1 && showControls && (
        <>
          {index > 0 && <button onClick={() => { setIndex(i => i - 1); setScale(1); }} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center z-10"><ChevronLeft className="w-6 h-6 text-white" /></button>}
          {index < mediaUrls.length - 1 && <button onClick={() => { setIndex(i => i + 1); setScale(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center z-10"><ChevronRight className="w-6 h-6 text-white" /></button>}
        </>
      )}
    </div>
  );
}

// Telegram-style media grid - ALL images same TALL portrait height
function TelegramMediaGrid({ mediaUrls, thumbUrls, thumbnailUrl, onClick }: { mediaUrls: string[]; thumbUrls?: string[]; thumbnailUrl?: string; onClick: (i: number) => void }) {
  if (mediaUrls.length === 0) return null;
  const isVideo = (url: string) => /\.(mp4|webm|mov|avi|mkv)/i.test(url) || (url.includes('/video/') && !url.includes('/thumb/'));
  // For each media item, use per-item thumb from thumbUrls array first, then global thumbnailUrl
  const getThumb = (i: number): string | null => {
    if (thumbUrls && thumbUrls[i] && thumbUrls[i].trim() && !isVideo(thumbUrls[i])) return thumbUrls[i];
    if (i === 0 && thumbnailUrl && !isVideo(thumbnailUrl)) return thumbnailUrl;
    return null;
  };
  const ITEM_HEIGHT = 520;

  const MediaItem = ({ url, style, idx }: { url: string; style: React.CSSProperties; idx: number }) => {
    const effectiveThumb = getThumb(idx);
    return (
      <div className="relative overflow-hidden cursor-pointer flex-shrink-0" style={style} onClick={() => onClick(idx)}>
        {isVideo(url) ? (
          <>
            {effectiveThumb ? (
              <img src={effectiveThumb} alt=""
                className="w-full h-full" style={{ objectFit: 'cover', objectPosition: 'top' }} loading="eager" />
            ) : (
              <div className="w-full h-full bg-[#1a0a1a] flex items-center justify-center">
                <span className="text-5xl opacity-20">🎬</span>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-black/55 flex items-center justify-center">
                <div className="w-0 h-0 border-l-[18px] border-l-white border-t-[12px] border-t-transparent border-b-[12px] border-b-transparent ml-1.5" />
              </div>
            </div>
          </>
        ) : (
          <img src={url} alt="" className="w-full h-full" style={{ objectFit: 'cover', objectPosition: 'top' }} loading="eager" />
        )}
      </div>
    );
  };

  const count = mediaUrls.length;
  if (count === 1) return <MediaItem url={mediaUrls[0]} style={{ width: '100%', height: `${ITEM_HEIGHT}px`, display: 'block' }} idx={0} />;
  if (count === 2) return (
    <div className="flex gap-0.5" style={{ height: `${ITEM_HEIGHT}px` }}>
      <MediaItem url={mediaUrls[0]} style={{ flex: 1, height: '100%' }} idx={0} />
      <MediaItem url={mediaUrls[1]} style={{ flex: 1, height: '100%' }} idx={1} />
    </div>
  );
  if (count === 3) {
    const halfH = Math.floor(ITEM_HEIGHT / 2);
    return (
      <div className="flex gap-0.5" style={{ height: `${ITEM_HEIGHT}px` }}>
        <MediaItem url={mediaUrls[0]} style={{ flex: '1.2', height: '100%' }} idx={0} />
        <div className="flex flex-col gap-0.5" style={{ flex: '0.8' }}>
          <MediaItem url={mediaUrls[1]} style={{ width: '100%', height: `${halfH}px` }} idx={1} />
          <MediaItem url={mediaUrls[2]} style={{ width: '100%', height: `${halfH}px` }} idx={2} />
        </div>
      </div>
    );
  }
  if (count === 4) {
    const halfH = Math.floor(ITEM_HEIGHT / 2);
    return (
      <div className="flex flex-col gap-0.5" style={{ height: `${ITEM_HEIGHT}px` }}>
        <div className="flex gap-0.5" style={{ height: `${halfH}px` }}>
          <MediaItem url={mediaUrls[0]} style={{ flex: 1, height: '100%' }} idx={0} />
          <MediaItem url={mediaUrls[1]} style={{ flex: 1, height: '100%' }} idx={1} />
        </div>
        <div className="flex gap-0.5" style={{ height: `${halfH}px` }}>
          <MediaItem url={mediaUrls[2]} style={{ flex: 1, height: '100%' }} idx={2} />
          <MediaItem url={mediaUrls[3]} style={{ flex: 1, height: '100%' }} idx={3} />
        </div>
      </div>
    );
  }
  const row1H = Math.floor(ITEM_HEIGHT * 0.55);
  const row2H = ITEM_HEIGHT - row1H - 2;
  return (
    <div className="flex flex-col gap-0.5" style={{ height: `${ITEM_HEIGHT}px` }}>
      <div className="flex gap-0.5" style={{ height: `${row1H}px` }}>
        <MediaItem url={mediaUrls[0]} style={{ flex: 1, height: '100%' }} idx={0} />
        <MediaItem url={mediaUrls[1]} style={{ flex: 1, height: '100%' }} idx={1} />
      </div>
      <div className="flex gap-0.5" style={{ height: `${row2H}px` }}>
        {mediaUrls.slice(2, 5).map((url, i) => (
          <div key={i} className="relative flex-1" style={{ height: '100%' }}>
            <MediaItem url={url} style={{ width: '100%', height: '100%' }} idx={i + 2} />
            {i === 2 && count > 5 && (
              <div className="absolute inset-0 bg-black/65 flex items-center justify-center">
                <span className="text-white font-black text-2xl">+{count - 5}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Gift Modal for posts
function GiftPostModal({ uploaderName, uploaderId, profile, onClose }: { uploaderName: string; uploaderId: string; profile: any; onClose: () => void }) {
  const GIFT_OPTIONS = [
    { emoji: '🌹', name: 'Waridi', amount: 100 },
    { emoji: '💐', name: 'Maua', amount: 200 },
    { emoji: '🍫', name: 'Chokoleti', amount: 500 },
    { emoji: '💍', name: 'Pete', amount: 1000 },
    { emoji: '🧸', name: 'Teddy', amount: 2000 },
    { emoji: '💎', name: 'Almasi', amount: 5000 },
    { emoji: '🏆', name: 'Trophy', amount: 10000 },
    { emoji: '🚗', name: 'Gari', amount: 50000 },
  ];
  const [selected, setSelected] = useState<typeof GIFT_OPTIONS[0] | null>(null);
  const [walletPass, setWalletPass] = useState('');
  const [sending, setSending] = useState(false);
  const { user, refreshProfile } = useAuth();
  const giftBal = (profile as any)?.gift_balance || 0;
  const mainBal = (profile as any)?.balance || 0;

  async function handleSend() {
    if (!selected || !user || !uploaderId) return;
    if (!user) { toast.error('Ingia kwanza'); return; }
    const amt = selected.amount;
    const canUseGift = giftBal >= amt;
    if (!canUseGift && mainBal < amt) return toast.error(`Salio halitooshi. Unahitaji TZS ${amt.toLocaleString()}`);
    if (profile?.wallet_password && walletPass !== profile.wallet_password) return toast.error('Password ya wallet si sahihi!');
    setSending(true);
    try {
      if (canUseGift) {
        await supabase.from('user_profiles').update({ gift_balance: giftBal - amt }).eq('id', user.id);
      } else {
        await supabase.from('user_profiles').update({ balance: mainBal - amt }).eq('id', user.id);
      }
      const { data: recvProf } = await supabase.from('user_profiles').select('gift_balance').eq('id', uploaderId).single();
      await supabase.from('user_profiles').update({ gift_balance: ((recvProf as any)?.gift_balance || 0) + amt }).eq('id', uploaderId);
      await supabase.from('transactions').insert({ user_id: uploaderId, amount: amt, type: 'gift_received', status: 'approved', description: `Zawadi ${selected.emoji} ${selected.name} | Kutoka: ${profile?.username} | Chanzo: Malaya` });
      await supabase.from('notifications').insert({ user_id: uploaderId, title: `🎁 Umepata Zawadi!`, message: `${profile?.username} amekutumia ${selected.emoji} ${selected.name} - TZS ${amt.toLocaleString()} (Malaya)!`, type: 'gift' });
      await supabase.from('transactions').insert({ user_id: user.id, amount: amt, type: 'gift_sent', status: 'approved', description: `Zawadi ${selected.emoji} ${selected.name} | Kwa: ${uploaderName} | Chanzo: Malaya` });
      await supabase.from('notifications').insert({ user_id: user.id, title: `🎁 Zawadi Imetumwa`, message: `Umetuma ${selected.emoji} ${selected.name} kwa ${uploaderName} - TZS ${amt.toLocaleString()} (Malaya)`, type: 'gift', link: '/wallet?tab=gifts' });
      if (refreshProfile) await refreshProfile();
      toast.success(`🎁 ${selected.emoji} Zawadi ya TZS ${amt.toLocaleString()} imetumwa kwa ${uploaderName}!`);
      onClose();
    } catch { toast.error('Hitilafu ya kutuma zawadi'); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-5 slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-3">
          <h3 className="text-white font-bold flex items-center gap-2"><Gift className="w-5 h-5 text-orange-400" /> Tuma Zawadi kwa {uploaderName}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {GIFT_OPTIONS.map(g => (
            <button key={g.name} onClick={() => setSelected(g)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${selected?.name === g.name ? 'bg-primary/20 border-2 border-primary' : 'bg-[#1a0a1a] border border-transparent'}`}>
              <span className="text-2xl">{g.emoji}</span>
              <span className="text-white text-[9px] font-semibold">{g.name}</span>
              <span className="text-primary text-[9px] font-bold">{g.amount >= 1000 ? `${g.amount/1000}K` : g.amount}</span>
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
            {profile?.wallet_password && (
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

// Balance-based payment confirmation dialog
function BalanceConfirmModal({ amount, itemName, balance, onConfirm, onCancel }: {
  amount: number; itemName: string; balance: number; onConfirm: () => void; onCancel: () => void;
}) {
  const canAfford = (balance || 0) >= amount;
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-sm bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 slide-up" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">💋</div>
          <h3 className="text-white font-black text-xl">{itemName}</h3>
        </div>
        <div className="bg-[#1a0a1a] rounded-xl p-4 mb-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Bei ya Kuona Namba:</span>
            <span className="text-primary font-black">TZS {amount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Salio Lako:</span>
            <span className={`font-black ${canAfford ? 'text-green-400' : 'text-red-400'}`}>TZS {(balance || 0).toLocaleString()}</span>
          </div>
          {!canAfford && <p className="text-red-400 text-xs text-center pt-1">⚠️ Salio halitooshi. Ongeza pesa kwenye Wallet.</p>}
        </div>
        <p className="text-gray-400 text-sm text-center mb-4">
          Thibitisha: TZS {amount.toLocaleString()} itakatwa kwenye salio lako na utaweza kuona namba ya simu.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-400 font-semibold text-sm">Ghairi</button>
          <button onClick={onConfirm} disabled={!canAfford} className="flex-1 py-3 rounded-xl gradient-pink text-white font-black text-sm disabled:opacity-40">
            ✅ Thibitisha &amp; Lipia
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MalayaSection() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, user, requireAuth, isAdmin } = useAuth();
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [region, setRegion] = useState('');
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadThumbPreview, setUploadThumbPreview] = useState<string>('');
  const [uploadThumbBlob, setUploadThumbBlob] = useState<Blob | null>(null);
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  // DB-backed revealed contacts - persists across sessions forever
  const [revealedContacts, setRevealedContacts] = useState<Set<string>>(new Set());
  const [revealedLoaded, setRevealedLoaded] = useState(false);
  const [balanceModal, setBalanceModal] = useState<ContentPost | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [uploadData, setUploadData] = useState({ title: '', location: '', phone: '', whatsapp: '', region: '', price: '0', is_free: true, show_in_tiksexy: true });
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  // Per-file upload progress
  const [fileUploadProgress, setFileUploadProgress] = useState<Record<number, number>>({});
  const [fileUploadedMB, setFileUploadedMB] = useState<Record<number, number>>({});
  const [currentUploadIdx, setCurrentUploadIdx] = useState(-1);
  // Per-file thumbnail previews
  const [fileThumbs, setFileThumbs] = useState<string[]>([]);
  const [galleryPost, setGalleryPost] = useState<{ post: ContentPost; index: number } | null>(null);
  const { openMedia, openImage, openVideo } = useMediaViewer();
  const [hiddenUpload, setHiddenUpload] = useState(false);
  const [editPost, setEditPost] = useState<ContentPost | null>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [planPickerMsg, setPlanPickerMsg] = useState('');
  const [giftMalayaChoiceModal, setGiftMalayaChoiceModal] = useState<ContentPost | null>(null);
  const [giftPost, setGiftPost] = useState<ContentPost | null>(null);

  const canUpload = profile?.is_admin || profile?.is_business;
  const isVip = profile?.is_vip || profile?.is_admin;
  const isBusiness = profile?.is_business;
  // Business users must also pay - only VIP/Admin get free access

  useEffect(() => { fetchData(); }, [region]);
  useEffect(() => { if (user && !revealedLoaded) loadRevealedContacts(); }, [user]);

  // Scroll to saved post if ?post=ID in URL
  useEffect(() => {
    const postId = searchParams.get('post');
    if (postId && posts.length > 0) {
      setTimeout(() => {
        const el = postRefs.current[postId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightPostId(postId);
          setTimeout(() => setHighlightPostId(null), 2500);
        }
      }, 300);
    }
  }, [posts.length, searchParams]);

  async function loadRevealedContacts() {
    if (!user) return;
    const { data } = await supabase.from('user_unlocked_content')
      .select('content_id').eq('user_id', user.id).eq('content_type', 'malaya');
    const ids = new Set((data || []).map((r: any) => r.content_id as string));
    setRevealedContacts(ids);
    setRevealedLoaded(true);
  }

  async function fetchData() {
    const { data: s } = await supabase.from('app_settings').select('*');
    const m: any = {}; s?.forEach((r: any) => { m[r.key] = r.value; }); setSettings(m);
    let q = supabase.from('content_posts')
      .select('*, uploader:uploader_id(username,avatar_url,blue_tick)')
      .eq('type', 'malaya')
      .neq('source', 'tiksexy')
      .order('is_pinned', { ascending: false })
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false });
    if (region) q = q.eq('region', region);
    const { data } = await q.limit(100);
    setPosts((data || []) as ContentPost[]);
  }

  async function handleUpload() {
    if (!user || !canUpload) { toast.error('Unahitaji Business Account au Admin'); return; }
    if (files.length === 0) { toast.error('Chagua picha au video'); return; }
    setUploading(true); setUploadPct(0); setFileUploadProgress({}); setFileUploadedMB({}); setCurrentUploadIdx(-1);
    const sessionId = `malaya_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    globalUploadTracker.register(sessionId, {
      fileName: files.length === 1 ? files[0].name : `${files.length} faili (${files[0].name}...)`,
      fileSize: files.reduce((s, f) => s + f.size, 0),
      section: 'malaya', userId: user.id, username: profile?.username || '',
      contentType: files.some(f => f.type.startsWith('video')) ? 'video' : 'image',
    });
    try {
      const totalSize = files.reduce((s, f) => s + f.size, 0);
      let uploadedSize = 0;
      const uploadedUrls: string[] = [];
      const uploadedThumbs: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentUploadIdx(i);
        setFileUploadProgress(prev => ({ ...prev, [i]: 0 }));
        setFileUploadedMB(prev => ({ ...prev, [i]: 0 }));
        const ext = file.name.split('.').pop()?.toLowerCase() || (file.type.startsWith('video') ? 'mp4' : 'jpg');
        let uploadFile2 = file;
        if (!file.type || file.type === 'application/octet-stream') {
          const mimeMap: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/avi', mkv: 'video/x-matroska', '3gp': 'video/3gpp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic' };
          const detectedMime = mimeMap[ext] || (ext.match(/mp4|mov|webm|avi|mkv|3gp/) ? 'video/mp4' : 'image/jpeg');
          uploadFile2 = new File([file], file.name, { type: detectedMime });
        }
        const path = `malaya/${user.id}/${Date.now()}_${i}.${ext}`;
        try {
          const url = await uploadFile('content', path, uploadFile2, (pct) => {
            const fp = uploadFile2.size * pct / 100;
            setUploadPct(Math.round((uploadedSize + fp) / totalSize * 100));
            setFileUploadProgress(prev => ({ ...prev, [i]: Math.round(pct) }));
            setFileUploadedMB(prev => ({ ...prev, [i]: fp / 1024 / 1024 }));
          }, sessionId);
          uploadedSize += uploadFile2.size;
          uploadedUrls.push(url);
          // Generate unique thumbnail for EACH video file
          let vThumbUrl = '';
          if (uploadFile2.type.startsWith('video')) {
            try {
              const blob = (i === 0 && uploadThumbBlob) ? uploadThumbBlob : await generateVideoThumbnail(uploadFile2);
              if (blob) {
                const tf = new File([blob], `thumb_${i}_${Date.now()}.jpg`, { type: 'image/jpeg' });
                vThumbUrl = await uploadFile('content', `malaya/thumb/${user.id}/v${i}_${Date.now()}.jpg`, tf);
              }
            } catch {}
          } else {
            // Image file - use itself as thumbnail
            vThumbUrl = url;
          }
          uploadedThumbs.push(vThumbUrl);
        } catch (e) {
          toast.error(`Hitilafu ya kupakia faili ${i + 1}`);
          uploadedThumbs.push('');
        }
      }
      setUploadPct(100);
      const primaryThumb = uploadedThumbs.find(t => t) || '';
      await supabase.from('content_posts').insert({
        type: 'malaya', title: uploadData.title, location: uploadData.location,
        phone: uploadData.phone, whatsapp: uploadData.whatsapp, region: uploadData.region,
        price: parseFloat(uploadData.price) || 0, is_free: uploadData.is_free,
        media_url: uploadedUrls[0], media_urls: uploadedUrls,
        thumbnail_url: primaryThumb,
        thumb_urls: uploadedThumbs,
        uploader_id: user.id, sort_order: 0,
        show_in_tiksexy: uploadData.show_in_tiksexy,
        source: 'home',
      });
      globalUploadTracker.complete(sessionId);
      toast.success(`✅ ${files.length} faili imepakiwa!`);
      setShowUpload(false); setFiles([]); setFileThumbs([]);
      setUploadThumbPreview(''); setUploadThumbBlob(null);
      setUploadData({ title: '', location: '', phone: '', whatsapp: '', region: '', price: '0', is_free: true, show_in_tiksexy: true });
      fetchData();
      // Notify followers background
      supabase.from('tik_follows').select('follower_id').eq('following_id', user.id).then(({ data: follows }) => {
        if (follows && follows.length > 0) {
          const notifs = follows.map((f: any) => ({ user_id: f.follower_id, title: `📄 Upload Mpya kutoka @${profile?.username}!`, message: `💋 Malaya: ${uploadData.title || 'Tangazo jipya'}`, type: 'new_upload', link: '/malaya' }));
          for (let i = 0; i < notifs.length; i += 50) supabase.from('notifications').insert(notifs.slice(i, i + 50)).catch(() => {});
        }
      }).catch(() => {});
    } catch (err) {
      globalUploadTracker.fail(sessionId);
      toast.error(`Hitilafu ya upload: ${(err as Error).message}`);
    } finally { setUploading(false); }
  }

  async function handlePinPost(post: ContentPost) {
    const newPinned = !(post as any).is_pinned;
    await supabase.from('content_posts').update({
      is_pinned: newPinned,
      pinned_at: newPinned ? new Date().toISOString() : null,
      sort_order: newPinned ? 999999 : 0
    }).eq('id', post.id);
    toast.success(newPinned ? '📌 Post imepinniwa juu!' : '✅ Pin imeondolewa!');
    fetchData();
  }

  async function handleBoostPost(post: ContentPost) {
    if (!user || !profile) { navigate('/login'); return; }
    const boostCost = 500;
    if ((profile.balance || 0) < boostCost) {
      toast.error(`Salio halitooshi. Unahitaji TZS ${boostCost.toLocaleString()} kuboost.`);
      navigate('/wallet');
      return;
    }
    if (!window.confirm(`Lipia TZS ${boostCost.toLocaleString()} kupin post yako juu kwa masaa 24?`)) return;
    const boostExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('user_profiles').update({ balance: (profile.balance || 0) - boostCost }).eq('id', user.id);
    await supabase.from('content_posts').update({ is_boosted: true, boost_expires_at: boostExpires, sort_order: 99999 }).eq('id', post.id);
    await supabase.from('transactions').insert({
      user_id: user.id, amount: boostCost, type: 'boost', status: 'approved',
      description: `Boost Post: ${post.title || 'Tangazo'}`,
    });
    if ((window as any).__authRefreshProfile) (window as any).__authRefreshProfile();
    toast.success('🚀 Post yako imeboostewa kwa masaa 24!');
    fetchData();
  }

  async function handleDeletePost(id: string) {
    if (!window.confirm('Futa post hii?')) return;
    await supabase.from('content_posts').delete().eq('id', id);
    toast.success('Imefutwa!'); fetchData();
  }

  async function handleSwapPost(id: string, direction: 'up' | 'down') {
    const idx = posts.findIndex(p => p.id === id);
    if (direction === 'up' && idx > 0) {
      const a = posts[idx], b = posts[idx - 1];
      await supabase.from('content_posts').update({ sort_order: (b.sort_order || 0) + 1 }).eq('id', a.id);
      await supabase.from('content_posts').update({ sort_order: (a.sort_order || 0) - 1 }).eq('id', b.id);
    } else if (direction === 'down' && idx < posts.length - 1) {
      const a = posts[idx], b = posts[idx + 1];
      await supabase.from('content_posts').update({ sort_order: (b.sort_order || 0) - 1 }).eq('id', a.id);
      await supabase.from('content_posts').update({ sort_order: (a.sort_order || 0) + 1 }).eq('id', b.id);
    }
    fetchData();
  }

  async function handleUpdatePost() {
    if (!editPost) return;
    await supabase.from('content_posts').update({
      title: editPost.title, location: editPost.location, phone: editPost.phone,
      whatsapp: editPost.whatsapp, region: editPost.region, price: editPost.price, is_free: editPost.is_free,
    }).eq('id', editPost.id);
    toast.success('Imebadilishwa!'); setEditPost(null); fetchData();
  }

  async function sharePost(post: ContentPost, e?: React.MouseEvent) {
    e?.stopPropagation();
    const shareUrl = `${window.location.origin}/malaya?post=${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: post.title || 'SEXY LIVE ROOM',
          text: post.description || 'Angalia tangazo hili kwenye SEXY LIVE ROOM!',
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link imenakiliwa!');
      }
    } catch {
      await navigator.clipboard.writeText(shareUrl).catch(() => {});
      toast.success('Link imenakiliwa!');
    }
  }

  // Helper: format WhatsApp number
  function formatWA(num: string): string {
    if (!num) return '';
    const d = num.replace(/\D/g, '');
    if (d.startsWith('0') && d.length >= 9) return '255' + d.slice(1);
    if (d.startsWith('255')) return d;
    if (d.startsWith('7') && d.length === 9) return '255' + d;
    return d;
  }

  function handleDownload(post: ContentPost, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    // Check gift download credits first
    const giftDownloadCredits = user ? parseInt(localStorage.getItem(`gift_download_credits_${user.id}`) || '0') : 0;
    if (!isVip && !isBusiness && giftDownloadCredits <= 0) {
      setPlanPickerMsg('Download inahitaji VIP Account au Business Account');
      setShowPlanPicker(true); return;
    }
    const mediaUrls = (post.media_urls && post.media_urls.length > 0) ? post.media_urls : (post.media_url ? [post.media_url] : []);
    mediaUrls.forEach((url, i) => {
      const isVid = /\.(mp4|webm|mov)/i.test(url);
      triggerDownload({ url, name: `${post.title || 'malaya'}_${i + 1}`, type: isVid ? 'video' : 'image', userId: user.id });
    });
    if (!isVip && !isBusiness && giftDownloadCredits > 0) {
      const newCreds = Math.max(0, giftDownloadCredits - 1);
      try { localStorage.setItem(`gift_download_credits_${user.id}`, String(newCreds)); } catch {}
      toast.success(`⬇️ Download imeanza! (Gift credits zilizobaki: ${newCreds})`);
    } else {
      toast.success('⬇️ Download imeanza!');
    }
  }

  // Malaya contact reveal logic:
  // - Free post (is_free=true or price<=0): show to ALL users (no auth needed)  
  // - VIP/Admin: free, show immediately
  // - Gift malaya credits: free if credits > 0
  // - Business: must pay like regular users
  // - Paid post + other users: deduct balance
  function handleViewContact(post: ContentPost) {
    // Free post - anyone can see
    if (post.is_free || !post.price || post.price <= 0) {
      setRevealedContacts(prev => new Set([...prev, post.id]));
      return;
    }
    // Paid post - need login
    requireAuth(() => {
      if (isVip) { setRevealedContacts(prev => new Set([...prev, post.id])); return; }
      // Check gift malaya credits
      const giftMalayaCredits = user ? parseInt(localStorage.getItem(`gift_malaya_credits_${user.id}`) || '0') : 0;
      if (giftMalayaCredits > 0) {
        // Show choice: use gift credits or pay with balance
        setGiftMalayaChoiceModal(post);
        return;
      }
      // Business & regular: show balance deduction modal
      setBalanceModal(post);
    });
  }

  async function confirmBalancePay(post: ContentPost) {
    if (!user || !profile) return;
    const price = post.price || 0;
    if ((profile.balance || 0) < price) {
      toast.error('Salio halitooshi. Ongeza pesa kwenye Wallet.');
      navigate('/wallet'); return;
    }
    const { error } = await supabase.from('user_profiles').update({ balance: (profile.balance || 0) - price }).eq('id', user.id);
    if (error) { toast.error('Hitilafu ya malipo'); return; }

    // Credit the uploader (business account) if post has an uploader
    if (post.uploader_id && post.uploader_id !== user.id) {
      const { data: uploaderProf } = await supabase.from('user_profiles').select('balance,is_business').eq('id', post.uploader_id).single();
      if (uploaderProf?.is_business) {
        await supabase.from('user_profiles').update({ balance: (uploaderProf.balance || 0) + price }).eq('id', post.uploader_id);
        await supabase.from('transactions').insert({
          user_id: post.uploader_id, amount: price, type: 'malaya_sale', status: 'approved',
          description: `Mapato: ${post.title} - kutoka kwa ${profile.username}`,
        });
        await supabase.from('notifications').insert({
          user_id: post.uploader_id, title: '💰 Pesa Imeingia!',
          message: `TZS ${price.toLocaleString()} kutoka kwa mtu aliyeona namba yako (${post.title})`,
          type: 'sale',
        });
      }
    }

    await supabase.from('transactions').insert({
      user_id: user.id, amount: price, type: 'phone_view', status: 'approved',
      description: `Ona Namba: ${post.title}`,
    });
    await supabase.from('user_unlocked_content').upsert({
      user_id: user.id, content_id: post.id, content_type: 'malaya', amount_paid: price,
    }, { onConflict: 'user_id,content_id' });
    setRevealedContacts(prev => new Set([...prev, post.id]));
    setBalanceModal(null);
    if ((window as any).__authRefreshProfile) (window as any).__authRefreshProfile();
    toast.success(`✅ Namba imefunguliwa! TZS ${price.toLocaleString()} imekatwa. Itakuwa bure daima.`);
  }

  async function handleSavePost(post: ContentPost) {
    if (!user) { navigate('/login'); return; }
    const mediaUrls = (post.media_urls && post.media_urls.length > 0) ? post.media_urls : (post.media_url ? [post.media_url] : []);
    const { error } = await supabase.from('saved_items').upsert({
      user_id: user.id, content_id: post.id, content_type: 'malaya',
      content_url: mediaUrls[0] || post.media_url,
      content_name: post.title || 'Malaya',
      thumbnail_url: mediaUrls[0],
    }, { onConflict: 'id' });
    if (!error) { const { toast: t } = await import('sonner'); t.success('✅ Imehifadhiwa kwenye Saved!'); }
  }

  const isContactRevealed = (post: ContentPost) => {
    // Free post: always show contact
    if (post.is_free || !post.price || post.price <= 0) return true;
    // VIP/Admin: always show
    if (isVip) return true;
    // Business & regular: check if already paid/revealed
    return revealedContacts.has(post.id);
  };

  // Auto-expire boosts (client-side check)
  const activePosts = posts.map(post => {
    if (post.is_boosted && post.boost_expires_at && new Date(post.boost_expires_at) < new Date()) {
      return { ...post, is_boosted: false };
    }
    return post;
  });

  const filteredPosts = activePosts.filter(p =>
    !search || p.title?.toLowerCase().includes(search.toLowerCase()) || p.location?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background pb-4">
      <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => navigate(-1)} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-white font-bold text-xl flex-1">💋 MALAYA</h1>
        <button onClick={() => setShowFilter(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold ${region ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400 border border-[#3d0b3d]'}`}>
          <SlidersHorizontal className="w-4 h-4" />{region || 'Filter'}
        </button>
        {canUpload && (
          <button onClick={() => setShowUpload(true)} className="w-8 h-8 gradient-pink rounded-full flex items-center justify-center">
            <Plus className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Hidden upload indicator */}
      {uploading && hiddenUpload && (
        <button onClick={() => { setHiddenUpload(false); setShowUpload(true); }} className="mx-4 mt-2 mb-1 w-[calc(100%-2rem)] py-2 text-xs text-primary font-semibold bg-primary/10 rounded-xl border border-primary/20 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Upload inaendelea... {Math.round(uploadPct)}% (Gonga kuona)
        </button>
      )}

      <div className="px-4 py-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tafuta..." className="input-field py-2" />
      </div>

      <div className="max-w-md mx-auto">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">💋</p>
            <p>Hakuna matangazo {region ? `kwenye ${region}` : ''}</p>
          </div>
        ) : (
          <div className="space-y-0">
            {filteredPosts.map((post) => {
              const mediaUrls: string[] = (post.media_urls && post.media_urls.length > 0) ? post.media_urls : (post.media_url ? [post.media_url] : []);
              const contactVisible = isContactRevealed(post);
              const isFreePost = post.is_free || !post.price || post.price <= 0;
              return (
                <div key={post.id} ref={el => { postRefs.current[post.id] = el; }} className={`border-b border-[#1a0a1a] transition-all duration-300 ${highlightPostId === post.id ? 'bg-primary/10' : ''} ${post.is_boosted && post.boost_expires_at && new Date(post.boost_expires_at) > new Date() ? 'border-l-2 border-l-orange-500' : ''}`}>
                    {/* Pin badge */}
                    {(post as any).is_pinned && (
                      <div className="flex items-center gap-1.5 px-4 pt-1">
                        <span className="text-[10px] font-black text-yellow-400 bg-yellow-500/15 border border-yellow-500/30 px-2 py-0.5 rounded-full">📌 PINNED</span>
                      </div>
                    )}
                    {/* BOOSTED badge */}
                  {post.is_boosted && post.boost_expires_at && new Date(post.boost_expires_at) > new Date() && (
                    <div className="flex items-center gap-1.5 px-4 pt-1.5">
                      <span className="text-[10px] font-black text-orange-400 bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 rounded-full animate-pulse">🚀 BOOSTED</span>
                      <span className="text-gray-600 text-[9px]">
                        hadi {new Date(post.boost_expires_at).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  {/* Post header */}
                  <div className="flex items-center gap-2 px-4 py-2">
                    <button
                      onClick={() => post.uploader_id && navigate(`/profile/${post.uploader_id}`)}
                      className="w-8 h-8 rounded-full overflow-hidden border border-primary/40 flex-shrink-0 active:scale-90 transition-transform">
                      {(post.uploader as any)?.avatar_url ?
                        <img src={(post.uploader as any).avatar_url} className="w-full h-full object-cover" alt="" /> :
                        <div className="w-full h-full gradient-pink flex items-center justify-center">
                          <span className="text-white text-xs font-bold">{(post.uploader as any)?.username?.[0]?.toUpperCase() || '?'}</span>
                        </div>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{post.title || 'Msichana'}</p>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-primary" />
                        <p className="text-gray-400 text-xs truncate">{post.location || post.region}</p>
                      </div>
                    </div>
                    {mediaUrls.length > 1 && <span className="text-gray-500 text-xs">{mediaUrls.length}📷</span>}
                    {/* Gift credit badge near lock for paid posts */}
                    {!isFreePost && !contactVisible && user && (() => {
                      const giftCreds = parseInt(localStorage.getItem(`gift_malaya_credits_${user.id}`) || '0');
                      return giftCreds > 0 ? (
                        <span className="bg-orange-500/90 text-white text-[9px] font-black px-2 py-0.5 rounded-full">🎁 {giftCreds}</span>
                      ) : null;
                    })()}
                    {!isFreePost && !contactVisible && (
                      <span className="bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">TZS {post.price?.toLocaleString()}</span>
                    )}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={e => sharePost(post, e)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#1a0a1a] text-gray-400"><Share2 className="w-3.5 h-3.5" /></button>
                    <button onClick={e => handleDownload(post, e)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#1a0a1a] text-gray-400"><Download className="w-3.5 h-3.5" /></button>
                    <button onClick={e => { e.stopPropagation(); handleSavePost(post); }} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#1a0a1a] text-gray-400"><Bookmark className="w-3.5 h-3.5" /></button>
                    {post.uploader_id && post.uploader_id !== user?.id && (
                      <button onClick={e => { e.stopPropagation(); if (!user) { navigate('/login'); return; } setGiftPost(post); }} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#1a0a1a] text-orange-400">
                        <Gift className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {(isBusiness || isAdmin) && post.uploader_id === user?.id && (
                      <button onClick={e => { e.stopPropagation(); handleBoostPost(post); }}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm ${
                          post.is_boosted && post.boost_expires_at && new Date(post.boost_expires_at) > new Date()
                            ? 'bg-orange-500/30 text-orange-400 animate-pulse' : 'bg-[#1a0a1a] text-gray-500'
                        }`}>🚀</button>
                    )}
                    {(isAdmin || (profile?.is_business && post.uploader_id === user?.id)) && (
                      <>
                        {isAdmin && (
                          <button onClick={e => { e.stopPropagation(); handlePinPost(post); }}
                            className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm ${
                              (post as any).is_pinned ? 'bg-yellow-500/20 text-yellow-400' : 'bg-[#1a0a1a] text-gray-500'
                            }`}>📌</button>
                        )}
                        <button onClick={() => setEditPost(post)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#1a0a1a] text-primary"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleSwapPost(post.id, 'up')} className="w-6 h-7 flex items-center justify-center rounded-lg bg-[#1a0a1a] text-gray-500"><ArrowUp className="w-3 h-3" /></button>
                        <button onClick={() => handleSwapPost(post.id, 'down')} className="w-6 h-7 flex items-center justify-center rounded-lg bg-[#1a0a1a] text-gray-500"><ArrowDown className="w-3 h-3" /></button>
                        <button onClick={() => handleDeletePost(post.id)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/20 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                    </div>
                  </div>

                  {/* Media grid - uses GlobalMediaViewer */}
                  {mediaUrls.length > 0 && (
                    <div className="w-full bg-[#080308] overflow-hidden">
                      {/* Get per-video thumbs from DB thumb_urls column */}
                      {(() => {
                        const dbThumbs: string[] = Array.isArray((post as any).thumb_urls) ? (post as any).thumb_urls : [];
                        const resolvedThumbs = mediaUrls.map((_, i) => dbThumbs[i] || (i === 0 ? post.thumbnail_url || '' : ''));
                        return (
                          <TelegramMediaGrid
                            mediaUrls={mediaUrls}
                            thumbUrls={resolvedThumbs}
                            thumbnailUrl={post.thumbnail_url || undefined}
                            onClick={(i) => {
                              const isVid = (url: string) => /\.(mp4|webm|mov|avi|mkv)/i.test(url) || url.includes('video');
                              if (isVid(mediaUrls[i])) {
                                const videoUrls = mediaUrls.filter(u => isVid(u));
                                navigate('/play', { state: { url: mediaUrls[i], title: post.title || 'Video', urls: videoUrls } });
                              } else {
                                openMedia(mediaUrls.map((u, idx) => ({ url: u, type: isVid(u) ? 'video' as const : 'image' as const, title: post.title })), i);
                              }
                            }}
                          />
                        );
                      })()}
                    </div>
                  )}

                  {/* Contact reveal buttons */}
                  <div className="px-4 py-3">
                    {contactVisible ? (
                      <div className="flex gap-2">
                        {post.phone && (
                          <a href={`tel:${post.phone}`}
                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm"
                            style={{ background: 'linear-gradient(135deg,#1565C0,#1976D2)', color: 'white' }}>
                            <span>📞</span>
                            <span className="truncate">{post.phone}</span>
                          </a>
                        )}
                        {post.whatsapp && (
                          <button
                            onClick={() => window.open(`https://wa.me/${formatWA(post.whatsapp || '')}?text=Habari`, '_blank')}
                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm"
                            style={{ background: 'linear-gradient(135deg,#1B5E20,#2E7D32)', color: 'white' }}>
                            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            <span className="truncate">{post.whatsapp}</span>
                          </button>
                        )}
                        {!post.phone && !post.whatsapp && <p className="text-gray-500 text-sm text-center flex-1 py-2">Namba haijaongezwa</p>}
                      </div>
                    ) : (
                      <button onClick={() => handleViewContact(post)}
                        className="w-full gradient-pink text-white font-bold py-2.5 rounded-xl text-sm">
                        {isFreePost
                          ? '📞 Ona Namba ya Simu (BURE)'
                          : `🔒 Lipia TZS ${post.price?.toLocaleString()} - Ona Namba`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* GalleryModal replaced by GlobalMediaViewer - no local gallery needed */}

      {showFilter && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end" onClick={() => setShowFilter(false)}>
          <div className="w-full bg-[#0d0d0d] border-t border-[#3d0b3d] rounded-t-3xl p-6 slide-up max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Chagua Mkoa</h3>
              <button onClick={() => setShowFilter(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setRegion(''); setShowFilter(false); }} className={`py-3 rounded-xl font-semibold text-sm ${!region ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>Mikoa Yote</button>
              {TANZANIA_REGIONS.map(r => (
                <button key={r} onClick={() => { setRegion(r); setShowFilter(false); }} className={`py-3 rounded-xl font-semibold text-sm ${region === r ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>{r}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end justify-center">
          <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto slide-up">
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Ongeza Tangazo</h3>
              <div className="flex gap-2">
                <button onClick={() => { setHiddenUpload(true); setShowUpload(false); }} title="Ficha - upload inaendelea" className="w-8 h-8 rounded-xl bg-[#1a0a1a] flex items-center justify-center">
                  <EyeOff className="w-4 h-4 text-gray-400" />
                </button>
                <button onClick={() => setShowUpload(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>
            <div className="space-y-3">
              <input value={uploadData.title} onChange={e => setUploadData(p => ({ ...p, title: e.target.value }))} placeholder="Jina la msichana" className="input-field" />
              <select value={uploadData.region} onChange={e => setUploadData(p => ({ ...p, region: e.target.value }))} className="input-field">
                <option value="">Chagua Mkoa</option>
                {TANZANIA_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input value={uploadData.location} onChange={e => setUploadData(p => ({ ...p, location: e.target.value }))} placeholder="Mtaa/Eneo" className="input-field" />
              <input value={uploadData.phone} onChange={e => setUploadData(p => ({ ...p, phone: e.target.value }))} placeholder="Namba ya simu" className="input-field" type="tel" />
              <input value={uploadData.whatsapp} onChange={e => setUploadData(p => ({ ...p, whatsapp: e.target.value }))} placeholder="WhatsApp" className="input-field" type="tel" />
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl">
                <span className="text-gray-300">Post hii ni bure?</span>
                <button onClick={() => setUploadData(p => ({ ...p, is_free: !p.is_free }))} className={`w-12 h-6 rounded-full transition-colors ${uploadData.is_free ? 'bg-green-500' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${uploadData.is_free ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              {/* TikSexy visibility switch */}
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl border border-primary/20">
                <div className="flex flex-col">
                  <span className="text-white text-sm font-semibold">🎬 Onyesha kwenye TIK-SEXY?</span>
                  <span className="text-gray-500 text-xs">{uploadData.show_in_tiksexy ? 'Itaonekana kwenye TikSexy feed pia' : 'Itaonekana hapa tu - sio TikSexy'}</span>
                </div>
                <button onClick={() => setUploadData(p => ({ ...p, show_in_tiksexy: !p.show_in_tiksexy }))} className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${uploadData.show_in_tiksexy ? 'bg-primary' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${uploadData.show_in_tiksexy ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              {!uploadData.is_free && (
                <input value={uploadData.price} onChange={e => setUploadData(p => ({ ...p, price: e.target.value }))} placeholder="Bei ya kuona namba (TZS)" className="input-field" type="number" />
              )}
              <label className="block btn-outline text-center cursor-pointer py-3" htmlFor="malaya-files">
                <Upload className="w-4 h-4 inline mr-2" />Chagua Picha/Video ({files.length} zilizochaguliwa)
              </label>
              <input id="malaya-files" type="file" accept="image/*,video/*" multiple className="hidden" onChange={async e => {
                const newFiles = Array.from(e.target.files || []);
                setFiles(newFiles); setFileThumbs([]);
                const firstVideo = newFiles.find(f => f.type.startsWith('video'));
                if (firstVideo) {
                  setUploadThumbPreview(''); setUploadThumbBlob(null);
                  try { const b = await generateVideoThumbnail(firstVideo); if (b) { setUploadThumbBlob(b); setUploadThumbPreview(URL.createObjectURL(b)); } } catch {}
                } else { setUploadThumbPreview(''); setUploadThumbBlob(null); }
                // Generate thumbnail preview for EACH file
                const thumbUrls: string[] = [];
                for (const f of newFiles) {
                  if (f.type.startsWith('video')) {
                    try { const blob = await generateVideoThumbnail(f); thumbUrls.push(blob ? URL.createObjectURL(blob) : ''); } catch { thumbUrls.push(''); }
                  } else { thumbUrls.push(URL.createObjectURL(f)); }
                }
                setFileThumbs(thumbUrls);
              }} />
              {files.length > 0 && (
                <div className="space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-[#1a0a1a] rounded-lg p-2">
                      <div className="w-12 h-10 rounded-lg overflow-hidden bg-[#2a0a2a] flex-shrink-0">
                        {fileThumbs[i] ? <img src={fileThumbs[i]} alt="" className="w-full h-full object-cover" /> :
                          <div className="w-full h-full flex items-center justify-center"><span className="text-xl">{f.type.startsWith('video') ? '🎬' : '🖼️'}</span></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-300 text-xs truncate">{f.name}</p>
                        <p className="text-primary text-xs font-semibold">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
                        {fileThumbs[i] && <p className="text-green-400 text-[10px]">✓ Cover ipo</p>}
                        {!fileThumbs[i] && f.type.startsWith('video') && <p className="text-yellow-400 text-[10px]">⏳ Inaunda cover...</p>}
                      </div>
                      <button onClick={() => { setFiles(prev => prev.filter((_, j) => j !== i)); setFileThumbs(prev => prev.filter((_, j) => j !== i)); }} className="text-red-400"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
              {uploading && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,20,147,0.08)', border: '1px solid rgba(255,20,147,0.2)' }}>
                  {/* Global progress */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-primary font-bold animate-pulse">Global: {Math.round(uploadPct)}%</span>
                    <span className="text-gray-400">{(files.reduce((s, f) => s + f.size, 0) * uploadPct / 100 / 1024 / 1024).toFixed(1)} / {(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                  <div className="h-1.5 bg-[#1a0a1a] rounded-full overflow-hidden"><div className="h-full gradient-pink rounded-full transition-all" style={{ width: `${Math.max(2, uploadPct)}%` }} /></div>
                  {/* Per-file progress */}
                  {files.length > 1 && files.map((f, fi) => (
                    <div key={fi} className={`rounded-lg p-2 transition-all ${fi === currentUploadIdx ? 'bg-primary/10 border border-primary/20' : 'bg-black/20'}`}>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-gray-300 truncate flex-1 mr-2">📁 {f.name.slice(0, 22)}{f.name.length > 22 ? '...' : ''}</span>
                        <span className={`font-bold flex-shrink-0 ${fi === currentUploadIdx ? 'text-primary animate-pulse' : fileUploadProgress[fi] >= 100 ? 'text-green-400' : 'text-gray-500'}`}>
                          {fi === currentUploadIdx ? `${fileUploadProgress[fi] || 0}%` : fileUploadProgress[fi] >= 100 ? '✓ Done' : 'Inasubiri...'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-[#1a0a1a] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${fileUploadProgress[fi] >= 100 ? 'bg-green-500' : 'gradient-pink'}`} style={{ width: `${Math.max(fi < currentUploadIdx ? 100 : 0, fileUploadProgress[fi] || 0)}%` }} />
                        </div>
                        <span className="text-[9px] text-gray-500 flex-shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={handleUpload} disabled={uploading} className="btn-primary w-full">{uploading ? `Inapakia ${uploadPct}%...` : 'Pakia Tangazo'}</button>
            </div>
          </div>
        </div>
      )}

      {editPost && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center">
          <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto slide-up">
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-bold">Hariri Post</h3>
              <button onClick={() => setEditPost(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <input value={editPost.title || ''} onChange={e => setEditPost(p => p ? { ...p, title: e.target.value } : null)} placeholder="Jina" className="input-field" />
              <select value={(editPost as any).region || ''} onChange={e => setEditPost(p => p ? { ...p, region: e.target.value } as any : null)} className="input-field">
                <option value="">Chagua Mkoa</option>
                {TANZANIA_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input value={editPost.location || ''} onChange={e => setEditPost(p => p ? { ...p, location: e.target.value } : null)} placeholder="Mtaa/Eneo" className="input-field" />
              <input value={editPost.phone || ''} onChange={e => setEditPost(p => p ? { ...p, phone: e.target.value } : null)} placeholder="Namba" className="input-field" />
              <input value={editPost.whatsapp || ''} onChange={e => setEditPost(p => p ? { ...p, whatsapp: e.target.value } : null)} placeholder="WhatsApp" className="input-field" />
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl">
                <span className="text-gray-300 text-sm">Ni bure?</span>
                <button onClick={() => setEditPost(p => p ? { ...p, is_free: !p.is_free } : null)} className={`w-12 h-6 rounded-full ${editPost.is_free ? 'bg-green-500' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editPost.is_free ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              {!editPost.is_free && <input type="number" value={editPost.price || 0} onChange={e => setEditPost(p => p ? { ...p, price: parseFloat(e.target.value) } : null)} placeholder="Bei" className="input-field" />}
              {/* Replace media - with real upload progress and auto thumbnail */}
              <div className="border border-primary/20 rounded-xl p-3 space-y-2">
                <p className="text-gray-400 text-xs font-semibold">🔄 Badilisha Picha/Video</p>
                <label className="block btn-outline text-center cursor-pointer py-2 text-xs">
                  <Upload className="w-3 h-3 inline mr-1" />Chagua Faili Jipya
                  <input type="file" accept="image/*,video/*" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f || !editPost) return;
                    setUploading(true); setUploadPct(0);
                    try {
                      const ext = f.name.split('.').pop() || 'jpg';
                      const path = `malaya/${user?.id || 'admin'}/${Date.now()}_replace.${ext}`;
                      const url = await uploadFile('content', path, f, (pct) => setUploadPct(Math.round(pct)));
                      let thumbUrl = editPost.thumbnail_url || '';
                      if (f.type.startsWith('video')) {
                        try {
                          const blob = await generateVideoThumbnail(f);
                          if (blob) {
                            const tf = new File([blob], `thumb_${Date.now()}.jpg`, { type: 'image/jpeg' });
                            thumbUrl = await uploadFile('content', `malaya/thumb/${user?.id || 'admin'}/${Date.now()}.jpg`, tf);
                          }
                        } catch {}
                      } else { thumbUrl = url; }
                      setUploadPct(100);
                      setEditPost(p => p ? { ...p, media_url: url, thumbnail_url: thumbUrl, media_urls: [url] } as any : null);
                      toast.success('✅ Media imebadilishwa! Bonyeza Hifadhi.');
                    } catch { toast.error('Hitilafu ya upload'); }
                    finally { setUploading(false); setUploadPct(0); }
                  }} />
                </label>
                {uploading && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-primary font-bold animate-pulse">{uploadPct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#1a0a1a] rounded-full overflow-hidden">
                      <div className="h-full gradient-pink rounded-full transition-all" style={{ width: `${Math.max(2, uploadPct)}%` }} />
                    </div>
                  </div>
                )}
                {!uploading && editPost.media_url && <p className="text-green-400 text-xs truncate">✓ {editPost.media_url.split('/').pop()?.slice(0, 40)}</p>}
              </div>
              <button onClick={async () => {
                if (!editPost) return;
                await supabase.from('content_posts').update({
                  title: editPost.title, location: editPost.location, phone: editPost.phone,
                  whatsapp: editPost.whatsapp, region: (editPost as any).region, price: editPost.price,
                  is_free: editPost.is_free, media_url: editPost.media_url,
                  thumbnail_url: editPost.thumbnail_url, media_urls: (editPost as any).media_urls,
                }).eq('id', editPost.id);
                toast.success('Imebadilishwa!'); setEditPost(null); fetchData();
              }} disabled={uploading} className="btn-primary w-full disabled:opacity-50">💾 Hifadhi</button>
            </div>
          </div>
        </div>
      )}

      {showPlanPicker && (
        <PlanPickerModal onClose={() => setShowPlanPicker(false)} settings={settings} message={planPickerMsg} onSuccess={() => setShowPlanPicker(false)} />
      )}

      {/* Gift Modal */}
      {giftPost && profile && (
        <GiftPostModal
          uploaderName={(giftPost.uploader as any)?.username || 'Mwenye Post'}
          uploaderId={giftPost.uploader_id!}
          profile={profile}
          onClose={() => setGiftPost(null)}
        />
      )}

      {/* Gift Choice Modal for Malaya */}
      {giftMalayaChoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setGiftMalayaChoiceModal(null)}>
          <div className="w-full max-w-sm bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 slide-up" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🎁</div>
              <h3 className="text-white font-black text-lg">{giftMalayaChoiceModal.title || 'Msichana'}</h3>
              <p className="text-gray-400 text-sm">Una Gift Credits - chagua jinsi ya kufungua namba</p>
            </div>
            {(() => {
              const creds = user ? parseInt(localStorage.getItem(`gift_malaya_credits_${user.id}`) || '0') : 0;
              return (
                <>
                  <button onClick={() => {
                    const newCreds = Math.max(0, creds - 1);
                    try { localStorage.setItem(`gift_malaya_credits_${user!.id}`, String(newCreds)); } catch {}
                    supabase.from('user_unlocked_content').upsert({ user_id: user!.id, content_id: giftMalayaChoiceModal.id, content_type: 'malaya', amount_paid: 0 }, { onConflict: 'user_id,content_id' }).then(() => {});
                    setRevealedContacts(prev => new Set([...prev, giftMalayaChoiceModal.id]));
                    setGiftMalayaChoiceModal(null);
                    toast.success(`✅ Namba imefunguliwa! (Gift credits zilizobaki: ${newCreds})`);
                  }} className="w-full py-3.5 rounded-xl text-white font-black text-sm mb-3 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                    🎁 Tumia Gift Credits ({creds} zilizobaki)
                  </button>
                  <button onClick={() => { setGiftMalayaChoiceModal(null); setBalanceModal(giftMalayaChoiceModal); }}
                    className="w-full py-3.5 rounded-xl gradient-pink text-white font-black text-sm flex items-center justify-center gap-2">
                    💰 Lipia kwa Salio (TZS {(giftMalayaChoiceModal.price || 0).toLocaleString()})
                  </button>
                  <button onClick={() => setGiftMalayaChoiceModal(null)} className="w-full mt-2 py-2 text-gray-400 text-sm">Ghairi</button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {balanceModal && (
        <BalanceConfirmModal
          amount={balanceModal.price || 0}
          itemName={balanceModal.title || 'Msichana'}
          balance={profile?.balance || 0}
          onConfirm={() => confirmBalancePay(balanceModal)}
          onCancel={() => setBalanceModal(null)}
        />
      )}
    </div>
  );
}
