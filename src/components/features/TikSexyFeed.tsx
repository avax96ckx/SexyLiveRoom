import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Heart, MessageCircle, Share2, Gift, Plus, Download, WifiOff, Bookmark, X, Search, Play, Volume2, VolumeX } from 'lucide-react';
import { triggerDownload } from '@/pages/Downloads';
import { toast } from 'sonner';
import BlueTick from '@/components/features/BlueTick';
import { TikPost, videoCache, isVideoFile, TikSexyLogo, CommentPanel, TikGiftModal, getSaveData } from '@/components/features/TikSexyShared';
import { PlanPickerModal } from '@/pages/Services';

// ─── Track viewed videos ─────────────────────────────────────────────────────
const VIEWED_KEY = 'tiksexy_viewed_v3';
const FEED_INDEX_KEY = 'tiksexy_feed_index';
const FEED_TAB_KEY = 'tiksexy_feed_tab';

function getViewedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]')); } catch { return new Set(); }
}
function markVideoViewed(id: string) {
  const v = getViewedIds(); v.add(id);
  try { localStorage.setItem(VIEWED_KEY, JSON.stringify([...v].slice(-3000))); } catch {}
}
function sortByUnseen(posts: TikPost[]): TikPost[] {
  const viewed = getViewedIds();
  const unseen = posts.filter(p => !viewed.has(p.id));
  const seen = posts.filter(p => viewed.has(p.id));
  const byDate = (a: TikPost, b: TikPost) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  return [...unseen.sort(byDate), ...seen.sort(byDate)];
}
function saveFeedPosition(index: number, tab: string) {
  try { localStorage.setItem(FEED_INDEX_KEY, String(index)); localStorage.setItem(FEED_TAB_KEY, tab); } catch {}
}
function loadFeedPosition(): { index: number; tab: string } {
  try {
    const index = parseInt(localStorage.getItem(FEED_INDEX_KEY) || '0');
    const tab = localStorage.getItem(FEED_TAB_KEY) || 'foryou';
    return { index: isNaN(index) ? 0 : index, tab };
  } catch { return { index: 0, tab: 'foryou' }; }
}

async function checkVipAndDownload(myProfile: any, url: string, title: string) {
  if (!myProfile?.is_vip && !myProfile?.is_business && !myProfile?.is_admin) {
    toast.info('Unahitaji VIP au Business Account kupakua!');
    return;
  }
  const a = document.createElement('a');
  a.href = url; a.download = title || 'video';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ─── BOTTOM = 56px (above TikBottomNav h-14=56px), all action buttons go here ─
const ACTION_BOTTOM = 56;

// ─── Malaya Post Overlay ──────────────────────────────────────────────────────
function MalayaBottomAction({ post, myProfile, isRevealed, onReveal }: { post: TikPost; myProfile: any; isRevealed: boolean; onReveal: () => void }) {
  const isFree = (post as any).is_free !== false || !(post as any).price || (post as any).price <= 0;
  const phone = (post as any).phone || '';
  const whatsapp = (post as any).whatsapp || '';
  const formatWA = (num: string) => { const d = num.replace(/\D/g, ''); if (d.startsWith('0') && d.length >= 9) return '255' + d.slice(1); if (d.startsWith('255')) return d; return d; };
  if (isRevealed || isFree) {
    return (
      <div data-overlay="true" className="absolute left-3 right-14 z-20 flex gap-2" style={{ bottom: ACTION_BOTTOM }} onClick={e => e.stopPropagation()}>
        {phone && (
          <a href={`tel:${phone}`} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm" style={{ background: 'linear-gradient(135deg,#1565C0,#1976D2)', color: 'white' }}>
            <span>📞</span><span className="truncate">{phone}</span>
          </a>
        )}
        {whatsapp && (
          <button onClick={() => window.open(`https://wa.me/${formatWA(whatsapp)}?text=Habari`, '_blank')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm"
            style={{ background: 'linear-gradient(135deg,#1B5E20,#2E7D32)', color: 'white' }}>
            <span>💬</span><span className="truncate">{whatsapp}</span>
          </button>
        )}
        {!phone && !whatsapp && <p className="text-gray-400 text-xs text-center flex-1 py-2">Namba haijaongezwa</p>}
      </div>
    );
  }
  return (
    <div data-overlay="true" className="absolute left-3 right-14 z-20" style={{ bottom: ACTION_BOTTOM }} onClick={e => e.stopPropagation()}>
      <button onClick={onReveal}
        className="w-full gradient-pink text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
        {isFree ? '📞 Ona Namba ya Simu (BURE)' : `🔒 Lipia TZS ${(post as any).price?.toLocaleString()} - Ona Namba`}
      </button>
    </div>
  );
}

// ─── Live Post Overlay ───────────────────────────────────────────────────────
function LiveBottomAction({ post, myProfile, isUnlocked, onJoin }: { post: TikPost; myProfile: any; isUnlocked: boolean; onJoin: () => void }) {
  const price = (post as any).price || 0;
  const isFree = price <= 0;
  const isOnline = (post as any).is_online !== false;
  const type = (post as any).live_type || (post as any).call_type || (post as any).live_type2 || '';
  const postWhatsapp = (post as any).whatsapp || '';
  const postPhone = (post as any).phone || '';
  const postLink = (post as any).link || '';
  const isVideoCall = type === 'video_call' || (postWhatsapp && !postLink && !post.title?.toLowerCase().includes('live room'));
  const formatWA = (num: string) => { const d = num.replace(/\D/g, ''); if (d.startsWith('0') && d.length >= 9) return '255' + d.slice(1); if (d.startsWith('255')) return d; return d; };

  const handleVideoCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (postWhatsapp) window.open(`https://wa.me/${formatWA(postWhatsapp)}?text=Nataka video call`, '_blank');
    else if (postPhone) window.open(`https://wa.me/${formatWA(postPhone)}?text=Nataka video call`, '_blank');
    else onJoin();
  };

  return (
    <div data-overlay="true" className="absolute left-3 right-14 z-20" style={{ bottom: ACTION_BOTTOM }} onClick={e => e.stopPropagation()}>
      {isVideoCall ? (
        <button onClick={handleVideoCall}
          className="w-full gradient-pink text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
          <span>📞</span> Piga video call sasa
          {!isFree && !isUnlocked && <span className="text-white/70 text-xs ml-1">TZS {price.toLocaleString()}</span>}
        </button>
      ) : isOnline ? (
        <button onClick={onJoin}
          className="w-full gradient-pink text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          🔴 Ingia Live Room
          {!isFree && !isUnlocked && <span className="text-white/70 text-xs ml-1">TZS {price.toLocaleString()}</span>}
          {(isFree || isUnlocked) && <span className="text-green-300 text-xs">BURE</span>}
        </button>
      ) : (
        <div className="w-full bg-gray-700/80 text-gray-300 font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-400" /> Nje ya Mtandao
        </div>
      )}
    </div>
  );
}

// ─── Services Post Overlay ────────────────────────────────────────────────────
function ServicesBottomAction({ post, myProfile, onBuy, onGetFree }: { post: TikPost; myProfile: any; onBuy: () => void; onGetFree: () => void }) {
  const price = (post as any).price || 0;
  const isFree = price <= 0;
  return (
    <div data-overlay="true" className="absolute left-3 right-14 z-20" style={{ bottom: ACTION_BOTTOM }} onClick={e => e.stopPropagation()}>
      {isFree ? (
        <button onClick={onGetFree}
          className="w-full gradient-pink text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
          <span>🎁</span> Pata Huduma Sasa
        </button>
      ) : (
        <button onClick={onBuy}
          className="w-full gradient-pink text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
          <span>💳</span> Lipia Sasa - TZS {price.toLocaleString()}
        </button>
      )}
    </div>
  );
}

// ─── Paid Video Bottom Card ───────────────────────────────────────────────────
function VideoPayBottomAction({ post, onPay, isUnlocked }: { post: TikPost; myProfile: any; onPay: () => void; isUnlocked: boolean }) {
  if (isUnlocked) return null;
  const price = (post as any).price || 0;
  return (
    <div data-overlay="true" className="absolute left-3 right-14 z-20" style={{ bottom: ACTION_BOTTOM }} onClick={e => e.stopPropagation()}>
      <button onClick={onPay}
        className="w-full gradient-pink text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
        🔒 Lipia TZS {price.toLocaleString()} - Fungua Video
      </button>
    </div>
  );
}

// ─── Single Video Feed Item ───────────────────────────────────────────────────
export function FeedItem({
  post, isActive, onNext, onPrev, myProfile, onOpenProfile, saveData, autoSwap,
}: {
  post: TikPost; isActive: boolean; onNext: () => void; onPrev: () => void;
  myProfile: any; onOpenProfile: (uid: string) => void; saveData: boolean; autoSwap?: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [showVipForShare, setShowVipForShare] = useState(false);
  const [settings, setSettings] = useState<any>({});
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true); // start muted for autoplay policy
  const [showPayModal, setShowPayModal] = useState(false);
  const [showGiftVideoChoice, setShowGiftVideoChoice] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [malayaRevealed, setMalayaRevealed] = useState(false);
  const [liveUnlocked, setLiveUnlocked] = useState(false);
  const [showLivePayModal, setShowLivePayModal] = useState(false);
  const [showServicePayModal, setShowServicePayModal] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);

  // Determine post type
  const postType = (post as any).type || 'video';
  const postSource = (post as any).source || 'home';
  const isFromTiksexy = postSource === 'tiksexy';
  const isMalayaPost = postType === 'malaya';
  const isLivePost = postType === 'live' || postType === 'live_room' || postType === 'video_call';
  const isServicesPost = postType === 'services' || postType === 'admin_service';
  const isVideoPost = !isMalayaPost && !isLivePost && !isServicesPost;

  const isFreePost = (post as any).is_free !== false || !(post as any).price || (post as any).price <= 0;
  const isVipUser = myProfile?.is_vip || myProfile?.is_admin;
  // For video posts from HOME (not tiksexy source): locked = heavy blur overlay + still plays
  const isLockedForUser = isVideoPost && !isFromTiksexy && !isFreePost && !isVipUser && !unlocked;

  // Live badge
  const isLive = (post as any).is_online === true;

  useEffect(() => {
    if (!user || isFreePost || isVipUser) return;
    if (isVideoPost) {
      supabase.from('user_unlocked_content').select('id').eq('user_id', user.id).eq('content_id', post.id).maybeSingle()
        .then(({ data }) => { if (data) setUnlocked(true); });
    }
    if (isMalayaPost) {
      if (isFreePost || isVipUser) { setMalayaRevealed(true); return; }
      supabase.from('user_unlocked_content').select('id').eq('user_id', user.id).eq('content_id', post.id).maybeSingle()
        .then(({ data }) => { if (data) setMalayaRevealed(true); });
    }
    if (isLivePost) {
      if (isFreePost || isVipUser) { setLiveUnlocked(true); return; }
      supabase.from('user_unlocked_content').select('id').eq('user_id', user.id).eq('content_id', post.id).eq('content_type', 'live').maybeSingle()
        .then(({ data }) => { if (data) setLiveUnlocked(true); });
    }
  }, [user?.id, post.id]);

  async function handlePayForPost() {
    if (!user || !myProfile) { navigate('/login'); return; }
    const price = (post as any).price || 0;
    const bal = myProfile.balance || 0;
    if (bal < price) { toast.error(`Salio halitooshi. Unahitaji TZS ${price.toLocaleString()}`); return; }
    const { error } = await supabase.from('user_profiles').update({ balance: bal - price }).eq('id', user.id);
    if (error) { toast.error('Hitilafu ya malipo'); return; }
    await supabase.from('user_unlocked_content').upsert({
      user_id: user.id, content_id: post.id, content_type: (post as any).type || 'video', amount_paid: price
    }, { onConflict: 'user_id,content_id' });
    if (post.uploader_id && post.uploader_id !== user.id) {
      const { data: uProf } = await supabase.from('user_profiles').select('balance,is_business').eq('id', post.uploader_id).single();
      if (uProf?.is_business) {
        await supabase.from('user_profiles').update({ balance: (uProf.balance || 0) + price }).eq('id', post.uploader_id);
        const saleType = (post as any).type === 'malaya' ? 'malaya_sale' : 'video_sale';
        await supabase.from('transactions').insert({ user_id: post.uploader_id, amount: price, type: saleType, status: 'approved', description: `Mapato TikSexy: ${post.title}` });
        await supabase.from('notifications').insert({ user_id: post.uploader_id, title: '💰 Pesa Imeingia!', message: `TZS ${price.toLocaleString()} kutoka kwa mtu alinunua content yako (TikSexy)`, type: 'sale' });
      }
    }
    await supabase.from('transactions').insert({ user_id: user.id, amount: price, type: 'video_purchase', status: 'approved', description: `TikSexy: ${post.title}` });
    setUnlocked(true);
    setShowPayModal(false);
    toast.success(`✅ Imefunguliwa!`);
  }

  async function handleMalayaReveal() {
    if (!user) { navigate('/login'); return; }
    if (isFreePost || isVipUser) { setMalayaRevealed(true); return; }
    if (!myProfile) { navigate('/login'); return; }
    // Check gift malaya credits first
    const giftMalayaCredits = parseInt(localStorage.getItem(`gift_malaya_credits_${user.id}`) || '0');
    if (giftMalayaCredits > 0) {
      const newCreds = Math.max(0, giftMalayaCredits - 1);
      try { localStorage.setItem(`gift_malaya_credits_${user.id}`, String(newCreds)); } catch {}
      await supabase.from('user_unlocked_content').upsert({ user_id: user.id, content_id: post.id, content_type: 'malaya', amount_paid: 0 }, { onConflict: 'user_id,content_id' });
      setMalayaRevealed(true);
      toast.success(`✅ Namba imefunguliwa! (Gift credits zilizobaki: ${newCreds})`);
      return;
    }
    const price = (post as any).price || 0;
    const bal = myProfile.balance || 0;
    if (bal < price) { toast.error(`Salio halitooshi. Unahitaji TZS ${price.toLocaleString()}`); return; }
    const { error } = await supabase.from('user_profiles').update({ balance: bal - price }).eq('id', user.id);
    if (error) { toast.error('Hitilafu ya malipo'); return; }
    await supabase.from('user_unlocked_content').upsert({ user_id: user.id, content_id: post.id, content_type: 'malaya', amount_paid: price }, { onConflict: 'user_id,content_id' });
    if (post.uploader_id && post.uploader_id !== user.id) {
      const { data: uProf } = await supabase.from('user_profiles').select('balance,is_business').eq('id', post.uploader_id).single();
      if (uProf?.is_business) {
        await supabase.from('user_profiles').update({ balance: (uProf.balance || 0) + price }).eq('id', post.uploader_id);
        await supabase.from('transactions').insert({ user_id: post.uploader_id, amount: price, type: 'malaya_sale', status: 'approved', description: `Mapato Malaya TikSexy: ${post.title}` });
        await supabase.from('notifications').insert({ user_id: post.uploader_id, title: '💰 Pesa Imeingia!', message: `TZS ${price.toLocaleString()} kutoka kwa mtu aliyeona namba yako (TikSexy)`, type: 'sale' });
      }
    }
    await supabase.from('transactions').insert({ user_id: user.id, amount: price, type: 'phone_view', status: 'approved', description: `Ona Namba TikSexy: ${post.title}` });
    setMalayaRevealed(true);
    toast.success(`✅ Namba imefunguliwa!`);
  }

  async function handleLiveJoin() {
    if (!user) { navigate('/login'); return; }
    const price = (post as any).price || 0;
    const isFree = price <= 0;
    // Check gift live credits first
    if (!isFree && !isVipUser && !liveUnlocked) {
      const giftLiveCredits = parseInt(localStorage.getItem(`gift_live_credits_${user.id}`) || '0');
      if (giftLiveCredits > 0) {
        const newCreds = Math.max(0, giftLiveCredits - 1);
        try { localStorage.setItem(`gift_live_credits_${user.id}`, String(newCreds)); } catch {}
        await supabase.from('user_unlocked_content').upsert({ user_id: user.id, content_id: post.id, content_type: 'live', amount_paid: 0 }, { onConflict: 'user_id,content_id' });
        setLiveUnlocked(true);
        toast.success(`✅ Umeingia! (Gift credits zilizobaki: ${newCreds})`);
        const link = (post as any).link || '';
        if (link) { let l = link.trim(); if (!/^https?:\/\//i.test(l)) l = 'https://' + l; window.open(l, '_blank'); }
        else if ((post as any).whatsapp) window.open(`https://wa.me/${(post as any).whatsapp.replace(/\D/g,'')}`,'_blank');
        else toast.info('Link haipatikani');
        return;
      }
    }
    if (isFree || isVipUser || liveUnlocked) {
      const link = (post as any).link || '';
      if (link) { let l = link.trim(); if (!/^https?:\/\//i.test(l)) l = 'https://' + l; window.open(l, '_blank'); }
      else if ((post as any).whatsapp) window.open(`https://wa.me/${(post as any).whatsapp.replace(/\D/g,'')}`,'_blank');
      else toast.info('Link haipatikani');
      return;
    }
    if (!myProfile) { navigate('/login'); return; }
    setShowLivePayModal(true);
  }

  async function confirmLiveJoin() {
    if (!user || !myProfile) return;
    const price = (post as any).price || 0;
    const bal = myProfile.balance || 0;
    if (bal < price) { toast.error(`Salio halitooshi. Unahitaji TZS ${price.toLocaleString()}`); return; }
    const { error } = await supabase.from('user_profiles').update({ balance: bal - price }).eq('id', user.id);
    if (error) { toast.error('Hitilafu ya malipo'); return; }
    await supabase.from('user_unlocked_content').upsert({ user_id: user.id, content_id: post.id, content_type: 'live', amount_paid: price }, { onConflict: 'user_id,content_id' });
    if (post.uploader_id && post.uploader_id !== user.id) {
      const { data: uProf } = await supabase.from('user_profiles').select('balance,is_business').eq('id', post.uploader_id).single();
      if (uProf?.is_business) {
        await supabase.from('user_profiles').update({ balance: (uProf.balance || 0) + price }).eq('id', post.uploader_id);
        await supabase.from('transactions').insert({ user_id: post.uploader_id, amount: price, type: 'live_sale', status: 'approved', description: `Mapato Live TikSexy: ${post.title}` });
      }
    }
    await supabase.from('transactions').insert({ user_id: user.id, amount: price, type: 'live_room', status: 'approved', description: `Live TikSexy: ${post.title}` });
    setLiveUnlocked(true); setShowLivePayModal(false);
    toast.success(`✅ Umeingia! TZS ${price.toLocaleString()} imekatwa.`);
    const link = (post as any).link || '';
    if (link) { let l = link.trim(); if (!/^https?:\/\//i.test(l)) l = 'https://' + l; window.open(l, '_blank'); }
    else if ((post as any).whatsapp) window.open(`https://wa.me/${(post as any).whatsapp.replace(/\D/g,'')}`,'_blank');
  }

  async function handleServiceBuy() {
    if (!user) { navigate('/login'); return; }
    if (!myProfile) { navigate('/login'); return; }
    const price = (post as any).price || 0;
    if (price <= 0) {
      const actionLink = (post as any).action_link || '';
      if (actionLink) { let l = actionLink.trim(); if (!/^https?:\/\//i.test(l)) l = 'https://' + l; window.open(l, '_blank'); }
      return;
    }
    setShowServicePayModal(true);
  }

  async function confirmServiceBuy() {
    if (!user || !myProfile) return;
    const price = (post as any).price || 0;
    const bal = myProfile.balance || 0;
    if (bal < price) { toast.error(`Salio halitooshi. Unahitaji TZS ${price.toLocaleString()}`); return; }
    const { error } = await supabase.from('user_profiles').update({ balance: bal - price }).eq('id', user.id);
    if (error) { toast.error('Hitilafu ya malipo'); return; }
    await supabase.from('transactions').insert({ user_id: user.id, amount: price, type: 'admin_service', status: 'approved', description: `Huduma TikSexy: ${post.title}` });
    const { data: adminProf } = await supabase.from('user_profiles').select('id').eq('is_admin', true).limit(1).single();
    if (adminProf) {
      await supabase.from('notifications').insert({ user_id: (adminProf as any).id, title: '💰 Huduma Imelipwa!', message: `${myProfile.username} amelipa TZS ${price.toLocaleString()} kwa ${post.title}`, type: 'payment_request' });
    }
    const actionLink = (post as any).action_link || '';
    setShowServicePayModal(false);
    toast.success(`✅ Umelipa TZS ${price.toLocaleString()}!`);
    if (actionLink) { let l = actionLink.trim(); if (!/^https?:\/\//i.test(l)) l = 'https://' + l; window.open(l, '_blank'); }
  }

  useEffect(() => {
    supabase.from('app_settings').select('*').then(({ data }) => {
      const m: any = {}; (data || []).forEach((r: any) => { m[r.key] = r.value; }); setSettings(m);
    });
  }, []);

  const [following, setFollowing] = useState(false);
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const touchStart = useRef<{ y: number; t: number } | null>(null);
  const cacheStarted = useRef(false);
  const viewedRef = useRef(false);
  const autoSwapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playAttemptRef = useRef(0);

  const mediaUrl = post.media_url || post.media_urls?.[0] || '';
  const isVideo = isVideoFile(mediaUrl);
  const thumb = post.thumbnail_url;

  useEffect(() => {
    if (!isActive || isVideo || !autoSwap) return;
    autoSwapTimer.current = setTimeout(() => { onNext(); }, 5000);
    return () => { if (autoSwapTimer.current) clearTimeout(autoSwapTimer.current); };
  }, [isActive, isVideo, autoSwap]);

  useEffect(() => {
    supabase.from('tik_likes').select('id', { count: 'exact', head: true }).eq('post_id', post.id)
      .then(({ count }) => setLikeCount(count || 0));
    supabase.from('room_messages').select('id', { count: 'exact', head: true }).eq('reply_to', post.id as any).is('is_deleted', false)
      .then(({ count }) => setCommentCount(count || 0));
    if (user) {
      supabase.from('tik_likes').select('id').eq('post_id', post.id).eq('user_id', user.id).maybeSingle()
        .then(({ data }) => setLiked(!!data));
      supabase.from('saved_items').select('id').eq('user_id', user.id).eq('content_id', post.id).maybeSingle()
        .then(({ data }) => setSaved(!!data));
      if (post.uploader_id) {
        supabase.from('tik_follows').select('id').eq('follower_id', user.id).eq('following_id', post.uploader_id).maybeSingle()
          .then(({ data }) => setFollowing(!!data));
      }
    }
  }, [post.id, user?.id]);

  useEffect(() => {
    if (!isActive || !isVideo || !mediaUrl || cacheStarted.current || saveData) return;
    cacheStarted.current = true;
    videoCache.get(mediaUrl).then(cached => {
      if (cached) { setCachedUrl(cached); return; }
      setTimeout(() => { videoCache.put(mediaUrl).then(url => { if (url) setCachedUrl(url); }); }, 1500);
    });
  }, [isActive, isVideo, mediaUrl, saveData]);

  useEffect(() => {
    if (isActive && !viewedRef.current) {
      viewedRef.current = true;
      markVideoViewed(post.id);
      supabase.from('content_posts').update({ views: (post.views || 0) + 1 }).eq('id', post.id).then(() => {});
    }
  }, [isActive]);

  const effectiveUrl = cachedUrl || mediaUrl;

  // ── Audio playback for posts with audio_url (like TikTok music) ─────────────
  const audioUrlRef = useRef<string>((post as any).audio_url || '');
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audioUrl = (post as any).audio_url;
    if (!audioUrl || !isActive) {
      if (bgAudioRef.current) { bgAudioRef.current.pause(); bgAudioRef.current = null; }
      return;
    }
    if (bgAudioRef.current) {
      bgAudioRef.current.pause();
      bgAudioRef.current = null;
    }
    const audio = new Audio(audioUrl);
    audio.loop = true;
    audio.volume = 0.85;
    bgAudioRef.current = audio;
    audio.play().catch(() => {
      // autoplay blocked - will play on next user interaction
    });
    return () => {
      audio.pause();
      bgAudioRef.current = null;
    };
  }, [isActive, (post as any).audio_url]);

  // When video is muted, unmute bg audio and vice versa
  useEffect(() => {
    if (!bgAudioRef.current) return;
    if (isActive && !saveData) {
      if (!bgAudioRef.current.paused) return;
      bgAudioRef.current.play().catch(() => {});
    } else {
      bgAudioRef.current.pause();
    }
  }, [isActive, saveData, muted]);

  // ── Video play/pause with sound management ────────────────────────────────
  useEffect(() => {
    if (!videoRef.current || !isVideo) return;
    const vid = videoRef.current;
    const attempt = ++playAttemptRef.current;

    if (!isActive || saveData) {
      vid.pause();
      if (!isActive) { vid.currentTime = 0; setPlaying(false); setMuted(true); }
      return;
    }

    const tryPlay = async () => {
      if (attempt !== playAttemptRef.current) return;
      // First try with audio (works if user has interacted with page before)
      vid.muted = false;
      vid.volume = 1.0;
      try {
        await vid.play();
        if (attempt === playAttemptRef.current) { setPlaying(true); setMuted(false); }
        return;
      } catch {
        // Autoplay blocked with audio - try muted autoplay
      }
      // Fallback: muted autoplay
      try {
        vid.muted = true;
        await vid.play();
        if (attempt === playAttemptRef.current) { setPlaying(true); setMuted(true); }
      } catch { setPlaying(false); }
    };
    tryPlay();
  }, [isActive, isVideo, saveData, effectiveUrl]);

  function formatDur(s: number) {
    if (!s || isNaN(s)) return '';
    const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // Handle unmute - called after user gesture
  const handleUnmute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const vid = videoRef.current;
    vid.muted = false;
    vid.volume = 1.0;
    setMuted(false);
    setUserInteracted(true);
    // Resume play if paused
    if (vid.paused) vid.play().catch(() => {});
  };

  const handleTap = (e: React.MouseEvent) => {
      // Simple tap: if video playing, toggle play/pause. No mute overlay needed.
      if ((e.target as HTMLElement).closest('[data-overlay]')) return;
      if (!isVideo || !videoRef.current) return;
      const vid = videoRef.current;
      if (vid.paused) {
        // Always try to play with sound after user tap (user interaction allows unmuted)
        vid.muted = false; vid.volume = 1.0;
        vid.play().then(() => { setPlaying(true); setMuted(false); }).catch(() => {
          // Browser blocked unmuted - fall back to muted
          vid.muted = true;
          vid.play().then(() => { setPlaying(true); setMuted(true); }).catch(() => {});
        });
      } else {
        vid.pause();
        setPlaying(false);
      }
  };

  const handleTouchStart = (e: React.TouchEvent) => { touchStart.current = { y: e.touches[0].clientY, t: Date.now() }; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const dt = Date.now() - touchStart.current.t;
    if (Math.abs(dy) > 50 && dt < 400) { if (dy < 0) onNext(); else onPrev(); }
    touchStart.current = null;
  };

  async function handleLike() {
    if (!user) { navigate('/login'); return; }
    if (liked) {
      setLiked(false); setLikeCount(c => Math.max(0, c - 1));
      await supabase.from('tik_likes').delete().eq('user_id', user.id).eq('post_id', post.id);
    } else {
      setLiked(true); setLikeCount(c => c + 1);
      await supabase.from('tik_likes').insert({ user_id: user.id, post_id: post.id });
      if (post.uploader_id && post.uploader_id !== user.id) {
        await supabase.from('notifications').insert({ user_id: post.uploader_id, title: '❤️ Like Mpya', message: `${myProfile?.username || 'Mtu'} amependa video yako`, type: 'like' });
      }
    }
  }

  async function handleFollow() {
    if (!user || !post.uploader_id) { navigate('/login'); return; }
    if (following) {
      setFollowing(false);
      await supabase.from('tik_follows').delete().eq('follower_id', user.id).eq('following_id', post.uploader_id);
    } else {
      setFollowing(true);
      await supabase.from('tik_follows').insert({ follower_id: user.id, following_id: post.uploader_id });
      await supabase.from('notifications').insert({ user_id: post.uploader_id, title: '👤 Mfuasi Mpya', message: `${myProfile?.username || 'Mtu'} amekufuata`, type: 'follow' });
    }
  }

  async function handleSave() {
    if (!user) return;
    if (saved) { setSaved(false); return; }
    await supabase.from('saved_items').insert({ user_id: user.id, content_id: post.id, content_type: post.type, content_url: post.media_url, content_name: post.title, thumbnail_url: post.thumbnail_url });
    setSaved(true); toast.success('✅ Imehifadhiwa!');
  }

  async function handleDownload() {
    if (!user) { navigate('/login'); return; }
    // Check gift download credits first
    const giftDownloadCredits = parseInt(localStorage.getItem(`gift_download_credits_${user.id}`) || '0');
    const isPrivileged = myProfile?.is_vip || myProfile?.is_business || myProfile?.is_admin;
    if (!isPrivileged && giftDownloadCredits <= 0) {
      toast.info('Unahitaji VIP, Business Account au Gift Download Credit kupakua!');
      return;
    }
    // Always use original mediaUrl (not cached blob URL) for type detection and download.
    // Blob URLs (blob:https://...) have no file extension so isVideoFile() returns false on them.
    const dlUrl = mediaUrl || effectiveUrl;
    if (!dlUrl) { toast.error('Hakuna media ya kupakua'); return; }
    const isVid = isVideoFile(dlUrl);
    const ext = isVid
      ? (dlUrl.match(/\.(mp4|webm|mov|avi|mkv|3gp|m4v)/i)?.[1] || 'mp4')
      : (dlUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1] || 'jpg');
    const dlName = (post.title || (isVid ? 'video' : 'picha')) + '.' + ext;
    await triggerDownload({ url: dlUrl, name: dlName, type: isVid ? 'video' : 'image', userId: user.id, thumbUrl: post.thumbnail_url || undefined });
    if (!isPrivileged && giftDownloadCredits > 0) {
      const newCreds = Math.max(0, giftDownloadCredits - 1);
      try { localStorage.setItem(`gift_download_credits_${user.id}`, String(newCreds)); } catch {}
      toast.success('⬇️ Download imeanza! (Gift credits zilizobaki: ' + newCreds + ')');
    } else {
      toast.success('⬇️ Download imeanza!');
    }
  }

  async function handleShare() {
    // No VIP required - everyone can share
    const postType = (post as any).type || 'video';
    let shareUrl = '';
    if (postType === 'malaya') {
      shareUrl = `${window.location.origin}/malaya?post=${post.id}`;
    } else if (postType === 'video') {
      shareUrl = `${window.location.origin}/video?post=${post.id}`;
    } else {
      shareUrl = `${window.location.origin}/tiksexy?post=${post.id}`;
    }
    // Build og-meta URL for WhatsApp/social preview
    const ogUrl = `${window.location.origin}/og-meta?id=${post.id}&type=${postType}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: post.title || 'TikSexy',
          text: post.title ? `${post.title} - TikSexy` : 'Angalia hii kwenye TikSexy!',
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('🔗 Link imenakiliwa!');
      }
    } catch {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('🔗 Link imenakiliwa!');
      } catch {
        toast.info(`Link: ${shareUrl}`);
      }
    }
  }

  const overlayHidden = showComments || showGiftModal;
  const isOwn = user?.id === post.uploader_id;
  const showOverlay = !overlayHidden && !saveData;

  // Bottom info bottom padding: needs to clear the action button (44px) + gap (8px) + action_bottom (56px) = 108px
  // But only when there IS an action button for this post type
  const hasActionButton = (isMalayaPost || isLivePost || isServicesPost || isLockedForUser) && !isFromTiksexy;
  const bottomInfoPadding = hasActionButton ? 108 : 58;

  return (
    <div className="relative w-full h-full bg-black select-none"
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onClick={handleTap}>

      {/* Media */}
      {isVideo ? (
        <video ref={videoRef} src={effectiveUrl}
          className="absolute inset-0 w-full h-full object-cover"
          style={isLockedForUser ? { filter: 'blur(22px)', transform: 'scale(1.12)' } : {}}
          loop={!autoSwap} playsInline preload="auto" poster={thumb}
          onLoadedMetadata={e => setVideoDuration((e.target as HTMLVideoElement).duration)}
          onCanPlay={() => {
            const vid = videoRef.current;
            if (isActive && !saveData && vid?.paused) {
              // Try unmuted, fallback to muted
              vid.muted = false; vid.volume = 1.0;
              vid.play().then(() => { setPlaying(true); setMuted(false); }).catch(() => {
                if (vid) {
                  vid.muted = true;
                  vid.play().then(() => { setPlaying(true); setMuted(true); }).catch(() => {});
                }
              });
            }
          }}
          onEnded={() => { if (autoSwap) onNext(); }}
          onTimeUpdate={e => {
            const v = e.target as HTMLVideoElement;
            if (v.duration) setVideoProgress(v.currentTime / v.duration * 100);
          }} />
      ) : (
        <img src={mediaUrl || thumb} alt={post.title}
          className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* LOCKED VIDEO: heavy blur overlay with price label */}
      {isLockedForUser && isVideo && (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="bg-black/70 rounded-2xl px-5 py-4 text-center border border-primary/30">
            <div className="text-3xl mb-1">🔒</div>
            <p className="text-white font-black text-base">TZS {((post as any).price || 0).toLocaleString()}</p>
            <p className="text-white/60 text-xs mt-0.5">Gonga kulipa kufungua</p>
          </div>
        </div>
      )}

      {/* Persistent mute button - REMOVED, tap to play/pause directly */}
      {/* Volume icon REMOVED as requested */}

      {/* VIDEO: locked bottom pay card */}
      {isVideoPost && isLockedForUser && showOverlay && (
        <VideoPayBottomAction post={post} myProfile={myProfile} onPay={() => {
            if (!user) { navigate('/login'); return; }
            // Check gift video credits first
            const giftCreds = parseInt(localStorage.getItem(`gift_video_credits_${user.id}`) || '0');
            if (giftCreds > 0) { setShowGiftVideoChoice(true); }
            else { setShowPayModal(true); }
          }} isUnlocked={unlocked} />
      )}

      {/* VIDEO: Gift choice modal */}
      {showGiftVideoChoice && isVideoPost && (() => {
        const creds = user ? parseInt(localStorage.getItem(`gift_video_credits_${user.id}`) || '0') : 0;
        const price = (post as any).price || 0;
        return (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/85" data-overlay="true" onClick={e => e.stopPropagation()}>
            <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 w-full max-w-xs">
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">🎁</div>
                <h3 className="text-white font-black text-lg line-clamp-2">{post.title || 'Video'}</h3>
                <p className="text-gray-400 text-sm">Chagua jinsi ya kufungua</p>
              </div>
              <button onClick={async () => {
                const newCreds = Math.max(0, creds - 1);
                try { localStorage.setItem(`gift_video_credits_${user!.id}`, String(newCreds)); } catch {}
                await supabase.from('user_unlocked_content').upsert({ user_id: user!.id, content_id: post.id, content_type: 'video', amount_paid: 0 }, { onConflict: 'user_id,content_id' });
                setUnlocked(true); setShowGiftVideoChoice(false);
                toast.success(`✅ Video imefunguliwa! (Gift credits zilizobaki: ${newCreds})`);
                // Auto-play: ensure video element plays immediately
                setTimeout(() => {
                  const vid = videoRef.current;
                  if (vid) {
                    vid.muted = false; vid.volume = 1.0;
                    vid.play().then(() => { setPlaying(true); setMuted(false); }).catch(() => {
                      vid.muted = true;
                      vid.play().then(() => { setPlaying(true); setMuted(true); }).catch(() => {});
                    });
                  }
                }, 150);
              }} className="w-full py-3.5 rounded-xl text-white font-black text-sm mb-3 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                🎁 Tumia Gift Credits ({creds} zilizobaki)
              </button>
              <button onClick={() => { setShowGiftVideoChoice(false); setShowPayModal(true); }}
                className="w-full py-3.5 rounded-xl gradient-pink text-white font-black text-sm flex items-center justify-center gap-2">
                💰 Lipia kwa Salio (TZS {price.toLocaleString()})
              </button>
              <button onClick={() => setShowGiftVideoChoice(false)} className="w-full mt-2 py-2 text-gray-400 text-sm">Ghairi</button>
            </div>
          </div>
        );
      })()}

      {/* VIDEO: Pay confirmation modal */}
      {showPayModal && isVideoPost && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/85" data-overlay="true" onClick={e => e.stopPropagation()}>
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 w-full max-w-xs">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🎬</div>
              <h3 className="text-white font-black text-lg line-clamp-2">{post.title || 'Content'}</h3>
              <p className="text-primary font-black text-2xl mt-1">TZS {((post as any).price || 0).toLocaleString()}</p>
            </div>
            <div className="bg-[#1a0a1a] rounded-xl p-3 mb-4 flex justify-between items-center">
              <span className="text-gray-400 text-sm">Salio lako:</span>
              <span className={`font-bold ${(myProfile?.balance || 0) >= ((post as any).price || 0) ? 'text-green-400' : 'text-red-400'}`}>
                TZS {(myProfile?.balance || 0).toLocaleString()}
              </span>
            </div>
            <p className="text-gray-400 text-xs text-center mb-4">Itafunguliwa mara moja na ibaki bure daima</p>
            <div className="flex gap-2">
              <button onClick={() => setShowPayModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-400 text-sm font-semibold">Ghairi</button>
              <button onClick={handlePayForPost} disabled={(myProfile?.balance || 0) < ((post as any).price || 0)}
                className="flex-1 py-2.5 rounded-xl gradient-pink text-white text-sm font-black disabled:opacity-40">
                ✅ Lipia
              </button>
            </div>
            {(myProfile?.balance || 0) < ((post as any).price || 0) && (
              <button onClick={() => navigate('/wallet')} className="w-full mt-2 py-2 text-primary text-sm font-semibold text-center">
                + Ongeza Pesa kwenye Wallet
              </button>
            )}
          </div>
        </div>
      )}

      {/* LIVE: Pay modal */}
      {showLivePayModal && isLivePost && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/85" data-overlay="true" onClick={e => e.stopPropagation()}>
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 w-full max-w-xs">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🔴</div>
              <h3 className="text-white font-black text-lg">{post.title || 'Live Room'}</h3>
              <p className="text-primary font-black text-2xl mt-1">TZS {((post as any).price || 0).toLocaleString()}</p>
            </div>
            <div className="bg-[#1a0a1a] rounded-xl p-3 mb-4 flex justify-between">
              <span className="text-gray-400 text-sm">Salio lako:</span>
              <span className={`font-bold ${(myProfile?.balance || 0) >= ((post as any).price || 0) ? 'text-green-400' : 'text-red-400'}`}>TZS {(myProfile?.balance || 0).toLocaleString()}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowLivePayModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-400 text-sm font-semibold">Ghairi</button>
              <button onClick={confirmLiveJoin} disabled={(myProfile?.balance || 0) < ((post as any).price || 0)}
                className="flex-1 py-2.5 rounded-xl gradient-pink text-white text-sm font-black disabled:opacity-40">
                ✅ Ingia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SERVICES: Pay modal */}
      {showServicePayModal && isServicesPost && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/85" data-overlay="true" onClick={e => e.stopPropagation()}>
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 w-full max-w-xs">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">💋</div>
              <h3 className="text-white font-black text-lg">{post.title}</h3>
              <p className="text-primary font-black text-2xl mt-1">TZS {((post as any).price || 0).toLocaleString()}</p>
            </div>
            <div className="bg-[#1a0a1a] rounded-xl p-3 mb-4 flex justify-between">
              <span className="text-gray-400 text-sm">Salio lako:</span>
              <span className={`font-bold ${(myProfile?.balance || 0) >= ((post as any).price || 0) ? 'text-green-400' : 'text-red-400'}`}>TZS {(myProfile?.balance || 0).toLocaleString()}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowServicePayModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-400 text-sm font-semibold">Ghairi</button>
              <button onClick={confirmServiceBuy} disabled={(myProfile?.balance || 0) < ((post as any).price || 0)}
                className="flex-1 py-2.5 rounded-xl gradient-pink text-white text-sm font-black disabled:opacity-40">
                ✅ Lipa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save data overlay */}
      {saveData && isActive && !playing && isVideo && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />
          <button className="relative w-20 h-20 rounded-full bg-black/70 flex items-center justify-center border-2 border-white/30"
            data-overlay="true"
            onClick={e => { e.stopPropagation(); if (videoRef.current) { videoRef.current.play().then(() => setPlaying(true)).catch(() => {}); } }}>
            <WifiOff className="w-4 h-4 text-yellow-400 absolute top-2 right-2" />
            <Play className="w-8 h-8 text-white ml-1" fill="white" />
          </button>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 28%, transparent 55%, rgba(0,0,0,0.1) 100%)' }} />

      {/* Gift credit badges on malaya locked posts */}
      {isMalayaPost && !isFreePost && !isVipUser && !malayaRevealed && user && (() => {
        const creds = parseInt(localStorage.getItem(`gift_malaya_credits_${user.id}`) || '0');
        return creds > 0 ? (
          <div className="absolute top-14 left-3 z-20 flex items-center gap-1 bg-orange-500/90 px-2 py-1 rounded-full pointer-events-none">
            <span className="text-white text-[10px] font-black">🎁 {creds} credits</span>
          </div>
        ) : null;
      })()}

      {/* Gift credit badges on video locked posts */}
      {isVideoPost && isLockedForUser && user && (() => {
        const creds = parseInt(localStorage.getItem(`gift_video_credits_${user.id}`) || '0');
        return creds > 0 ? (
          <div className="absolute top-14 left-3 z-20 flex items-center gap-1 bg-orange-500/90 px-2 py-1 rounded-full pointer-events-none">
            <span className="text-white text-[10px] font-black">🎁 {creds} credits</span>
          </div>
        ) : null;
      })()}

      {/* Gift credit badges on live locked posts */}
      {isLivePost && !isFreePost && !isVipUser && !liveUnlocked && user && (() => {
        const creds = parseInt(localStorage.getItem(`gift_live_credits_${user.id}`) || '0');
        return creds > 0 ? (
          <div className="absolute top-14 left-3 z-20 flex items-center gap-1 bg-orange-500/90 px-2 py-1 rounded-full pointer-events-none">
            <span className="text-white text-[10px] font-black">🎁 {creds} credits</span>
          </div>
        ) : null;
      })()}

      {/* LIVE badge on live posts */}
      {isLivePost && isLive && (
        <div className="absolute top-14 left-3 z-10 flex items-center gap-1 bg-red-600 px-2 py-1 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-white text-[10px] font-black">LIVE</span>
        </div>
      )}

      {/* Progress bar */}
      {isVideo && playing && videoProgress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none" style={{ height: 2 }}>
          <div className="h-full bg-primary" style={{ width: `${videoProgress}%`, transition: 'width 0.3s linear' }} />
        </div>
      )}

      {/* Right side actions */}
      {showOverlay && (
        <div data-overlay="true" className="absolute right-2 flex flex-col items-center gap-3 z-10"
          style={{ top: '38%', bottom: hasActionButton ? ACTION_BOTTOM + 52 : ACTION_BOTTOM }}
          onClick={e => e.stopPropagation()}>
          <div className="relative mb-1">
            <button onClick={() => post.uploader_id && onOpenProfile(post.uploader_id)}>
              <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden">
                {post.uploader?.avatar_url
                  ? <img src={post.uploader.avatar_url} className="w-full h-full object-cover" alt="" />
                  : <div className="w-full h-full gradient-pink flex items-center justify-center">
                      <span className="text-white font-bold">{post.uploader?.username?.[0]?.toUpperCase() || '?'}</span>
                    </div>}
              </div>
            </button>
            {!isOwn && (
              <button onClick={handleFollow}
                className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center border border-black ${following ? 'bg-gray-600' : 'gradient-pink'}`}>
                {following ? <span className="text-white text-[9px] font-black">✓</span> : <Plus className="w-3 h-3 text-white" />}
              </button>
            )}
          </div>
          <button data-overlay="true" onClick={() => myProfile ? setShowGiftModal(true) : navigate('/login')} className="flex flex-col items-center gap-0.5">
            <Gift className="w-7 h-7 text-orange-300" />
            <span className="text-white text-[10px] font-bold drop-shadow-md">Zawadi</span>
          </button>
          <button data-overlay="true" onClick={handleLike} className="flex flex-col items-center gap-0.5">
            <Heart className={`w-7 h-7 transition-all ${liked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
            <span className="text-white text-[10px] font-bold drop-shadow-md">{likeCount > 999 ? `${(likeCount / 1000).toFixed(1)}K` : likeCount}</span>
          </button>
          <button data-overlay="true" onClick={() => setShowComments(true)} className="flex flex-col items-center gap-0.5">
            <MessageCircle className="w-7 h-7 text-white" />
            <span className="text-white text-[10px] font-bold drop-shadow-md">{commentCount > 999 ? `${(commentCount/1000).toFixed(1)}K` : commentCount}</span>
          </button>
          <button data-overlay="true" onClick={handleSave} className="flex flex-col items-center gap-0.5">
            <Bookmark className={`w-7 h-7 ${saved ? 'text-yellow-400 fill-yellow-400' : 'text-white'}`} />
            <span className="text-white text-[10px] font-bold drop-shadow-md">Hifadhi</span>
          </button>
          <button data-overlay="true" onClick={() => {
            handleShare();
          }} className="flex flex-col items-center gap-0.5">
            <Share2 className="w-7 h-7 text-white" />
            <span className="text-white text-[10px] font-bold drop-shadow-md">Shiriki</span>
          </button>
          <button data-overlay="true" onClick={handleDownload} className="flex flex-col items-center gap-0.5">
            <Download className="w-7 h-7 text-white" />
            <span className="text-white text-[10px] font-bold drop-shadow-md">Pakua</span>
          </button>
        </div>
      )}

      {/* Bottom info - username, title, ticker */}
      {showOverlay && (
        <div data-overlay="true" className="absolute left-3 right-[76px] z-10"
          style={{ bottom: 0, paddingBottom: bottomInfoPadding }}
          onClick={e => e.stopPropagation()}>
          <button onClick={() => post.uploader_id && onOpenProfile(post.uploader_id)} className="flex items-center gap-1.5 mb-0.5">
            <span className="text-white font-black text-sm drop-shadow-md">@{post.uploader?.username || 'mtumiaji'}</span>
            {post.uploader?.blue_tick && <BlueTick tickId={post.uploader.blue_tick} size={13} />}
            {post.uploader?.is_admin && <span className="text-[9px] bg-primary/80 px-1 py-0.5 rounded-full text-white">Admin</span>}
            {post.uploader?.is_business && !post.uploader?.is_admin && <span className="text-[9px] bg-blue-600/80 px-1 py-0.5 rounded-full text-white">Business</span>}
          </button>
          {post.title && <p className="text-white text-xs leading-snug line-clamp-2 drop-shadow-md mb-0.5">{post.title}</p>}
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-full gradient-pink flex items-center justify-center flex-shrink-0" style={{ animation: 'spin 3s linear infinite' }}>
              <span className="text-[6px]">♪</span>
            </div>
            <span className="text-white text-[10px] drop-shadow-md">TIK-SEXY</span>
            {isVideo && videoDuration > 0 && <span className="text-white/60 text-[10px] ml-1">{formatDur(videoDuration)}</span>}
          </div>
        </div>
      )}

      {/* MALAYA: contact button - above nav, below bottom info */}
      {isMalayaPost && !isFromTiksexy && showOverlay && (
        <MalayaBottomAction post={post} myProfile={myProfile} isRevealed={malayaRevealed || isFreePost || isVipUser} onReveal={handleMalayaReveal} />
      )}

      {/* LIVE: join button */}
      {isLivePost && !isFromTiksexy && showOverlay && (
        <LiveBottomAction post={post} myProfile={myProfile} isUnlocked={liveUnlocked || isFreePost || isVipUser} onJoin={handleLiveJoin} />
      )}

      {/* SERVICES: buy/get button */}
      {isServicesPost && !isFromTiksexy && showOverlay && (
        <ServicesBottomAction post={post} myProfile={myProfile} onBuy={handleServiceBuy}
          onGetFree={() => {
            const link = (post as any).action_link || '';
            if (link) { let l = link.trim(); if (!/^https?:\/\//i.test(l)) l = 'https://' + l; window.open(l, '_blank'); }
            else toast.info('Link haipatikani');
          }} />
      )}

      {showComments && <CommentPanel post={post} onClose={() => setShowComments(false)} />}
      {showGiftModal && myProfile && <TikGiftModal post={post} myProfile={myProfile} onClose={() => setShowGiftModal(false)} />}
      {showVipForShare && (
        <PlanPickerModal onClose={() => setShowVipForShare(false)} settings={settings}
          onSuccess={() => { setShowVipForShare(false); handleShare(); }}
          message="Shiriki video - Inahitaji VIP au Business Account" />
      )}

      {/* Play icon - only visible when paused. Tapping anywhere toggles via handleTap. */}
      {isVideo && !saveData && !playing && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 5, pointerEvents: 'none' }}>
          <div
            style={{ pointerEvents: 'auto' }}
            onClick={e => {
              e.stopPropagation();
              const vid = videoRef.current;
              if (!vid) return;
              vid.muted = false; vid.volume = 1.0;
              vid.play()
                .then(() => { setPlaying(true); setMuted(false); })
                .catch(() => {
                  if (vid) {
                    vid.muted = true;
                    vid.play().then(() => { setPlaying(true); setMuted(true); }).catch(() => {});
                  }
                });
            }}
            className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center shadow-xl cursor-pointer active:scale-90 transition-transform">
            <Play className="w-8 h-8 text-white ml-1" fill="white" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Search Modal ─────────────────────────────────────────────────────────────
export function SearchModal({ onClose, onOpenProfile }: { onClose: () => void; onOpenProfile: (uid: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TikPost[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTab, setSearchTab] = useState<'videos' | 'users'>('videos');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);
  useEffect(() => {
    if (!query.trim()) { setResults([]); setUsers([]); return; }
    const t = setTimeout(() => doSearch(), 400);
    return () => clearTimeout(t);
  }, [query]);

  async function doSearch() {
    setLoading(true);
    const [{ data: posts }, { data: userList }] = await Promise.all([
      supabase.from('content_posts').select('*, uploader:uploader_id(username,avatar_url,blue_tick,is_admin,is_business)')
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .in('type', ['video', 'malaya']).order('views', { ascending: false }).limit(20),
      supabase.from('user_profiles').select('id,username,avatar_url,blue_tick,is_vip,is_admin,is_business')
        .ilike('username', `%${query}%`).limit(15),
    ]);
    setResults((posts || []) as TikPost[]);
    setUsers(userList || []);
    setLoading(false);
  }

  return (
    <div className="absolute inset-0 z-40 bg-black flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <div className="flex-1 flex items-center gap-2 bg-white/10 rounded-full px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Tafuta video au watumiaji..." className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-gray-500" />
          {query && <button onClick={() => setQuery('')}><X className="w-4 h-4 text-gray-400" /></button>}
        </div>
        <button onClick={onClose} className="text-white font-semibold text-sm">Ghairi</button>
      </div>
      <div className="flex px-4 gap-2 py-2">
        {(['videos', 'users'] as const).map(t => (
          <button key={t} onClick={() => setSearchTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold ${searchTab === t ? 'gradient-pink text-white' : 'bg-white/10 text-gray-300'}`}>
            {t === 'videos' ? 'Video' : 'Watumiaji'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
        {!query && !loading && (
          <div className="text-center py-16 text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>Andika kutafuta...</p>
          </div>
        )}
        {searchTab === 'videos' && results.map(p => {
          const thumb = p.thumbnail_url || (isVideoFile(p.media_url) ? undefined : p.media_url);
          return (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
              <div className="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-[#1a0a1a]">
                {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> :
                  <div className="w-full h-full flex items-center justify-center text-gray-600">▶</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold line-clamp-2">{p.title || 'Video'}</p>
                <p className="text-gray-400 text-xs mt-1">@{p.uploader?.username}</p>
                <p className="text-gray-500 text-xs">{p.views || 0} views</p>
              </div>
            </div>
          );
        })}
        {searchTab === 'users' && users.map(u => (
          <button key={u.id} onClick={() => { onOpenProfile(u.id); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/5">
            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-primary/20">
              {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" /> :
                <div className="w-full h-full gradient-pink flex items-center justify-center text-white font-bold">{u.username?.[0]?.toUpperCase()}</div>}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1">
                <span className="text-white font-semibold">@{u.username}</span>
                {u.blue_tick && <BlueTick tickId={u.blue_tick} size={14} />}
              </div>
              <p className="text-gray-400 text-xs">{u.is_admin ? 'Admin' : u.is_business ? 'Business' : 'Member'}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── TikSexy Home Feed ────────────────────────────────────────────────────────
export function TikSexyHome({ onTabChange, onOpenProfile, saveData, feedTab, setFeedTab, autoSwap, showSearch, setShowSearch, initialPostId }: {
  onTabChange: (tab: string) => void; onOpenProfile: (uid: string) => void; saveData: boolean;
  feedTab: 'foryou' | 'following'; setFeedTab: (t: 'foryou' | 'following') => void;
  autoSwap: boolean; showSearch: boolean; setShowSearch: (v: boolean) => void;
  initialPostId?: string | null;
}) {
  const navigate = useNavigate();
  const { user, profile, requireAuth } = useAuth();
  const [posts, setPosts] = useState<TikPost[]>([]);
  const [followingPosts, setFollowingPosts] = useState<TikPost[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadFeed(); }, []);
  useEffect(() => { if (user) loadFollowingFeed(); }, [user]);

  // Jump to specific post if initialPostId provided (from saved items or shared link)
  useEffect(() => {
    if (!initialPostId || posts.length === 0) return;
    // Search for the post in current list
    const idx = posts.findIndex(p => p.id === initialPostId);
    if (idx >= 0) {
      setActiveIdx(idx);
      return;
    }
    // Post not in current list - fetch it and prepend
    supabase.from('content_posts')
      .select('*, uploader:uploader_id(username,avatar_url,blue_tick,is_admin,is_business)')
      .eq('id', initialPostId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setPosts(prev => {
          const alreadyIn = prev.findIndex(p => p.id === initialPostId);
          if (alreadyIn >= 0) { setActiveIdx(alreadyIn); return prev; }
          const next = [data as TikPost, ...prev.filter(p => p.id !== initialPostId)];
          setActiveIdx(0);
          return next;
        });
      });
  }, [initialPostId, posts.length]);

  async function loadFeed() {
    const { data } = await supabase.from('content_posts')
      .select('*, uploader:uploader_id(username,avatar_url,blue_tick,is_admin,is_business)')
      .in('type', ['video', 'malaya', 'live', 'services'])
      .neq('show_in_tiksexy', false)
      .order('is_pinned', { ascending: false })
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false }).limit(80);

    const { data: svcs } = await supabase.from('services')
      .select('*').eq('is_active', true).eq('show_in_tiksexy', true).order('display_order');

    const { data: liveOpts } = await supabase.from('live_options')
      .select('*, uploader:uploader_id(username,avatar_url,blue_tick,is_admin,is_business)')
      .eq('is_active', true).eq('show_in_tiksexy', true);

    const allPosts: TikPost[] = [];
    if (data) allPosts.push(...data as TikPost[]);

    if (svcs) {
      svcs.forEach((svc: any) => {
        allPosts.push({
          id: svc.id, type: 'services', title: svc.name, description: svc.description,
          media_url: svc.video_url || svc.image_url || '',
          thumbnail_url: svc.thumbnail_url || svc.image_url || '',
          price: svc.price, is_free: svc.price <= 0, action_link: svc.action_link,
          uploader_id: null, uploader: null, views: 0, created_at: svc.created_at,
          show_in_tiksexy: true, source: 'home',
        } as any);
      });
    }

    if (liveOpts) {
      liveOpts.forEach((lo: any) => {
        allPosts.push({
          id: lo.id,
          type: lo.type === 'video_call' ? 'video_call' : 'live',
          title: lo.name,
          media_url: lo.cover_url || '', thumbnail_url: lo.cover_url || '',
          price: lo.price || 0, is_free: !lo.price || lo.price <= 0,
          whatsapp: lo.whatsapp, phone: lo.link, link: lo.link,
          is_online: lo.is_online, call_type: lo.type, live_type2: lo.type,
          uploader_id: lo.uploader_id, uploader: lo.uploader,
          views: 0, created_at: lo.created_at, show_in_tiksexy: true, source: 'home',
        } as any);
      });
    }

    if (allPosts.length === 0) { setLoading(false); return; }
    const withPriority = [...allPosts].sort((a: any, b: any) => {
      const aScore = a.uploader?.is_admin ? 2 : a.uploader?.is_business ? 1 : 0;
      const bScore = b.uploader?.is_admin ? 2 : b.uploader?.is_business ? 1 : 0;
      if (bScore !== aScore) return bScore - aScore;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }) as TikPost[];
    setPosts(sortByUnseen(withPriority));
    setLoading(false);
    setActiveIdx(0);
  }

  async function loadFollowingFeed() {
    if (!user) return;
    const { data: follows } = await supabase.from('tik_follows').select('following_id').eq('follower_id', user.id);
    if (!follows || follows.length === 0) { setFollowingPosts([]); return; }
    const ids = follows.map((f: any) => f.following_id);
    const { data } = await supabase.from('content_posts')
      .select('*, uploader:uploader_id(username,avatar_url,blue_tick,is_admin,is_business)')
      .in('type', ['video', 'malaya', 'live', 'services'])
      .neq('show_in_tiksexy', false)
      .in('uploader_id', ids).order('created_at', { ascending: false }).limit(40);
    setFollowingPosts(sortByUnseen((data || []) as TikPost[]));
  }

  const activePosts = feedTab === 'foryou' ? posts : followingPosts;

  const goNext = useCallback(() => {
    setActiveIdx(i => { const next = Math.min(i + 1, activePosts.length - 1); saveFeedPosition(next, feedTab); return next; });
  }, [activePosts.length, feedTab]);

  const goPrev = useCallback(() => {
    setActiveIdx(i => { const prev = Math.max(i - 1, 0); saveFeedPosition(prev, feedTab); return prev; });
  }, [feedTab]);

  useEffect(() => { setActiveIdx(0); }, [feedTab]);

  // Preload next 2 videos in advance for instant transitions - NO black screen on swipe
  useEffect(() => {
    if (activePosts.length === 0) return;
    // Preload thumbnails for next/prev posts immediately
    for (let offset = -1; offset <= 2; offset++) {
      if (offset === 0) continue;
      const post = activePosts[activeIdx + offset];
      if (!post) continue;
      // Preload thumbnail image
      if (post.thumbnail_url) {
        const img = new Image();
        img.src = post.thumbnail_url;
      }
      // Preload video into cache
      const nextUrl = post.media_url || post.media_urls?.[0] || '';
      if (nextUrl && isVideoFile(nextUrl)) {
        videoCache.get(nextUrl).then(cached => {
          if (!cached) videoCache.put(nextUrl).catch(() => {});
        });
        // Also use browser's native preload
        const preloadEl = document.createElement('video');
        preloadEl.preload = 'auto';
        preloadEl.src = nextUrl;
        preloadEl.style.cssText = 'display:none;position:absolute;pointer-events:none;';
        preloadEl.muted = true;
        preloadEl.playsInline = true;
        document.body.appendChild(preloadEl);
        setTimeout(() => { try { document.body.removeChild(preloadEl); } catch {} }, 12000);
      }
    }
  }, [activeIdx, activePosts]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel < 400) return;
      lastWheel = now;
      if (e.deltaY > 0) goNext(); else goPrev();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [goNext, goPrev]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-black">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-black">
      {activePosts.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <TikSexyLogo size={64} />
          <p className="text-white font-bold text-xl mt-4">{feedTab === 'following' ? 'Bado hufuati mtu' : 'Hakuna Video Bado'}</p>
          <button onClick={() => feedTab === 'following' ? setFeedTab('foryou') : requireAuth(() => onTabChange('upload'))}
            className="mt-6 gradient-pink text-white font-bold px-8 py-3 rounded-full">
            {feedTab === 'following' ? 'Rudi Kwako' : '+ Pakia Sasa'}
          </button>
        </div>
      ) : (
        activePosts.map((post, idx) => (
          <div key={post.id} className="absolute inset-0 transition-transform duration-300"
            style={{ transform: `translateY(${(idx - activeIdx) * 100}%)` }}>
            <FeedItem post={post} isActive={idx === activeIdx} onNext={goNext} onPrev={goPrev}
              myProfile={profile} onOpenProfile={onOpenProfile} saveData={saveData} autoSwap={autoSwap} />
          </div>
        ))
      )}
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} onOpenProfile={onOpenProfile} />}
    </div>
  );
}
