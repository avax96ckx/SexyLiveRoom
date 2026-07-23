
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { AppSettings, HomeBox, ContentPost } from '@/types';
import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';
import AuthModal from '@/components/features/AuthModal';
import BlueTick from '@/components/features/BlueTick';
import { ChevronRight, Plus, Copy, Gift, Download, MessageCircle, Crown, Share2, Play, Bell, ArrowDownCircle, Upload } from 'lucide-react';
import { toast } from 'sonner';

// TikSexy icon (same as BottomNav)
const TikSexyIcon = () => (
  <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
    <path d="M17 8 C17 8 17 22 17 26 C17 29.3 14.3 32 11 32 C7.7 32 5 29.3 5 26 C5 22.7 7.7 20 11 20 C12.1 20 13.1 20.3 14 20.8 L14 14.5 C13.1 14.2 12.1 14 11 14 C4.4 14 -1 19.4 -1 26 C-1 32.6 4.4 38 11 38 C17.6 38 23 32.6 23 26 L23 14 C25.3 15.8 28.1 17 31 17 L31 11 C27.7 11 25 8.3 25 5 L19 5 C19 6.7 18.2 8.2 17 9.2 Z"
      fill="rgba(0,255,255,0.5)" transform="translate(2.5, 2.5) scale(0.85)" />
    <path d="M17 8 C17 8 17 22 17 26 C17 29.3 14.3 32 11 32 C7.7 32 5 29.3 5 26 C5 22.7 7.7 20 11 20 C12.1 20 13.1 20.3 14 20.8 L14 14.5 C13.1 14.2 12.1 14 11 14 C4.4 14 -1 19.4 -1 26 C-1 32.6 4.4 38 11 38 C17.6 38 23 32.6 23 26 L23 14 C25.3 15.8 28.1 17 31 17 L31 11 C27.7 11 25 8.3 25 5 L19 5 C19 6.7 18.2 8.2 17 9.2 Z"
      fill="rgba(255,20,147,0.5)" transform="translate(-0.5, -0.5) scale(0.85)" />
    <path d="M17 8 C17 8 17 22 17 26 C17 29.3 14.3 32 11 32 C7.7 32 5 29.3 5 26 C5 22.7 7.7 20 11 20 C12.1 20 13.1 20.3 14 20.8 L14 14.5 C13.1 14.2 12.1 14 11 14 C4.4 14 -1 19.4 -1 26 C-1 32.6 4.4 38 11 38 C17.6 38 23 32.6 23 26 L23 14 C25.3 15.8 28.1 17 31 17 L31 11 C27.7 11 25 8.3 25 5 L19 5 C19 6.7 18.2 8.2 17 9.2 Z"
      fill="white" transform="translate(1, 1) scale(0.85)" />
  </svg>
);

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, requireAuth, showAuthModal, setShowAuthModal } = useAuth();
  const [settings, setSettings] = useState<AppSettings>({});
  const [homeCardsConfig, setHomeCardsConfig] = useState<any[]>([]);
  const [smallCardsConfig, setSmallCardsConfig] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<Record<string, HomeBox[]>>({});
  const [featuredPosts, setFeaturedPosts] = useState<Record<string, ContentPost[]>>({});
  const [videoCatCovers, setVideoCatCovers] = useState<string[]>([]);
  const [liveCovers, setLiveCovers] = useState<string[]>([]);
  const [serviceCovers, setServiceCovers] = useState<string[]>([]);
  const [tiksexyCovers, setTiksexyCovers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [vipExpiryWarning, setVipExpiryWarning] = useState(false);

  // Listen for real-time settings updates (from admin panel) - applies INSTANTLY
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      setSettings((prev: AppSettings) => ({ ...prev, ...detail }));
      // Invalidate all caches
      try { sessionStorage.removeItem('home_settings_cache'); } catch {}
      if (detail.home_cards_config) {
        try { const p = JSON.parse(detail.home_cards_config); if (Array.isArray(p) && p.length > 0) { setHomeCardsConfig(p); contentCacheRef.current.homeCardsConfig = p; } } catch {}
      }
      if (detail.home_small_cards_config) {
        try { const p = JSON.parse(detail.home_small_cards_config); if (Array.isArray(p) && p.length > 0) { setSmallCardsConfig(p); contentCacheRef.current.smallCardsConfig = p; } } catch {}
      }
    };
    window.addEventListener('app-settings-updated', handler);
    return () => window.removeEventListener('app-settings-updated', handler);
  }, []);

  // Content cache - keeps last loaded content so no flash on return
  const contentCacheRef = useRef<Record<string, any>>({});

  // Fetch on mount AND every time user navigates back to home
  useEffect(() => { fetchData(); }, [user?.id, location.key]);

  // Listen for box title updates from Admin panel
  useEffect(() => {
    const handler = () => { fetchData(); };
    window.addEventListener('home-boxes-updated', handler);
    return () => window.removeEventListener('home-boxes-updated', handler);
  }, []);

  // Re-read small cards on EVERY render if cache is stale
  useEffect(() => {
    supabase.from('app_settings').select('key,value').in('key', ['home_cards_config', 'home_small_cards_config']).then(({ data }) => {
      (data || []).forEach((row: any) => {
        if (row.key === 'home_cards_config') {
          try { const p = JSON.parse(row.value); if (Array.isArray(p) && p.length > 0) setHomeCardsConfig(p); } catch {}
        }
        if (row.key === 'home_small_cards_config') {
          try { const p = JSON.parse(row.value); if (Array.isArray(p) && p.length > 0) setSmallCardsConfig(p); } catch {}
        }
      });
    });
  }, [location.key]);

  useEffect(() => {
    if (!profile?.is_vip || !profile?.vip_expires_at) return;
    const expiresAt = new Date(profile.vip_expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 3 && daysLeft > 0) {
      setVipExpiryWarning(true);
      const lastWarnKey = `vip_warn_${profile.id}_${new Date().toDateString()}`;
      if (!localStorage.getItem(lastWarnKey) && user) {
        localStorage.setItem(lastWarnKey, '1');
        supabase.from('notifications').insert({ user_id: user.id, title: '⚠️ VIP Yako Inakwisha!', message: `VIP yako itakwisha siku ${daysLeft} - fanya upya!`, type: 'vip_expiry', link: '/wallet', action_label: 'Fanya Upya' }).then(() => {});
      }
    }
  }, [profile?.vip_expires_at, profile?.id]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      const shown = localStorage.getItem('notif_prompt_shown');
      if (!shown) setTimeout(() => setShowNotifPrompt(true), 3000);
    }
  }, []);

  async function fetchData() {
    // Apply content cache immediately so no blank flash on navigation return
    const c = contentCacheRef.current;
    if (c.settings) {
      setSettings(c.settings);
      if (c.homeCardsConfig) setHomeCardsConfig(c.homeCardsConfig);
      if (c.smallCardsConfig) setSmallCardsConfig(c.smallCardsConfig);
      if (c.boxes) setBoxes(c.boxes);
      if (c.featuredPosts) setFeaturedPosts(c.featuredPosts);
      if (c.videoCatCovers) setVideoCatCovers(c.videoCatCovers);
      if (c.liveCovers) setLiveCovers(c.liveCovers);
      if (c.serviceCovers) setServiceCovers(c.serviceCovers);
      if (c.tiksexyCovers) setTiksexyCovers(c.tiksexyCovers);
      setLoading(false); // Show cached content immediately
    }
    try {
      // Also check sessionStorage for settings
      try {
        const cached = sessionStorage.getItem('home_settings_cache');
        if (cached && !c.settings) {
          const m = JSON.parse(cached);
          setSettings(m);
          if (m.home_cards_config) { try { const p = JSON.parse(m.home_cards_config); if (Array.isArray(p)) setHomeCardsConfig(p); } catch {} }
          if (m.home_small_cards_config) { try { const p = JSON.parse(m.home_small_cards_config); if (Array.isArray(p)) setSmallCardsConfig(p); } catch {} }
        }
      } catch {}
      // Run all initial fetches in PARALLEL for faster page load
      const [settingsResult, boxResult, postsResult, postsImgResult] = await Promise.all([
        supabase.from('app_settings').select('*'),
        supabase.from('home_boxes').select('*').order('section').order('box_number'),
        Promise.all([
          supabase.from('content_posts').select('id,type,media_url,thumbnail_url,media_urls,title,location').eq('type','malaya').neq('source','tiksexy').not('thumbnail_url','is',null).order('created_at',{ascending:false}).limit(8),
          supabase.from('content_posts').select('id,type,media_url,thumbnail_url,media_urls,title,location').eq('type','video').neq('source','tiksexy').order('created_at',{ascending:false}).limit(8),
          supabase.from('content_posts').select('id,type,media_url,thumbnail_url,media_urls,title,location').eq('type','live').neq('source','tiksexy').order('created_at',{ascending:false}).limit(8),
        ]),
        supabase.from('content_posts').select('id,type,media_url,thumbnail_url,media_urls,title,location').eq('type','malaya').neq('source','tiksexy').order('created_at',{ascending:false}).limit(8),
      ]);

      const settingsData = settingsResult.data;
      const settingsMap: AppSettings = {};
      settingsData?.forEach(s => { settingsMap[s.key] = s.value; });
      setSettings(settingsMap);
      contentCacheRef.current.settings = settingsMap;
      try { sessionStorage.setItem('home_settings_cache', JSON.stringify(settingsMap)); } catch {}

      if (settingsMap.home_cards_config) {
        try { const p = JSON.parse(settingsMap.home_cards_config); if (Array.isArray(p)) { setHomeCardsConfig(p); contentCacheRef.current.homeCardsConfig = p; } } catch {}
      }
      if (settingsMap.home_small_cards_config) {
        try { const p = JSON.parse(settingsMap.home_small_cards_config); if (Array.isArray(p) && p.length > 0) { setSmallCardsConfig(p); contentCacheRef.current.smallCardsConfig = p; } } catch {}
      }

      // Process home_boxes
      const boxData = boxResult.data;
      const boxMap: Record<string, HomeBox[]> = { malaya: [], video: [], live: [], services: [], admin_services: [] };
      if (boxData) {
        boxData.forEach((b: any) => {
          if (boxMap[b.section] !== undefined) {
            const idx = (b.box_number || 1) - 1;
            boxMap[b.section][idx] = b;
          }
        });
      }
      setBoxes(boxMap);
      contentCacheRef.current.boxes = boxMap;

      // Process posts from parallel fetch
      const [{ data: malayaPosts }, { data: videoPosts }, { data: livePosts }] = postsResult;
      const malayaImgPosts = postsImgResult.data;
      const malayaAll = [...(malayaPosts||[]), ...(malayaImgPosts||[]).filter(p => !(malayaPosts||[]).find((x: any) =>x.id===p.id))];
      const postMap: Record<string, ContentPost[]> = { malaya: malayaAll as ContentPost[], video: (videoPosts||[]) as ContentPost[], live: (livePosts||[]) as ContentPost[] };
      setFeaturedPosts(postMap);
      contentCacheRef.current.featuredPosts = postMap;
      console.log('[Index] malaya boxes:', boxMap['malaya'], 'malaya posts:', malayaAll.length);

      // Fetch video categories for home video boxes (each box = one category)
      const { data: videoCats } = await supabase.from('video_categories').select('name,cover_url').order('display_order').limit(4);
      const catCovers: string[] = [];
      if (videoCats) {
        for (const cat of videoCats.slice(0, 4)) {
          // Priority 1: category's own cover_url
          if (cat.cover_url) { catCovers.push(cat.cover_url); continue; }
          // Priority 2: most recent uploaded post thumbnail in this category
          const { data: cp } = await supabase.from('content_posts').select('thumbnail_url').eq('type', 'video').eq('section', cat.name).not('thumbnail_url', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
          catCovers.push(cp?.thumbnail_url || '');
        }
      }
      setVideoCatCovers(catCovers);
      contentCacheRef.current.videoCatCovers = catCovers;

      // Live covers: newest uploaded live posts' thumbnails (NEWEST first)
      // Fetch WITHOUT thumbnail filter - use any available media as fallback
      const { data: livePosts2 } = await supabase.from('content_posts')
        .select('thumbnail_url,media_url,media_urls,thumb_urls')
        .eq('type', 'live')
        .neq('source', 'tiksexy')
        .order('created_at', { ascending: false })
        .limit(8);
      // Fallback: live_options covers
      const { data: liveOpts } = await supabase.from('live_options').select('cover_url').eq('is_active', true).order('display_order').limit(4);
      const isVideoUrl2 = (u: string) => /\.(mp4|webm|mov|avi|mkv|3gp|m4v)/i.test(u);
      // Pick best cover for each live post: thumbnail_url > thumb_urls[0] > image from media_urls
      const livePostCovers: string[] = [];
      for (const p of (livePosts2 || [])) {
        let cover = '';
        if (p.thumbnail_url && !isVideoUrl2(p.thumbnail_url)) cover = p.thumbnail_url;
        else if (Array.isArray(p.thumb_urls) && p.thumb_urls[0] && !isVideoUrl2(p.thumb_urls[0])) cover = p.thumb_urls[0];
        else if (p.media_url && !isVideoUrl2(p.media_url)) cover = p.media_url;
        else if (Array.isArray(p.media_urls)) { const img = p.media_urls.find((u: string) => !isVideoUrl2(u)); if (img) cover = img; }
        if (cover) livePostCovers.push(cover);
        if (livePostCovers.length >= 4) break;
      }
      const liveOptCovers = (liveOpts || []).filter((o: any) => o.cover_url).map((o: any) => o.cover_url);
      // Use newest post covers first, fallback to live_options
      const lc: string[] = [];
      for (let i = 0; i < 4; i++) {
        lc.push(livePostCovers[i] || liveOptCovers[i] || '');
      }
      setLiveCovers(lc.filter(Boolean));
      contentCacheRef.current.liveCovers = lc.filter(Boolean);

      // Services boxes: prefer thumbnail_url (from video), fallback to image_url
      const { data: svcs } = await supabase.from('services').select('image_url,thumbnail_url,video_url').eq('is_active', true).eq('type', 'admin_service').order('display_order').limit(4);
      const sc = (svcs || []).map((s: any) => s.thumbnail_url || s.image_url || '').filter(Boolean);
      setServiceCovers(sc);
      contentCacheRef.current.serviceCovers = sc;

      const isVideoUrl = (u: string) => /\.(mp4|webm|mov|avi|mkv)/i.test(u);
      // TikSexy boxes: ONLY from source='tiksexy' posts (not home malaya/video/services)
      const { data: tikPosts } = await supabase.from('content_posts').select('thumbnail_url,media_url').eq('source', 'tiksexy').order('created_at', { ascending: false }).limit(8);
      const tikCovers = (tikPosts || []).map((p: any) => p.thumbnail_url || (!isVideoUrl(p.media_url || '') ? p.media_url : null)).filter(Boolean).slice(0, 4);
      setTiksexyCovers(tikCovers);
      contentCacheRef.current.tiksexyCovers = tikCovers;
    } catch (err) { console.error('Error fetching data:', err); }
    finally { setLoading(false); }
  }

  async function requestPushPermission() {
    if (!('Notification' in window)) { toast.error('Browser haisaidii arifa'); return; }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setShowNotifPrompt(false); localStorage.setItem('notif_prompt_shown', '1');
      toast.success('Arifa za browser zimewezeshwa!');
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification('SEXY LIVE ROOM', { body: 'Utapata arifa za ujumbe mpya na malipo.', icon: '/icon-192.png' });
          if (user) await supabase.from('push_subscriptions').upsert({ user_id: user.id, subscription: JSON.stringify({ userId: user.id }) }, { onConflict: 'user_id' } as any);
        } catch (e) { console.error('SW notification error:', e); }
      }
    } else { setShowNotifPrompt(false); localStorage.setItem('notif_prompt_shown', '1'); toast.info('Arifa zimekatazwa.'); }
  }

  // ── Small card config helpers ─────────────────────────────────────────────
  const isSmallCardVisible = (cardId: string) => {
    if (smallCardsConfig.length === 0) return true;
    const found = smallCardsConfig.find((c: any) => c.id === cardId);
    // If not found in config, default to visible
    return found ? found.visible !== false : true;
  };
  const getSmallCardTitle = (cardId: string, defaultTitle: string) => {
    const found = smallCardsConfig.find((c: any) => c.id === cardId);
    return (found?.title && found.title.trim()) ? found.title : defaultTitle;
  };

  // Re-fetch settings when page becomes visible (after navigating from admin)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        supabase.from('app_settings').select('key,value').in('key', ['home_cards_config', 'home_small_cards_config']).then(({ data }) => {
          (data || []).forEach((row: any) => {
            if (row.key === 'home_cards_config') {
              try { const p = JSON.parse(row.value); if (Array.isArray(p) && p.length > 0) setHomeCardsConfig(p); } catch {}
            }
            if (row.key === 'home_small_cards_config') {
              try { const p = JSON.parse(row.value); if (Array.isArray(p) && p.length > 0) setSmallCardsConfig(p); } catch {}
            }
          });
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const referralTarget = parseInt(settings.referral_target || '10');
  const referralBonus = parseInt(settings.referral_bonus || '20000');
  const referralCount = profile?.referral_count || 0;
  const referralPercent = Math.min((referralCount / referralTarget) * 100, 100);
  const isBusiness = profile?.is_business || profile?.is_admin;
  const giftWithdrawCredits = user ? parseInt(localStorage.getItem(`gift_withdraw_credits_${user.id}`) || '0') : 0;

  const handleShare = async () => {
    if (!profile) return;
    const link = `${window.location.origin}/login?ref=${profile.referral_code}&bonus=1`;
    try {
      if (navigator.share) await navigator.share({ title: '🎁 Jisajili SEXY LIVE ROOM - Pata Bonus!', text: `Jisajili upate bonus ya TZS ${referralBonus.toLocaleString()}! Tumia kiungo changu:`, url: link });
      else { await navigator.clipboard.writeText(link); toast.success('Link imenakiliwa!'); }
    } catch { toast.info(`Link: ${link}`); }
  };

  const handleCopyLink = async () => {
    if (!profile) return;
    const link = `${window.location.origin}/login?ref=${profile.referral_code}&bonus=1`;
    try { await navigator.clipboard.writeText(link); toast.success('Link imenakiliwa!'); } catch { toast.info(`Link: ${link}`); }
  };

  const handleClaimBonus = async () => {
    if (!profile || referralCount < referralTarget) return;
    await supabase.from('user_profiles').update({ balance: (profile.balance || 0) + referralBonus, referral_count: 0 }).eq('id', profile.id);
    await supabase.from('notifications').insert({ user_id: profile.id, title: 'Hongera! Bonus Yako!', message: `TZS ${referralBonus.toLocaleString()} imeingia!`, type: 'bonus' });
    toast.success(`TZS ${referralBonus.toLocaleString()} imeingia!`);
  };

    // Video section: each box shows a different video category cover
  const renderVideoSection = () => {
    const sectionBoxes = boxes['video'] || [];
    const title = settings.home_card_video_title || homeCardsConfig.find((c: any) => c.id === 'video')?.title || 'VIDEO';
    return (
      <div className="mx-3 mb-4 content-box">
        <div className="section-header">
          <div className="section-title"><span style={{ fontSize: 20 }}>🎬</span><span>{title}</span></div>
          <div className="flex items-center gap-3">
            {profile?.is_admin && (
              <button onClick={() => navigate('/video')} className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                <Plus className="w-4 h-4 text-white" />
              </button>
            )}
            <button onClick={() => requireAuth(() => navigate('/video'))} className="ona-zaidi flex items-center gap-1">
              ONA ZAIDI <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 pt-0">
          {[0, 1, 2, 3].map(i => {
            const box = sectionBoxes[i];
            // Admin box cover overrides category cover
            const boxImage = box?.image_url || videoCatCovers[i] || null;
            const itemTitle = box?.title || '';
            return (
              <div key={i} className="relative rounded-xl overflow-hidden cursor-pointer group" style={{ aspectRatio: '0.75', background: '#1a0a1a' }}
                onClick={() => requireAuth(() => navigate('/video'))}>
                {boxImage ? (
                  <img src={boxImage} alt={itemTitle || 'Video'} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" loading="eager" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    <span className="text-4xl opacity-30">🎬</span>
                    <span className="text-gray-600 text-xs">Box {i + 1}</span>
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                  <div className="w-11 h-11 rounded-full bg-black/55 flex items-center justify-center shadow-lg"><Play className="w-5 h-5 text-white ml-0.5" fill="white" /></div>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  {itemTitle && <p className="text-white font-semibold text-xs leading-tight truncate">{itemTitle}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSection = (section: string, title: string, icon: string) => {
    const sectionBoxes = boxes[section] || [];
    const sectionPosts = featuredPosts[section] || [];
    const showPlayIcon = section === 'video';
    return (
      <div className="mx-3 mb-4 content-box">
        <div className="section-header">
          <div className="section-title"><span style={{ fontSize: 20 }}>{icon}</span><span>{title}</span></div>
          <div className="flex items-center gap-3">
            {profile?.is_admin && (
              <button onClick={() => navigate(`/${section}`)} className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                <Plus className="w-4 h-4 text-white" />
              </button>
            )}
            <button onClick={() => requireAuth(() => navigate(`/${section}`))} className="ona-zaidi flex items-center gap-1">
              ONA ZAIDI <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 pt-0">
          {[0, 1, 2, 3].map(i => {
            const box = sectionBoxes[i];
            const post = sectionPosts[i];
            const isVideoFile = (url: string) => /\.(mp4|webm|mov|avi|mkv|3gp|m4v)/i.test(url);
            // Admin box cover = highest priority (never expires, never replaced unless admin uploads new)
            // Admin box cover = ALWAYS first priority (never expires)
            const boxImage = box?.image_url || box?.video_url || null;
            // Post fallback: for malaya, use thumbnail_url, then media_url if it's an image
            const isVideoFile2 = (url: string) => /\.(mp4|webm|mov|avi|mkv|3gp|m4v)/i.test(url);
            const postThumb = section !== 'video' && post?.thumbnail_url && !isVideoFile2(post.thumbnail_url) ? post.thumbnail_url : undefined;
            const postImgDirect = section !== 'video' && post?.media_url && !isVideoFile2(post.media_url) ? post.media_url : undefined;
            const mediaUrls2: string[] = (post?.media_urls && post.media_urls.length > 0) ? post.media_urls : [];
            const firstImgFromPost = section !== 'video' ? mediaUrls2.find(u => !isVideoFile2(u)) : undefined;
            const imageUrl = boxImage || postThumb || firstImgFromPost || postImgDirect;
            const itemTitle = box?.title || post?.title || post?.location || '';
            return (
              <div key={i} className="relative rounded-xl overflow-hidden cursor-pointer group" style={{ aspectRatio: '0.75', background: '#1a0a1a' }}
                onClick={() => requireAuth(() => navigate(`/${section}`))}>
                {imageUrl ? (
                  <img src={imageUrl} alt={itemTitle || section} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" loading="eager" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    <span className="text-4xl opacity-30">{icon}</span>
                    <span className="text-gray-600 text-xs">Box {i + 1}</span>
                  </div>
                )}
                {showPlayIcon && imageUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                    <div className="w-11 h-11 rounded-full bg-black/55 flex items-center justify-center shadow-lg"><Play className="w-5 h-5 text-white ml-0.5" fill="white" /></div>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  {itemTitle && <p className="text-white font-semibold text-xs leading-tight truncate">{itemTitle}</p>}
                </div>
                {section === 'live' && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-500/90 px-2 py-0.5 rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-white text-[9px] font-bold">LIVE</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render live section using newest live post covers (same logic as malaya/video)
  const renderLiveSection = () => {
    const section = 'live';
    const sectionBoxes = boxes[section] || [];
    const livePosts = featuredPosts['live'] || [];
    const isVideoFile2 = (url: string) => /\.(mp4|webm|mov|avi|mkv|3gp|m4v)/i.test(url);
    return (
      <div className="mx-3 mb-4 content-box">
        <div className="section-header">
          <div className="section-title"><span style={{ fontSize: 20 }}>🔴</span><span>{settings.home_card_live_title || homeCardsConfig.find((c: any) => c.id === 'live')?.title || 'LIVE'}</span></div>
          <div className="flex items-center gap-3">
            {profile?.is_admin && (
              <button onClick={() => navigate('/live')} className="w-7 h-7 rounded-full bg-primary flex items-center justify-center"><Plus className="w-4 h-4 text-white" /></button>
            )}
            <button onClick={() => requireAuth(() => navigate('/live'))} className="ona-zaidi flex items-center gap-1">ONA ZAIDI <ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 pt-0">
          {[0, 1, 2, 3].map(i => {
            const box = sectionBoxes[i];
            const post = livePosts[i];
            // Admin box cover = highest priority
            const boxImage = box?.image_url || box?.video_url || null;
            // Post cover: newest live post thumbnail > thumb_urls[0] > image media_url
            const postThumb = post?.thumbnail_url && !isVideoFile2(post.thumbnail_url) ? post.thumbnail_url : undefined;
            const mediaUrls2: string[] = (post?.media_urls && post.media_urls.length > 0) ? post.media_urls : [];
            const firstImgFromPost = mediaUrls2.find(u => !isVideoFile2(u));
            const postImgDirect = post?.media_url && !isVideoFile2(post.media_url) ? post.media_url : undefined;
            // Fallback to liveCovers from live_options
            // For live section: newest post cover takes priority over box admin image
            // (box image may be stale - live posts should show newest content)
            const imageUrl = postThumb || firstImgFromPost || postImgDirect || boxImage || liveCovers[i] || null;
            const itemTitle = box?.title || post?.title || '';
            return (
              <div key={i} className="relative rounded-xl overflow-hidden cursor-pointer group" style={{ aspectRatio: '0.75', background: '#1a0a1a' }}
                onClick={() => requireAuth(() => navigate('/live'))}>
                {imageUrl ? (
                  <img src={imageUrl} alt={itemTitle || 'Live'} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" loading="eager" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    <span className="text-4xl opacity-30">🔴</span>
                    <span className="text-gray-600 text-xs">Box {i + 1}</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  {itemTitle && <p className="text-white font-semibold text-xs leading-tight truncate">{itemTitle}</p>}
                </div>
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-500/90 px-2 py-0.5 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span className="text-white text-[9px] font-bold">LIVE</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderServicesSection = () => (
    <div className="mx-3 mb-4 content-box">
      <div className="section-header">
        <div className="section-title"><span style={{ fontSize: 20 }}>💋</span><span>HUDUMA ZA ADMIN</span></div>
        <div className="flex items-center gap-3">
          {profile?.is_admin && (
            <button onClick={() => navigate('/admin-services')} className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
              <Plus className="w-4 h-4 text-white" />
            </button>
          )}
          <button onClick={() => navigate('/admin-services')} className="ona-zaidi flex items-center gap-1">
            ONA ZAIDI <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 pt-0">
        {(serviceCovers.length > 0 ? serviceCovers : ['', '', '', '']).map((coverUrl, i) => (
          <div key={i} className="relative rounded-xl overflow-hidden cursor-pointer group" style={{ aspectRatio: '0.75', background: '#1a0a1a' }}
            onClick={() => navigate('/admin-services')}>
            {coverUrl ? (
              <img src={coverUrl} alt={`Huduma ${i + 1}`} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" loading="eager" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <span className="text-4xl opacity-30">💋</span>
                <span className="text-gray-600 text-xs">Huduma {i + 1}</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <p className="text-white font-semibold text-xs leading-tight truncate">Huduma za Admin</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTikSexySection = () => (
    <div className="mx-3 mb-4 content-box">
      <div className="section-header">
        <div className="section-title"><TikSexyIcon /><span>TIKTOK SEXY</span></div>
        <button onClick={() => navigate('/tiksexy')} className="ona-zaidi flex items-center gap-1">
          ONA ZAIDI <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 pt-0">
        {[0, 1, 2, 3].map(i => {
          const coverUrl = tiksexyCovers[i];
          return (
            <div key={i} className="relative rounded-xl overflow-hidden cursor-pointer group" style={{ aspectRatio: '0.75', background: '#1a0a1a' }}
              onClick={() => navigate('/tiksexy')}>
              {coverUrl ? (
                <img src={coverUrl} alt={`TikSexy ${i + 1}`} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" loading="eager" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <TikSexyIcon />
                  <span className="text-gray-600 text-xs">TikSexy {i + 1}</span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <p className="text-white font-semibold text-xs leading-tight truncate">TikSexy</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="page-container">
      <TopBar />

      {showNotifPrompt && (
        <div className="mx-3 mt-2 rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(255,20,147,0.1)', border: '1px solid rgba(255,20,147,0.3)' }}>
          <Bell className="w-8 h-8 text-primary flex-shrink-0" />
          <div className="flex-1"><p className="text-white font-bold text-sm">Ruhusu Arifa</p><p className="text-gray-400 text-xs">Pata arifa za ujumbe mpya na malipo hata nje ya app</p></div>
          <button onClick={requestPushPermission} className="gradient-pink text-white text-xs font-bold px-3 py-2 rounded-xl flex-shrink-0">Ruhusu</button>
          <button onClick={() => setShowNotifPrompt(false)} className="text-gray-500 text-xs">✕</button>
        </div>
      )}

      {vipExpiryWarning && profile?.vip_expires_at && (
        <div className="mx-3 mt-2 rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(255,165,0,0.12)', border: '2px solid rgba(255,165,0,0.5)' }}>
          <Crown className="w-8 h-8 text-yellow-400 flex-shrink-0 animate-pulse" />
          <div className="flex-1">
            <p className="text-yellow-400 font-bold text-sm">⚠️ VIP Inakwisha Karibuni!</p>
            <p className="text-gray-400 text-xs">VIP yako itakwisha {new Date(profile.vip_expires_at).toLocaleDateString('sw-TZ')} - fanya upya usipoteze faida</p>
          </div>
          <button onClick={() => navigate('/wallet')} className="text-xs font-black px-3 py-2 rounded-xl flex-shrink-0" style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#000' }}>Fanya Upya</button>
          <button onClick={() => setVipExpiryWarning(false)} className="text-gray-500 text-xs">✕</button>
        </div>
      )}

      <div className="max-w-md mx-auto">
        {/* Profile Card */}
        <div className="mx-3 mt-2 mb-3 rounded-2xl p-4 flex items-center gap-4 cursor-pointer"
          style={{ background: 'rgba(26,8,26,0.9)', border: '1px solid rgba(255,20,147,0.4)' }}
          onClick={() => requireAuth(() => navigate('/profile/edit'))}>
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-primary overflow-hidden">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" /> :
                <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-bold text-2xl">{profile?.username?.[0]?.toUpperCase() || '?'}</span></div>}
            </div>
            {profile?.is_vip && <div className="absolute -top-1 -right-1 vip-badge text-[9px]">VIP</div>}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-black text-xl">{profile?.username || (user ? 'Member' : 'Wageni')}</span>
              {profile?.blue_tick && <BlueTick tickId={profile.blue_tick} size={18} />}
            </div>
            {profile?.is_business && <span className="text-xs text-yellow-400 font-semibold">💼 Business Account</span>}
            {!user && <p className="text-gray-400 text-sm">Bonyeza kuingia</p>}
          </div>
          <Share2 className="w-5 h-5 text-gray-400" onClick={e => { e.stopPropagation(); requireAuth(handleShare); }} />
        </div>

        {/* Balance Card */}
        {user && profile && (
          <div className="mx-3 mb-4 rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #7C3AED, #FF1493)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">SALIO LA AKAUNTI</p>
                <p className="text-white font-black text-3xl mt-1">TZS {(profile.balance || 0).toLocaleString()}</p>
              </div>
              {isBusiness ? (
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => navigate('/wallet?tab=deposit')} className="flex items-center gap-1.5 bg-white/20 text-white font-bold px-3 py-2 rounded-xl text-xs active:scale-95">
                    <Upload className="w-3.5 h-3.5" /> Weka Pesa
                  </button>
                  <button onClick={() => navigate('/wallet?withdraw=1')} className="flex items-center gap-1.5 bg-white text-purple-700 font-bold px-3 py-2 rounded-xl text-xs active:scale-95">
                    <ArrowDownCircle className="w-3.5 h-3.5" /> Toa Pesa
                  </button>
                </div>
              ) : giftWithdrawCredits > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => navigate('/wallet?tab=deposit')} className="flex items-center gap-1.5 bg-white/20 text-white font-bold px-3 py-2 rounded-xl text-xs active:scale-95">
                    <Upload className="w-3.5 h-3.5" /> Weka Pesa
                  </button>
                  <button onClick={() => {
                    const newCreds = Math.max(0, giftWithdrawCredits - 1);
                    try { localStorage.setItem(`gift_withdraw_credits_${user!.id}`, String(newCreds)); } catch {}
                    navigate('/wallet?withdraw=1');
                  }} className="flex items-center gap-1.5 bg-white text-purple-700 font-bold px-3 py-2 rounded-xl text-xs active:scale-95">
                    <ArrowDownCircle className="w-3.5 h-3.5" /> Toa Pesa 🎁
                  </button>
                </div>
              ) : (
                <button onClick={() => navigate('/wallet?tab=deposit')} className="flex flex-col items-center gap-1" aria-label="Weka Pesa">
                  <div className="w-12 h-12 rounded-xl border-2 border-white/40 flex items-center justify-center bg-white/10"><span className="text-white font-bold text-lg">$</span></div>
                  <span className="text-white text-xs font-semibold">WEKA PESA</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Large Cards - respect homeCardsConfig visibility */}
        {(homeCardsConfig.length === 0 || homeCardsConfig.find((c: any) => c.id === 'malaya')?.visible !== false) &&
          renderSection('malaya', settings.home_card_malaya_title || homeCardsConfig.find((c: any) => c.id === 'malaya')?.title || 'MALAYA', '💋')}
        {(homeCardsConfig.length === 0 || homeCardsConfig.find((c: any) => c.id === 'video')?.visible !== false) &&
          renderVideoSection()}
        {(homeCardsConfig.length === 0 || homeCardsConfig.find((c: any) => c.id === 'live')?.visible !== false) &&
          renderLiveSection()}
        {(homeCardsConfig.length === 0 || homeCardsConfig.find((c: any) => c.id === 'admin_services')?.visible !== false) &&
          renderServicesSection()}
        {(homeCardsConfig.length === 0 || homeCardsConfig.find((c: any) => c.id === 'tiksexy')?.visible !== false) &&
          renderTikSexySection()}

        {/* Referral Card */}
        {user && profile && (
          <div className="mx-3 mb-4 content-box p-4">
            <div className="flex items-center gap-2 mb-3"><Gift className="w-5 h-5 text-primary" /><h3 className="text-white font-bold">Shiriki Kiungo - Pata Bonus!</h3></div>
            <p className="text-gray-400 text-sm mb-3">Shiriki na marafiki <span className="text-primary font-bold">{referralTarget}</span> upate <span className="text-primary font-bold">TZS {referralBonus.toLocaleString()}</span> bure!</p>
            <div className="flex justify-between text-sm mb-2"><span className="text-gray-400">{referralCount}/{referralTarget}</span><span className="text-primary font-bold">{Math.round(referralPercent)}%</span></div>
            <div className="progress-bar h-3 mb-3"><div className="progress-fill h-full" style={{ width: `${referralPercent}%` }} /></div>
            {referralCount >= referralTarget ? (
              <button onClick={handleClaimBonus} className="btn-primary w-full mb-3 flex items-center justify-center gap-2"><Gift className="w-5 h-5" /> CHUKUA ZAWADI - TZS {referralBonus.toLocaleString()}</button>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 bg-[#1a0a1a] rounded-xl px-3 py-2 text-xs text-gray-400 truncate">{window.location.origin}/login?ref={profile.referral_code}&bonus=1</div>
                <button onClick={handleCopyLink} className="p-2 bg-[#1a0a1a] rounded-xl" title="Nakili"><Copy className="w-4 h-4 text-gray-300" /></button>
                <button onClick={handleShare} className="btn-primary px-3 flex items-center gap-1" title="Shiriki"><Share2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        )}

        {/* Download App - small card */}
        {isSmallCardVisible('download_app') && (
          <div className="mx-3 mb-4 content-box p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 gradient-pink rounded-xl flex items-center justify-center flex-shrink-0"><Download className="w-6 h-6 text-white" /></div>
              <div className="flex-1"><p className="text-white font-bold">{getSmallCardTitle('download_app', 'Download App')}</p><p className="text-gray-400 text-xs">Pata uzoefu bora zaidi kwenye simu yako</p></div>
              <button onClick={async () => { 
                const apkUrl = settings.app_apk_url; 
                if (apkUrl) {
                  try {
                    toast.info('Inaanza kudownload APK...');
                    const resp = await fetch(apkUrl);
                    if (!resp.ok) throw new Error('Download failed');
                    const blob = await resp.blob();
                    const objUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = objUrl;
                    a.download = 'SexyLiveRoom.apk';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
                    toast.success('✅ APK inadownload!');
                  } catch {
                    // Fallback: open in new tab
                    window.open(apkUrl, '_blank');
                  }
                } else { 
                  const prompt = (window as any).__pwaInstallPrompt; 
                  if (prompt) prompt.prompt(); 
                  else toast.info('Bonyeza "Install" kwenye browser yako!'); 
                } 
              }} className="btn-primary text-sm px-4 py-2">Install</button>
            </div>
          </div>
        )}

        {/* WhatsApp Support - small card */}
        {isSmallCardVisible('whatsapp_support') && (
          <div className="mx-3 mb-4 content-box p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0"><MessageCircle className="w-6 h-6 text-white" /></div>
              <div className="flex-1"><p className="text-white font-bold">{getSmallCardTitle('whatsapp_support', 'WhatsApp Msaada')}</p><p className="text-gray-400 text-xs">Tuwasiliane nawe moja kwa moja 24/7</p></div>
              <button onClick={() => { const num = (settings.whatsapp_support || '+255655299602').replace(/\D/g, ''); window.open(`https://wa.me/${num}`, '_blank'); }} className="bg-green-600 text-white font-bold px-4 py-2 rounded-xl text-sm">Piga</button>
            </div>
          </div>
        )}

        {/* VIP Upgrade - small card */}
        {user && !profile?.is_vip && !profile?.is_business && isSmallCardVisible('vip_upgrade') && (
          <div className="mx-3 mb-4 content-box p-4" style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.1), rgba(255,140,0,0.1))', borderColor: 'rgba(255,215,0,0.3)' }}>
            <div className="flex items-center gap-3">
              <Crown className="w-10 h-10 text-yellow-400" />
              <div className="flex-1"><p className="text-yellow-400 font-bold">{getSmallCardTitle('vip_upgrade', 'Fungua VIP Member!')}</p><p className="text-gray-400 text-xs">Tuma picha/video, ona namba, na faida nyingi zaidi</p></div>
              <button onClick={() => navigate('/services')} className="text-sm font-bold px-4 py-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#000' }}>Jiunge</button>
            </div>
          </div>
        )}

        {/* AI Support - small card */}
        {isSmallCardVisible('ai_support') && (
          <div className="mx-3 mb-4">
            <button onClick={() => navigate('/support')} className="w-full p-4 rounded-2xl text-white font-bold flex items-center justify-center gap-3 active:scale-95" style={{ background: 'linear-gradient(135deg, #FF1493, #7C3AED)' }}>
              <MessageCircle className="w-5 h-5" /> {getSmallCardTitle('ai_support', 'AI MSAADA WA MOJA KWA MOJA')}
            </button>
          </div>
        )}

        <div className="h-4" />
      </div>

      <BottomNav />
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}
