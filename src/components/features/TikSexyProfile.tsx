
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Plus, Video, Download, Wifi, WifiOff, X, Send, ChevronLeft, Gift, RefreshCw, Clock } from 'lucide-react';
import { toast } from 'sonner';
import BlueTick from '@/components/features/BlueTick';
import { TikPost, TikSexyLogo, isVideoFile, TikGiftModal } from '@/components/features/TikSexyShared';
import { FeedItem } from '@/components/features/TikSexyFeed';

// ─── Thumbnail with video duration ───────────────────────────────────────────
function VideoDurationThumb({ post, onClick, onMouseDown, onMouseUp, onMouseLeave, onTouchStart, onTouchEnd, children }: {
  post: TikPost; onClick: () => void;
  onMouseDown?: () => void; onMouseUp?: () => void; onMouseLeave?: () => void;
  onTouchStart?: () => void; onTouchEnd?: () => void;
  children?: React.ReactNode;
}) {
  const [duration, setDuration] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaUrl = post.media_url || post.media_urls?.[0] || '';
  const isVid = isVideoFile(mediaUrl);
  const thumb = post.thumbnail_url;

  function formatDur(s: number) {
    if (!s || isNaN(s) || !isFinite(s)) return '';
    const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  return (
    <div className="relative cursor-pointer active:opacity-80" style={{ aspectRatio: '9/16' }}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}>
      {thumb ? (
        <img src={thumb} alt={post.title} className="w-full h-full object-cover" />
      ) : !isVid ? (
        <img src={mediaUrl} alt={post.title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-[#1a0a1a] flex items-center justify-center">
          <Video className="w-6 h-6 text-gray-500" />
        </div>
      )}
      {/* Hidden video to load duration */}
      {isVid && !duration && (
        <video
          ref={videoRef}
          src={mediaUrl}
          className="hidden"
          preload="metadata"
          onLoadedMetadata={e => {
            const d = (e.target as HTMLVideoElement).duration;
            if (d && isFinite(d)) setDuration(formatDur(d));
          }}
        />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)' }} />
      <div className="absolute bottom-1 left-1 flex items-center gap-1">
        {isVid && <span className="text-white text-[10px]">▶</span>}
        <span className="text-white text-xs font-bold">{post.views || 0}</span>
      </div>
      {duration && (
        <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1 py-0.5">
          <span className="text-white text-[9px] font-bold">{duration}</span>
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Mini Chat Overlay ────────────────────────────────────────────────────────
function MiniChat({ targetUserId, targetUsername, onClose }: { targetUserId: string; targetUsername: string; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    loadMessages();
    const t = setInterval(loadMessages, 3000);
    return () => clearInterval(t);
  }, [user, targetUserId]);

  async function loadMessages() {
    if (!user) return;
    const { data } = await supabase.from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true }).limit(30);
    setMessages(data || []);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  async function sendMsg() {
    if (!user || !text.trim()) return;
    const t = text.trim(); setText('');
    await supabase.from('messages').insert({ sender_id: user.id, receiver_id: targetUserId, content: t });
    loadMessages();
  }

  if (!user) return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-[#0d0d0d] rounded-t-3xl p-6 text-center">
      <p className="text-white">Ingia kwanza</p>
      <button onClick={() => navigate('/login')} className="mt-3 gradient-pink text-white px-6 py-2 rounded-full font-bold">Ingia</button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col justify-end" onClick={onClose}>
      <div className="bg-[#0d0d0d] rounded-t-3xl flex flex-col" style={{ maxHeight: '75vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <button onClick={onClose}><ChevronLeft className="w-5 h-5 text-gray-400" /></button>
          <span className="text-white font-black flex-1">@{targetUsername}</span>
          <button onClick={() => navigate(`/chat/${targetUserId}`)} className="text-primary text-xs font-bold">Fungua Chat Kamili</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ minHeight: 200, maxHeight: 400 }}>
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.sender_id === user.id ? 'gradient-pink text-white' : 'bg-white/10 text-white'}`}>
                {m.content}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10">
          <input value={text} onChange={e => setText(e.target.value)}
            placeholder="Andika ujumbe..."
            className="flex-1 bg-white/10 rounded-full px-4 py-2.5 text-white text-sm outline-none border border-white/10 focus:border-primary/50"
            onKeyDown={e => e.key === 'Enter' && sendMsg()} />
          <button onClick={sendMsg} className="w-10 h-10 rounded-full gradient-pink flex items-center justify-center flex-shrink-0">
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Post Viewer inside profile ───────────────────────────────────────────────
function InlinePostViewer({ posts, startIdx, onClose, myProfile, saveData, autoSwap }: {
  posts: TikPost[]; startIdx: number; onClose: () => void; myProfile: any; saveData?: boolean; autoSwap?: boolean;
}) {
  const [activeIdx, setActiveIdx] = useState(startIdx);
  const containerRef = useRef<HTMLDivElement>(null);
  const goNext = useCallback(() => setActiveIdx(i => Math.min(i + 1, posts.length - 1)), [posts.length]);
  const goPrev = useCallback(() => setActiveIdx(i => Math.max(i - 1, 0)), []);
  const touchRef = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    let lw = 0;
    const h = (e: WheelEvent) => {
      e.preventDefault(); const n = Date.now(); if (n - lw < 400) return; lw = n;
      if (e.deltaY > 0) goNext(); else goPrev();
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [goNext, goPrev]);

  // Virtualization: only render 5 posts around active index (prev2, prev1, current, next1, next2)
  const RENDER_WINDOW = 2;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" ref={containerRef}
      onTouchStart={e => { touchRef.current = { y: e.touches[0].clientY, t: Date.now() }; }}
      onTouchEnd={e => {
        if (!touchRef.current) return;
        const dy = e.changedTouches[0].clientY - touchRef.current.y;
        const dt = Date.now() - touchRef.current.t;
        if (Math.abs(dy) > 50 && dt < 500) { if (dy < 0) goNext(); else goPrev(); }
        touchRef.current = null;
      }}>
      <div className="absolute top-3 left-3 z-50">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
      </div>
      {/* Virtualization: only render 5 posts around active index - prevents lag with 100+ posts */}
      {posts.map((post, idx) => {
        const offset = idx - activeIdx;
        // Only render posts within ±RENDER_WINDOW of active index
        if (Math.abs(offset) > RENDER_WINDOW) return null;
        return (
          <div key={post.id} className="absolute inset-0"
            style={{
              transform: `translateY(${offset * 100}%)`,
              transition: Math.abs(offset) <= 1 ? 'transform 0.25s ease' : 'none',
              willChange: Math.abs(offset) <= 1 ? 'transform' : 'auto',
            }}>
            <FeedItem post={post} isActive={idx === activeIdx} onNext={goNext} onPrev={goPrev}
              myProfile={myProfile} onOpenProfile={() => {}} saveData={saveData || false} autoSwap={autoSwap} />
          </div>
        );
      })}
    </div>
  );
}

// ─── TikSexy User Profile (TikTok style) ─────────────────────────────────────
export function TikSexyUserProfile({ userId, onClose, onOpenPost }: {
  userId: string; onClose: () => void;
  onOpenPost: (post: TikPost, allPosts: TikPost[], idx: number) => void;
}) {
  const { user, profile: myProfile } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<TikPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [showFollowersList, setShowFollowersList] = useState(false);
  const [showFollowingList, setShowFollowingList] = useState(false);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [showMiniChat, setShowMiniChat] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [inlinePostViewer, setInlinePostViewer] = useState<{ idx: number } | null>(null);
  const isMe = user?.id === userId;

  useEffect(() => {
    loadProfile(); loadPosts(); loadStats();
    if (user && !isMe) {
      supabase.from('tik_follows').select('id').eq('follower_id', user.id).eq('following_id', userId).maybeSingle()
        .then(({ data }) => setFollowing(!!data));
    }
  }, [userId, user]);

  async function loadProfile() {
    const { data } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
    setProfile(data); setLoading(false);
  }

  async function loadPosts() {
    const { data } = await supabase.from('content_posts')
      .select('*, uploader:uploader_id(username,avatar_url,blue_tick,is_admin,is_business)')
      .eq('uploader_id', userId).order('created_at', { ascending: false });
    setPosts((data || []) as TikPost[]);
  }

  async function loadStats() {
    const [{ count: frs }, { count: fing }] = await Promise.all([
      supabase.from('tik_follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('tik_follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
    ]);
    setFollowerCount(frs || 0);
    setFollowingCount(fing || 0);
  }

  useEffect(() => {
    if (posts.length > 0) {
      supabase.from('tik_likes').select('id', { count: 'exact', head: true }).in('post_id', posts.map(p => p.id))
        .then(({ count }) => setLikeCount(count || 0));
    }
  }, [posts]);

  async function handleFollow() {
    if (!user) { navigate('/login'); return; }
    if (following) {
      setFollowing(false); setFollowerCount(c => Math.max(0, c - 1));
      await supabase.from('tik_follows').delete().eq('follower_id', user.id).eq('following_id', userId);
    } else {
      setFollowing(true); setFollowerCount(c => c + 1);
      await supabase.from('tik_follows').insert({ follower_id: user.id, following_id: userId });
      await supabase.from('notifications').insert({ user_id: userId, title: '👤 Mfuasi Mpya', message: `${myProfile?.username || 'Mtu'} amekufuata`, type: 'follow' });
    }
  }

  async function loadFollowersList() {
    const { data } = await supabase.from('tik_follows').select('follower:follower_id(id,username,avatar_url,blue_tick)').eq('following_id', userId);
    setFollowersList((data || []).map((d: any) => d.follower));
    setShowFollowersList(true);
  }

  async function loadFollowingList() {
    const { data } = await supabase.from('tik_follows').select('following:following_id(id,username,avatar_url,blue_tick)').eq('follower_id', userId);
    setFollowingList((data || []).map((d: any) => d.following));
    setShowFollowingList(true);
  }

  if (loading) return (
    <div className="absolute inset-0 z-30 bg-black flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const UserListModal = ({ list, title, onClose2 }: { list: any[]; title: string; onClose2: () => void }) => (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end" onClick={onClose2}>
      <div className="w-full bg-[#0d0d0d] rounded-t-3xl max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-4 py-3 border-b border-white/10">
          <span className="text-white font-bold">{title}</span>
          <button onClick={onClose2}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        {list.map(u => (
          <div key={u?.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/20">
              {u?.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" /> :
                <div className="w-full h-full gradient-pink flex items-center justify-center text-white font-bold">{u?.username?.[0]?.toUpperCase()}</div>}
            </div>
            <span className="text-white">@{u?.username}</span>
            {u?.blue_tick && <BlueTick tickId={u.blue_tick} size={14} />}
          </div>
        ))}
        <div className="h-4" />
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-30 bg-black" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {/* Top bar - clean, centered name with blue tick BEFORE name */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-black/80 backdrop-blur-sm">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          {/* Username then blue tick AFTER */}
          <span className="text-white font-black text-base">{profile?.username || 'Profaili'}</span>
          {profile?.blue_tick && <BlueTick tickId={profile.blue_tick} size={16} />}
        </div>
        {/* Gift icon - top right */}
        {!isMe ? (
          <button onClick={() => user ? setShowGiftModal(true) : navigate('/login')}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
            <Gift className="w-5 h-5 text-orange-300" />
          </button>
        ) : (
          <div className="w-9 h-9 flex-shrink-0" />
        )}
      </div>

      <div className="px-4 pt-4 pb-4 text-center">
        <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary mx-auto mb-3">
          {profile?.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" /> :
            <div className="w-full h-full gradient-pink flex items-center justify-center">
              <span className="text-white font-black text-4xl">{profile?.username?.[0]?.toUpperCase() || '?'}</span>
            </div>}
        </div>
        <div className="flex items-center justify-center gap-2 mb-1">
          {/* Username then blue tick AFTER */}
          <p className="text-white font-black text-lg">@{profile?.username}</p>
          {profile?.blue_tick && <BlueTick tickId={profile.blue_tick} size={18} />}
        </div>
        {profile?.is_vip && <span className="vip-badge text-xs mb-2 inline-block">VIP</span>}
        {profile?.is_admin && <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">Admin</span>}
        {profile?.is_business && !profile?.is_admin && <span className="text-[10px] bg-blue-600/20 text-blue-300 px-2 py-0.5 rounded-full">Business</span>}

        {/* Stats */}
        <div className="flex justify-center gap-8 mt-3 mb-4">
          <button className="text-center" onClick={loadFollowingList}>
            <p className="text-white font-black text-xl">{followingCount}</p>
            <p className="text-gray-400 text-xs">Wafuasi</p>
          </button>
          <div className="w-px bg-white/10" />
          <button className="text-center" onClick={loadFollowersList}>
            <p className="text-white font-black text-xl">{followerCount}</p>
            <p className="text-gray-400 text-xs">Wanaomfuata</p>
          </button>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-white font-black text-xl">{likeCount}</p>
            <p className="text-gray-400 text-xs">Likes</p>
          </div>
        </div>

        {isMe ? (
          <button onClick={() => navigate('/profile/edit')} className="px-8 py-2 rounded-full border border-white/30 text-white text-sm font-semibold">
            Hariri Profaili
          </button>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <button onClick={handleFollow}
              className={`px-8 py-2 rounded-full text-sm font-black ${following ? 'border border-white/30 text-white' : 'gradient-pink text-white'}`}>
              {following ? 'Unfuata' : 'Fuata'}
            </button>
            <button onClick={() => setShowMiniChat(true)}
              className="px-6 py-2 rounded-full border border-white/30 text-white text-sm font-semibold">
              Ujumbe
            </button>
          </div>
        )}
      </div>

      {/* Posts grid */}
      {posts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Video className="w-12 h-12 mx-auto mb-2 opacity-20" />
          <p>Bado hajapakia video yoyote</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5">
          {posts.map((post, idx) => (
            <VideoDurationThumb key={post.id} post={post} onClick={() => setInlinePostViewer({ idx })} />
          ))}
          <div className="h-4" />
        </div>
      )}
      <div className="h-4" />

      {showFollowersList && <UserListModal list={followersList} title={`Wanaomfuata (${followerCount})`} onClose2={() => setShowFollowersList(false)} />}
      {showFollowingList && <UserListModal list={followingList} title={`Wafuasi (${followingCount})`} onClose2={() => setShowFollowingList(false)} />}
      {showMiniChat && profile && <MiniChat targetUserId={userId} targetUsername={profile.username} onClose={() => setShowMiniChat(false)} />}
      {showGiftModal && myProfile && profile && (
        <TikGiftModal post={{ id: userId, uploader_id: userId, type: 'malaya', media_url: '' } as any} myProfile={myProfile} onClose={() => setShowGiftModal(false)} />
      )}
      {inlinePostViewer !== null && (
        <InlinePostViewer posts={posts} startIdx={inlinePostViewer.idx} onClose={() => setInlinePostViewer(null)} myProfile={myProfile} />
      )}
    </div>
  );
}

// ─── My Profile Tab ───────────────────────────────────────────────────────────────────────
export function TikSexyProfile({ onOpenProfile, onOpenPost, saveData, setSaveData, autoSwap, setAutoSwap }: {
  onOpenProfile: (uid: string) => void;
  onOpenPost: (post: TikPost, allPosts: TikPost[], idx: number) => void;
  saveData: boolean; setSaveData: (v: boolean) => void;
  autoSwap: boolean; setAutoSwap: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [myPosts, setMyPosts] = useState<TikPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [showFollowersList, setShowFollowersList] = useState(false);
  const [showFollowingList, setShowFollowingList] = useState(false);
  const [showLikesList, setShowLikesList] = useState(false);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [likersList, setLikersList] = useState<any[]>([]);
  const [inlinePostViewer, setInlinePostViewer] = useState<{ idx: number } | null>(null);
  const longPressTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadPosts();
    supabase.from('tik_follows').select('id', { count: 'exact', head: true }).eq('following_id', user.id)
      .then(({ count }) => setFollowerCount(count || 0));
    supabase.from('tik_follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id)
      .then(({ count }) => setFollowingCount(count || 0));
  }, [user]);

  async function loadPosts() {
    const { data } = await supabase.from('content_posts').select('*').eq('uploader_id', user!.id).order('created_at', { ascending: false });
    const p = (data || []) as TikPost[];
    setMyPosts(p);
    if (p.length > 0) {
      const { count } = await supabase.from('tik_likes').select('id', { count: 'exact', head: true }).in('post_id', p.map(x => x.id));
      setLikeCount(count || 0);
    }
    setLoading(false);
  }

  async function loadFollowersList() {
    const { data } = await supabase.from('tik_follows').select('follower:follower_id(id,username,avatar_url,blue_tick)').eq('following_id', user!.id);
    setFollowersList((data || []).map((d: any) => d.follower));
    setShowFollowersList(true);
  }

  async function loadFollowingList() {
    const { data } = await supabase.from('tik_follows').select('following:following_id(id,username,avatar_url,blue_tick)').eq('follower_id', user!.id);
    setFollowingList((data || []).map((d: any) => d.following));
    setShowFollowingList(true);
  }

  async function loadLikersList() {
    if (myPosts.length === 0) return;
    const { data } = await supabase.from('tik_likes').select('user:user_id(id,username,avatar_url,blue_tick)').in('post_id', myPosts.map(p => p.id)).limit(50);
    setLikersList((data || []).map((d: any) => d.user));
    setShowLikesList(true);
  }

  function handleLongPressStart(postId: string) {
    longPressTimers.current[postId] = setTimeout(() => { setSelectMode(true); setSelected(new Set([postId])); }, 700);
  }
  function handleLongPressEnd(postId: string) {
    if (longPressTimers.current[postId]) { clearTimeout(longPressTimers.current[postId]); delete longPressTimers.current[postId]; }
  }
  function toggleSelect(postId: string) {
    if (!selectMode) return;
    setSelected(prev => { const n = new Set(prev); if (n.has(postId)) n.delete(postId); else n.add(postId); return n; });
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Futa post ${selected.size}? Haiwezi kurudishwa.`)) return;
    for (const id of selected) {
      await supabase.from('content_posts').delete().eq('id', id).eq('uploader_id', user!.id);
    }
    setMyPosts(prev => prev.filter(p => !selected.has(p.id)));
    setSelected(new Set()); setSelectMode(false);
    toast.success('✅ Post zimefutwa!');
  }

  if (!user || !profile) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black p-6 text-center">
      <button onClick={() => navigate('/login')} className="mt-4 gradient-pink text-white font-bold px-8 py-3 rounded-full">Ingia</button>
    </div>
  );

  const UserListModal = ({ list, title, onClose2 }: { list: any[]; title: string; onClose2: () => void }) => (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end" onClick={onClose2}>
      <div className="w-full bg-[#0d0d0d] rounded-t-3xl max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-4 py-3 border-b border-white/10">
          <span className="text-white font-bold">{title}</span>
          <button onClick={onClose2}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        {list.map((u, i) => (
          <div key={u?.id || i} className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/20">
              {u?.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" /> :
                <div className="w-full h-full gradient-pink flex items-center justify-center text-white font-bold">{u?.username?.[0]?.toUpperCase()}</div>}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white">@{u?.username}</span>
              {u?.blue_tick && <BlueTick tickId={u.blue_tick} size={14} />}
            </div>
          </div>
        ))}
        <div className="h-4" />
      </div>
    </div>
  );

  return (
    <div className="flex-1 bg-black" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0, flex: '1 1 0' }}>
      {/* Profile header */}
      <div className="px-4 pb-4 text-center">
        <div className="relative w-24 h-24 mx-auto mb-3">
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary">
            {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" /> :
              <div className="w-full h-full gradient-pink flex items-center justify-center">
                <span className="text-white font-black text-4xl">{profile.username?.[0]?.toUpperCase() || '?'}</span>
              </div>}
          </div>
          <button onClick={() => navigate('/profile/edit')}
            className="absolute bottom-0 right-0 w-7 h-7 rounded-full gradient-pink flex items-center justify-center border-2 border-black">
            <Plus className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 mb-1">
          {/* Username then blue tick AFTER on my profile */}
          <p className="text-white font-black text-xl">@{profile.username}</p>
          {profile.blue_tick && <BlueTick tickId={profile.blue_tick} size={20} />}
        </div>
        {profile.is_vip && <span className="vip-badge text-xs mb-1 inline-block">VIP</span>}
        {profile.is_admin && <span className="text-[11px] bg-primary/20 text-primary px-2 py-0.5 rounded-full block w-fit mx-auto mt-1">Admin</span>}

        {/* Stats */}
        <div className="flex justify-center gap-8 mt-4 mb-4">
          <button className="text-center" onClick={loadFollowingList}>
            <p className="text-white font-black text-xl">{followingCount}</p>
            <p className="text-gray-400 text-xs">Wafuasi</p>
          </button>
          <div className="w-px bg-white/10" />
          <button className="text-center" onClick={loadFollowersList}>
            <p className="text-white font-black text-xl">{followerCount}</p>
            <p className="text-gray-400 text-xs">Wanaomfuata</p>
          </button>
          <div className="w-px bg-white/10" />
          <button className="text-center" onClick={loadLikersList}>
            <p className="text-white font-black text-xl">{likeCount}</p>
            <p className="text-gray-400 text-xs">Likes</p>
          </button>
        </div>

        <button onClick={() => navigate('/profile/edit')} className="px-8 py-2 rounded-full border border-white/30 text-white text-sm font-semibold">
          Hariri Profaili
        </button>
      </div>

      {selectMode && (
        <div className="sticky top-0 z-10 bg-black/90 px-4 py-2 flex items-center justify-between border-b border-white/10">
          <span className="text-white text-sm font-semibold">{selected.size} zimechaguliwa</span>
          <div className="flex gap-2">
            <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm">Ghairi</button>
            <button onClick={deleteSelected} disabled={selected.size === 0} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50">Futa ({selected.size})</button>
          </div>
        </div>
      )}

      {!selectMode && myPosts.length > 0 && <p className="text-gray-600 text-xs text-center mb-2">Shikilia kwa muda kuchagua na kufuta post</p>}

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : myPosts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Video className="w-12 h-12 mx-auto mb-2 opacity-20" />
          <p>Bado hujapakia video yoyote</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5">
            {myPosts.map((post, postIdx) => (
          <VideoDurationThumb key={post.id} post={post}
                onClick={() => selectMode ? toggleSelect(post.id) : setInlinePostViewer({ idx: postIdx })}
                onMouseDown={() => handleLongPressStart(post.id)}
                onMouseUp={() => handleLongPressEnd(post.id)}
                onMouseLeave={() => handleLongPressEnd(post.id)}
                onTouchStart={() => handleLongPressStart(post.id)}
                onTouchEnd={() => handleLongPressEnd(post.id)}
              >
                {selectMode && (
                  <div className={`absolute top-1 right-1 w-5 h-5 rounded-full border-2 ${selected.has(post.id) ? 'border-primary bg-primary' : 'border-white/50 bg-black/50'} flex items-center justify-center`}>
                    {selected.has(post.id) && <X className="w-3 h-3 text-white" />}
                  </div>
                )}
              </VideoDurationThumb>
            ))}
        </div>
      )}
      <div className="h-4" />

      {showFollowersList && <UserListModal list={followersList} title={`Wanaomfuata (${followerCount})`} onClose2={() => setShowFollowersList(false)} />}
      {showFollowingList && <UserListModal list={followingList} title={`Wafuasi (${followingCount})`} onClose2={() => setShowFollowingList(false)} />}
      {showLikesList && <UserListModal list={likersList} title={`Waliopenda (${likeCount})`} onClose2={() => setShowLikesList(false)} />}
      {inlinePostViewer !== null && (
        <InlinePostViewer posts={myPosts} startIdx={inlinePostViewer.idx} onClose={() => setInlinePostViewer(null)} myProfile={profile} saveData={saveData} autoSwap={autoSwap} />
      )}
    </div>
  );
}
