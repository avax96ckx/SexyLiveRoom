import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, uploadFile, globalUploadTracker } from '@/lib/supabase';
import { ContentPost, VideoCategory } from '@/types';
import { ArrowLeft, Plus, Play, Upload, X, Share2, Trash2, Download, Bookmark, Edit3, Gift, EyeOff, ArrowUp, ArrowDown, Lock } from 'lucide-react';
import { toast } from 'sonner';
import UploadProgress from '@/components/features/UploadProgress';
import { PlanPickerModal } from '@/pages/Services';
import { triggerDownload } from '@/pages/Downloads';
import { generateVideoThumbnail } from '@/lib/generateThumbnail';

const X_CATEGORY_KEYWORDS = ['x za admin', 'x za adimin', 'xxxx', 'xxx', 'adult', 'x rated', 'xrated', '18+'];

// Balance-based payment confirmation dialog
function BalanceConfirmModal({ amount, itemName, balance, onConfirm, onCancel }: {
  amount: number; itemName: string; balance: number; onConfirm: () => void; onCancel: () => void;
}) {
  const canAfford = (balance || 0) >= amount;
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-sm bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 slide-up" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">🎬</div>
          <h3 className="text-white font-black text-xl">{itemName}</h3>
        </div>
        <div className="bg-[#1a0a1a] rounded-xl p-4 mb-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Bei ya Video:</span>
            <span className="text-primary font-black">TZS {amount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Salio Lako:</span>
            <span className={`font-black ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
              TZS {(balance || 0).toLocaleString()}
            </span>
          </div>
          {!canAfford && (
            <p className="text-red-400 text-xs text-center pt-1">⚠️ Salio halitooshi. Ongeza pesa kwenye Wallet.</p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-400 font-semibold text-sm">Ghairi</button>
          <button onClick={onConfirm} disabled={!canAfford} className="flex-1 py-3 rounded-xl gradient-pink text-white font-black text-sm disabled:opacity-40">
            ✅ Thibitisha &amp; Lipa
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Persistent thumbnail cache (localStorage) ──────────────────────────────
const THUMB_CACHE_PREFIX = 'vtc_';
function getCachedThumb(videoUrl: string): string {
  try { return localStorage.getItem(THUMB_CACHE_PREFIX + btoa(videoUrl).slice(0, 40)) || ''; } catch { return ''; }
}
function setCachedThumb(videoUrl: string, dataUrl: string) {
  try {
    // Only cache small data URLs to avoid quota errors
    if (dataUrl && dataUrl.length < 200000) {
      localStorage.setItem(THUMB_CACHE_PREFIX + btoa(videoUrl).slice(0, 40), dataUrl);
    }
  } catch {}
}

// Per-video thumbnail item - robust canvas capture with CORS blob fallback + localStorage cache
function VideoThumbItem({ thumbUrl, videoUrl, style, onPlay, videoIndex = 0 }: { thumbUrl?: string; videoUrl?: string; style: React.CSSProperties; onPlay: () => void; videoIndex?: number }) {
  const [loading, setLoading] = useState(true);
  const [videoThumb, setVideoThumb] = useState(() => {
    // Immediately check localStorage cache on first render
    if (videoUrl) return getCachedThumb(videoUrl);
    return '';
  });
  const attemptedRef = useRef(false);

  useEffect(() => {
    // Already have a stored thumbnail from DB - just display it
    if (thumbUrl && thumbUrl.trim()) {
      setLoading(false);
      return;
    }
    // Check localStorage cache first (persists forever)
    if (videoUrl) {
      const cached = getCachedThumb(videoUrl);
      if (cached) {
        setVideoThumb(cached);
        setLoading(false);
        return;
      }
    }
    // Need to generate from video URL
    if (!videoUrl || attemptedRef.current) { setLoading(false); return; }
    attemptedRef.current = true;

    let blobUrl = '';
    const controller = new AbortController();
    // Vary seek time per video index so different videos get distinct frames
    // 0 → 1.5s, 1 → 3.0s, 2 → 5.0s, 3 → 7.0s
    const seekTimes = [1.5, 3.0, 5.0, 7.0];
    const targetSeekTime = seekTimes[videoIndex % seekTimes.length];

    const saveAndSet = (dataUrl: string) => {
      if (dataUrl && dataUrl.length > 500) {
        setVideoThumb(dataUrl);
        // ALWAYS save to localStorage - persists permanently, no regeneration
        if (videoUrl) setCachedThumb(videoUrl, dataUrl);
      }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setLoading(false);
    };

    const captureFrame = (v: HTMLVideoElement, onFail: () => void) => {
      let captured = false;
      const doCapture = () => {
        if (captured) return;
        try {
          const c = document.createElement('canvas');
          c.width = 320; c.height = 480;
          const ctx = c.getContext('2d');
          if (ctx && v.videoWidth > 0 && v.videoHeight > 0) {
            ctx.drawImage(v, 0, 0, c.width, c.height);
            const dataUrl = c.toDataURL('image/jpeg', 0.8);
            if (dataUrl && dataUrl.length > 1000 && dataUrl !== 'data:,') {
              captured = true;
              saveAndSet(dataUrl);
              v.src = '';
              return;
            }
          }
        } catch {}
        if (!captured) { onFail(); v.src = ''; }
      };

      const seekHandler = () => { setTimeout(doCapture, 100); };

      v.onseeked = seekHandler;
      v.onloadeddata = () => {
        if (v.videoWidth > 0 && v.videoHeight > 0) {
          v.currentTime = Math.min(targetSeekTime, (v.duration || targetSeekTime + 1) * 0.3);
        }
      };
      v.onloadedmetadata = () => {
        v.currentTime = Math.min(targetSeekTime, (v.duration || targetSeekTime + 1) * 0.3);
      };
      v.onerror = () => { if (!captured) { onFail(); } v.src = ''; };
      // Fallback timeout: force capture after 6s
      setTimeout(() => { if (!captured) doCapture(); }, 6000);
      v.load();
    };

    // STEP 1: Try blob fetch first (most reliable, bypasses CORS canvas taint)
    // No Range header - fetch full video segment for reliable seeking
    const tryBlob = () => {
      if (controller.signal.aborted) { setLoading(false); return; }
      fetch(videoUrl!, {
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
      })
        .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.blob(); })
        .then(blob => {
          if (controller.signal.aborted) { setLoading(false); return; }
          blobUrl = URL.createObjectURL(blob);
          const v = document.createElement('video');
          v.muted = true; v.playsInline = true;
          v.preload = 'auto';
          v.src = blobUrl;
          captureFrame(v, () => {
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            setLoading(false);
          });
        })
        .catch(() => {
          // Blob fetch failed - try direct with crossOrigin
          tryDirect();
        });
    };

    // STEP 2: Direct crossOrigin (fallback)
    const tryDirect = () => {
      if (controller.signal.aborted) { setLoading(false); return; }
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true;
      v.crossOrigin = 'anonymous';
      v.preload = 'metadata';
      v.src = videoUrl!;
      captureFrame(v, () => { setLoading(false); });
    };

    // Start with blob method (more reliable for CORS)
    tryBlob();

    return () => {
      controller.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [thumbUrl, videoUrl]);

  const displayThumb = (thumbUrl && thumbUrl.trim()) ? thumbUrl : videoThumb;
  return (
    <div className="relative overflow-hidden cursor-pointer flex-shrink-0 bg-[#0d0d0d]" style={style} onClick={onPlay}>
      {displayThumb ? (
        <img src={displayThumb} alt="" className="w-full h-full" style={{ objectFit: 'cover', objectPosition: 'top' }} loading="eager"
          onLoad={() => setLoading(false)} onError={() => setLoading(false)} />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#1a0a1a]">
          {loading
            ? <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            : <Play className="w-10 h-10 text-gray-600" />}
        </div>
      )}
      {loading && displayThumb && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-14 h-14 rounded-full bg-black/55 flex items-center justify-center">
          <Play className="w-7 h-7 text-white ml-1" fill="white" />
        </div>
      </div>
    </div>
  );
}

// Telegram-style media grid — each video uses its OWN thumbnail (thumbUrls[i])
function TelegramVideoGrid({ mediaUrls, thumbUrls, onClick }: {
  mediaUrls: string[]; thumbUrls?: string[]; onClick: (i: number) => void;
}) {
  if (mediaUrls.length === 0) return null;
  const ITEM_HEIGHT = 500;

  // Each Item renders a VideoThumbItem with its own unique key and index
  const Item = ({ idx, style }: { idx: number; style: React.CSSProperties }) => (
    <VideoThumbItem
      key={`${mediaUrls[idx]}_${idx}`}
      thumbUrl={thumbUrls?.[idx] || ''}
      videoUrl={mediaUrls[idx]}
      style={style}
      onPlay={() => onClick(idx)}
      videoIndex={idx}
    />
  );

  const count = mediaUrls.length;
  const halfH = Math.floor(ITEM_HEIGHT / 2);
  if (count === 1) return <Item idx={0} style={{ width: '100%', height: `${ITEM_HEIGHT}px`, display: 'block' }} />;
  if (count === 2) return (
    <div className="flex gap-0.5" style={{ height: `${ITEM_HEIGHT}px` }}>
      <Item idx={0} style={{ flex: 1, height: '100%' }} />
      <Item idx={1} style={{ flex: 1, height: '100%' }} />
    </div>
  );
  if (count === 3) return (
    <div className="flex gap-0.5" style={{ height: `${ITEM_HEIGHT}px` }}>
      <Item idx={0} style={{ flex: '1.2', height: '100%' }} />
      <div className="flex flex-col gap-0.5" style={{ flex: '0.8' }}>
        <Item idx={1} style={{ width: '100%', height: `${halfH}px` }} />
        <Item idx={2} style={{ width: '100%', height: `${halfH}px` }} />
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-0.5" style={{ height: `${ITEM_HEIGHT}px` }}>
      <div className="flex gap-0.5" style={{ height: `${halfH}px` }}>
        <Item idx={0} style={{ flex: 1, height: '100%' }} />
        <Item idx={1} style={{ flex: 1, height: '100%' }} />
      </div>
      <div className="flex gap-0.5" style={{ height: `${halfH}px` }}>
        {mediaUrls.slice(2, 5).map((_, i) => (
          <div key={i} className="relative flex-1" style={{ height: '100%' }}>
            <Item idx={i + 2} style={{ width: '100%', height: '100%' }} />
            {i === 2 && count > 5 && (
              <div className="absolute inset-0 bg-black/65 flex items-center justify-center pointer-events-none">
                <span className="text-white font-black text-2xl">+{count - 5}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Gift Modal for Video posts
function VideoGiftModal({ post, myProfile, onClose }: { post: any; myProfile: any; onClose: () => void }) {
  const GIFTS = [
    { emoji: '🌹', name: 'Waridi', amount: 100 }, { emoji: '💐', name: 'Maua', amount: 200 },
    { emoji: '🍫', name: 'Chokoleti', amount: 500 }, { emoji: '💍', name: 'Pete', amount: 1000 },
    { emoji: '🧸', name: 'Teddy', amount: 2000 }, { emoji: '💎', name: 'Almasi', amount: 5000 },
    { emoji: '🏆', name: 'Trophy', amount: 10000 }, { emoji: '🚗', name: 'Gari', amount: 50000 },
  ];
  const [selected, setSelected] = useState<typeof GIFTS[0] | null>(null);
  const [walletPass, setWalletPass] = useState('');
  const [sending, setSending] = useState(false);
  const { user, refreshProfile } = useAuth() as any;
  const giftBal = myProfile?.gift_balance || 0;
  const mainBal = myProfile?.balance || 0;

  async function handleSend() {
    if (!selected || !user) return;
    const amt = selected.amount;
    const canUseGift = giftBal >= amt;
    if (!canUseGift && mainBal < amt) return toast.error(`Salio halitooshi. Unahitaji TZS ${amt.toLocaleString()}`);
    if (myProfile?.wallet_password && walletPass !== myProfile.wallet_password) return toast.error('Password si sahihi!');
    setSending(true);
    try {
      if (canUseGift) await supabase.from('user_profiles').update({ gift_balance: giftBal - amt }).eq('id', user.id);
      else await supabase.from('user_profiles').update({ balance: mainBal - amt }).eq('id', user.id);
      const { data: r } = await supabase.from('user_profiles').select('gift_balance').eq('id', post.uploader_id).single();
      await supabase.from('user_profiles').update({ gift_balance: ((r as any)?.gift_balance || 0) + amt }).eq('id', post.uploader_id);
      await supabase.from('notifications').insert({ user_id: post.uploader_id, title: '🎁 Umepata Zawadi!', message: `${myProfile?.username} amekutumia ${selected.emoji} ${selected.name} - TZS ${amt.toLocaleString()} kwenye video yako!`, type: 'gift' });
      await supabase.from('transactions').insert({ user_id: post.uploader_id, amount: amt, type: 'gift_received', status: 'approved', description: `Zawadi Video: ${selected.emoji} ${selected.name} kutoka ${myProfile?.username}` });
      if (refreshProfile) await refreshProfile();
      toast.success(`🎁 Zawadi ya TZS ${amt.toLocaleString()} imetumwa!`);
      onClose();
    } catch { toast.error('Hitilafu ya kutuma zawadi'); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-5 slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-3">
          <h3 className="text-white font-bold flex items-center gap-2"><Gift className="w-5 h-5 text-orange-400" /> Tuma Zawadi kwa Video</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {GIFTS.map(g => (
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
            {myProfile?.wallet_password && <input value={walletPass} onChange={e => setWalletPass(e.target.value)} placeholder="Password ya wallet" type="password" className="input-field text-sm" />}
            <button onClick={handleSend} disabled={sending} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>{selected.emoji}</span>}
              {sending ? 'Inatuma...' : `Tuma ${selected.emoji} - TZS ${selected.amount.toLocaleString()}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VideoSection() {
  const navigate = useNavigate();
  const { profile, user, requireAuth, isAdmin } = useAuth();
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [catCovers, setCatCovers] = useState<Record<string, string>>({});
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [selectedCat, setSelectedCat] = useState<VideoCategory | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [settings, setSettings] = useState<any>({});
  const [uploadData, setUploadData] = useState({ title: '', section: '', price: '0', is_free: true, show_in_tiksexy: true });
  const [files, setFiles] = useState<File[]>([]);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('');
  const [autoThumbBlob, setAutoThumbBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  // Per-file upload progress tracking
  const [fileUploadProgress, setFileUploadProgress] = useState<Record<number, number>>({});
  const [fileUploadedMB, setFileUploadedMB] = useState<Record<number, number>>({});
  const [currentUploadIdx, setCurrentUploadIdx] = useState(-1);
  // Per-file thumbnail previews for upload modal
  const [fileThumbs, setFileThumbs] = useState<string[]>([]);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [planPickerMsg, setPlanPickerMsg] = useState('');
  const [balanceModal, setBalanceModal] = useState<ContentPost | null>(null);
  const [giftVideoChoiceModal, setGiftVideoChoiceModal] = useState<ContentPost | null>(null);
  const [editVideoPost, setEditVideoPost] = useState<ContentPost | null>(null);
  const [unlockedPostIds, setUnlockedPostIds] = useState<Set<string>>(new Set());
  const [unlockedLoaded, setUnlockedLoaded] = useState(false);
  const [giftPost, setGiftPost] = useState<ContentPost | null>(null);
  // X ZA ADMIN code
  const [showXCodeModal, setShowXCodeModal] = useState(false);
  const [xCodeInput, setXCodeInput] = useState('');
  const [xCodePending, setXCodePending] = useState<VideoCategory | null>(null);
  const [xUnlocked, setXUnlocked] = useState(false);
  const [hiddenUpload, setHiddenUpload] = useState(false);

  const [searchParams] = useSearchParams();
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const isVipMember = profile?.is_vip || profile?.is_admin;
  const isBusiness = profile?.is_business;
  const canUpload = profile?.is_admin || profile?.is_business;

  const isXCategory = (cat: VideoCategory) =>
    X_CATEGORY_KEYWORDS.some(k => cat.name.toLowerCase().includes(k));

  // Check X unlock from DB every 30s so admin lock/unlock works instantly
  useEffect(() => {
    if (!user) return;
    const checkXUnlock = async () => {
      try {
        const { data: codes } = await supabase.from('x_codes')
          .select('used_by, is_active').order('created_at', { ascending: false });
        const stillUnlocked = (codes || []).some((code: any) => {
          if (!code.is_active) return false;
          const usedBy = Array.isArray(code.used_by) ? code.used_by : [];
          return usedBy.some((u: any) => u.user_id === user.id);
        });
        setXUnlocked(stillUnlocked);
        try {
          if (stillUnlocked) localStorage.setItem(`x_unlocked_${user.id}`, 'true');
          else localStorage.removeItem(`x_unlocked_${user.id}`);
        } catch {}
      } catch {}
    };
    checkXUnlock();
    const iv = setInterval(checkXUnlock, 30000);
    return () => clearInterval(iv);
  }, [user?.id]);

  async function handleCategoryClick(cat: VideoCategory) {
    // Admin can always open
    if (isAdmin) { setSelectedCat(cat); return; }
    if (isXCategory(cat) && !xUnlocked) {
      setXCodePending(cat);
      setShowXCodeModal(true);
      return;
    }
    requireAuth(() => setSelectedCat(cat));
  }

  async function submitXCode() {
    if (!xCodeInput.trim() || !user) return;
    const code = xCodeInput.trim().toUpperCase();
    const { data: codeData } = await supabase.from('x_codes')
      .select('*').eq('code', code).eq('is_active', true).maybeSingle();
    if (!codeData) { toast.error('Code si sahihi au imeshaisha!'); return; }
    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) { toast.error('Code imekwisha muda!'); return; }
    if ((codeData.use_count || 0) >= (codeData.max_uses || 1)) { toast.error('Code hii imekwisha matumizi!'); return; }
    const usedBy = Array.isArray(codeData.used_by) ? codeData.used_by : [];
    const alreadyUsed = usedBy.some((u: any) => u.user_id === user.id);
    if (alreadyUsed) {
      setXUnlocked(true);
      try { localStorage.setItem(`x_unlocked_${user.id}`, 'true'); } catch {}
      setShowXCodeModal(false); setXCodeInput('');
      toast.success('✅ Umefungua X ZA ADMIN!');
      if (xCodePending) { setSelectedCat(xCodePending); setXCodePending(null); }
      return;
    }
    const newUsedBy = [...usedBy, { user_id: user.id, username: profile?.username || '', used_at: new Date().toISOString() }];
    await supabase.from('x_codes').update({ use_count: (codeData.use_count || 0) + 1, used_by: newUsedBy }).eq('id', codeData.id);
    setXUnlocked(true);
    try { localStorage.setItem(`x_unlocked_${user.id}`, 'true'); } catch {}
    setShowXCodeModal(false); setXCodeInput('');
    toast.success('✅ Code inafanya kazi! Umefungua X ZA ADMIN!');
    if (xCodePending) { setSelectedCat(xCodePending); setXCodePending(null); }
  }

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (selectedCat) fetchPosts(selectedCat.name); }, [selectedCat]);

  useEffect(() => {
    const postId = searchParams.get('post');
    if (!postId) return;
    if (posts.length > 0) {
      setTimeout(() => {
        const el = postRefs.current[postId];
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setHighlightPostId(postId); setTimeout(() => setHighlightPostId(null), 2500); }
      }, 300);
      return;
    }
    supabase.from('content_posts').select('id,section').eq('id', postId).eq('type', 'video').maybeSingle().then(({ data: pd }) => {
      if (pd?.section) supabase.from('video_categories').select('*').eq('name', pd.section).maybeSingle().then(({ data: cd }) => { if (cd) setSelectedCat(cd as VideoCategory); });
    });
  }, [posts.length, searchParams]);

  useEffect(() => { if (user && !unlockedLoaded) loadUnlockedPosts(); }, [user]);

  async function loadUnlockedPosts() {
    if (!user) return;
    const { data } = await supabase.from('user_unlocked_content').select('content_id').eq('user_id', user.id).eq('content_type', 'video');
    setUnlockedPostIds(new Set((data || []).map((r: any) => r.content_id)));
    setUnlockedLoaded(true);
  }

  async function fetchData() {
    const { data: s } = await supabase.from('app_settings').select('*');
    const m: any = {}; s?.forEach((r: any) => { m[r.key] = r.value; }); setSettings(m);
    const { data: c } = await supabase.from('video_categories').select('*').order('display_order');
    const cats = (c || []) as VideoCategory[];
    setCategories(cats);
    // Load a cover per category: category's own cover_url first, then most recent post thumbnail
    const covers: Record<string, string> = {};
    await Promise.all(cats.map(async (cat) => {
      // Priority 1: category's own admin-set cover_url
      if (cat.cover_url) { covers[cat.name] = cat.cover_url; return; }
      // Priority 2: most recent uploaded thumbnail from this exact category
      const { data: post } = await supabase.from('content_posts')
        .select('thumbnail_url,media_url')
        .eq('type', 'video').eq('section', cat.name)
        .not('thumbnail_url', 'is', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (post?.thumbnail_url) { covers[cat.name] = post.thumbnail_url; return; }
      // Priority 3: try without thumbnail filter (maybe media_url is image)
      const { data: post2 } = await supabase.from('content_posts')
        .select('thumbnail_url,media_url')
        .eq('type', 'video').eq('section', cat.name)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (post2?.thumbnail_url) covers[cat.name] = post2.thumbnail_url;
    }));
    setCatCovers(covers);
  }

  async function fetchPosts(catName: string) {
    const { data } = await supabase.from('content_posts')
      .select('*')
      .eq('type', 'video').eq('section', catName)
      .neq('source', 'tiksexy')
      .order('is_pinned', { ascending: false })
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false });
    // Fetch uploader info separately
    const posts = (data || []) as ContentPost[];
    if (posts.length > 0) {
      const uploaderIds = [...new Set(posts.map(p => p.uploader_id).filter(Boolean))];
      if (uploaderIds.length > 0) {
        const { data: uploaders } = await supabase.from('user_profiles').select('id,username,avatar_url').in('id', uploaderIds);
        const uploaderMap: Record<string, any> = {};
        (uploaders || []).forEach((u: any) => { uploaderMap[u.id] = u; });
        posts.forEach((p: any) => { if (p.uploader_id) p.uploader = uploaderMap[p.uploader_id] || null; });
      }
    }
    setPosts(posts);
  }

  async function handleUpload() {
    if (!user || !canUpload) { toast.error('Unahitaji Business Account au Admin'); return; }
    if (files.length === 0) { toast.error('Chagua video'); return; }
    if (!uploadData.section && !selectedCat) { toast.error('Chagua Category'); return; }
    setUploading(true); setUploadPct(0); setFileUploadProgress({}); setFileUploadedMB({}); setCurrentUploadIdx(-1);
    const sessionId = `video_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    globalUploadTracker.register(sessionId, {
      fileName: files.length === 1 ? files[0].name : `${files.length} video (${files[0].name}...)`,
      fileSize: files.reduce((s, f) => s + f.size, 0),
      section: uploadData.section || selectedCat?.name || 'video',
      userId: user.id, username: profile?.username || '', contentType: 'video',
    });
    try {
      const section = uploadData.section || selectedCat?.name || '';
      let globalThumbUrl = '';
      if (thumbnail) {
        const tp = `video/thumb/${user.id}/${Date.now()}_manual.${thumbnail.name.split('.').pop()}`;
        globalThumbUrl = await uploadFile('content', tp, thumbnail);
      }
      const totalSize = files.reduce((s, f) => s + f.size, 0);
      let uploadedSize = 0;
      const uploadedUrls: string[] = [];
      const uploadedThumbs: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentUploadIdx(i);
        setFileUploadProgress(prev => ({ ...prev, [i]: 0 }));
        setFileUploadedMB(prev => ({ ...prev, [i]: 0 }));
        const ext = file.name.split('.').pop() || 'mp4';
        const path = `video/${user.id}/${Date.now()}_${i}.${ext}`;
        try {
          const url = await uploadFile('content', path, file, (pct) => {
            const fp = file.size * pct / 100;
            setUploadPct(Math.round((uploadedSize + fp) / totalSize * 100));
            setFileUploadProgress(prev => ({ ...prev, [i]: Math.round(pct) }));
            setFileUploadedMB(prev => ({ ...prev, [i]: fp / 1024 / 1024 }));
          }, sessionId);
          uploadedSize += file.size;
          uploadedUrls.push(url);
          // Generate unique thumbnail for EACH video
          let vThumbUrl = '';
          if (file.type.startsWith('video')) {
            try {
              // Use pre-gen blob for first video, generate fresh for others
              const blob = (i === 0 && autoThumbBlob) ? autoThumbBlob : await generateVideoThumbnail(file);
              if (blob) {
                const tf = new File([blob], `vt_${i}_${Date.now()}.jpg`, { type: 'image/jpeg' });
                vThumbUrl = await uploadFile('content', `video/thumb/${user.id}/v${i}_${Date.now()}.jpg`, tf);
              }
            } catch {}
          }
          uploadedThumbs.push(vThumbUrl || globalThumbUrl);
        } catch (e) {
          toast.error(`Hitilafu ya kupakia video ${i+1}`);
          uploadedThumbs.push('');
        }
      }
      setUploadPct(100);
      const primaryThumb = uploadedThumbs[0] || globalThumbUrl || '';
      await supabase.from('content_posts').insert({
        type: 'video', section, title: uploadData.title,
        price: parseFloat(uploadData.price) || 0, is_free: uploadData.is_free,
        media_url: uploadedUrls[0], media_urls: uploadedUrls,
        thumbnail_url: primaryThumb,
        thumb_urls: uploadedThumbs,
        uploader_id: user.id, views: 0,
        show_in_tiksexy: uploadData.show_in_tiksexy,
        source: 'home',
      });
      globalUploadTracker.complete(sessionId);
      toast.success(`${files.length} video imepakiwa!`);
      setShowUpload(false); setFiles([]); setThumbnail(null); setThumbnailPreview(''); setAutoThumbBlob(null);
      setUploadData({ title: '', section: '', price: '0', is_free: true, show_in_tiksexy: true });
      if (selectedCat) fetchPosts(selectedCat.name);
    } catch (err) {
      globalUploadTracker.fail(sessionId);
      toast.error(`Hitilafu ya upload: ${(err as Error).message}`);
    } finally { setUploading(false); }
  }

  function isPostUnlocked(post: ContentPost): boolean {
    return post.is_free || isVipMember || unlockedPostIds.has(post.id);
  }

  async function handlePlayVideo(post: ContentPost) {
    if (!user) { requireAuth(() => {}); return; }
    const mediaUrls: string[] = (post.media_urls && post.media_urls.length > 0) ? post.media_urls : (post.media_url ? [post.media_url] : []);
    if (isPostUnlocked(post)) {
      await supabase.from('content_posts').update({ views: (post.views || 0) + 1 }).eq('id', post.id);
      navigate('/play', { state: { url: mediaUrls[0], title: post.title || 'Video', urls: mediaUrls, thumbnail: post.thumbnail_url || '' } });
    } else {
      if (!post.price || post.price <= 0) { setPlanPickerMsg('Angalia video inahitaji VIP au Business Account'); setShowPlanPicker(true); return; }
      const giftCreds = user ? parseInt(localStorage.getItem(`gift_video_credits_${user.id}`) || '0') : 0;
      if (giftCreds > 0) { setGiftVideoChoiceModal(post); return; }
      setBalanceModal(post);
    }
  }

  async function confirmBalancePay(post: ContentPost) {
    if (!user || !profile) return;
    const price = post.price || 0;
    if ((profile.balance || 0) < price) { toast.error('Salio halitooshi. Ongeza pesa kwenye Wallet.'); navigate('/wallet'); return; }
    await supabase.from('user_profiles').update({ balance: (profile.balance || 0) - price }).eq('id', user.id);
    if (post.uploader_id && post.uploader_id !== user.id) {
      const { data: up } = await supabase.from('user_profiles').select('balance,is_business').eq('id', post.uploader_id).single();
      if (up?.is_business) {
        await supabase.from('user_profiles').update({ balance: (up.balance || 0) + price }).eq('id', post.uploader_id);
        await supabase.from('transactions').insert({ user_id: post.uploader_id, amount: price, type: 'video_sale', status: 'approved', description: `Mapato ya Video: ${post.title}` });
      }
    }
    await supabase.from('transactions').insert({ user_id: user.id, amount: price, type: 'video_purchase', status: 'approved', description: `Video: ${post.title}` });
    await supabase.from('user_unlocked_content').upsert({ user_id: user.id, content_id: post.id, content_type: 'video', amount_paid: price }, { onConflict: 'user_id,content_id' });
    setUnlockedPostIds(prev => new Set([...prev, post.id]));
    setBalanceModal(null);
    if ((window as any).__authRefreshProfile) (window as any).__authRefreshProfile();
    toast.success(`✅ Video imefunguliwa! TZS ${price.toLocaleString()} imekatwa.`);
    const mediaUrls: string[] = (post.media_urls && post.media_urls.length > 0) ? post.media_urls : (post.media_url ? [post.media_url] : []);
    await supabase.from('content_posts').update({ views: (post.views || 0) + 1 }).eq('id', post.id);
    navigate('/play', { state: { url: mediaUrls[0], title: post.title, urls: mediaUrls, thumbnail: post.thumbnail_url || '' } });
  }

  async function sharePost(post: ContentPost, e?: React.MouseEvent) {
    e?.stopPropagation();
    const url = `${window.location.origin}/video?post=${post.id}`;
    try { if (navigator.share) await navigator.share({ title: post.title || 'Video', url }); else { await navigator.clipboard.writeText(url); toast.success('Link imenakiliwa!'); } }
    catch { await navigator.clipboard.writeText(url).catch(() => {}); toast.success('Link imenakiliwa!'); }
  }

  function handleDownload(post: ContentPost, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) { requireAuth(() => {}); return; }
    const giftCreds = user ? parseInt(localStorage.getItem(`gift_download_credits_${user.id}`) || '0') : 0;
    if (!isVipMember && !isBusiness && giftCreds <= 0) { setPlanPickerMsg('Download inahitaji VIP Account au Business Account'); setShowPlanPicker(true); return; }
    const mediaUrls = (post.media_urls && post.media_urls.length > 0) ? post.media_urls : (post.media_url ? [post.media_url] : []);
    mediaUrls.forEach((url, i) => triggerDownload({ url, name: `video_${post.title || i}_${i + 1}`, type: 'video', userId: user.id, thumbUrl: post.thumbnail_url || undefined }));
    toast.success('⬇️ Download imeanza!');
  }

  async function deletePost(id: string) {
    if (!window.confirm('Futa video hii?')) return;
    await supabase.from('content_posts').delete().eq('id', id);
    toast.success('Imefutwa!');
    if (selectedCat) fetchPosts(selectedCat.name);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => selectedCat ? setSelectedCat(null) : navigate(-1)} className="text-gray-400">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-white font-bold text-xl flex-1">🎬 {selectedCat ? selectedCat.name : 'VIDEO'}</h1>
        {canUpload && (
          <button onClick={() => setShowUpload(true)} className="w-8 h-8 gradient-pink rounded-full flex items-center justify-center">
            <Plus className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {uploading && hiddenUpload && (
        <button onClick={() => { setHiddenUpload(false); setShowUpload(true); }} className="mx-4 mt-2 mb-1 w-[calc(100%-2rem)] py-2 text-xs text-primary font-semibold bg-primary/10 rounded-xl border border-primary/20 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Upload inaendelea... {Math.round(uploadPct)}% (Gonga kuona)
        </button>
      )}

      <div className="max-w-md mx-auto">
        {!selectedCat ? (
          <div className="grid grid-cols-2 gap-3 p-4">
            {categories.map((cat, catIdx) => {
              const isX = isXCategory(cat);
              const cover = cat.cover_url || catCovers[cat.name];
              return (
                <div key={cat.id}
                  className={`relative rounded-2xl overflow-hidden group cursor-pointer ${isX && !xUnlocked && !isAdmin ? 'border-2 border-red-800/60' : ''}`}
                  style={{ aspectRatio: '0.75', background: '#1a0a1a' }}
                  onClick={() => handleCategoryClick(cat)}>
                  {cover ? (
                    <img src={cover} alt={cat.name} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" loading="eager" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-5xl opacity-30">🎬</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-3">
                    <span className="text-white font-bold text-base">{cat.name}</span>
                  </div>
                  {isX && !xUnlocked && !isAdmin && (
                    <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-red-400" />
                    </div>
                  )}
                  {isAdmin && (
                    <div className="absolute top-1 right-1 flex flex-col gap-0.5 z-10" onClick={e => e.stopPropagation()}>
                      {catIdx > 0 && <button onClick={async e => { e.stopPropagation(); const prev = categories[catIdx-1]; await supabase.from('video_categories').update({ display_order: prev.display_order || catIdx-1 }).eq('id', cat.id); await supabase.from('video_categories').update({ display_order: cat.display_order || catIdx }).eq('id', prev.id); fetchData(); }} className="w-6 h-6 rounded bg-black/80 flex items-center justify-center"><ArrowUp className="w-3 h-3 text-white" /></button>}
                      {catIdx < categories.length - 1 && <button onClick={async e => { e.stopPropagation(); const next = categories[catIdx+1]; await supabase.from('video_categories').update({ display_order: next.display_order || catIdx+1 }).eq('id', cat.id); await supabase.from('video_categories').update({ display_order: cat.display_order || catIdx }).eq('id', next.id); fetchData(); }} className="w-6 h-6 rounded bg-black/80 flex items-center justify-center"><ArrowDown className="w-3 h-3 text-white" /></button>}
                    </div>
                  )}
                </div>
              );
            })}
            {isAdmin && (
              <button onClick={async () => { const name = prompt('Jina la category:'); if (name) { await supabase.from('video_categories').insert({ name, display_order: categories.length + 1 }); fetchData(); toast.success('Imeongezwa!'); } }}
                className="rounded-2xl border-2 border-dashed border-primary/30 flex items-center justify-center" style={{ aspectRatio: '1.4' }}>
                <div className="text-center"><Plus className="w-8 h-8 text-primary mx-auto mb-1" /><span className="text-gray-400 text-sm">Category Mpya</span></div>
              </button>
            )}
          </div>
        ) : (
          <div className="mt-2">
            {posts.length === 0 ? (
              <div className="text-center py-16 text-gray-500 px-4">
                <Play className="w-16 h-16 mx-auto mb-3 opacity-20" />
                <p>Hakuna video kwenye {selectedCat.name}</p>
                {canUpload && <button onClick={() => setShowUpload(true)} className="btn-primary mt-4">+ Pakia Video</button>}
              </div>
            ) : (
              <div className="space-y-0">
                {posts.map(post => {
                  const mediaUrls: string[] = (post.media_urls && post.media_urls.length > 0) ? post.media_urls : (post.media_url ? [post.media_url] : []);
                  const unlocked = isPostUnlocked(post);
                  // Get per-video thumbnails from DB thumb_urls column
                  const dbThumbs: string[] = Array.isArray((post as any).thumb_urls) ? (post as any).thumb_urls : [];
                  // Each video gets its own thumbnail; fallback to post.thumbnail_url for first video only
                  const resolvedThumbs = mediaUrls.map((_, i) => {
                    if (dbThumbs[i] && dbThumbs[i].trim()) return dbThumbs[i];
                    if (i === 0 && post.thumbnail_url && post.thumbnail_url.trim()) return post.thumbnail_url;
                    return '';
                  });
                  return (
                    <div key={post.id} ref={el => { postRefs.current[post.id] = el; }}
                      className={`border-b border-[#1a0a1a] transition-all duration-300 ${highlightPostId === post.id ? 'bg-primary/10' : ''}`}>
                      {(post as any).is_pinned && (
                        <div className="flex items-center gap-1.5 px-4 pt-1">
                          <span className="text-[10px] font-black text-yellow-400 bg-yellow-500/15 border border-yellow-500/30 px-2 py-0.5 rounded-full">📌 PINNED</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 px-4 py-2">
                        <button onClick={() => post.uploader_id && navigate(`/profile/${post.uploader_id}`)}
                          className="w-7 h-7 rounded-full overflow-hidden border border-primary/30 flex-shrink-0">
                          {(post.uploader as any)?.avatar_url ?
                            <img src={(post.uploader as any).avatar_url} className="w-full h-full object-cover" alt="" /> :
                            <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white text-xs font-bold">{(post.uploader as any)?.username?.[0]?.toUpperCase() || 'A'}</span></div>}
                        </button>
                        <p className="text-white font-semibold text-sm flex-1 truncate">{post.title || 'Video'}</p>
                        <span className="text-gray-500 text-xs">{post.views || 0} 👁</span>
                        {!post.is_free && !unlocked && <span className="bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">TZS {post.price?.toLocaleString()}</span>}
                        {unlocked && !post.is_free && <span className="text-green-400 text-xs font-bold">✓</span>}
                        <button onClick={e => sharePost(post, e)} className="text-gray-400 ml-1"><Share2 className="w-4 h-4" /></button>
                        <button onClick={e => handleDownload(post, e)} className="text-gray-400 ml-1"><Download className="w-4 h-4" /></button>
                        {(isAdmin || (canUpload && post.uploader_id === user?.id)) && <button onClick={() => deletePost(post.id)} className="text-red-400 ml-1"><Trash2 className="w-4 h-4" /></button>}
                        {isAdmin && <button onClick={e => { e.stopPropagation(); setEditVideoPost(post); }} className="text-gray-400 ml-1"><Edit3 className="w-4 h-4" /></button>}
                        {isAdmin && (
                          <button onClick={async e => { e.stopPropagation(); const np = !(post as any).is_pinned; await supabase.from('content_posts').update({ is_pinned: np, pinned_at: np ? new Date().toISOString() : null, sort_order: np ? 999999 : 0 }).eq('id', post.id); toast.success(np ? '📌 Imepinniwa!' : '✅ Pin imeondolewa!'); if (selectedCat) fetchPosts(selectedCat.name); }}
                            className={`ml-1 text-sm ${(post as any).is_pinned ? 'text-yellow-400' : 'text-gray-500'}`}>📌</button>
                        )}
                        <button onClick={async e => { e.stopPropagation(); if (!user) { navigate('/login'); return; } await supabase.from('saved_items').insert({ user_id: user.id, content_id: post.id, content_type: 'video', content_url: mediaUrls[0], content_name: post.title || 'Video', thumbnail_url: post.thumbnail_url || mediaUrls[0] }); toast.success('✅ Imehifadhiwa!'); }}
                          className="text-gray-400 ml-1"><Bookmark className="w-4 h-4" /></button>
                        {post.uploader_id && post.uploader_id !== user?.id && (
                          <button onClick={e => { e.stopPropagation(); if (!user) { navigate('/login'); return; } setGiftPost(post); }} className="text-orange-400 ml-1"><Gift className="w-4 h-4" /></button>
                        )}
                      </div>

                      <div className="w-full bg-[#080308] overflow-hidden cursor-pointer relative" onClick={() => handlePlayVideo(post)}>
                        <TelegramVideoGrid
                          mediaUrls={mediaUrls}
                          thumbUrls={resolvedThumbs}
                          onClick={() => handlePlayVideo(post)}
                        />
                        {!unlocked && post.price && post.price > 0 && (
                          <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center gap-2 z-10 pointer-events-none">
                            <div className="w-16 h-16 rounded-full gradient-pink flex items-center justify-center"><span className="text-2xl">🔒</span></div>
                            <p className="text-white font-black text-lg">TZS {post.price?.toLocaleString()}</p>
                            <p className="text-white/70 text-sm">Bonyeza kulipa - bure daima baadaye</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end justify-center">
          <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto slide-up">
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Pakia Video</h3>
              <div className="flex gap-2">
                <button onClick={() => { setHiddenUpload(true); setShowUpload(false); }} className="w-8 h-8 rounded-xl bg-[#1a0a1a] flex items-center justify-center"><EyeOff className="w-4 h-4 text-gray-400" /></button>
                <button onClick={() => setShowUpload(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>
            <div className="space-y-3">
              <input value={uploadData.title} onChange={e => setUploadData(p => ({ ...p, title: e.target.value }))} placeholder="Jina la video" className="input-field" />
              <select value={uploadData.section || selectedCat?.name || ''} onChange={e => setUploadData(p => ({ ...p, section: e.target.value }))} className="input-field">
                <option value="">Chagua Category</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl">
                <span className="text-gray-300 text-sm">Video hii ni bure?</span>
                <button onClick={() => setUploadData(p => ({ ...p, is_free: !p.is_free }))} className={`w-12 h-6 rounded-full transition-colors ${uploadData.is_free ? 'bg-green-500' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${uploadData.is_free ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl border border-primary/20">
                <span className="text-white text-sm font-semibold">🎬 TIK-SEXY?</span>
                <button onClick={() => setUploadData(p => ({ ...p, show_in_tiksexy: !p.show_in_tiksexy }))} className={`w-12 h-6 rounded-full transition-colors ${uploadData.show_in_tiksexy ? 'bg-primary' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${uploadData.show_in_tiksexy ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              {!uploadData.is_free && <input value={uploadData.price} onChange={e => setUploadData(p => ({ ...p, price: e.target.value }))} placeholder="Bei (TZS)" className="input-field" type="number" />}
              <label className="block btn-outline text-center cursor-pointer py-3">
                <Upload className="w-4 h-4 inline mr-2" />Chagua Video ({files.length} zilizochaguliwa)
                <input type="file" accept="video/*" multiple className="hidden" onChange={async e => {
                  const nf = Array.from(e.target.files || []); setFiles(nf); setFileThumbs([]);
                  if (nf.length > 0 && nf[0].type.startsWith('video')) {
                    setThumbnailPreview(''); setAutoThumbBlob(null);
                    try { const b = await generateVideoThumbnail(nf[0]); if (b) { setAutoThumbBlob(b); setThumbnailPreview(URL.createObjectURL(b)); } } catch {}
                  }
                  // Generate thumbnail preview for EACH selected video file
                  const thumbUrls: string[] = [];
                  for (const f of nf) {
                    if (f.type.startsWith('video')) {
                      try {
                        const blob = await generateVideoThumbnail(f);
                        thumbUrls.push(blob ? URL.createObjectURL(blob) : '');
                      } catch { thumbUrls.push(''); }
                    } else {
                      thumbUrls.push(URL.createObjectURL(f));
                    }
                  }
                  setFileThumbs(thumbUrls);
                }} />
              </label>
              {files.length > 0 && (
                <div className="space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-[#1a0a1a] rounded-lg p-2">
                      {/* Thumbnail preview for each file */}
                      <div className="w-12 h-10 rounded-lg overflow-hidden bg-[#2a0a2a] flex-shrink-0">
                        {fileThumbs[i] ? (
                          <img src={fileThumbs[i]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play className="w-4 h-4 text-primary" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-300 text-xs truncate">{f.name}</p>
                        <p className="text-primary text-xs font-semibold">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
                        {fileThumbs[i] && <p className="text-green-400 text-[10px]">✓ Cover ipo</p>}
                        {!fileThumbs[i] && i > 0 && <p className="text-yellow-400 text-[10px]">⏳ Inaunda cover...</p>}
                      </div>
                      <button onClick={() => {
                        setFiles(prev => prev.filter((_, j) => j !== i));
                        setFileThumbs(prev => prev.filter((_, j) => j !== i));
                      }} className="text-red-400"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
              <label className="block btn-outline text-center cursor-pointer py-3 text-sm">
                <Upload className="w-4 h-4 inline mr-2" />Thumbnail {thumbnail ? `✓ ${thumbnail.name}` : '(Auto)'}
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0] || null; setThumbnail(f); if (f) setThumbnailPreview(URL.createObjectURL(f)); }} />
              </label>
              {thumbnailPreview && (
                <div className="relative">
                  <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-32 object-cover rounded-xl border border-primary/30" />
                  <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg">{thumbnail ? '✓ Custom thumbnail' : '🤖 Auto-generated'}</div>
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
              <button onClick={handleUpload} disabled={uploading || files.length === 0} className="btn-primary w-full disabled:opacity-50">
                {uploading ? `Inapakia ${uploadPct}%...` : 'Pakia Video'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gift Choice Modal */}
      {giftVideoChoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setGiftVideoChoiceModal(null)}>
          <div className="w-full max-w-sm bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 slide-up" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4"><div className="text-4xl mb-2">🎁</div><h3 className="text-white font-black text-lg">{giftVideoChoiceModal.title || 'Video'}</h3></div>
            {(() => {
              const creds = user ? parseInt(localStorage.getItem(`gift_video_credits_${user.id}`) || '0') : 0;
              const post = giftVideoChoiceModal;
              const mediaUrls: string[] = (post.media_urls && post.media_urls.length > 0) ? post.media_urls : (post.media_url ? [post.media_url] : []);
              return (
                <>
                  <button onClick={async () => {
                    const nc = Math.max(0, creds - 1); try { localStorage.setItem(`gift_video_credits_${user!.id}`, String(nc)); } catch {}
                    await supabase.from('user_unlocked_content').upsert({ user_id: user!.id, content_id: post.id, content_type: 'video', amount_paid: 0 }, { onConflict: 'user_id,content_id' });
                    setUnlockedPostIds(prev => new Set([...prev, post.id])); setGiftVideoChoiceModal(null);
                    toast.success(`✅ Video imefunguliwa! (Credits zilizobaki: ${nc})`);
                    navigate('/play', { state: { url: mediaUrls[0], title: post.title || 'Video', urls: mediaUrls, thumbnail: post.thumbnail_url || '' } });
                  }} className="w-full py-3.5 rounded-xl text-white font-black text-sm mb-3 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                    🎁 Tumia Gift Credits ({creds} zilizobaki)
                  </button>
                  <button onClick={() => { setGiftVideoChoiceModal(null); setBalanceModal(giftVideoChoiceModal); }} className="w-full py-3.5 rounded-xl gradient-pink text-white font-black text-sm flex items-center justify-center gap-2">
                    💰 Lipia kwa Salio (TZS {(giftVideoChoiceModal.price || 0).toLocaleString()})
                  </button>
                  <button onClick={() => setGiftVideoChoiceModal(null)} className="w-full mt-2 py-2 text-gray-400 text-sm">Ghairi</button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {showPlanPicker && <PlanPickerModal onClose={() => setShowPlanPicker(false)} settings={settings} message={planPickerMsg} onSuccess={() => setShowPlanPicker(false)} />}
      {balanceModal && <BalanceConfirmModal amount={balanceModal.price || 0} itemName={balanceModal.title || 'Video'} balance={profile?.balance || 0} onConfirm={() => confirmBalancePay(balanceModal)} onCancel={() => setBalanceModal(null)} />}
      {giftPost && profile && <VideoGiftModal post={giftPost} myProfile={profile} onClose={() => setGiftPost(null)} />}

      {/* X ZA ADMIN Code Modal */}
      {showXCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => { setShowXCodeModal(false); setXCodePending(null); setXCodeInput(''); }}>
          <div className="w-full max-w-sm bg-[#0d0d0d] border-2 border-red-800/60 rounded-2xl p-6 slide-up" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className="text-5xl mb-2">🔞</div>
              <h3 className="text-white font-black text-2xl">X ZA ADMIN</h3>
              <p className="text-gray-400 text-sm mt-1">Ingiza code ya siri kupata ufikiaji wa maudhui ya watu wazima</p>
            </div>
            <input value={xCodeInput} onChange={e => setXCodeInput(e.target.value.toUpperCase())}
              placeholder="CODE (mfano: XABC1234)" className="input-field text-center text-xl font-mono tracking-widest mb-4"
              autoFocus onKeyDown={e => e.key === 'Enter' && submitXCode()} />
            <button onClick={submitXCode} className="btn-primary w-full text-base font-black py-4 mb-3">🔓 Fungua X ZA ADMIN</button>
            <button onClick={() => { setShowXCodeModal(false); setXCodePending(null); setXCodeInput(''); }} className="w-full py-2 text-gray-400 text-sm">Ghairi</button>
            <p className="text-gray-600 text-xs text-center mt-3">Code inapatikana kwa watu walioidhinishwa na Admin peke yao</p>
          </div>
        </div>
      )}

      {/* Edit Video Post Modal */}
      {editVideoPost && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">Hariri Video</h3><button onClick={() => setEditVideoPost(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="space-y-3">
              <input value={editVideoPost.title || ''} onChange={e => setEditVideoPost(p => p ? { ...p, title: e.target.value } : null)} placeholder="Jina la video" className="input-field" />
              <select value={editVideoPost.section || ''} onChange={e => setEditVideoPost(p => p ? { ...p, section: e.target.value } : null)} className="input-field">
                <option value="">Chagua Category</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl">
                <span className="text-gray-300 text-sm">Ni bure?</span>
                <button onClick={() => setEditVideoPost(p => p ? { ...p, is_free: !p.is_free } : null)} className={`w-12 h-6 rounded-full ${editVideoPost.is_free ? 'bg-green-500' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editVideoPost.is_free ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              {!editVideoPost.is_free && <input type="number" value={editVideoPost.price || 0} onChange={e => setEditVideoPost(p => p ? { ...p, price: parseFloat(e.target.value) } : null)} placeholder="Bei" className="input-field" />}
              {/* Replace media - with progress + auto thumbnail */}
              <div className="border border-primary/20 rounded-xl p-3 space-y-2">
                <p className="text-gray-400 text-xs font-semibold">🔄 Badilisha Picha/Video</p>
                <label className="block btn-outline text-center cursor-pointer py-2 text-xs">
                  <Upload className="w-3 h-3 inline mr-1" />Chagua Faili Jipya
                  <input type="file" accept="image/*,video/*" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f || !editVideoPost) return;
                    setUploading(true); setUploadPct(0);
                    try {
                      const ext = f.name.split('.').pop() || 'mp4';
                      const path = `video/${user?.id || 'admin'}/${Date.now()}_replace.${ext}`;
                      const url = await uploadFile('content', path, f, (pct) => setUploadPct(Math.round(pct)));
                      let thumbUrl = editVideoPost.thumbnail_url || '';
                      if (f.type.startsWith('video')) {
                        try {
                          const blob = await generateVideoThumbnail(f);
                          if (blob) {
                            const tf = new File([blob], `thumb_${Date.now()}.jpg`, { type: 'image/jpeg' });
                            thumbUrl = await uploadFile('content', `video/thumb/${user?.id || 'admin'}/${Date.now()}.jpg`, tf);
                          }
                        } catch {}
                      }
                      setUploadPct(100);
                      setEditVideoPost(p => p ? { ...p, media_url: url, thumbnail_url: thumbUrl, media_urls: [url] } as any : null);
                      toast.success('✅ Media imebadilishwa! Bonyeza Hifadhi.');
                    } catch { toast.error('Hitilafu ya upload'); }
                    finally { setUploading(false); setUploadPct(0); }
                  }} />
                </label>
                {uploading && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-primary font-bold animate-pulse">{uploadPct}%</span>
                      <span className="text-gray-500">{uploadPct}% imepakiwa</span>
                    </div>
                    <div className="h-1.5 bg-[#1a0a1a] rounded-full overflow-hidden">
                      <div className="h-full gradient-pink rounded-full transition-all" style={{ width: `${Math.max(2, uploadPct)}%` }} />
                    </div>
                  </div>
                )}
                {!uploading && editVideoPost.media_url && <p className="text-green-400 text-xs truncate">✓ {editVideoPost.media_url.split('/').pop()?.slice(0, 40)}</p>}
              </div>
              <button onClick={async () => {
                if (!editVideoPost) return;
                await supabase.from('content_posts').update({
                  title: editVideoPost.title, section: editVideoPost.section,
                  price: editVideoPost.price, is_free: editVideoPost.is_free,
                  media_url: editVideoPost.media_url, thumbnail_url: editVideoPost.thumbnail_url,
                  media_urls: (editVideoPost as any).media_urls,
                  thumb_urls: (editVideoPost as any).thumb_urls,
                }).eq('id', editVideoPost.id);
                setEditVideoPost(null);
                if (selectedCat) fetchPosts(selectedCat.name);
                toast.success('Imebadilishwa!');
              }} disabled={uploading} className="btn-primary w-full disabled:opacity-50">💾 Hifadhi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
