import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, uploadFile } from '@/lib/supabase';
import { ArrowLeft, Home, Radio, Plus, MessageCircle, User, Send, X, Video, Search, Heart, Share2, Gift, Bookmark, WifiOff, Wifi, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import BlueTick from '@/components/features/BlueTick';
import { generateVideoThumbnail } from '@/lib/generateThumbnail';
import { UserProfile, Message } from '@/types';
import { useApp } from '@/contexts/AppContext';
import { PlanPickerModal } from '@/pages/Services';
import { TikPost, videoCache, isVideoFile, getSaveData, persistSaveData, TikSexyLogo, CommentPanel, TikGiftModal, NotifBell } from '@/components/features/TikSexyShared';
import { FeedItem, SearchModal, TikSexyHome } from '@/components/features/TikSexyFeed';
import { TikSexyProfile, TikSexyUserProfile } from '@/components/features/TikSexyProfile';
import LiveDiscover from '@/pages/LiveDiscover';

// ─── Persist auto-swap ───────────────────────────────────────────────────────
function getAutoSwap() { try { return localStorage.getItem('tiksexy_autoswap') === '1'; } catch { return false; } }
function persistAutoSwap(v: boolean) { try { localStorage.setItem('tiksexy_autoswap', v ? '1' : '0'); } catch {} }

// ─── TikSexy Live (shows discover INLINE - keeps bottom nav) ─────────────────
function TikSexyLive({ onGoLive }: { onGoLive: () => void }) {
  const navigate = useNavigate();
  return (
    <LiveDiscover
      inline
      onNavigate={(path) => {
        if (path === '/live/setup') onGoLive();
        else navigate(path);
      }}
    />
  );
}

// ─── Upload Step 1 - directly open gallery ───────────────────────────────────
function TikSexyUploadStep1({ onFileSelected, onGoLive }: {
  onFileSelected: (file: File, preview: string, isVideo: boolean, thumbnail?: Blob | null) => void;
  onGoLive: () => void;
}) {
  const { requireAuth } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const preview = URL.createObjectURL(f);
    const isVid = f.type.startsWith('video');
    // Go to step 2 IMMEDIATELY without waiting for thumbnail
    onFileSelected(f, preview, isVid, null);
    // Generate thumbnail in background
    if (isVid) {
      try {
        const thumb = await generateVideoThumbnail(f);
        if (thumb) onFileSelected(f, preview, isVid, thumb); // Update thumbnail
      } catch {}
    }
  }

  // Auto-open file picker on mount
  useEffect(() => {
    requireAuth(() => {
      fileRef.current?.click(); // Immediate - no delay
    });
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black p-6">
      <TikSexyLogo size={80} />
      <p className="text-white font-bold mt-4 text-lg">Chagua picha au video...</p>
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
      <button onClick={() => requireAuth(() => fileRef.current?.click())}
        className="mt-6 gradient-pink text-white font-bold px-8 py-3 rounded-full">
        Chagua Tena
      </button>
    </div>
  );
}

// ─── Upload Step 2 ────────────────────────────────────────────────────────────
function TikSexyUploadStep2({ file, preview, isVideo, thumbnail, onBack }: {
  file: File; preview: string; isVideo: boolean; thumbnail?: Blob | null; onBack: () => void;
}) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [showInTiksexy, setShowInTiksexy] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedMB, setUploadedMB] = useState(0);
  const [done, setDone] = useState(false);
  const [processing, setProcessing] = useState(false);
  // TikSexy upload - mute and audio actually work
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [thumbPreview, setThumbPreview] = useState('');
  const audioRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (thumbnail) setThumbPreview(URL.createObjectURL(thumbnail));
  }, [thumbnail]);

  // Apply mute to preview video
  useEffect(() => {
    if (videoPreviewRef.current) videoPreviewRef.current.muted = isMuted;
  }, [isMuted]);

  // Control audio element when audioFile changes
  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    if (audioFile) {
      const el = new Audio(URL.createObjectURL(audioFile));
      el.loop = true;
      el.volume = 1;
      el.play().catch(() => {});
      audioElRef.current = el;
    }
    return () => { if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current = null; } };
  }, [audioFile]);

  async function handleUpload() {
    if (!user || !profile) { navigate('/login'); return; }
    setUploading(true);
    const ext = file.name.split('.').pop() || 'mp4';
    const path = `posts/${user.id}/${Date.now()}.${ext}`;
    const mediaUrl = await uploadFile('content', path, file, p => { setProgress(Math.round(p)); setUploadedMB(file.size * p / 100 / 1024 / 1024); });
    
    // Immediately show processing state at 100% - before DB write
    setProgress(100);
    setProcessing(true);
    
    let thumbUrl = '';
    if (isVideo) {
      try {
        const tb = thumbnail || await generateVideoThumbnail(file);
        if (tb) {
          const tp = `posts/${user.id}/${Date.now()}_thumb.jpg`;
          thumbUrl = await uploadFile('content', tp, tb);
        }
      } catch {}
    }
    // Upload audio file if provided
    let audioUrl = '';
    if (audioFile) {
      try {
        const audioExt = audioFile.name.split('.').pop() || 'mp3';
        const audioPath = `posts/${user.id}/${Date.now()}_audio.${audioExt}`;
        audioUrl = await uploadFile('content', audioPath, audioFile);
      } catch {}
    }
    await supabase.from('content_posts').insert({
      type: isVideo ? 'video' : 'malaya', title: title.trim() || undefined,
      media_url: mediaUrl, thumbnail_url: thumbUrl || undefined,
      uploader_id: user.id, is_free: true, price: 0, views: 0,
      show_in_tiksexy: true,
      source: 'tiksexy',
      audio_url: audioUrl || null,
    } as any).select('id').single();

    // Notify all followers about new upload
    try {
      const { data: follows } = await supabase.from('tik_follows').select('follower_id').eq('following_id', user.id);
      if (follows && follows.length > 0) {
        const sectionLabel = isVideo ? '🎬 Video' : '💋 Malaya';
        const notifs = follows.map((f: any) => ({
          user_id: f.follower_id,
          title: `📤 Upload Mpya kutoka @${profile.username}!`,
          message: `${sectionLabel}: ${title.trim() || 'Post mpya'}`,
          type: 'new_upload',
          link: '/tiksexy',
        }));
        for (let i = 0; i < notifs.length; i += 50) {
          await supabase.from('notifications').insert(notifs.slice(i, i + 50));
        }
      }
    } catch {}

    setProcessing(false);
    setDone(true); setUploading(false);
    toast.success('✅ Imepakiwa!');
  }

  if (done) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black text-center px-6">
      <div className="text-6xl mb-4">✅</div>
      <p className="text-white font-black text-2xl mb-2">Imepakiwa!</p>
      <button onClick={onBack} className="gradient-pink text-white font-bold px-8 py-3 rounded-full">Rudi Nyumbani</button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button onClick={onBack} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
        <h2 className="text-white font-bold">Maelezo ya Post</h2>
        <button onClick={handleUpload} disabled={uploading} className="gradient-pink text-white font-black px-4 py-2 rounded-xl text-sm disabled:opacity-60">
          {uploading ? (processing ? 'Inachakata...' : `${progress}%`) : 'Upload'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Preview - with per-file mute control */}
        <div className="rounded-2xl overflow-hidden bg-[#1a0a1a]" style={{ aspectRatio: '9/16', maxHeight: '40vh' }}>
          {isVideo
            ? <video ref={videoPreviewRef} src={preview} className="w-full h-full object-cover" controls muted={isMuted} playsInline poster={thumbPreview || undefined} onPlay={() => { if (audioElRef.current) { audioElRef.current.currentTime = 0; audioElRef.current.play().catch(() => {}); } }} onPause={() => { audioElRef.current?.pause(); }} />
            : <img src={preview} alt="" className="w-full h-full object-cover" />}
        </div>
        {/* Show auto-generated thumbnail */}
        {isVideo && thumbPreview && (
          <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
            <img src={thumbPreview} alt="Cover" className="w-14 h-20 object-cover rounded-lg" />
            <div>
              <p className="text-white text-sm font-semibold">✅ Cover imeundwa</p>
              <p className="text-gray-400 text-xs">Picha ya jalada imewekwa moja kwa moja</p>
            </div>
          </div>
        )}
        <textarea value={title} onChange={e => setTitle(e.target.value)} placeholder="Andika maelezo ya post yako..." rows={4}
          className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white text-base outline-none focus:border-primary/60 resize-none" />
        {/* Mute + Add Music — WORKING implementation */}
        {isVideo && (
          <div className="flex gap-2">
            <button onClick={() => { const newMuted = !isMuted; setIsMuted(newMuted); if (videoPreviewRef.current) videoPreviewRef.current.muted = newMuted; }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border flex-1 transition-all ${
                isMuted ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-white/5 text-gray-400 border-white/10'
              }`}>
              <span>🔇</span> {isMuted ? 'Sauti: IMEZIMWA' : 'Zima Sauti'}
            </button>
            <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border flex-1 cursor-pointer transition-all ${
              audioFile ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-white/5 text-gray-400 border-white/10'
            }`}>
              <span>🎵</span> {audioFile ? audioFile.name.slice(0, 14) + '...' : 'Ongeza Mziki'}
              <input ref={audioRef} type="file" accept="audio/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0] || null;
                setAudioFile(f);
              }} />
            </label>
          </div>
        )}
        {/* Photo: show audio button too */}
        {!isVideo && (
          <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
            audioFile ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-white/5 text-gray-400 border-white/10'
          }`}>
            <span>🎵</span> {audioFile ? audioFile.name.slice(0, 20) + '...' : 'Ongeza Mziki kwenye Photo'}
            <input type="file" accept="audio/*" className="hidden" onChange={e => setAudioFile(e.target.files?.[0] || null)} />
          </label>
        )}
        {audioFile && (
          <div className="flex items-center gap-2 bg-green-500/10 rounded-xl p-2 border border-green-500/20">
            <audio src={URL.createObjectURL(audioFile)} controls className="flex-1" style={{ height: '32px' }} />
            <button onClick={() => setAudioFile(null)} className="text-red-400"><X className="w-4 h-4" /></button>
          </div>
        )}
        {uploading && (
          <div className="bg-[#1a0a1a] rounded-2xl p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-white font-semibold">{processing ? '⏳ Inachakata (Processing)...' : '📤 Inapakia...'}</span>
              <span className="text-primary font-black">{processing ? 'Uploading...' : `${progress}%`}</span>
            </div>
            {!processing && (
              <>
                <div className="h-2 bg-[#2a0a2a] rounded-full overflow-hidden">
                  <div className="h-full gradient-pink rounded-full transition-all" style={{ width: `${Math.max(2, progress)}%` }} />
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-gray-500 text-xs">{uploadedMB.toFixed(1)} MB / {(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  <p className="text-gray-600 text-xs">{progress}%</p>
                </div>
              </>
            )}
            {processing && (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-xs">Inaweka kwenye seva... tafadhali subiri</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Go Live (redirects to setup page) ──────────────────────────────────────
function TikSexyGoLive({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  useEffect(() => { navigate('/live/setup'); }, []);
  return (
    <div className="flex-1 flex items-center justify-center bg-black">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Inbox (mirrors Chat) ─────────────────────────────────────────────────────
function TikSexyInbox() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t, language } = useApp();
  const [threads, setThreads] = useState<any[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'chats' | 'members'>('chats');
  const [loading, setLoading] = useState(true);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [planSettings, setPlanSettings] = useState<any>({});

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchThreads(); fetchMembers();
    supabase.from('app_settings').select('*').then(({ data }) => { const m: any = {}; data?.forEach((r: any) => { m[r.key] = r.value; }); setPlanSettings(m); });
    const interval = setInterval(fetchThreads, 4000);
    const updateOnline = () => supabase.from('user_profiles').update({ is_online: !document.hidden, last_seen: new Date().toISOString() }).eq('id', user.id);
    updateOnline();
    const oi = setInterval(updateOnline, 8000);
    const hv = () => supabase.from('user_profiles').update({ is_online: !document.hidden, last_seen: new Date().toISOString() }).eq('id', user.id);
    document.addEventListener('visibilitychange', hv);
    return () => { clearInterval(interval); clearInterval(oi); document.removeEventListener('visibilitychange', hv); };
  }, [user]);

  async function fetchThreads() {
    if (!user) return;
    const { data: msgs } = await supabase.from('messages')
      .select('*, sender:sender_id(id,username,avatar_url,blue_tick,is_vip,last_seen,is_online), receiver:receiver_id(id,username,avatar_url,blue_tick,is_vip,last_seen,is_online)')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('created_at', { ascending: false });
    if (!msgs) return;
    const map = new Map<string, any>();
    msgs.forEach((msg: any) => {
      const other = msg.sender_id === user.id ? msg.receiver : msg.sender;
      if (!other?.id) return;
      if (!map.has(other.id)) {
        const diff = other.last_seen ? Date.now() - new Date(other.last_seen).getTime() : 999999;
        map.set(other.id, { user: other, lastMessage: msg, unreadCount: 0, isOnline: !!other.is_online && diff < 30000 });
      }
      if (msg.receiver_id === user.id && !msg.read) map.get(other.id)!.unreadCount++;
    });
    setThreads(Array.from(map.values())); setLoading(false);
  }

  async function fetchMembers() {
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('*').neq('id', user.id).eq('account_status', 'active')
      .order('is_admin', { ascending: false }).order('is_business', { ascending: false }).limit(200);
    setMembers((data || []) as UserProfile[]);
  }

  const handleOpenChat = (userId: string, targetUser?: UserProfile) => {
    const isPriv = profile?.is_vip || profile?.is_business || profile?.is_admin;
    if (!isPriv && targetUser && !targetUser.is_admin && !targetUser.is_business) {
      setShowPlanPicker(true); return;
    }
    navigate(`/chat/${userId}`);
  };

  const ft = threads.filter(th => th.user.username?.toLowerCase().includes(search.toLowerCase()));
  const fm = members.filter(m => m.username?.toLowerCase().includes(search.toLowerCase()));

  if (!user) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#050208] p-6 text-center">
      <MessageCircle className="w-16 h-16 text-primary/30 mb-4" />
      <p className="text-white font-bold text-lg">Ingia Kwanza</p>
      <button onClick={() => navigate('/login')} className="mt-4 gradient-pink text-white font-bold px-8 py-3 rounded-full">Ingia</button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#050208]">
      <div className="px-4 py-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input type="text" placeholder="Tafuta member..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-10 py-2" />
        </div>
      </div>
      <div className="flex px-4 gap-2 mb-2 flex-shrink-0">
        {(['chats', 'members'] as const).map(tk => (
          <button key={tk} onClick={() => setTab(tk)}
            className={`flex-1 py-2 rounded-xl font-semibold text-sm ${tab === tk ? 'gradient-pink text-white' : 'text-gray-400 bg-[#1a0a1a]'}`}>
            {tk === 'chats' ? (language === 'en' ? 'Chats' : 'Mazungumzo') : t('members')}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'chats' ? (
          ft.length === 0 ? <div className="flex items-center justify-center h-40 text-gray-500"><p>{t('chat_no_msgs')}</p></div> :
          ft.map((th: any) => (
            <button key={th.user.id} onClick={() => handleOpenChat(th.user.id, th.user)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-[#1a0a1a]">
              <div className="relative">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-primary/30">
                  {th.user.avatar_url ? <img src={th.user.avatar_url} alt="" className="w-full h-full object-cover" /> :
                    <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-bold">{th.user.username?.[0]?.toUpperCase()}</span></div>}
                </div>
                {th.unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{th.unreadCount}</span>}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-1">
                  <span className={`font-semibold ${th.unreadCount > 0 ? 'text-white' : 'text-gray-200'}`}>{th.user.username}</span>
                  {th.user.blue_tick && <BlueTick tickId={th.user.blue_tick} size={14} />}
                </div>
                <p className={`text-sm truncate ${th.unreadCount > 0 ? 'text-white font-semibold' : 'text-gray-400'}`}>
                  {th.lastMessage?.content ? (th.lastMessage.sender_id === th.user.id ? '' : 'Wewe: ') + th.lastMessage.content : 'Bonyeza kuanza'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${th.isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
                <span className={`text-[10px] ${th.isOnline ? 'text-green-400' : 'text-gray-500'}`}>{th.isOnline ? 'Online' : ''}</span>
              </div>
            </button>
          ))
        ) : (
          fm.map((member: UserProfile) => (
            <button key={member.id} onClick={() => handleOpenChat(member.id, member)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-[#1a0a1a]">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-primary/30">
                {member.avatar_url ? <img src={member.avatar_url} alt="" className="w-full h-full object-cover" /> :
                  <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-bold">{member.username?.[0]?.toUpperCase()}</span></div>}
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-1">
                  <span className="text-white font-semibold">{member.username}</span>
                  {member.blue_tick && <BlueTick tickId={member.blue_tick} size={14} />}
                </div>
                <p className="text-gray-500 text-xs">{member.is_business ? 'Business Account' : 'Member'}</p>
              </div>
              <div className="text-primary text-sm">{t('send')}</div>
            </button>
          ))
        )}
      </div>
      {showPlanPicker && <PlanPickerModal onClose={() => setShowPlanPicker(false)} settings={planSettings} message="Unahitaji VIP au Business Account" onSuccess={() => setShowPlanPicker(false)} />}
    </div>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────
function TikBottomNav({ activeTab, onTab, liveBadge, inboxBadge, profileBadge }: { activeTab: string; onTab: (t: string) => void; liveBadge?: number; inboxBadge?: number; profileBadge?: number }) {
  return (
    <div className="flex-shrink-0 flex items-center justify-around bg-black border-t border-white/10 h-14 px-2">
      {[
        { key: 'home', Icon: Home, label: 'home', badge: 0 },
        { key: 'live', Icon: Radio, label: 'live', badge: liveBadge || 0 },
        { key: 'upload', Icon: Plus, label: '', isCenter: true, badge: 0 },
        { key: 'inbox', Icon: MessageCircle, label: 'inbox', badge: inboxBadge || 0 },
        { key: 'profile', Icon: User, label: 'profile', badge: profileBadge || 0 },
      ].map(item => (
        <button key={item.key} onClick={() => onTab(item.key)} className="flex flex-col items-center gap-0.5 flex-1 py-2">
          {item.isCenter ? (
            <div className="flex items-center justify-center" style={{ width: 44, height: 28, background: 'linear-gradient(90deg, #69C9D0 0%, #69C9D0 40%, #ff0050 60%, #ff0050 100%)', borderRadius: 8, position: 'relative' }}>
              <div className="absolute inset-0.5 rounded-md bg-black flex items-center justify-center">
                <Plus className="w-5 h-5 text-white" />
              </div>
            </div>
          ) : (
            <div className="relative">
              <item.Icon className={`w-6 h-6 ${activeTab === item.key ? 'text-white' : 'text-gray-500'}`} />
              {(item.badge || 0) > 0 && (
                <span style={{ position: 'absolute', top: -7, right: -9, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 900, minWidth: 17, height: 17, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', zIndex: 9999, border: '1.5px solid #000', lineHeight: 1, pointerEvents: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.8)' }}>
                  {(item.badge || 0) > 99 ? '99+' : item.badge}
                </span>
              )}
            </div>
          )}
          {!item.isCenter && (
            <span className={`text-[10px] font-semibold ${activeTab === item.key ? 'text-white' : 'text-gray-500'}`}>{item.label}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Post Viewer Overlay (from profile grid click) ────────────────────────────
function PostViewer({ posts, startIdx, onClose, myProfile, saveData, autoSwap }: {
  posts: TikPost[]; startIdx: number; onClose: () => void; myProfile: any; saveData: boolean; autoSwap: boolean;
}) {
  const [activeIdx, setActiveIdx] = useState(startIdx);
  const containerRef = useRef<HTMLDivElement>(null);
  const goNext = useCallback(() => setActiveIdx(i => Math.min(i + 1, posts.length - 1)), [posts.length]);
  const goPrev = useCallback(() => setActiveIdx(i => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    let lw = 0;
    const h = (e: WheelEvent) => { e.preventDefault(); const n = Date.now(); if (n - lw < 400) return; lw = n; if (e.deltaY > 0) goNext(); else goPrev(); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [goNext, goPrev]);

  return (
    <div className="absolute inset-0 z-40 bg-black flex flex-col" ref={containerRef}>
      <div className="absolute top-3 left-3 z-50">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
      </div>
      {posts.map((post, idx) => (
        <div key={post.id} className="absolute inset-0 transition-transform duration-300" style={{ transform: `translateY(${(idx - activeIdx) * 100}%)` }}>
          <FeedItem post={post} isActive={idx === activeIdx} onNext={goNext} onPrev={goPrev}
            myProfile={myProfile} onOpenProfile={() => {}} saveData={saveData} autoSwap={autoSwap} />
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function TikSexy() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [showGoLive, setShowGoLive] = useState(false);
  const [uploadFileState, setUploadFileState] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState('');
  const [uploadIsVideo, setUploadIsVideo] = useState(false);
  const [uploadThumbnail, setUploadThumbnail] = useState<Blob | null>(null);
  const [uploadStep, setUploadStep] = useState<1 | 2>(1);
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
  const [postViewer, setPostViewer] = useState<{ posts: TikPost[]; idx: number } | null>(null);
  const [saveData, setSaveDataState] = useState(getSaveData());
  const [autoSwap, setAutoSwapState] = useState(getAutoSwap());
  const [feedTab, setFeedTab] = useState<'foryou' | 'following'>('foryou');
  const [showSearch, setShowSearch] = useState(false);
  const [tikLiveBadge, setTikLiveBadge] = useState(0);
  const [tikInboxBadge, setTikInboxBadge] = useState(0);
  const [tikProfileBadge, setTikProfileBadge] = useState(0);

  // Poll badges for TikSexy bottom nav
  useEffect(() => {
    if (!user) return;
    const fetchBadges = async () => {
      try {
        // Live badge: active live sessions
        const { count: lc } = await supabase.from('live_sessions').select('*', { count: 'exact', head: true }).eq('status', 'live');
        setTikLiveBadge(Math.min(lc || 0, 99));
        // Inbox badge: unread messages
        const { count: mc } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('read', false);
        setTikInboxBadge(Math.min(mc || 0, 99));
        // Profile badge: new followers
        const lastCheck = parseInt(localStorage.getItem('slr_tik_follower_check') || '0');
        const since = lastCheck > 0 ? new Date(lastCheck).toISOString() : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: fc } = await supabase.from('tik_follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id).gt('created_at', since);
        setTikProfileBadge(Math.min(fc || 0, 99));
      } catch {}
    };
    fetchBadges();
    const iv = setInterval(fetchBadges, 8000);
    return () => clearInterval(iv);
  }, [user?.id]);

  function handleSetSaveData(v: boolean) { setSaveDataState(v); persistSaveData(v); }
  function handleSetAutoSwap(v: boolean) { setAutoSwapState(v); persistAutoSwap(v); }

  function handleTabChange(tab: string) {
    if (tab === 'go_live') { setShowGoLive(true); return; }
    if (tab !== 'upload') { setUploadStep(1); setUploadFileState(null); if (uploadPreview) URL.revokeObjectURL(uploadPreview); setUploadPreview(''); setUploadThumbnail(null); }
    if (tab === 'live') setTikLiveBadge(0);
    if (tab === 'inbox') setTikInboxBadge(0);
    if (tab === 'profile') { setTikProfileBadge(0); try { localStorage.setItem('slr_tik_follower_check', Date.now().toString()); } catch {} }
    setActiveTab(tab); setShowGoLive(false);
  }

  function handleFileSelected(file: File, preview: string, isVideo: boolean, thumbnail?: Blob | null) {
    setUploadFileState(file); setUploadPreview(preview); setUploadIsVideo(isVideo); setUploadThumbnail(thumbnail || null); setUploadStep(2);
  }

  function handleUploadBack() {
    if (uploadStep === 2) { setUploadStep(1); setUploadFileState(null); if (uploadPreview) URL.revokeObjectURL(uploadPreview); setUploadPreview(''); setUploadThumbnail(null); }
    else setActiveTab('home');
  }

  // Hide top bar when: upload step2 showing, go live, user profile open, search open
  const showTopBar = !(activeTab === 'upload' && uploadStep === 2) && !showGoLive && !openProfileId && !showSearch;

  const renderContent = () => {
    if (showGoLive) return <TikSexyGoLive onBack={() => setShowGoLive(false)} />;
    switch (activeTab) {
      case 'home': return (
        <TikSexyHome
          onTabChange={handleTabChange}
          onOpenProfile={id => setOpenProfileId(id)}
          saveData={saveData}
          feedTab={feedTab}
          setFeedTab={setFeedTab}
          autoSwap={autoSwap}
          showSearch={showSearch}
          setShowSearch={setShowSearch}
          initialPostId={searchParams.get('post')}
        />
      );
      case 'live': return <TikSexyLive onGoLive={() => setShowGoLive(true)} />;
      case 'upload':
        if (uploadStep === 2 && uploadFileState) return (
          <TikSexyUploadStep2 file={uploadFileState} preview={uploadPreview} isVideo={uploadIsVideo} thumbnail={uploadThumbnail} onBack={handleUploadBack} />
        );
        return <TikSexyUploadStep1 onFileSelected={handleFileSelected} onGoLive={() => setShowGoLive(true)} />;
      case 'inbox': return <TikSexyInbox />;
      case 'profile': return (
        <div className="flex-1 flex flex-col" style={{ minHeight: 0, overflow: 'hidden' }}>
          <TikSexyProfile
            onOpenProfile={id => setOpenProfileId(id)}
            onOpenPost={(post, posts, idx) => setPostViewer({ posts, idx })}
            saveData={saveData}
            setSaveData={handleSetSaveData}
            autoSwap={autoSwap}
            setAutoSwap={handleSetAutoSwap}
          />
        </div>
      );
      default: return (
        <TikSexyHome
          onTabChange={handleTabChange}
          onOpenProfile={id => setOpenProfileId(id)}
          saveData={saveData}
          feedTab={feedTab}
          setFeedTab={setFeedTab}
          autoSwap={autoSwap}
          showSearch={showSearch}
          setShowSearch={setShowSearch}
          initialPostId={searchParams.get('post')}
        />
      );
    }
  };

  const isFullscreen = activeTab === 'home';

  // Profile and other non-fullscreen tabs need proper scroll container
  const contentClass = isFullscreen && !showGoLive
    ? 'flex-1 relative overflow-hidden'
    : activeTab === 'profile' || activeTab === 'inbox' || activeTab === 'live' || activeTab === 'upload'
      ? 'flex-1 flex flex-col overflow-hidden'
      : 'flex-1 flex flex-col overflow-hidden';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Top bar */}
      {showTopBar && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3"
          style={{
            height: 52, zIndex: 50,
            background: isFullscreen ? 'transparent' : 'rgba(0,0,0,0.9)',
            position: isFullscreen ? 'absolute' : 'relative',
            top: 0, left: 0, right: 0,
          }}>
          {/* Back button */}
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>

          {/* Home: tabs + search in same row */}
          {activeTab === 'home' && (
            <>
              <div className="flex-1 flex items-center justify-center gap-4">
                <button onClick={() => setFeedTab('following')}
                  className={`text-sm font-semibold drop-shadow-md ${feedTab === 'following' ? 'text-white font-black border-b-2 border-white pb-0.5' : 'text-white/60'}`}>
                  Wafuasi
                </button>
                <div className="w-px h-4 bg-white/30" />
                <button onClick={() => setFeedTab('foryou')}
                  className={`text-sm font-semibold drop-shadow-md ${feedTab === 'foryou' ? 'text-white font-black border-b-2 border-white pb-0.5' : 'text-white/60'}`}>
                  Kwako
                </button>
              </div>
              <button
                onClick={() => setShowSearch(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
                <Search className="w-5 h-5 text-white" />
              </button>
            </>
          )}

          {/* Live tab */}
          {activeTab === 'live' && <span className="flex-1 text-center text-white font-black text-base">LIVE</span>}
          {activeTab === 'inbox' && <span className="flex-1 text-center text-white font-black text-base">Inbox</span>}

          {/* Profile tab: title + Save Data toggle + Auto-swap toggle */}
          {activeTab === 'profile' && (
            <>
              <span className="flex-1 text-center text-white font-black text-base">Profaili</span>
              {/* Auto-swap toggle */}
              <button onClick={() => { const v = !autoSwap; handleSetAutoSwap(v); toast.info(v ? '🔄 Auto-Swap: ON' : '⏸ Auto-Swap: OFF'); }}
                className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full flex-shrink-0" title="Auto Swap">
                <RefreshCw className={`w-3.5 h-3.5 ${autoSwap ? 'text-green-400' : 'text-gray-400'}`} />
                <span className={`text-[10px] font-bold ${autoSwap ? 'text-green-400' : 'text-gray-400'}`}>{autoSwap ? 'ON' : 'OFF'}</span>
              </button>
              {/* Save Data toggle */}
              <button onClick={() => { const v = !saveData; handleSetSaveData(v); toast.info(v ? '💾 Data Saver: ON' : '📶 Data Saver: OFF'); }}
                className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full flex-shrink-0">
                {saveData ? <WifiOff className="w-3.5 h-3.5 text-yellow-400" /> : <Wifi className="w-3.5 h-3.5 text-green-400" />}
                <span className={`text-[10px] font-bold ${saveData ? 'text-yellow-400' : 'text-green-400'}`}>{saveData ? 'ON' : 'OFF'}</span>
              </button>
            </>
          )}
          {activeTab === 'upload' && <span className="flex-1 text-center text-white font-black text-base">Pakia</span>}

          {activeTab !== 'home' && activeTab !== 'profile' && <div className="w-9 h-9 flex-shrink-0" />}
        </div>
      )}

      {/* Content */}
      <div className={`${isFullscreen && !showGoLive ? 'flex-1 relative' : 'flex-1 flex flex-col'}`}
        style={isFullscreen && !showGoLive ? { display: 'flex', flexDirection: 'column' } : {}}>
        {renderContent()}
      </div>

      {/* Bottom nav - always visible (including live tab now inline) */}
      {!showGoLive && <TikBottomNav activeTab={activeTab} onTab={handleTabChange} liveBadge={tikLiveBadge} inboxBadge={tikInboxBadge} profileBadge={tikProfileBadge} />}

      {/* User Profile overlay */}
      {openProfileId && (
        <div className="absolute inset-0 z-[200] bg-black">
          <TikSexyUserProfile userId={openProfileId} onClose={() => setOpenProfileId(null)}
            onOpenPost={(post, posts, idx) => { setOpenProfileId(null); setPostViewer({ posts, idx }); }} />
        </div>
      )}

      {/* Post viewer from profile grid */}
      {postViewer && (
        <PostViewer posts={postViewer.posts} startIdx={postViewer.idx} onClose={() => setPostViewer(null)}
          myProfile={profile} saveData={saveData} autoSwap={autoSwap} />
      )}
    </div>
  );
}
