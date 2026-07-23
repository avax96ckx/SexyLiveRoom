import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, uploadFile } from '@/lib/supabase';
import { UserProfile, Transaction, AppSettings, VipPlan, Service, ContentPost, VideoCategory, LiveOption } from '@/types';
import { ArrowLeft, Edit3, Trash2, Check, X, Bell, Upload, Play, Plus, Settings, Users, DollarSign, Package, Palette, Image, Video, ArrowUp, ArrowDown, RefreshCw, Volume2, Radio, ArrowDownCircle, Download, StopCircle, UploadCloud, PauseCircle, PlayCircle, Save, Lock } from 'lucide-react';
import { globalUploadTracker } from '@/lib/supabase';
import { toast } from 'sonner';
import UploadProgress from '@/components/features/UploadProgress';
import { generateVideoThumbnail } from '@/lib/generateThumbnail';
import BlueTick from '@/components/features/BlueTick';

function DetailedProgress({ progress, fileName, fileSize, uploadedBytes }: {
  progress: number; fileName?: string; fileSize?: number; uploadedBytes?: number;
}) {
  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };
  const loaded = uploadedBytes ?? (fileSize ? (fileSize * progress / 100) : 0);
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,20,147,0.08)', border: '1px solid rgba(255,20,147,0.2)' }}>
      {fileName && <p className="text-gray-300 text-xs font-semibold truncate">📁 {fileName}</p>}
      <div className="flex items-center justify-between text-xs">
        <span className="text-primary font-bold animate-pulse">{Math.round(progress)}%</span>
        {fileSize && fileSize > 0 && <span className="text-gray-500">{formatSize(loaded)} / {formatSize(fileSize)}</span>}
      </div>
      <div className="h-1.5 bg-[#1a0a1a] rounded-full overflow-hidden">
        <div className="h-full gradient-pink rounded-full transition-all duration-300" style={{ width: `${Math.max(2, progress)}%` }} />
      </div>
    </div>
  );
}

type AdminTab = 'members' | 'transactions' | 'malaya' | 'video' | 'live' | 'livestreams' | 'settings' | 'notifications' | 'services' | 'theme' | 'sounds' | 'withdrawals' | 'uploads' | 'giftcards' | 'gifts' | 'savecodes' | 'adminservices' | 'tikposts' | 'security' | 'homeedit' | 'xcodes' | 'seo';

function WhatsAppBlastPanel({ members }: { members: UserProfile[] }) {
  const [waMsg, setWaMsg] = useState('');
  const [search, setSearch] = useState('');
  const [sentCount, setSentCount] = useState(0);
  const [copyAll, setCopyAll] = useState(false);

  const withPhone = members.filter(m => m.phone && m.phone.trim());
  const filtered = withPhone.filter(m => !search || m.username?.toLowerCase().includes(search.toLowerCase()) || m.phone?.includes(search));

  function formatWANum(num: string) {
    const d = num.replace(/\D/g, '');
    if (d.startsWith('0') && d.length >= 9) return '255' + d.slice(1);
    if (d.startsWith('255')) return d;
    if (d.startsWith('7') && d.length === 9) return '255' + d;
    return d;
  }

  function openWA(member: UserProfile) {
    if (!member.phone) return;
    const num = formatWANum(member.phone);
    const msg = waMsg.trim() || 'Habari!';
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
    setSentCount(c => c + 1);
  }

  function copyAllNumbers() {
    const nums = filtered.map(m => m.phone).join('\n');
    navigator.clipboard.writeText(nums).then(() => {
      toast.success(`\u2705 Namba ${filtered.length} zimenakiliwa!`);
      setCopyAll(true);
      setTimeout(() => setCopyAll(false), 3000);
    });
  }

  return (
    <div className="space-y-3">
      <textarea value={waMsg} onChange={e => setWaMsg(e.target.value)} placeholder="Andika ujumbe wa WhatsApp hapa... (hiari)" className="input-field min-h-[70px] resize-none" />
      <div className="flex gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tafuta member..." className="input-field flex-1" />
        <button onClick={copyAllNumbers}
          className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
            copyAll ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
          }`}>
          {copyAll ? '\u2713 Imenakiliwa' : '\ud83d\udccb Nakili Zote'}
        </button>
      </div>
      <div className="bg-[#1a0a1a] rounded-xl p-3 flex justify-between items-center">
        <span className="text-gray-400 text-xs">Members wenye simu: <span className="text-white font-bold">{withPhone.length}</span> / {members.length}</span>
        {sentCount > 0 && <span className="text-green-400 text-xs font-bold">\u2705 {sentCount} wametumwa</span>}
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-4">Hakuna members wenye simu</p>
        ) : filtered.map(m => (
          <button key={m.id} onClick={() => openWA(m)}
            className="w-full flex items-center gap-3 p-2.5 bg-[#1a0a1a] rounded-xl hover:bg-green-500/10 border border-transparent hover:border-green-500/30 transition-all active:scale-95 text-left">
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-primary/20">
              {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" /> :
                <div className="w-full h-full gradient-pink flex items-center justify-center text-white text-xs font-bold">{m.username?.[0]?.toUpperCase()}</div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-xs truncate">{m.username}</p>
              <p className="text-gray-400 text-[10px]">{m.phone}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-green-400 text-lg">💬</span>
              <span className="text-green-400 text-[10px] font-bold">WhatsApp</span>
            </div>
          </button>
        ))}
      </div>
      {filtered.length > 0 && (
        <p className="text-gray-600 text-xs text-center">Bonyeza jina la member kufungua WhatsApp kwenye tab mpya</p>
      )}
    </div>
  );
}

function BroadcastToFollowersPanel({ members }: { members: UserProfile[] }) {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [broadTitle, setBroadTitle] = useState('');
  const [broadMsg, setBroadMsg] = useState('');
  const [broadLink, setBroadLink] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const eligibleAccounts = members.filter(m => m.is_admin || m.is_business);

  async function handleBroadcast() {
    if (!selectedAccountId) return toast.error('Chagua account kwanza');
    if (!broadTitle.trim() || !broadMsg.trim()) return toast.error('Jaza kichwa na ujumbe');
    setSending(true); setSentCount(0);
    try {
      const { data: follows } = await supabase.from('tik_follows').select('follower_id').eq('following_id', selectedAccountId);
      if (!follows || follows.length === 0) { toast.info('Account hii hana wafuasi bado'); setSending(false); return; }
      const selectedAccount = eligibleAccounts.find(m => m.id === selectedAccountId);
      const notifs = follows.map((f: any) => ({ user_id: f.follower_id, title: broadTitle.trim(), message: broadMsg.trim(), type: 'new_upload', link: broadLink.trim() || '/tiksexy' }));
      let total = 0;
      for (let i = 0; i < notifs.length; i += 50) {
        await supabase.from('notifications').insert(notifs.slice(i, i + 50));
        total += Math.min(50, notifs.length - i); setSentCount(total);
      }
      toast.success(`✅ Arifa imetumwa kwa wafuasi ${follows.length} wa @${selectedAccount?.username}!`);
      setBroadTitle(''); setBroadMsg(''); setBroadLink('');
    } catch { toast.error('Hitilafu ya kutuma arifa'); } finally { setSending(false); }
  }

  return (
    <div className="space-y-3">
      <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)} className="input-field">
        <option value="">Chagua Account (Business/Admin)</option>
        {eligibleAccounts.map(m => <option key={m.id} value={m.id}>{m.is_admin ? '⚡ Admin' : '💼 Business'}: {m.username}</option>)}
      </select>
      <input value={broadTitle} onChange={e => setBroadTitle(e.target.value)} placeholder="Kichwa cha arifa *" className="input-field" />
      <textarea value={broadMsg} onChange={e => setBroadMsg(e.target.value)} placeholder="Ujumbe wa arifa *" className="input-field min-h-[70px] resize-none" />
      <input value={broadLink} onChange={e => setBroadLink(e.target.value)} placeholder="Link ya kuelekea (default: /tiksexy)" className="input-field" />
      {sentCount > 0 && <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3"><span className="text-green-400 font-bold">{sentCount}</span><span className="text-gray-400 text-sm">wafuasi wamepata arifa</span></div>}
      <button onClick={handleBroadcast} disabled={sending || !selectedAccountId || !broadTitle || !broadMsg} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
        {sending ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Inatuma...</> : <>📢 Tuma kwa Wafuasi Wote</>}
      </button>
    </div>
  );
}

function AdminLiveSessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<any[]>([]);
  const [bannedUsers, setBannedUsers] = useState<any[]>([]);
  const [banHistory, setBanHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'ended' | 'banned' | 'history'>('all');
  const [banReasonModal, setBanReasonModal] = useState<{hostId: string; username: string} | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState<'1'|'7'|'30'|'forever'>('forever');

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  async function load() {
    const [{ data: sess }, { data: banned }, { data: history }] = await Promise.all([
      supabase.from('live_sessions').select('*, host:host_id(id,username,avatar_url,email,phone,is_blocked,account_status)').order('created_at', { ascending: false }).limit(100),
      supabase.from('user_profiles').select('id,username,avatar_url,email,phone,account_status,ban_expires_at,created_at').eq('account_status', 'live_banned'),
      supabase.from('live_ban_history').select('*, admin:admin_id(username,avatar_url), target:user_id(username,avatar_url)').order('created_at', { ascending: false }).limit(100),
    ]);
    setSessions(sess || []);
    // Auto-unban expired bans
    const now = new Date();
    const expiredBans = (banned || []).filter((u: any) => u.ban_expires_at && new Date(u.ban_expires_at) <= now);
    for (const u of expiredBans) {
      const adminId = (await supabase.auth.getUser()).data.user?.id || '';
      await supabase.from('user_profiles').update({ account_status: 'active', ban_expires_at: null }).eq('id', u.id);
      await supabase.from('notifications').insert({ user_id: u.id, title: '✅ Ban Imeisha - Live Imefunguliwa', message: 'Muda wa kuzuiwa live umekwisha. Unaweza tena kutumia live! 🕊️', type: 'system' });
      await supabase.from('live_ban_history').insert({ admin_id: adminId || null, user_id: u.id, action: 'unban', reason: 'Ban ya muda imeisha otomatiki' });
    }
    setBannedUsers((banned || []).filter((u: any) => !expiredBans.find((e: any) => e.id === u.id)));
    setBanHistory(history || []);
    setLoading(false);
  }

  async function endSession(id: string, hostId: string) {
    if (!window.confirm('Maliza live hii?')) return;
    await supabase.from('live_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', id);
    await supabase.from('live_options').update({ is_online: false }).eq('uploader_id', hostId);
    toast.success('Live imekwisha!'); load();
  }

  async function toggleBan(hostId: string, username: string, isBanned: boolean, reason?: string, durationDays?: number) {
    const adminId = (await supabase.auth.getUser()).data.user?.id || '';
    if (isBanned) {
      await supabase.from('user_profiles').update({ account_status: 'active', ban_expires_at: null }).eq('id', hostId);
      await supabase.from('notifications').insert({ user_id: hostId, title: '✅ Live Imefunguliwa', message: 'Live yako imefunguliwa na Admin. Unaweza tena kutumia live! 🕊️', type: 'system' });
      await supabase.from('live_ban_history').insert({ admin_id: adminId, user_id: hostId, action: 'unban', reason: reason || 'Admin unban from Live Sessions panel' });
      toast.success(`${username} amefunguliwa live!`);
    } else {
      const banExpiresAt = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString() : null;
      await supabase.from('user_profiles').update({ account_status: 'live_banned', ban_expires_at: banExpiresAt }).eq('id', hostId);
      await supabase.from('live_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('host_id', hostId).eq('status', 'live');
      await supabase.from('live_options').update({ is_online: false }).eq('uploader_id', hostId);
      const durationText = durationDays ? ` kwa siku ${durationDays}` : ' milele';
      const banMsg = reason ? `Live yako imezuiwa na Admin${durationText}. Sababu: ${reason}. Wasiliana na Admin kupitia WhatsApp au Inbox.` : `Live yako imezuiwa na Admin${durationText}. Wasiliana na Admin kupitia WhatsApp au Inbox.`;
      await supabase.from('notifications').insert({ user_id: hostId, title: '🚫 Live Imefungwa', message: banMsg, type: 'system' });
      await supabase.from('live_ban_history').insert({ admin_id: adminId, user_id: hostId, action: 'ban', reason: reason || 'Admin ban from Live Sessions panel' });
      toast.success(`${username} live imezuiwa${durationDays ? ` kwa siku ${durationDays}` : ' milele'}!`);
    }
    load();
  }

  async function unbanUser(userId: string, username: string) {
    const adminId = (await supabase.auth.getUser()).data.user?.id || '';
    await supabase.from('user_profiles').update({ account_status: 'active' }).eq('id', userId);
    await supabase.from('notifications').insert({ user_id: userId, title: '✅ Live Imefunguliwa', message: 'Live yako imefunguliwa na Admin. Unaweza tena kutumia live! 🕊️', type: 'system' });
    await supabase.from('live_ban_history').insert({ admin_id: adminId, user_id: userId, action: 'unban', reason: 'Admin unban from Ban History panel' });
    toast.success(`${username} amefunguliwa!`);
    load();
  }

  function timeSince(ts: string) {
    const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (secs < 60) return `${secs}s`; if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  }

  const filtered = sessions.filter(s => filterStatus === 'all' || s.status === filterStatus);
  const liveCount = sessions.filter(s => s.status === 'live').length;

  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-2">{liveCount > 0 && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}<h3 className="text-white font-bold">Live Sessions</h3></div>
        {liveCount > 0 && <span className="bg-red-500/20 text-red-400 text-xs font-black px-2 py-0.5 rounded-full">{liveCount} LIVE</span>}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'live', 'ended', 'banned', 'history'] as const).map(f => (
          <button key={f} onClick={() => setFilterStatus(f)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 ${filterStatus === f ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
            {f === 'all' ? 'Zote' : f === 'live' ? '🟢 Zinaendelea' : f === 'ended' ? 'Zilizokwisha' : f === 'banned' ? `🚫 Waliobaniwa (${bannedUsers.length})` : `📋 Historia (${banHistory.length})`}
          </button>
        ))}
      </div>

      {/* Ban History Panel */}
      {filterStatus === 'banned' && (
        <div className="space-y-3">
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
            <h4 className="text-red-400 font-bold text-sm mb-1">🚫 Historia ya Bans - Live</h4>
            <p className="text-gray-500 text-xs">Watu wote waliozuiwa kutumia Live. Bonyeza "Fungua" kuwaruhusu tena.</p>
          </div>
          {bannedUsers.length === 0 ? (
            <div className="text-center py-10 text-gray-500 bg-[#0d0d0d] rounded-2xl border border-white/5">
              <span className="text-4xl block mb-3">✅</span>
              <p className="font-semibold">Hakuna mtumiaji aliyebaniwa live sasa hivi</p>
              <p className="text-xs mt-1 text-gray-600">Watu wote wana ruhusa ya kutumia Live</p>
            </div>
          ) : bannedUsers.map((u: any) => (
            <div key={u.id} className="rounded-2xl overflow-hidden border border-red-500/25" style={{ background: 'rgba(10,3,15,0.98)' }}>
              {/* Red header bar */}
              <div className="h-1.5 w-full bg-gradient-to-r from-red-600 to-red-400" />
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 bg-red-500/20 border-2 border-red-500/40">
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-red-400 font-black text-xl">{u.username?.[0]?.toUpperCase()}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-white font-black text-base">@{u.username}</p>
                      <span className="bg-red-500/20 text-red-400 text-[9px] font-black px-2 py-0.5 rounded-full border border-red-500/30">🚫 LIVE BANNED</span>
                    </div>
                    <p className="text-gray-500 text-xs">{u.phone || u.email}</p>
                    {(u as any).ban_expires_at && (
                      <p className="text-orange-400 text-[10px] font-semibold mt-0.5">⏰ Inaisha: {new Date((u as any).ban_expires_at).toLocaleDateString('sw-TZ')} ({Math.max(0, Math.ceil((new Date((u as any).ban_expires_at).getTime() - Date.now()) / (1000*60*60*24)))} siku)</p>
                    )}
                    {!(u as any).ban_expires_at && <p className="text-red-400 text-[10px] font-semibold mt-0.5">🔴 Milele</p>}
                  </div>
                </div>
                <div className="bg-red-500/8 border border-red-500/15 rounded-xl p-3 mb-3">
                  <p className="text-gray-400 text-xs text-center">Mtumiaji huyu hawezi kuanza Live hadi admin amfungue</p>
                </div>
                <button onClick={() => unbanUser(u.id, u.username)}
                  className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}>
                  <Check className="w-4 h-4 text-white" />
                  <span className="text-white">Fungua Live ya @{u.username}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ban History Panel */}
      {filterStatus === 'history' && (
        <div className="space-y-3">
          <div className="bg-[#1a0a1a] border border-white/10 rounded-2xl p-4">
            <h4 className="text-white font-bold text-sm mb-1">📋 Historia ya Ban/Unban - Live</h4>
            <p className="text-gray-500 text-xs">Matukio yote ya ban na unban yaliyofanywa na admin.</p>
          </div>
          {banHistory.length === 0 ? (
            <div className="text-center py-10 text-gray-500 bg-[#0d0d0d] rounded-2xl border border-white/5">
              <span className="text-4xl block mb-3">📋</span>
              <p className="font-semibold">Hakuna historia ya bans bado</p>
            </div>
          ) : banHistory.map((h: any) => (
            <div key={h.id} className={`rounded-2xl overflow-hidden border ${h.action === 'ban' ? 'border-red-500/25' : 'border-green-500/25'}`} style={{ background: 'rgba(10,3,15,0.98)' }}>
              <div className={`h-1 w-full ${h.action === 'ban' ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-green-600 to-green-400'}`} />
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border-2 ${h.action === 'ban' ? 'border-red-500/40 bg-red-500/10' : 'border-green-500/40 bg-green-500/10'}`}>
                    {h.target?.avatar_url
                      ? <img src={h.target.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-base font-black" style={{ color: h.action === 'ban' ? '#f87171' : '#4ade80' }}>{h.target?.username?.[0]?.toUpperCase()}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-black">@{h.target?.username || 'Mtumiaji'}</p>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${h.action === 'ban' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>{h.action === 'ban' ? '🚫 BANIWA' : '✅ FUNGULIWA'}</span>
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5">Admin: @{h.admin?.username || 'Admin'}</p>
                    <p className="text-gray-600 text-xs">{new Date(h.created_at).toLocaleString('sw-TZ')}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ban Reason + Duration Modal */}
      {banReasonModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4" onClick={() => setBanReasonModal(null)}>
          <div className="w-full max-w-sm bg-[#0d0d0d] border border-red-500/40 rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <X className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-black text-base">Zuia Live ya @{banReasonModal.username}</h3>
                <p className="text-gray-500 text-xs">Weka sababu na muda wa ban</p>
              </div>
            </div>
            <textarea
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              placeholder="Sababu ya kuzuia (mfano: Maudhui yasiyofaa...)" 
              className="input-field min-h-[80px] resize-none mb-4 text-sm"
              autoFocus
            />
            <div className="mb-4">
              <p className="text-gray-400 text-xs font-semibold mb-2">⏰ Muda wa Ban:</p>
              <div className="grid grid-cols-4 gap-2">
                {([['1', 'Siku 1'], ['7', 'Siku 7'], ['30', 'Siku 30'], ['forever', 'Milele']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setBanDuration(val as any)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      banDuration === val ? 'gradient-pink text-white border-transparent' : 'bg-[#1a0a1a] text-gray-400 border-gray-700'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-gray-600 text-[10px] mt-1.5">
                {banDuration === 'forever' ? '🔴 Milele - hadi admin afungue manually' : `🟡 Itafunguliwa otomatiki baada ya siku ${banDuration}`}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setBanReasonModal(null)} className="flex-1 py-3 rounded-xl border border-white/20 text-gray-400 font-semibold text-sm">Ghairi</button>
              <button onClick={() => {
                const days = banDuration === 'forever' ? undefined : parseInt(banDuration);
                toggleBan(banReasonModal.hostId, banReasonModal.username, false, banReason.trim() || undefined, days);
                setBanReasonModal(null); setBanReason(''); setBanDuration('forever');
              }}
                className="flex-1 py-3 rounded-xl font-black text-white text-sm flex items-center justify-center gap-2 active:scale-95"
                style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                <X className="w-4 h-4" /> Zuia Live
              </button>
            </div>
          </div>
        </div>
      )}

      {filterStatus !== 'banned' && filterStatus !== 'history' && (
        loading ? <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          : filtered.length === 0 ? <div className="text-center py-8 text-gray-500"><Radio className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>Hakuna live sessions bado</p></div>
          : filtered.map(s => {
            const isLive = s.status === 'live';
            const isBanned = s.host?.account_status === 'live_banned';
            return (
              <div key={s.id} className="content-box p-4">
                <div className="flex items-start gap-3">
                  <div className="w-16 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#1a0a1a] flex items-center justify-center">
                    {s.cover_url ? <img src={s.cover_url} alt="" className="w-full h-full object-cover" /> : <Radio className="w-6 h-6 text-gray-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {isLive && <span className="flex items-center gap-1 bg-red-600 px-1.5 py-0.5 rounded-full"><div className="w-1 h-1 rounded-full bg-white animate-pulse" /><span className="text-white text-[9px] font-black">LIVE</span></span>}
                      <p className="text-white font-bold text-sm truncate">{s.title || 'Live Session'}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-gray-400 text-xs">@{s.host?.username || 'Host'}</p>
                      {isBanned && <span className="bg-red-500/20 text-red-400 text-[9px] font-black px-1.5 py-0.5 rounded-full border border-red-500/30">🚫 BANNED</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5">
                      <p className="text-gray-500 text-[10px]">👁 {s.viewer_count || 0} viewers</p>
                      <p className="text-gray-500 text-[10px]">❤️ {s.like_count || 0} likes</p>
                      <p className="text-gray-500 text-[10px]">💬 {s.comment_count || 0} maoni</p>
                      <p className="text-yellow-400 text-[10px]">🪙 {s.gift_coin_earned || 0} coins</p>
                      <p className="text-gray-500 text-[10px]">⏱️ {isLive ? timeSince(s.started_at) : 'Imekwisha'}</p>
                      <p className="text-gray-500 text-[10px]">{new Date(s.started_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {isLive ? (
                    <button onClick={() => navigate(`/live/${s.id}`)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-primary/20 text-primary border border-primary/30 active:scale-95"><Play className="w-3.5 h-3.5" /> Angalia</button>
                  ) : (
                    <button onClick={() => navigate(`/live/replay/${s.id}`)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 active:scale-95"><Save className="w-3.5 h-3.5" /> Hifadhi Live</button>
                  )}
                  {isLive && <button onClick={() => endSession(s.id, s.host_id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 active:scale-95"><StopCircle className="w-3.5 h-3.5" /> Maliza</button>}
                  <button onClick={() => {
                    if (isBanned) { toggleBan(s.host_id, s.host?.username || 'Host', true); }
                    else { setBanReasonModal({ hostId: s.host_id, username: s.host?.username || 'Host' }); setBanReason(''); }
                  }}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border active:scale-95 transition-all ${
                      isBanned ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
                    }`}>
                    {isBanned ? <><Check className="w-3.5 h-3.5" /> Unban</> : <><X className="w-3.5 h-3.5" /> Ban</>}
                  </button>
                </div>
              </div>
            );
          })
      )}
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [tab, setTab] = useState<AdminTab>('members');
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<any[]>([]);
  const [settings, setSettings] = useState<AppSettings>({});
  const [vipPlans, setVipPlans] = useState<VipPlan[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [editSettings, setEditSettings] = useState<AppSettings>({});
  const [editMember, setEditMember] = useState<UserProfile | null>(null);
  const [editService, setEditService] = useState<Service | null>(null);
  const [editVipPlan, setEditVipPlan] = useState<VipPlan | null>(null);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMsg, setNotifMsg] = useState('');
  const [notifLink, setNotifLink] = useState('');
  const [notifTarget, setNotifTarget] = useState<'all' | 'one'>('all');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [malayaPosts, setMalayaPosts] = useState<ContentPost[]>([]);
  const [videoPosts, setVideoPosts] = useState<ContentPost[]>([]);
  const [livePosts, setLivePosts] = useState<LiveOption[]>([]);
  const [howVideos, setHowVideos] = useState<ContentPost[]>([]);
  const [videoCategories, setVideoCategories] = useState<VideoCategory[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileSize, setUploadFileSize] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [editPost, setEditPost] = useState<ContentPost | null>(null);
  const [editLive, setEditLive] = useState<LiveOption | null>(null);
  const [txFilter, setTxFilter] = useState<'pending' | 'all' | 'approved' | 'rejected'>('pending');
  const [saving, setSaving] = useState(false);
  const userIsEditing = useRef(false);
  const editSettingsInitialized = useRef(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [boxes, setBoxes] = useState<any[]>([]);
  const [editBoxTitle, setEditBoxTitle] = useState<Record<string, string>>({});
  const [pendingBoxTitles, setPendingBoxTitles] = useState<Record<string, string>>({});
  const [savingBoxTitles, setSavingBoxTitles] = useState<Record<string, boolean>>({});
  const [xCodes, setXCodes] = useState<any[]>([]);
  const [xCodeUnlocked, setXCodeUnlocked] = useState<any[]>([]);
  const [showAddService, setShowAddService] = useState(false);
  const [newServiceShowTiksexy, setNewServiceShowTiksexy] = useState(false);
  const [liveUploads, setLiveUploads] = useState<any[]>([]);
  const [completedUploads, setCompletedUploads] = useState<any[]>([]);
  const [uploadMonitorTick, setUploadMonitorTick] = useState(0);
  const [newServiceData, setNewServiceData] = useState({ name: '', description: '', price: '0', action_link: '' });
  const [newServiceImage, setNewServiceImage] = useState<string>('');
  const [newServiceVideo, setNewServiceVideo] = useState<string>('');
  const [uploadingNewService, setUploadingNewService] = useState(false);
  const [giftCards, setGiftCards] = useState<any[]>([]);
  const [giftOptions, setGiftOptions] = useState<any[]>([]);
  const [saveCodes, setSaveCodes] = useState<any[]>([]);
  const [adminServices2, setAdminServices2] = useState<any[]>([]);
  const [editAdminService2, setEditAdminService2] = useState<any | null>(null);
  const [showAddAdminService2, setShowAddAdminService2] = useState(false);
  const [newAdminService2Data, setNewAdminService2Data] = useState({ name: '', description: '', price: '0', action_link: '', show_in_tiksexy: false, image_url: '', video_url: '' });
  const [editGift, setEditGift] = useState<any | null>(null);
  const [bulkBalanceAmount, setBulkBalanceAmount] = useState('');
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [autoRefreshTick, setAutoRefreshTick] = useState(0);
  const [sendingVipReminders, setSendingVipReminders] = useState(false);
  const [homeCards, setHomeCards] = useState<any[]>([
    { id: 'malaya', title: 'MALAYA', icon: '💋', visible: true, order: 0 },
    { id: 'video', title: 'VIDEO', icon: '🎬', visible: true, order: 1 },
    { id: 'live', title: 'LIVE', icon: '🔴', visible: true, order: 2 },
    { id: 'admin_services', title: 'HUDUMA ZA ADMIN', icon: '💋', visible: true, order: 3 },
    { id: 'tiksexy', title: 'TIKTOK SEXY', icon: '🎵', visible: true, order: 4 },
  ]);
  const [smallCards, setSmallCards] = useState<any[]>([
    { id: 'download_app', title: 'Download App', icon: '📥', visible: true, order: 0 },
    { id: 'whatsapp_support', title: 'WhatsApp Msaada', icon: '💬', visible: true, order: 1 },
    { id: 'vip_upgrade', title: 'Fungua VIP Member!', icon: '👑', visible: true, order: 2 },
    { id: 'ai_support', title: 'AI MSAADA WA MOJA KWA MOJA', icon: '🤖', visible: true, order: 3 },
  ]);
  const [savingSmallCards, setSavingSmallCards] = useState(false);
  const [savingHomeCards, setSavingHomeCards] = useState(false);
  const [tikPosts, setTikPosts] = useState<ContentPost[]>([]);
  const [editTikPost, setEditTikPost] = useState<ContentPost | null>(null);
  const [tikBulkSelected, setTikBulkSelected] = useState<string[]>([]);
  const [tikBulkMode, setTikBulkMode] = useState(false);
  const uploadStartTime = useRef<number>(0);
  const uploadedRef = useRef<number>(0);

  const markEditing = () => { userIsEditing.current = true; clearTimeout((markEditing as any)._t); (markEditing as any)._t = setTimeout(() => { userIsEditing.current = false; }, 10000); };

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return; }
    fetchAll();
    loadHomeCards();
    const interval = setInterval(fetchAll, 5000);
    const autoInterval = setInterval(() => {
      fetchAll();
      setLastRefreshed(new Date());
      setAutoRefreshTick(t => t + 1);
    }, 30000);
    const displayInterval = setInterval(() => setAutoRefreshTick(t => t + 1), 60000);
    return () => { clearInterval(interval); clearInterval(autoInterval); clearInterval(displayInterval); };
  }, [isAdmin]);

  // Auto-send VIP expiry reminders when admin opens the panel
  useEffect(() => {
    if (!isAdmin) return;
    sendVipExpiryReminders();
  }, [isAdmin]);

  async function sendVipExpiryReminders() {
    try {
      const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      const { data: expiring } = await supabase.from('user_profiles').select('id,username,vip_expires_at').eq('is_vip', true).lte('vip_expires_at', in3Days).gte('vip_expires_at', now);
      if (!expiring?.length) return;
      for (const vipUser of expiring) {
        const daysLeft = Math.ceil((new Date(vipUser.vip_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await supabase.from('notifications').select('id').eq('user_id', vipUser.id).eq('type', 'vip_expiry_reminder').gte('created_at', dayAgo).maybeSingle();
        if (!existing) {
          await supabase.from('notifications').insert({ user_id: vipUser.id, title: '⏰ VIP Inakwisha Karibuni!', message: `VIP yako inakwisha siku ${daysLeft}! Renew sasa ili usipoteze uwezo wa kurekodi, kudownload na faida nyingine za VIP.`, type: 'vip_expiry_reminder', link: '/wallet?tab=deposit', action_label: 'Renew VIP' });
        }
      }
      if (expiring.length > 0) console.log(`[VIP Reminders] Sent reminders for ${expiring.length} expiring VIPs`);
    } catch (e) { console.warn('[VIP Reminders] Error:', e); }
  }

  async function manualSendVipReminders() {
    setSendingVipReminders(true);
    const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const { data: expiring } = await supabase.from('user_profiles').select('id,username,vip_expires_at').eq('is_vip', true).lte('vip_expires_at', in3Days).gte('vip_expires_at', now);
    if (!expiring?.length) { toast.info('Hakuna VIP member anayekwisha siku 3 zijazo'); setSendingVipReminders(false); return; }
    for (const vipUser of expiring) {
      const daysLeft = Math.ceil((new Date(vipUser.vip_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      await supabase.from('notifications').insert({ user_id: vipUser.id, title: '⏰ VIP Inakwisha Karibuni!', message: `VIP yako inakwisha siku ${daysLeft}! Renew sasa ili usipoteze uwezo wa kurekodi, kudownload na faida nyingine za VIP.`, type: 'vip_expiry_reminder', link: '/wallet?tab=deposit', action_label: 'Renew VIP' });
    }
    toast.success(`✅ Arifa za VIP zimetumwa kwa members ${expiring.length}!`);
    setSendingVipReminders(false);
  }

  async function loadHomeCards() {
    const [{ data: bigData }, { data: smallData }] = await Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'home_cards_config').maybeSingle(),
      supabase.from('app_settings').select('value').eq('key', 'home_small_cards_config').maybeSingle(),
    ]);
    if (bigData?.value) { try { const parsed = JSON.parse(bigData.value); if (Array.isArray(parsed) && parsed.length > 0) setHomeCards(parsed); } catch {} }
    if (smallData?.value) { try { const parsed = JSON.parse(smallData.value); if (Array.isArray(parsed) && parsed.length > 0) setSmallCards(parsed); } catch {} }
  }

  async function saveSmallCards(cards: any[]) {
    setSavingSmallCards(true);
    const value = JSON.stringify(cards);
    await supabase.from('app_settings').upsert({ key: 'home_small_cards_config', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSmallCards([...cards]);
    try { sessionStorage.removeItem('home_settings_cache'); } catch {}
    window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: { home_small_cards_config: value } }));
    setSavingSmallCards(false);
    toast.success('✅ Kadi ndogo zimehifadhiwa!');
  }

  async function saveHomeCards(cards: any[]) {
    setSavingHomeCards(true);
    const value = JSON.stringify(cards);
    await supabase.from('app_settings').upsert({ key: 'home_cards_config', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setHomeCards([...cards]);
    try { sessionStorage.removeItem('home_settings_cache'); } catch {}
    try { sessionStorage.removeItem('home_cards_cache'); } catch {}
    window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: { home_cards_config: value } }));
    setSavingHomeCards(false);
    toast.success('✅ Mipangilio ya nyumbani imehifadhiwa!');
  }

  useEffect(() => {
    if (tab !== 'uploads') return;
    supabase.from('upload_sessions').select('*').in('status', ['completed', 'failed', 'cancelled']).order('completed_at', { ascending: false }).limit(100).then(({ data }) => setCompletedUploads(data || []));
    const getLocalUploads = () => Array.from(globalUploadTracker.sessions.values()).map(s => ({ id: s.sessionId, file_name: s.fileName, file_size: s.fileSize, progress: s.progress, section: s.section, username: s.username, content_type: s.contentType, status: 'uploading', speed: globalUploadTracker.getSpeed(s.sessionId), isLocal: true }));
    const dbActiveRef = { current: [] as any[] };
    const rebuildList = () => { const local = getLocalUploads(); const localIds = new Set(local.map((u: any) => u.id)); const dbOnly = dbActiveRef.current.filter((u: any) => !localIds.has(u.id)); return [...local, ...dbOnly]; };
    const listener = () => setLiveUploads(rebuildList());
    globalUploadTracker.listeners.add(listener); listener();
    const animInterval = setInterval(() => setLiveUploads(rebuildList()), 200);
    const dbInterval = setInterval(async () => {
      const { data } = await supabase.from('upload_sessions').select('*').eq('status', 'uploading').order('started_at', { ascending: false }).limit(50);
      dbActiveRef.current = (data || []).filter((u: any) => !globalUploadTracker.sessions.has(u.id));
      setLiveUploads(rebuildList());
      const { data: done } = await supabase.from('upload_sessions').select('*').in('status', ['completed', 'failed', 'cancelled']).order('completed_at', { ascending: false }).limit(100);
      setCompletedUploads(done || []);
    }, 2500);
    return () => { globalUploadTracker.listeners.delete(listener); clearInterval(animInterval); clearInterval(dbInterval); };
  }, [tab]);

  useEffect(() => {
    if (tab === 'malaya') { fetchMalaya(); fetchBoxes('malaya'); }
    else if (tab === 'video') { fetchVideo(); fetchBoxes('video'); }
    else if (tab === 'live') { fetchLive(); fetchBoxes('live'); }
    else if (tab === 'giftcards') { fetchGiftCards(); }
    else if (tab === 'gifts') { fetchGiftOptions(); }
    else if (tab === 'savecodes') { fetchSaveCodes(); }
    else if (tab === 'xcodes') { fetchXCodes(); }
    else if (tab === 'tikposts') { fetchTikPosts(); }
    else if (tab === 'tikposts') { fetchTikPosts(); }
    else if (tab === 'adminservices') { fetchAdminServices2(); }
  }, [tab]);

  async function fetchAll() {
    const [{ data: m }, { data: t }, { data: s }, { data: v }, { data: sv }, { data: vc }, { data: wr }] = await Promise.all([
      supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('transactions').select('*, user:user_id(username,phone,email)').order('created_at', { ascending: false }).limit(200),
      supabase.from('app_settings').select('*'),
      supabase.from('vip_plans').select('*').order('display_order'),
      supabase.from('services').select('*').order('display_order').order('created_at', { ascending: false }),
      supabase.from('video_categories').select('*').order('display_order'),
      supabase.from('withdrawal_requests').select('*, user:user_id(username,phone,email)').order('created_at', { ascending: false }).limit(50),
    ]);
    setMembers((m || []) as UserProfile[]);
    setTransactions((t || []) as Transaction[]);
    setWithdrawalRequests(wr || []);
    const sm: AppSettings = {}; s?.forEach((r: any) => { sm[r.key] = r.value; });
    setSettings(sm);
    if (!editSettingsInitialized.current) { setEditSettings({ ...sm }); editSettingsInitialized.current = true; }
    else if (!userIsEditing.current) {
      setEditSettings(prev => {
        const merged = { ...sm };
        // Protect ALL keys that user might be editing - don't overwrite any existing prev value
        // This prevents the 3-second reset bug where fetchAll overwrites in-progress edits
        Object.keys(prev).forEach(k => {
          if (prev[k] !== undefined) merged[k] = prev[k];
        });
        return merged;
      });
    }
    setVipPlans((v || []) as VipPlan[]);
    setServices((sv || []) as Service[]);
    setVideoCategories((vc || []) as VideoCategory[]);
  }

  const DEFAULT_GIFTS = [
    { emoji: '🌹', name: 'Waridi', amount: 100 }, { emoji: '💐', name: 'Maua', amount: 200 },
    { emoji: '🍫', name: 'Chokoleti', amount: 500 }, { emoji: '💍', name: 'Pete', amount: 1000 },
    { emoji: '🧸', name: 'Teddy', amount: 2000 }, { emoji: '💎', name: 'Almasi', amount: 5000 },
    { emoji: '🏆', name: 'Trophy', amount: 10000 }, { emoji: '🚗', name: 'Gari', amount: 50000 },
  ];

  async function fetchGiftOptions() {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'gift_options').single();
    if (data?.value) { try { setGiftOptions(JSON.parse(data.value)); return; } catch {} }
    setGiftOptions(DEFAULT_GIFTS);
  }

  async function saveGiftOptions(opts: any[]) {
    await supabase.from('app_settings').upsert({ key: 'gift_options', value: JSON.stringify(opts), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setGiftOptions([...opts]);
    window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: { gift_options: JSON.stringify(opts) } }));
    toast.success('✅ Zawadi zimehifadhiwa!');
  }

  async function fetchGiftCards() {
    const { data } = await supabase.from('gift_cards').select('*').order('created_at', { ascending: false }).limit(100);
    setGiftCards(data || []);
  }

  async function fetchXCodes() {
    const { data } = await supabase.from('x_codes').select('*').order('created_at', { ascending: false }).limit(100);
    setXCodes(data || []);
    // Also fetch unlocked users for X category
    const { data: members } = await supabase.from('user_profiles').select('id,username,avatar_url').limit(500);
    // Find users who used any x_code by checking x_codes.used_by
    const unlocked: any[] = [];
    (data || []).forEach((code: any) => {
      const usedBy = Array.isArray(code.used_by) ? code.used_by : [];
      usedBy.forEach((entry: any) => { if (entry?.user_id) { const m = (members || []).find((u: any) => u.id === entry.user_id); if (m) unlocked.push({ ...m, code: code.code, used_at: entry.used_at }); } });
    });
    setXCodeUnlocked(unlocked);
  }

  async function fetchSaveCodes() {
    const { data } = await supabase.from('save_codes').select('*').order('created_at', { ascending: false }).limit(100);
    setSaveCodes(data || []);
  }

  async function fetchTikPosts() {
    const { data } = await supabase.from('content_posts')
      .select('*, uploader:uploader_id(username)')
      .eq('source', 'tiksexy')
      .order('is_pinned', { ascending: false })
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    setTikPosts((data || []) as ContentPost[]);
  }

  async function pinTikPost(post: ContentPost, pin: boolean) {
    await supabase.from('content_posts').update({ is_pinned: pin, pinned_at: pin ? new Date().toISOString() : null, sort_order: pin ? 999999 : 0 }).eq('id', post.id);
    toast.success(pin ? '📌 Post imepinniwa!' : '✅ Pin imeondolewa!');
    fetchTikPosts();
  }

  async function deleteTikPost(id: string) {
    if (!window.confirm('Futa post hii?')) return;
    await supabase.from('content_posts').delete().eq('id', id);
    toast.success('Imefutwa!'); fetchTikPosts();
  }

  async function swapTikPost(posts: ContentPost[], id: string, dir: 'up' | 'down') {
    const idx = posts.findIndex(p => p.id === id);
    if (dir === 'up' && idx > 0) {
      const a = posts[idx], b = posts[idx - 1];
      await supabase.from('content_posts').update({ sort_order: (b.sort_order || 0) + 1 }).eq('id', a.id);
      await supabase.from('content_posts').update({ sort_order: (a.sort_order || 0) - 1 }).eq('id', b.id);
    } else if (dir === 'down' && idx < posts.length - 1) {
      const a = posts[idx], b = posts[idx + 1];
      await supabase.from('content_posts').update({ sort_order: (b.sort_order || 0) - 1 }).eq('id', a.id);
      await supabase.from('content_posts').update({ sort_order: (a.sort_order || 0) + 1 }).eq('id', b.id);
    }
    fetchTikPosts();
  }

  async function handlePinPost(post: ContentPost) {
    const newPinned = !(post as any).is_pinned;
    await supabase.from('content_posts').update({ is_pinned: newPinned, pinned_at: newPinned ? new Date().toISOString() : null, sort_order: newPinned ? 999999 : 0 }).eq('id', post.id);
    toast.success(newPinned ? '📌 Post imepinniwa juu!' : '✅ Pin imeondolewa!');
    fetchMalaya();
  }

  async function handleSwapPost(id: string, dir: 'up' | 'down') {
    return swapPost(malayaPosts, id, dir, fetchMalaya);
  }

  async function handleDeletePost(id: string) {
    return deletePost(id, 'malaya');
  }

  async function fetchAdminServices2() {
    const { data } = await supabase.from('services').select('*').eq('type', 'admin_service').order('display_order').order('created_at', { ascending: false });
    setAdminServices2(data || []);
  }

  async function fetchMalaya() {
    const { data } = await supabase.from('content_posts').select('*, uploader:uploader_id(username)')
      .eq('type', 'malaya').neq('source', 'tiksexy').order('sort_order', { ascending: false }).order('created_at', { ascending: false }).limit(100);
    setMalayaPosts((data || []) as ContentPost[]);
  }

  async function fetchVideo() {
    const { data } = await supabase.from('content_posts').select('*, uploader:uploader_id(username)')
      .eq('type', 'video').neq('source', 'tiksexy').order('sort_order', { ascending: false }).order('created_at', { ascending: false }).limit(100);
    setVideoPosts((data || []) as ContentPost[]);
    const { data: hv } = await supabase.from('content_posts').select('*').eq('type', 'how_video').order('created_at', { ascending: false });
    setHowVideos((hv || []) as ContentPost[]);
  }

  async function fetchLive() {
    const { data } = await supabase.from('live_options').select('*').order('display_order');
    setLivePosts((data || []) as LiveOption[]);
  }

  async function fetchBoxes(section: string) {
    const { data } = await supabase.from('home_boxes').select('*').eq('section', section).order('box_number');
    setBoxes((data || []));
    const titleMap: Record<string, string> = {};
    (data || []).forEach((b: any) => { titleMap[`${b.section}_${b.box_number}`] = b.title || ''; });
    setEditBoxTitle(prev => ({ ...prev, ...titleMap }));
  }

  async function uploadWithProgress(bucket: string, path: string, file: File): Promise<string> {
    setUploadingFile(true); setUploadPct(0); setUploadFileName(file.name); setUploadFileSize(file.size); setUploadedBytes(0);
    uploadStartTime.current = Date.now(); uploadedRef.current = 0;
    const url = await uploadFile(bucket, path, file, (pct) => { setUploadPct(pct); setUploadedBytes(Math.round(file.size * pct / 100)); });
    setUploadPct(100); setUploadedBytes(file.size); setUploadingFile(false);
    return url;
  }

  async function saveBoxTitle(section: string, boxNum: number) {
    const key = `${section}_${boxNum}`;
    const titleToSave = pendingBoxTitles[key] !== undefined ? pendingBoxTitles[key] : (editBoxTitle[key] || '');
    setSavingBoxTitles(prev => ({ ...prev, [key]: true }));
    // First check if box exists
    const { data: existing } = await supabase.from('home_boxes').select('id').eq('section', section).eq('box_number', boxNum).maybeSingle();
    let error;
    if (existing?.id) {
      // UPDATE existing
      const result = await supabase.from('home_boxes').update({ title: titleToSave }).eq('id', existing.id);
      error = result.error;
    } else {
      // INSERT new
      const result = await supabase.from('home_boxes').insert({ section, box_number: boxNum, title: titleToSave, image_url: null, video_url: null });
      error = result.error;
    }
    if (error) { toast.error('Hitilafu: ' + error.message); setSavingBoxTitles(prev => ({ ...prev, [key]: false })); return; }
    setEditBoxTitle(prev => ({ ...prev, [key]: titleToSave }));
    setPendingBoxTitles(prev => { const n = { ...prev }; delete n[key]; return n; });
    setSavingBoxTitles(prev => ({ ...prev, [key]: false }));
    // Reload boxes so input shows saved title immediately
    await fetchBoxes(section);
    // Force home page refresh immediately
    window.dispatchEvent(new CustomEvent('home-boxes-updated', { detail: { section, box_number: boxNum, title: titleToSave } }));
    try { sessionStorage.removeItem('home_settings_cache'); } catch {}
    toast.success('\u2705 Jina limehifadhiwa!');
  }

  async function deletePost(id: string, type: 'malaya' | 'video') {
    if (!window.confirm('Futa post hii?')) return;
    await supabase.from('content_posts').delete().eq('id', id);
    toast.success('Imefutwa!');
    if (type === 'malaya') fetchMalaya(); else fetchVideo();
  }

  async function swapPost(posts: ContentPost[], id: string, dir: 'up' | 'down', fetchFn: () => void) {
    const idx = posts.findIndex(p => p.id === id);
    if (dir === 'up' && idx > 0) {
      const a = posts[idx], b = posts[idx - 1];
      await supabase.from('content_posts').update({ sort_order: (b.sort_order || 0) + 1 }).eq('id', a.id);
      await supabase.from('content_posts').update({ sort_order: (a.sort_order || 0) - 1 }).eq('id', b.id);
    } else if (dir === 'down' && idx < posts.length - 1) {
      const a = posts[idx], b = posts[idx + 1];
      await supabase.from('content_posts').update({ sort_order: (b.sort_order || 0) - 1 }).eq('id', a.id);
      await supabase.from('content_posts').update({ sort_order: (a.sort_order || 0) + 1 }).eq('id', b.id);
    }
    fetchFn();
  }

  async function approveTx(tx: Transaction) {
    try {
      const { error } = await supabase.rpc('approve_transaction', { tx_id: tx.id });
      if (error) throw error;
    } catch (err) {
      await supabase.from('transactions').update({ status: 'approved' }).eq('id', tx.id);
      if (tx.type === 'deposit') { const { data: prof } = await supabase.from('user_profiles').select('balance').eq('id', tx.user_id).single(); await supabase.from('user_profiles').update({ balance: (prof?.balance || 0) + tx.amount }).eq('id', tx.user_id); }
      if (tx.type === 'vip') { const plan = vipPlans.find(p => p.name === tx.plan_name); const exp = new Date(); exp.setDate(exp.getDate() + (plan?.duration_days || 30)); await supabase.from('user_profiles').update({ is_vip: true, vip_plan: tx.plan_name, vip_expires_at: exp.toISOString(), blue_tick: 'gold' }).eq('id', tx.user_id); }
      if (tx.type === 'business') await supabase.from('user_profiles').update({ is_business: true, blue_tick: 'blue' }).eq('id', tx.user_id);
      if (tx.type === 'blue_tick') await supabase.from('user_profiles').update({ blue_tick: 'blue' }).eq('id', tx.user_id);
      await supabase.from('notifications').insert({ user_id: tx.user_id, title: '✅ Malipo Yamekubaliwa!', message: tx.type === 'deposit' ? `TZS ${tx.amount.toLocaleString()} imeongezwa!` : 'Huduma yako imefunguliwa!', type: 'payment_approved' });
    }
    toast.success('✅ Imekubaliwa!'); fetchAll();
  }

  async function rejectTx(tx: Transaction) {
    await supabase.from('transactions').update({ status: 'rejected' }).eq('id', tx.id);
    await supabase.from('notifications').insert({ user_id: tx.user_id, title: '❌ Malipo Yamekataliwa', message: 'Ombi lako limekataliwa. Wasiliana nasi kwa msaada.', type: 'payment_rejected' });
    toast.success('Imekataliwa!'); fetchAll();
  }

  async function sendNotification() {
    if (!notifTitle || !notifMsg) return toast.error('Jaza kichwa na ujumbe');
    if (notifTarget === 'one') {
      if (!selectedMemberId) return toast.error('Chagua member');
      await supabase.from('notifications').insert({ title: notifTitle, message: notifMsg, type: 'system', link: notifLink || null, user_id: selectedMemberId });
    } else { await supabase.from('notifications').insert({ title: notifTitle, message: notifMsg, type: 'system', link: notifLink || null, user_id: null }); }
    toast.success('Arifa imetumwa!'); setNotifTitle(''); setNotifMsg(''); setNotifLink('');
  }

  async function saveSettings() {
    setSaving(true); userIsEditing.current = true;
    try {
      // Bulk upsert all settings at once - much faster than one by one
      const upsertRows = Object.entries(editSettings)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => ({ key, value: String(value), updated_at: new Date().toISOString() }));
      if (upsertRows.length > 0) {
        // Split into batches of 50 for safety
        for (let i = 0; i < upsertRows.length; i += 50) {
          await supabase.from('app_settings').upsert(upsertRows.slice(i, i + 50), { onConflict: 'key' });
        }
      }
      setSettings(prev => ({ ...prev, ...editSettings }));
      const allSettings = { ...settings, ...editSettings };
      window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: allSettings }));
      try { localStorage.setItem('slr_settings_cache', JSON.stringify(allSettings)); } catch {}
      try { const { invalidateBlueTickCache } = await import('@/components/features/BlueTick'); invalidateBlueTickCache(); } catch {}
      toast.success('✅ Mipangilio imehifadhiwa!');
    } catch { toast.error('Hitilafu ya kuhifadhi'); }
    finally { setSaving(false); setTimeout(() => { userIsEditing.current = false; }, 3000); }
  }

  async function blockMember(id: string, block: boolean) {
    await supabase.from('user_profiles').update({ is_blocked: block, account_status: block ? 'blocked' : 'active' }).eq('id', id);
    await supabase.from('notifications').insert({ user_id: id, title: block ? '🚫 Akaunti Imezuiwa' : '✅ Akaunti Imefunguliwa', message: block ? 'Akaunti yako imezuiwa na Admin.' : 'Akaunti yako imefunguliwa.', type: 'system' });
    toast.success(block ? '🚫 Amezuiwa' : '✅ Amefunguliwa'); fetchAll();
  }

  async function deleteMember(id: string) {
    if (!window.confirm('Una uhakika wa kufuta akaunti hii?')) return;
    await supabase.from('user_profiles').delete().eq('id', id);
    toast.success('Imefutwa'); fetchAll();
  }

  function exportMembersCSV() {
    const headers = ['Jina', 'Simu', 'Email', 'Salio (TZS)', 'VIP', 'Business', 'Admin', 'Imesajiliwa'];
    const rows = members.map(m => [m.username || '', m.phone || '', m.email || '', (m.balance || 0).toString(), m.is_vip ? 'Ndiyo' : 'Hapana', m.is_business ? 'Ndiyo' : 'Hapana', m.is_admin ? 'Ndiyo' : 'Hapana', new Date(m.created_at || '').toLocaleDateString('sw-TZ')]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `members_${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`✅ ${members.length} members wameexportwa kama CSV!`);
  }

  async function updateMember() {
    if (!editMember) return;
    const { error } = await supabase.from('user_profiles').update({ username: editMember.username || '', phone: editMember.phone || null, is_vip: editMember.is_vip, is_business: editMember.is_business, blue_tick: editMember.blue_tick || null, is_admin: editMember.is_admin, balance: Number(editMember.balance) || 0, is_blocked: editMember.is_blocked, account_status: editMember.is_blocked ? 'blocked' : 'active' }).eq('id', editMember.id);
    if (error) { toast.error('Hitilafu: ' + error.message); return; }
    if (editMember.is_vip && !editMember.blue_tick) await supabase.from('user_profiles').update({ blue_tick: 'gold' }).eq('id', editMember.id);
    if (editMember.is_business && !editMember.blue_tick) await supabase.from('user_profiles').update({ blue_tick: 'blue' }).eq('id', editMember.id);
    setEditMember(null); toast.success('✅ Mabadiliko yamehifadhiwa!'); fetchAll();
  }

  async function updatePost() {
    if (!editPost) return;
    await supabase.from('content_posts').update({ title: editPost.title, description: editPost.description, location: editPost.location, phone: editPost.phone, whatsapp: editPost.whatsapp, region: editPost.region, price: editPost.price, is_free: editPost.is_free, section: editPost.section }).eq('id', editPost.id);
    toast.success('Imebadilishwa!'); setEditPost(null);
    if (tab === 'malaya') fetchMalaya(); else if (tab === 'video') fetchVideo();
  }

  async function updateLiveOption() {
    if (!editLive) return;
    await supabase.from('live_options').update({ name: editLive.name, price: editLive.price, whatsapp: editLive.whatsapp, link: editLive.link, is_active: editLive.is_active }).eq('id', editLive.id);
    toast.success('Imebadilishwa!'); setEditLive(null); fetchLive();
  }

  async function updateService() {
    if (!editService) return;
    await supabase.from('services').update({ name: editService.name, description: editService.description, price: editService.price, is_active: editService.is_active, image_url: (editService as any).image_url, action_link: (editService as any).action_link, video_url: (editService as any).video_url }).eq('id', editService.id);
    toast.success('Imebadilishwa!'); setEditService(null); fetchAll();
  }

  async function updateVipPlan() {
    if (!editVipPlan) return;
    await supabase.from('vip_plans').update({ name: editVipPlan.name, duration_days: editVipPlan.duration_days, price: editVipPlan.price, is_active: editVipPlan.is_active }).eq('id', editVipPlan.id);
    toast.success('Mpango umebadilishwa!'); setEditVipPlan(null); fetchAll();
  }

  async function uploadBoxMedia(section: string, boxNum: number, file: File) {
    try {
      const isVideo = file.type.startsWith('video');
      const url = await uploadWithProgress('content', `boxes/${section}_${boxNum}_${Date.now()}.${file.name.split('.').pop() || 'jpg'}`, file);
      await supabase.from('home_boxes').upsert({ section, box_number: boxNum, title: editBoxTitle[`${section}_${boxNum}`] || `Box ${boxNum}`, image_url: isVideo ? null : url, video_url: isVideo ? url : null }, { onConflict: 'section,box_number' });
      toast.success(`✅ Box ${boxNum} imepakiwa!`); fetchBoxes(section);
    } catch { toast.error('Hitilafu ya upload'); setUploadingFile(false); }
  }

  async function uploadCategoryImage(catId: string, file: File) {
    try {
      const url = await uploadWithProgress('content', `categories/${catId}_${Date.now()}.${file.name.split('.').pop()}`, file);
      await supabase.from('video_categories').update({ cover_url: url }).eq('id', catId);
      toast.success('Picha ya category imebadilishwa!'); fetchAll();
    } catch { toast.error('Hitilafu ya upload'); setUploadingFile(false); }
  }

  async function uploadHowVideo(file: File, title: string) {
    try {
      const url = await uploadWithProgress('content', `how-videos/${Date.now()}.${file.name.split('.').pop()}`, file);
      await supabase.from('content_posts').insert({ type: 'how_video', title, media_url: url, is_free: true, price: 0, views: 0 });
      toast.success('Video ya mwongozo imepakiwa!'); fetchVideo();
    } catch { toast.error('Hitilafu ya upload'); setUploadingFile(false); }
  }

  async function deleteHowVideo(id: string) {
    if (!window.confirm('Futa video hii?')) return;
    await supabase.from('content_posts').delete().eq('id', id);
    toast.success('Imefutwa!'); fetchVideo();
  }

  async function uploadSound(key: string, file: File) {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
      const mimeType = ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : ext === 'webm' ? 'audio/webm' : 'audio/mpeg';
      const audioFile = new File([await file.arrayBuffer()], `sound_${key}.${ext}`, { type: mimeType });
      const path = `sounds/${key}_${Date.now()}.${ext}`;
      setUploadingFile(true); setUploadFileName(file.name); setUploadFileSize(file.size); setUploadPct(20);
      const { error: uploadErr } = await supabase.storage.from('content').upload(path, audioFile, { upsert: true, contentType: mimeType, duplex: 'half' } as any);
      if (uploadErr) throw new Error('Upload: ' + uploadErr.message);
      setUploadPct(70);
      const { data: urlData } = supabase.storage.from('content').getPublicUrl(path);
      const url = urlData.publicUrl + `?v=${Date.now()}`;
      setUploadPct(90);
      await supabase.from('app_settings').upsert({ key, value: url, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      setEditSettings(p => ({ ...p, [key]: url })); setSettings(p => ({ ...p, [key]: url }));
      setUploadPct(100); setUploadingFile(false);
      setTimeout(() => { const audio = new Audio(url); audio.volume = 0.9; audio.play().then(() => toast.success('✅ Sauti imepakiwa na inalia!')).catch(() => toast.success('✅ Sauti imepakiwa!')); }, 500);
    } catch (err) { toast.error(`Hitilafu: ${(err as Error).message}`); setUploadingFile(false); }
  }

  async function generateMissingThumbnails() {
    const { data: missing } = await supabase.from('content_posts').select('id, media_url').eq('type', 'video').is('thumbnail_url', null).not('media_url', 'is', null).limit(50);
    if (!missing || missing.length === 0) { toast.success('Thumbnails zote zipo tayari!'); return; }
    toast.info(`Inaunda thumbnails ${missing.length} video...`);
    let done = 0;
    for (const post of missing) {
      try {
        const resp = await fetch(post.media_url); if (!resp.ok) { done++; continue; }
        const blob = await resp.blob(); const file = new File([blob], 'video.mp4', { type: blob.type || 'video/mp4' });
        const thumbBlob = await generateVideoThumbnail(file);
        if (thumbBlob) {
          const thumbFile = new File([thumbBlob], `thumb_${post.id}.jpg`, { type: 'image/jpeg' });
          const url = await uploadFile('content', `video/thumb/admin/${post.id}_auto.jpg`, thumbFile);
          await supabase.from('content_posts').update({ thumbnail_url: url }).eq('id', post.id);
        }
        done++;
      } catch { done++; }
    }
    toast.success(`✅ Thumbnails ${done} imeundwa!`); fetchVideo();
  }

  const pendingTx = transactions.filter(t => t.status === 'pending');
  const filteredTx = txFilter === 'all' ? transactions : transactions.filter(t => t.status === txFilter);
  const filteredMembers = members.filter(m => !memberSearch || m.username?.toLowerCase().includes(memberSearch.toLowerCase()) || m.phone?.includes(memberSearch) || m.email?.toLowerCase().includes(memberSearch.toLowerCase()));

  const renderBoxes = (section: string) => (
    <div className="mb-4">
      <h3 className="text-white font-bold mb-2">📦 Vibox vya Nyumbani ({section})</h3>
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map(n => {
          const boxKey = `${section}_${n}`;
          const existingBox = boxes.find(b => b.section === section && b.box_number === n);
          const currentTitle = pendingBoxTitles[boxKey] !== undefined ? pendingBoxTitles[boxKey] : (editBoxTitle[boxKey] || '');
          const isSaving = savingBoxTitles[boxKey];
          const hasPending = pendingBoxTitles[boxKey] !== undefined;
          return (
            <div key={n} className="content-box p-2">
              <p className="text-gray-400 text-xs mb-1">Box {n}</p>
              <div className="flex gap-1 mb-1">
                <input
                  value={currentTitle}
                  onChange={e => setPendingBoxTitles(prev => ({ ...prev, [boxKey]: e.target.value }))}
                  placeholder="Jina la box..."
                  className="input-field py-1 text-xs flex-1"
                />
                <button
                  onClick={() => saveBoxTitle(section, n)}
                  disabled={isSaving || !hasPending}
                  className={`text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 transition-all ${hasPending ? 'gradient-pink text-white' : 'bg-gray-700 text-gray-500'} disabled:opacity-50`}
                >
                  {isSaving ? '...' : '💾'}
                </button>
              </div>
              {existingBox?.image_url && (
                <div className="relative mb-1">
                  <img src={existingBox.image_url} alt="" className="w-full h-16 object-cover rounded-lg border border-primary/20" />
                  <button onClick={async () => { await supabase.from('home_boxes').update({ image_url: null }).eq('section', section).eq('box_number', n); fetchBoxes(section); toast.success('Picha imeondolewa!'); }} className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center"><X className="w-3 h-3 text-white" /></button>
                </div>
              )}
              {existingBox?.video_url && (
                <div className="relative mb-1">
                  <video src={existingBox.video_url} className="w-full h-16 object-cover rounded-lg" muted />
                  <button onClick={async () => { await supabase.from('home_boxes').update({ video_url: null }).eq('section', section).eq('box_number', n); fetchBoxes(section); toast.success('Video imeondolewa!'); }} className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center"><X className="w-3 h-3 text-white" /></button>
                </div>
              )}
              <label className="block cursor-pointer btn-outline text-xs py-1.5 text-center">
                <Upload className="w-3 h-3 inline mr-1" />Pakia Picha/Video
                <input type="file" accept="image/*,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadBoxMedia(section, n, f); }} />
              </label>
            </div>
          );
        })}
      </div>
      {uploadingFile && <div className="mt-2"><DetailedProgress progress={uploadPct} fileName={uploadFileName} fileSize={uploadFileSize} uploadedBytes={uploadedBytes} /></div>}
    </div>
  );

  const getFontFamily = (fontKey: string) => {
    const f = editSettings[fontKey] || 'default';
    if (f === 'dancing') return 'Dancing Script, cursive'; if (f === 'pacifico') return 'Pacifico, cursive';
    if (f === 'lobster') return 'Lobster, cursive'; return 'inherit';
  };

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'livestreams', label: 'Live Sessions', icon: <Radio className="w-4 h-4" /> },
    { id: 'members', label: 'Members', icon: <Users className="w-4 h-4" /> },
    { id: 'transactions', label: 'Malipo', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'withdrawals', label: 'Withdrawal', icon: <ArrowDownCircle className="w-4 h-4" /> },
    { id: 'uploads', label: 'Uploads', icon: <UploadCloud className="w-4 h-4" /> },
    { id: 'malaya', label: 'Malaya', icon: <Image className="w-4 h-4" /> },
    { id: 'video', label: 'Video', icon: <Video className="w-4 h-4" /> },
    { id: 'live', label: 'Live', icon: <Radio className="w-4 h-4" /> },
    { id: 'notifications', label: 'Arifa', icon: <Bell className="w-4 h-4" /> },
    { id: 'services', label: 'Huduma', icon: <Package className="w-4 h-4" /> },
    { id: 'settings', label: 'Mipangilio', icon: <Settings className="w-4 h-4" /> },
    { id: 'theme', label: 'Mandhari', icon: <Palette className="w-4 h-4" /> },
    { id: 'tikposts', label: 'TikSexy Posts', icon: <span className="text-sm">🎬</span> },
    { id: 'security', label: 'Usalama', icon: <span className="text-sm">🔒</span> },
    { id: 'sounds', label: 'Sauti', icon: <Volume2 className="w-4 h-4" /> },
    { id: 'giftcards', label: 'Gift Cards', icon: <span className="text-sm">🎁</span> },
    { id: 'gifts', label: 'Zawadi', icon: <span className="text-sm">🎀</span> },
    { id: 'savecodes', label: 'Save Codes', icon: <span className="text-sm">💾</span> },
    { id: 'xcodes', label: 'X ZA ADMIN Codes', icon: <span className="text-sm">🔞</span> },
    { id: 'adminservices', label: 'Huduma Admin', icon: <span className="text-sm">💋</span> },
    { id: 'homeedit', label: 'Home Edit', icon: <span className="text-sm">🏠</span> },
    { id: 'seo', label: 'SEO', icon: <span className="text-sm">🔍</span> },
  ];

  const TiksexyToggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!value)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${value ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-gray-600/20 text-gray-500 border border-gray-600/40'}`}>
      {value ? '🎬 TikSexy: ON' : '🎬 TikSexy: OFF'}
    </button>
  );

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => navigate(-1)} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-white font-bold text-xl flex-1">⚙️ Admin Panel</h1>
        <div className="flex flex-col items-end gap-0.5">
          <button onClick={async () => { setRefreshing(true); await fetchAll(); setLastRefreshed(new Date()); setTimeout(() => setRefreshing(false), 600); }} className={`text-gray-400 hover:text-primary active:scale-90 transition-transform ${refreshing ? 'animate-spin text-primary' : ''}`} title="Refresh data">
            <RefreshCw className="w-5 h-5" />
          </button>
          <span className="text-gray-600 text-[9px]">{(() => { const diff = Math.floor((Date.now() - lastRefreshed.getTime()) / 60000); return diff < 1 ? 'Sasa hivi' : `${diff}m iliyopita`; })()}</span>
        </div>
        {pendingTx.length > 0 && <span className="bg-red-600 text-white text-xs font-black px-2 py-0.5 rounded-full" style={{ animation: 'pulse 1s ease-in-out infinite' }}>{pendingTx.length} pending</span>}
      </div>

      <div className="px-4 py-3 grid grid-cols-4 gap-2">
        {[{ label: 'Members', value: members.length, color: 'text-blue-400' }, { label: 'VIP', value: members.filter(m => m.is_vip).length, color: 'text-yellow-400' }, { label: 'Business', value: members.filter(m => m.is_business).length, color: 'text-blue-300' }, { label: 'Pending', value: pendingTx.length, color: 'text-orange-400' }].map(s => (
          <div key={s.label} className="gradient-card rounded-xl p-2 text-center">
            <p className={`font-black text-lg ${s.color}`}>{s.value}</p>
            <p className="text-gray-400 text-[10px]">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex overflow-x-auto px-4 gap-2 pb-2 scrollbar-hide">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t.id ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
            {t.icon} {t.label}
            {t.id === 'transactions' && pendingTx.length > 0 && <span className="bg-yellow-500 text-black text-[9px] font-black px-1 rounded-full">{pendingTx.length}</span>}
            {t.id === 'withdrawals' && withdrawalRequests.filter(w => w.status === 'pending').length > 0 && <span className="bg-orange-500 text-white text-[9px] font-black px-1 rounded-full">{withdrawalRequests.filter(w => w.status === 'pending').length}</span>}
          </button>
        ))}
      </div>

      <div className="max-w-md mx-auto px-4">

        {/* ── SEO ── */}
        {tab === 'seo' && (
          <div className="mt-4 space-y-4" onFocus={markEditing} onChange={markEditing} onInput={markEditing}>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
              <p className="text-blue-400 font-bold text-sm">🔍 SEO - Google Search Optimization</p>
              <p className="text-gray-400 text-xs mt-1">Badilisha metadata ya website yako ili ionekane vizuri kwenye Google, WhatsApp, na social media.</p>
            </div>

            {/* Site Identity */}
            <div className="content-box p-4 space-y-3">
              <p className="text-white font-bold text-sm border-b border-white/10 pb-2">🌐 Utambulisho wa Website</p>
              <div>
                <label className="text-gray-400 text-xs font-semibold mb-1 block">Site Title (Jina la Website) *</label>
                <input value={editSettings.site_title || ''} onChange={e => setEditSettings(p => ({ ...p, site_title: e.target.value }))} placeholder="SEXY LIVE ROOM 💋" className="input-field" />
                <p className="text-gray-600 text-[10px] mt-1">Inaonekana kwenye browser tab, Google results, na WhatsApp preview</p>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-semibold mb-1 block">Meta Description *</label>
                <textarea value={editSettings.site_description || ''} onChange={e => setEditSettings(p => ({ ...p, site_description: e.target.value }))} placeholder="SEXY LIVE ROOM - Jukwaa bora la burudani la watu wazima Tanzania. Tazama video za live, video calls, malaya, na zaidi!" className="input-field min-h-[80px] resize-none" />
                <p className="text-gray-600 text-[10px] mt-1">Inatakiwa iwe 120-160 herufi. Mara hii: {(editSettings.site_description || '').length}/160</p>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-semibold mb-1 block">Keywords (maneno ya utafutaji)</label>
                <textarea value={editSettings.site_keywords || ''} onChange={e => setEditSettings(p => ({ ...p, site_keywords: e.target.value }))} placeholder="SEXY LIVE ROOM, sexy live room, malaya Tanzania, live streaming Tanzania, video calls..." className="input-field min-h-[60px] resize-none" />
                <p className="text-gray-600 text-[10px] mt-1">Tenganisha kwa koma. Maneno yanayotumiwa na watu kutafuta website yako.</p>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-semibold mb-1 block">Canonical URL (Link ya msingi)</label>
                <input value={editSettings.site_canonical_url || ''} onChange={e => setEditSettings(p => ({ ...p, site_canonical_url: e.target.value }))} placeholder="https://sexy-live-room.vercel.app/" className="input-field" />
              </div>
            </div>

            {/* OG Image */}
            <div className="content-box p-4 space-y-3">
              <p className="text-white font-bold text-sm border-b border-white/10 pb-2">🖼️ Open Graph Image (Preview ya Social Media)</p>
              <p className="text-gray-400 text-xs">Picha inayoonekana ukishiriki link kwenye WhatsApp, Telegram, Facebook, Twitter/X</p>
              <div>
                <label className="text-gray-400 text-xs font-semibold mb-1 block">OG Image URL</label>
                <input value={editSettings.site_og_image || ''} onChange={e => setEditSettings(p => ({ ...p, site_og_image: e.target.value }))} placeholder="https://sexy-live-room.vercel.app/og-image.jpg" className="input-field" />
                <p className="text-gray-600 text-[10px] mt-1">Ukubwa unaoshauriwa: 1200x630 pixels</p>
              </div>
              <label className="block btn-outline text-center cursor-pointer py-2 text-sm">
                <Upload className="w-4 h-4 inline mr-2" />Pakia OG Image Mpya
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  try {
                    const url = await uploadWithProgress('content', `seo/og-image_${Date.now()}.${f.name.split('.').pop()}`, f);
                    setEditSettings(p => ({ ...p, site_og_image: url }));
                    toast.success('✅ OG Image imepakiwa!');
                  } catch { toast.error('Hitilafu ya upload'); }
                  finally { setUploadingFile(false); }
                }} />
              </label>
              {(editSettings.site_og_image || '/og-image.jpg') && (
                <img src={editSettings.site_og_image || '/og-image.jpg'} alt="OG Preview" className="w-full h-32 object-cover rounded-xl border border-primary/30" onError={e => (e.target as HTMLImageElement).style.display='none'} />
              )}
              {uploadingFile && <DetailedProgress progress={uploadPct} fileName={uploadFileName} fileSize={uploadFileSize} uploadedBytes={uploadedBytes} />}
            </div>

            {/* Google Search Console */}
            <div className="content-box p-4 space-y-3">
              <p className="text-white font-bold text-sm border-b border-white/10 pb-2">📊 Google Search Console</p>
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                <p className="text-green-400 text-xs font-semibold">✅ Verification Code Imewekwa</p>
                <p className="text-gray-400 text-[10px] mt-1">Meta tag: <code className="text-primary text-[9px]">Fq0MEf5IvdrHlxHEw3MfsNXlOcdizQag8zRaq8xlSak</code></p>
              </div>
              <div className="bg-[#1a0a1a] rounded-xl p-3 space-y-2">
                <p className="text-white text-xs font-semibold">📌 Hatua za Kuwasilisha Sitemap kwa Google:</p>
                <ol className="text-gray-400 text-[10px] space-y-1 list-decimal list-inside">
                  <li>Nenda <a href="https://search.google.com/search-console" target="_blank" className="text-blue-400 underline">search.google.com/search-console</a></li>
                  <li>Chagua property ya website yako</li>
                  <li>Bonyeza "Sitemaps" kwenye sidebar ya kushoto</li>
                  <li>Weka URL: <code className="text-primary">https://sexy-live-room.vercel.app/sitemap.xml</code></li>
                  <li>Bonyeza "Submit" - Google itaanza ku-index website yako!</li>
                </ol>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                <p className="text-yellow-400 text-xs font-semibold">💡 Jinsi ya Kuonekana Kwanza Google</p>
                <ul className="text-gray-400 text-[10px] space-y-1 mt-1">
                  <li>• Andika "SEXY LIVE ROOM" katika content nyingi</li>
                  <li>• Ongeza maelezo mazuri kwa kila post</li>
                  <li>• Shiriki link kwenye WhatsApp, Instagram, Facebook</li>
                  <li>• Weka title na description nzuri hapo juu</li>
                  <li>• Google inachukua wiki 2-4 ku-index baada ya sitemap</li>
                </ul>
              </div>
            </div>

            {/* Twitter/X */}
            <div className="content-box p-4 space-y-3">
              <p className="text-white font-bold text-sm border-b border-white/10 pb-2">🐦 Twitter/X Card</p>
              <div>
                <label className="text-gray-400 text-xs font-semibold mb-1 block">Twitter Handle</label>
                <input value={editSettings.site_twitter_handle || ''} onChange={e => setEditSettings(p => ({ ...p, site_twitter_handle: e.target.value }))} placeholder="@sexyliveroom" className="input-field" />
              </div>
            </div>

            {/* Preview */}
            <div className="content-box p-4 space-y-3">
              <p className="text-white font-bold text-sm border-b border-white/10 pb-2">👁️ Preview - Jinsi Itakavyoonekana Google</p>
              <div className="rounded-xl p-4 border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-blue-400 text-sm font-semibold truncate">{editSettings.site_title || 'SEXY LIVE ROOM 💋 - Burudani ya Watu Wazima Tanzania'}</p>
                <p className="text-green-400 text-xs">{editSettings.site_canonical_url || 'https://sexy-live-room.vercel.app/'}</p>
                <p className="text-gray-300 text-xs mt-1 line-clamp-2">{editSettings.site_description || 'SEXY LIVE ROOM - Jukwaa bora la burudani la watu wazima Tanzania...'}</p>
              </div>
            </div>

            <button onClick={async () => {
              setSaving(true);
              // Save SEO settings to app_settings
              const seoKeys = ['site_title', 'site_description', 'site_keywords', 'site_canonical_url', 'site_og_image', 'site_twitter_handle'];
              const rows = seoKeys.filter(k => editSettings[k] !== undefined).map(k => ({ key: k, value: String(editSettings[k] || ''), updated_at: new Date().toISOString() }));
              if (rows.length > 0) await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
              // Also update index.html meta tags dynamically via settings
              window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: Object.fromEntries(seoKeys.map(k => [k, editSettings[k] || ''])) }));
              toast.success('✅ SEO imehifadhiwa! Mabadiliko yataonekana kwenye meta tags.');
              setSaving(false);
            }} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
              {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Inahifadhi...</> : '🔍 Hifadhi SEO Settings'}
            </button>
          </div>
        )}

        {tab === 'livestreams' && <AdminLiveSessions />}

        {/* ── MEMBERS ── */}
        {tab === 'members' && (
          <div className="space-y-2 mt-2">
            <div className="flex gap-2">
              <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Tafuta member..." className="input-field flex-1" />
              <button onClick={exportMembersCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-600/20 text-green-400 border border-green-600/30 flex-shrink-0 active:scale-95"><Download className="w-3.5 h-3.5" /> CSV</button>
            </div>
            {/* VIP Expiry Reminder Button */}
            <button onClick={manualSendVipReminders} disabled={sendingVipReminders}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 active:scale-95 disabled:opacity-50">
              {sendingVipReminders ? <><div className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />Inatuma...</> : <>⏰ Tuma Arifa za VIP Inayokwisha (siku 3)</>}
            </button>
            {/* Bulk Balance Update */}
            <div className="content-box p-3 space-y-2">
              <p className="text-gray-400 text-xs font-semibold">💰 Ongeza Salio kwa Members Wengi</p>
              <div className="flex gap-2">
                <input type="number" value={bulkBalanceAmount} onChange={e => setBulkBalanceAmount(e.target.value)} placeholder="Kiasi (TZS)" className="input-field flex-1 py-1.5 text-sm" />
                <button onClick={async () => {
                  if (!bulkBalanceAmount || bulkSelectedIds.length === 0) { toast.error('Chagua members na weka kiasi'); return; }
                  setBulkAdding(true);
                  const amount = parseFloat(bulkBalanceAmount) || 0;
                  let done = 0;
                  for (const uid of bulkSelectedIds) {
                    const m = members.find(x => x.id === uid);
                    if (!m) continue;
                    await supabase.from('user_profiles').update({ balance: (m.balance || 0) + amount }).eq('id', uid);
                    await supabase.from('notifications').insert({ user_id: uid, title: '💰 Salio Limeongezwa!', message: `TZS ${amount.toLocaleString()} imeongezwa na Admin`, type: 'payment_approved' });
                    done++;
                  }
                  setBulkAdding(false); setBulkSelectedIds([]); setBulkBalanceAmount('');
                  toast.success(`✅ TZS ${amount.toLocaleString()} imeongezwa kwa members ${done}!`);
                  fetchAll();
                }} disabled={bulkAdding || bulkSelectedIds.length === 0 || !bulkBalanceAmount}
                  className="btn-primary text-xs px-3 py-1.5 flex-shrink-0 disabled:opacity-50">
                  {bulkAdding ? '...' : `Ongeza kwa ${bulkSelectedIds.length > 0 ? bulkSelectedIds.length : '?'} Members`}
                </button>
              </div>
              {bulkSelectedIds.length > 0 && (
                <p className="text-primary text-xs">{bulkSelectedIds.length} member wamechaguliwa - bonyeza jina kuwachagua/kuwaondoa</p>
              )}
            </div>
            {filteredMembers.map(m => (
              <div key={m.id} className={`content-box p-3 cursor-pointer transition-all ${bulkSelectedIds.includes(m.id) ? 'border-primary/70 bg-primary/5' : ''}`}
                onClick={() => setBulkSelectedIds(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/30 flex-shrink-0">
                    {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-bold text-sm">{m.username?.[0]?.toUpperCase()}</span></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-white font-semibold text-sm">{m.username}</span>
                      {m.is_vip && <span className="vip-badge text-[8px]">VIP</span>}
                      {m.is_business && <span className="text-[8px] bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded-full">BIZ</span>}
                      {m.is_admin && <span className="text-[8px] bg-primary/30 text-primary px-1.5 py-0.5 rounded-full">ADMIN</span>}
                      {m.is_blocked && <span className="text-[8px] bg-red-600/30 text-red-300 px-1.5 py-0.5 rounded-full">BLOCKED</span>}
                      {m.blue_tick && <BlueTick tickId={m.blue_tick} size={12} />}
                      {m.blue_tick && m.vip_expires_at && (() => {
                        const daysLeft = Math.ceil((new Date(m.vip_expires_at).getTime() - Date.now()) / (1000*60*60*24));
                        if (daysLeft <= 0) return <span className="text-[8px] text-red-400 font-bold">✗ Tick imeisha</span>;
                        if (daysLeft <= 30) return <span className="text-[8px] text-yellow-400 font-bold">{daysLeft}d</span>;
                        return null;
                      })()}
                    </div>
                    <p className="text-gray-400 text-xs truncate">{m.phone || m.email}</p>
                    <p className="text-gray-500 text-xs">💰 TZS {(m.balance || 0).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setEditMember({ ...m })} className="p-1.5 bg-[#1a0a1a] rounded-lg"><Edit3 className="w-3.5 h-3.5 text-primary" /></button>
                    <button onClick={() => blockMember(m.id, !m.is_blocked)} className={`p-1.5 rounded-lg ${m.is_blocked ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>{m.is_blocked ? <Check className="w-3.5 h-3.5 text-green-400" /> : <X className="w-3.5 h-3.5 text-yellow-400" />}</button>
                    <button onClick={() => deleteMember(m.id)} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TRANSACTIONS ── */}
        {tab === 'transactions' && (
          <div className="space-y-3 mt-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(['pending', 'all', 'approved', 'rejected'] as const).map(f => (
                <button key={f} onClick={() => setTxFilter(f)} className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold ${txFilter === f ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
                  {f === 'all' ? 'Zote' : f === 'pending' ? `⏳ Pending (${pendingTx.length})` : f === 'approved' ? '✓ Zimekubaliwa' : '✗ Zimekataliwa'}
                </button>
              ))}
            </div>
            {filteredTx.map(tx => (
              <div key={tx.id} className={`content-box p-4 ${tx.status === 'pending' ? 'border-yellow-500/40' : tx.status === 'approved' ? 'border-green-500/30' : 'border-red-500/20'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm">{(tx as any).user?.username || 'User'}</p>
                    <p className="text-gray-400 text-xs">{(tx as any).user?.phone || (tx as any).user?.email}</p>
                    <p className="text-gray-500 text-xs">{tx.plan_name || tx.type} • {new Date(tx.created_at).toLocaleString()}</p>
                    {tx.description && <p className="text-yellow-400/80 text-xs mt-0.5 truncate">📝 {tx.description}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-primary font-black text-lg">TZS {tx.amount.toLocaleString()}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${tx.status === 'approved' ? 'bg-green-500/20 text-green-400' : tx.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {tx.status === 'approved' ? '✓ Imekubaliwa' : tx.status === 'rejected' ? '✗ Imekataliwa' : '⏳ Inasubiri'}
                    </span>
                  </div>
                </div>
                {tx.screenshot_url && (
                  <button onClick={() => {
                    const overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;'; overlay.onclick = () => document.body.removeChild(overlay);
                    const img = document.createElement('img'); img.src = tx.screenshot_url!; img.style.cssText = 'max-width:95%;max-height:85vh;object-fit:contain;border-radius:12px;';
                    const closeBtn = document.createElement('button'); closeBtn.textContent = '✕ Funga'; closeBtn.style.cssText = 'position:absolute;top:16px;right:16px;color:white;background:rgba(0,0,0,0.7);border:none;font-size:16px;padding:8px 16px;border-radius:12px;cursor:pointer;z-index:1;'; closeBtn.onclick = (e) => { e.stopPropagation(); document.body.removeChild(overlay); };
                    overlay.appendChild(img); overlay.appendChild(closeBtn); document.body.appendChild(overlay);
                  }} className="mb-2 w-full rounded-xl overflow-hidden border border-primary/20">
                    <img src={tx.screenshot_url} alt="" className="w-full object-cover max-h-40" />
                    <p className="text-primary text-xs text-center py-1">Bonyeza kuona kubwa 🔍</p>
                  </button>
                )}
                {tx.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => approveTx(tx)} className="flex-1 bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm">✓ Kubali</button>
                    <button onClick={() => rejectTx(tx)} className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm">✗ Kataa</button>
                    <button onClick={() => navigate(`/chat/${tx.user_id}`)} className="px-3 bg-[#1a0a1a] text-primary font-bold py-2.5 rounded-xl text-sm">💬</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── UPLOADS MONITOR ── */}
        {tab === 'uploads' && (
          <div className="mt-2">
            <div className="flex gap-2 mb-3">
              <button onClick={() => setUploadMonitorTick(0)} className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${uploadMonitorTick === 0 ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
                <UploadCloud className="w-4 h-4" /> Zinaupload {liveUploads.length > 0 && <span className={`text-xs font-black px-1.5 py-0.5 rounded-full animate-pulse ${uploadMonitorTick === 0 ? 'bg-white/20 text-white' : 'bg-primary/20 text-primary'}`}>{liveUploads.length}</span>}
              </button>
              <button onClick={() => setUploadMonitorTick(1)} className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${uploadMonitorTick === 1 ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
                <Check className="w-4 h-4" /> Zilizokamilika {completedUploads.length > 0 && <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${uploadMonitorTick === 1 ? 'bg-white/20 text-white' : 'bg-green-500/20 text-green-400'}`}>{completedUploads.length}</span>}
              </button>
            </div>
            {uploadMonitorTick === 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">{liveUploads.length > 0 && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}<span className="text-gray-400 text-xs">Upload zinazoendela ({liveUploads.length})</span></div>
                {liveUploads.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-[#0d0d0d] rounded-2xl border border-[#2a0a2a]"><UploadCloud className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="font-semibold">Hakuna uploads zinazoedelea sasa</p></div>
                ) : liveUploads.map((u: any) => {
                  const s = u.isLocal ? globalUploadTracker.sessions.get(u.id) : null;
                  const isPaused = !!s?.paused;
                  const queuePos = u.isLocal ? globalUploadTracker.getQueuePosition(u.id) : 0;
                  const progress = Math.round(u.progress || 0);
                  const uploadedMB = u.file_size > 0 ? ((u.file_size * progress / 100) / 1024 / 1024).toFixed(1) : '0';
                  const totalMB = u.file_size > 0 ? (u.file_size / 1024 / 1024).toFixed(1) : '?';
                  return (
                    <div key={u.id} className="content-box p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">{u.content_type === 'video' ? <Video className="w-4 h-4 text-primary" /> : <Image className="w-4 h-4 text-primary" />}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm truncate">{u.file_name || 'Faili'}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-400 text-[11px]">👤 {u.username || 'Mtumiaji'}</span>
                            <span className="text-gray-500 text-[11px]">📂 {u.section || 'N/A'}</span>
                            {u.file_size > 0 && <span className="text-gray-600 text-[11px]">{totalMB} MB</span>}
                            {u.speed > 1024 && <span className="text-blue-400 text-[11px] font-bold">⚡ {u.speed >= 1024*1024 ? `${(u.speed/1024/1024).toFixed(1)}MB/s` : `${(u.speed/1024).toFixed(0)}KB/s`}</span>}
                            {u.speed > 1024 && u.file_size > 0 && progress < 100 && (() => { const rem = (u.file_size * (1 - progress/100)) / u.speed; return rem > 0 && isFinite(rem) ? <span className="text-yellow-400 text-[11px]">~{rem < 60 ? `${Math.ceil(rem)}s` : `${Math.floor(rem/60)}m ${Math.ceil(rem%60)}s`}</span> : null; })()}
                          </div>
                        </div>
                      </div>
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          {queuePos > 0 ? <span className="text-gray-500 font-bold">⏳ Inasubiri #{queuePos}</span> : isPaused ? <span className="text-yellow-400 font-bold">⏸ Imesimamishwa</span> : <span className="text-primary font-bold">{progress}%</span>}
                          {u.file_size > 0 && <span className="text-gray-500">{uploadedMB} / {totalMB} MB</span>}
                        </div>
                        <div className="h-2 bg-[#1a0a1a] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-300 ${queuePos > 0 ? 'bg-gray-600' : isPaused ? 'bg-yellow-500' : 'gradient-pink'}`} style={{ width: `${queuePos > 0 ? 100 : Math.max(2, progress)}%`, opacity: queuePos > 0 ? 0.25 : 1 }} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {u.isLocal && queuePos === 0 && (isPaused ?
                          <button onClick={() => { globalUploadTracker.resume(u.id); toast.success('Upload imeendelea!'); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30 active:scale-95"><PlayCircle className="w-3.5 h-3.5" /> Endelea</button> :
                          <button onClick={() => { globalUploadTracker.pause(u.id); toast.info('Upload imesimamishwa!'); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 active:scale-95"><PauseCircle className="w-3.5 h-3.5" /> Simamisha</button>
                        )}
                        {queuePos > 0 && <span className="flex-1 text-center py-2 text-xs text-gray-500 font-semibold bg-[#1a0a1a] rounded-xl">#{queuePos} foleni</span>}
                        <button onClick={async () => {
                          if (u.isLocal) { globalUploadTracker.cancel(u.id); toast.success('Upload imefutwa!'); }
                          else { await supabase.from('upload_sessions').update({ status: 'cancelled', cancelled_by_admin: true }).eq('id', u.id); toast.success('Upload imesimamishwa!'); }
                          setLiveUploads(prev => prev.filter((x: any) => x.id !== u.id));
                        }} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 active:scale-95 flex-shrink-0"><StopCircle className="w-3.5 h-3.5" /> Futa</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {uploadMonitorTick === 1 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-xs">Uploads zilizokamilika ({completedUploads.length})</span>
                  {completedUploads.length > 0 && <button onClick={async () => { await supabase.from('upload_sessions').delete().in('status', ['completed', 'failed', 'cancelled']); setCompletedUploads([]); toast.success('Zimefutwa!'); }} className="text-red-400 text-xs font-semibold">Futa Zote</button>}
                </div>
                {completedUploads.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-[#0d0d0d] rounded-2xl border border-[#2a0a2a]"><Check className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="font-semibold">Hakuna uploads zilizokamilika bado</p></div>
                ) : completedUploads.map((u: any) => (
                  <div key={u.id} className="content-box p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#1a0a1a] flex-shrink-0 flex items-center justify-center">
                        {u.media_url ? (u.content_type === 'video' ? <video src={u.media_url} className="w-full h-full object-cover" muted /> : <img src={u.media_url} alt="" className="w-full h-full object-cover" />) : (u.content_type === 'video' ? <Video className="w-5 h-5 text-gray-500" /> : <Image className="w-5 h-5 text-gray-500" />)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{u.file_name || 'Faili'}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-gray-400 text-xs">👤 {u.username || 'Mtumiaji'}</span>
                          <span className="text-gray-500 text-xs">📂 {u.section || 'N/A'}</span>
                          {u.file_size > 0 && <span className="text-gray-600 text-xs">{(u.file_size / 1024 / 1024).toFixed(1)} MB</span>}
                          {u.status === 'failed' ? <span className="text-red-400 text-xs font-bold">✗ Imeshindwa</span> : u.status === 'cancelled' ? <span className="text-orange-400 text-xs font-bold">✗ Imefutwa</span> : <span className="text-green-400 text-xs font-bold">✓ Imekamilika</span>}
                          {u.completed_at && <span className="text-gray-600 text-[10px]">{new Date(u.completed_at).toLocaleTimeString('sw-TZ')}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {u.status === 'failed' && (
                        <button onClick={async () => { await supabase.from('upload_sessions').update({ status: 'uploading', progress: 0 }).eq('id', u.id); setCompletedUploads(prev => prev.filter((x: any) => x.id !== u.id)); toast.info('Mtumiaji aendelee kupakia kutoka app yake.'); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 active:scale-95"><RefreshCw className="w-3.5 h-3.5" /> Jaribu Tena</button>
                      )}
                      {u.media_url && u.status === 'completed' && (
                        <button onClick={() => window.open(u.media_url, '_blank')} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-primary/20 text-primary border border-primary/30 active:scale-95"><Play className="w-3.5 h-3.5" /> Angalia</button>
                      )}
                      <button onClick={async () => { await supabase.from('upload_sessions').delete().eq('id', u.id); setCompletedUploads(prev => prev.filter((x: any) => x.id !== u.id)); }} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 active:scale-95 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /> Futa</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── WITHDRAWALS ── */}
        {tab === 'withdrawals' && (
          <div className="space-y-3 mt-2">
            <h3 className="text-white font-bold flex items-center gap-2"><ArrowDownCircle className="w-5 h-5 text-primary" />Maombi ya Kutoa Pesa</h3>
            {withdrawalRequests.length === 0 ? <div className="text-center py-8 text-gray-500"><ArrowDownCircle className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>Hakuna maombi ya kutoa pesa bado</p></div>
              : withdrawalRequests.map(w => (
              <div key={w.id} className={`content-box p-4 ${w.status === 'pending' ? 'border-yellow-500/40' : w.status === 'completed' ? 'border-green-500/30' : 'border-red-500/20'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm">{(w.user as any)?.username || 'Business'}</p>
                    <p className="text-gray-400 text-xs">{(w.user as any)?.phone || (w.user as any)?.email}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{w.network} - {w.phone_number}</p>
                    <p className="text-gray-500 text-xs">Jina: {w.account_name}</p>
                    <p className="text-gray-600 text-xs">{new Date(w.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-primary font-black text-lg">TZS {w.amount.toLocaleString()}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${w.status === 'completed' ? 'bg-green-500/20 text-green-400' : w.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {w.status === 'completed' ? '✓ Imetumwa' : w.status === 'rejected' ? '✗ Imekataliwa' : '⏳ Inasubiri'}
                    </span>
                  </div>
                </div>
                {w.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={async () => { await supabase.from('withdrawal_requests').update({ status: 'completed' }).eq('id', w.id); await supabase.from('notifications').insert({ user_id: w.user_id, title: '✅ Pesa Imetumwa!', message: `TZS ${w.amount.toLocaleString()} imetumwa kwa ${w.network} ${w.phone_number}.`, type: 'withdrawal_approved' }); toast.success('✅ Imeidhinishwa!'); fetchAll(); }} className="flex-1 bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm">✓ Nimetuma Pesa</button>
                    <button onClick={async () => { const { data: prof } = await supabase.from('user_profiles').select('balance').eq('id', w.user_id).single(); await supabase.from('user_profiles').update({ balance: (prof?.balance || 0) + w.amount }).eq('id', w.user_id); await supabase.from('withdrawal_requests').update({ status: 'rejected' }).eq('id', w.id); await supabase.from('notifications').insert({ user_id: w.user_id, title: '❌ Ombi Limekataliwa', message: `Ombi lako la kutoa TZS ${w.amount.toLocaleString()} limekataliwa. Pesa zimerudishwa.`, type: 'withdrawal_rejected' }); toast.success('Imekataliwa - pesa zimerudishwa'); fetchAll(); }} className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm">✗ Kataa</button>
                    <button onClick={() => navigate(`/chat/${w.user_id}`)} className="px-3 bg-[#1a0a1a] text-primary font-bold py-2.5 rounded-xl text-sm">💬</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* X ZA ADMIN CODES */}
        {tab === 'xcodes' && (
          <div className="mt-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-2"><span className="text-xl">🔞</span> X ZA ADMIN - Codes</h3>
            </div>
            <div className="content-box p-4 space-y-3">
              <div><label className="text-gray-400 text-xs mb-1 block">Max Matumizi (watu wangapi)</label><input id="xc-max-uses" type="number" placeholder="1" defaultValue="1" className="input-field" /></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Inaisha (hiari)</label><input id="xc-expires" type="datetime-local" className="input-field" /></div>
              <button onClick={async () => {
                const maxUses = parseInt((document.getElementById('xc-max-uses') as HTMLInputElement)?.value || '1');
                const expiresInput = (document.getElementById('xc-expires') as HTMLInputElement)?.value;
                const code = 'X' + Math.random().toString(36).substring(2, 9).toUpperCase();
                const { error } = await supabase.from('x_codes').insert({ code, max_uses: maxUses, use_count: 0, is_active: true, created_by: user?.id, expires_at: expiresInput ? new Date(expiresInput).toISOString() : null });
                if (error) { toast.error('Hitilafu: ' + error.message); return; }
                toast.success(`✅ X Code: ${code}`);
                alert(`🔞 X ZA ADMIN Code: ${code}\nMax watu: ${maxUses}`);
                fetchXCodes();
              }} className="btn-primary w-full">🔞 Tengeneza X Code</button>
            </div>
            <h3 className="text-white font-bold">X Codes Zote</h3>
            <div className="space-y-2">
              {xCodes.map((xc: any) => (
                <div key={xc.id} className={`content-box p-3 ${!xc.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-mono font-bold text-lg">{xc.code}</p>
                      <p className="text-gray-400 text-xs">Watu: {xc.use_count || 0}/{xc.max_uses}</p>
                      {xc.expires_at && <p className="text-gray-500 text-[10px]">Inaisha: {new Date(xc.expires_at).toLocaleDateString()}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => { navigator.clipboard.writeText(xc.code).then(() => toast.success('Code imenakiliwa!')).catch(() => {}); }} className="p-1.5 bg-blue-500/20 rounded-lg" title="Nakili code">
                        <span className="text-blue-400 text-xs font-bold">📋</span>
                      </button>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${xc.is_active && (xc.use_count || 0) < xc.max_uses ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{xc.is_active && (xc.use_count || 0) < xc.max_uses ? '✓ Inapatikana' : '✗ Imejaa'}</span>
                      <button onClick={async () => { await supabase.from('x_codes').update({ is_active: !xc.is_active }).eq('id', xc.id); fetchXCodes(); }} className={`p-1.5 rounded-lg text-xs font-bold ${xc.is_active ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{xc.is_active ? 'Zima' : 'Washa'}</button>
                      <button onClick={async () => { await supabase.from('x_codes').delete().eq('id', xc.id); fetchXCodes(); }} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </div>
                  {/* Members waliotumia code - na Lock/Unlock button kwa kila mmoja */}
                  {Array.isArray(xc.used_by) && xc.used_by.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-gray-400 text-xs font-semibold mb-2">👥 Members waliofungua ({xc.used_by.length}):</p>
                      <div className="space-y-2">
                        {xc.used_by.map((u: any, i: number) => {
                          const member = members.find((m: any) => m.id === u.user_id);
                          return (
                            <div key={i} className="flex items-center gap-3 bg-[#1a0a1a] rounded-xl p-2.5">
                              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-primary/20">
                                {member?.avatar_url
                                  ? <img src={member.avatar_url} className="w-full h-full object-cover" alt="" />
                                  : <div className="w-full h-full gradient-pink flex items-center justify-center text-white font-bold text-sm">{(member?.username || u.username || '?')[0]?.toUpperCase()}</div>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-semibold text-sm truncate">@{member?.username || u.username || u.user_id?.slice(0, 10)}</p>
                                <p className="text-gray-500 text-[10px]">{u.used_at ? new Date(u.used_at).toLocaleDateString('sw-TZ') : 'Haijulikani'}</p>
                              </div>
                              {/* Lock/Unlock button */}
                              <button onClick={async () => {
                                // Remove user from used_by = LOCK them (they'll need code again)
                                const newUsedBy = xc.used_by.filter((_: any, j: number) => j !== i);
                                await supabase.from('x_codes').update({ used_by: newUsedBy, use_count: Math.max(0, (xc.use_count || 1) - 1) }).eq('id', xc.id);
                                toast.success(`🔒 ${member?.username || u.username || 'Mtumiaji'} amefungwa! Ataomba code tena.`);
                                fetchXCodes();
                              }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-red-500/20 text-red-400 border border-red-500/30 active:scale-95 transition-transform flex-shrink-0">
                                <Lock className="w-3 h-3" /> Lock
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-gray-600 text-[10px] mt-2 text-center">"Lock" = Mtumiaji ataomba code mpya; "Unlock" = weka tena kwenye used_by</p>
                    </div>
                  )}
                  {/* If is_active=false that means admin disabled the whole code (all users locked effectively) */}
                  {!xc.is_active && (
                    <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-xl p-2">
                      <p className="text-red-400 text-xs text-center">🔒 Code imezimwa - Watu wote hawataweza kufungua bila kuwasha tena</p>
                    </div>
                  )}
                </div>
              ))}
              {xCodes.length === 0 && <p className="text-gray-500 text-center py-4">Hakuna X codes bado</p>}
            </div>
          </div>
        )}

      {/* ── MALAYA ── */}
        {tab === 'malaya' && (
          <div className="mt-2">
            {renderBoxes('malaya')}
            <div className="flex justify-between mb-2">
              <h3 className="text-white font-bold">{malayaPosts.length} Posts</h3>
              <button onClick={() => navigate('/malaya')} className="btn-primary text-xs py-1.5 px-3">+ Ongeza</button>
            </div>
            <div className="space-y-2">
              {malayaPosts.map((post) => (
                <div key={post.id} className="content-box p-3 flex gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#1a0a1a] flex-shrink-0">
                    {post.media_url && (/\.(mp4|webm|mov)/i.test(post.media_url) ? <video src={post.media_url} className="w-full h-full object-cover" muted /> : <img src={post.media_url} alt="" className="w-full h-full object-cover" />)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{post.title || 'Tangazo'}</p>
                    <p className="text-gray-400 text-xs">{post.region} • {post.location}</p>
                    {!post.is_free && <p className="text-primary text-xs font-bold">TZS {post.price?.toLocaleString()}</p>}
                    <TiksexyToggle value={(post as any).show_in_tiksexy !== false} onChange={async (v) => { await supabase.from('content_posts').update({ show_in_tiksexy: v }).eq('id', post.id); setMalayaPosts(prev => prev.map(p => p.id === post.id ? { ...p, show_in_tiksexy: v } as any : p)); toast.success(v ? '🎬 TikSexy: ON' : '❌ TikSexy: OFF'); }} />
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <div className="flex gap-0.5 flex-wrap justify-end">
                      {isAdmin && (
                        <button onClick={e => { e.stopPropagation(); handlePinPost(post); }}
                          className={`p-1 rounded text-[10px] ${(post as any).is_pinned ? 'text-yellow-400' : 'text-gray-500'}`}
                          title={(post as any).is_pinned ? 'Unpin' : 'Pin juu'}>
                          📌
                        </button>
                      )}
                      <button onClick={() => setEditPost(post)} className="text-primary p-1"><Edit3 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleSwapPost(post.id, 'up')} className="text-gray-500 p-1"><ArrowUp className="w-3 h-3" /></button>
                      <button onClick={() => handleSwapPost(post.id, 'down')} className="text-gray-500 p-1"><ArrowDown className="w-3 h-3" /></button>
                      <button onClick={() => handleDeletePost(post.id)} className="text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── VIDEO ── */}
        {tab === 'video' && (
          <div className="mt-2 space-y-4">
            {renderBoxes('video')}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-white font-bold">📂 Kategoria</h3>
                <button onClick={async () => { const name = prompt('Jina la category:'); if (!name) return; await supabase.from('video_categories').insert({ name, display_order: videoCategories.length + 1 }); fetchAll(); toast.success('Imeongezwa!'); }} className="btn-primary text-xs py-1.5 px-3">+ Category</button>
              </div>
              <div className="space-y-2">
                {videoCategories.map(cat => (
                  <div key={cat.id} className="content-box p-3 flex items-center gap-3">
                    <div className="w-12 h-10 rounded-lg overflow-hidden bg-[#1a0a1a] flex-shrink-0">
                      {cat.cover_url ? <img src={cat.cover_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-500">🎬</div>}
                    </div>
                    <span className="text-white font-semibold flex-1">{cat.name}</span>
                    <label className="p-1.5 bg-blue-500/20 rounded-lg cursor-pointer"><Image className="w-3.5 h-3.5 text-blue-400" /><input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadCategoryImage(cat.id, f); }} /></label>
                    <button onClick={async () => { const n = prompt('Jina jipya:', cat.name); if (!n) return; await supabase.from('video_categories').update({ name: n }).eq('id', cat.id); fetchAll(); }} className="p-1.5 bg-[#1a0a1a] rounded-lg"><Edit3 className="w-3.5 h-3.5 text-primary" /></button>
                    <button onClick={async () => { if (!window.confirm(`Futa "${cat.name}"?`)) return; await supabase.from('video_categories').delete().eq('id', cat.id); fetchAll(); }} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-white font-bold">{videoPosts.length} Video</h3>
                <div className="flex gap-2">
                  <button onClick={generateMissingThumbnails} className="btn-outline text-xs py-1.5 px-2 flex items-center gap-1"><Image className="w-3 h-3" /> Thumbnails</button>
                  <button onClick={() => navigate('/video')} className="btn-primary text-xs py-1.5 px-3">+ Pakia</button>
                </div>
              </div>
              {uploadingFile && <div className="mb-2"><DetailedProgress progress={uploadPct} fileName={uploadFileName} fileSize={uploadFileSize} uploadedBytes={uploadedBytes} /></div>}
              <div className="space-y-2">
                {videoPosts.map(post => (
                  <div key={post.id} className="content-box p-3 flex gap-3">
                    <div className="w-14 h-12 rounded-xl overflow-hidden bg-[#1a0a1a] flex-shrink-0 flex items-center justify-center">
                      {post.thumbnail_url ? <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" /> : post.media_url ? <video src={post.media_url} className="w-full h-full object-cover" muted /> : <Play className="w-5 h-5 text-gray-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{post.title || 'Video'}</p>
                      <p className="text-gray-400 text-xs">{post.section} • {post.views || 0} views</p>
                      {!post.is_free && <p className="text-primary text-xs font-bold">TZS {post.price?.toLocaleString()}</p>}
                      <TiksexyToggle value={(post as any).show_in_tiksexy !== false} onChange={async (v) => { await supabase.from('content_posts').update({ show_in_tiksexy: v }).eq('id', post.id); setVideoPosts(prev => prev.map(p => p.id === post.id ? { ...p, show_in_tiksexy: v } as any : p)); toast.success(v ? '🎬 TikSexy: ON' : '❌ TikSexy: OFF'); }} />
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={() => setEditPost({ ...post })} className="text-primary p-1"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => swapPost(videoPosts, post.id, 'up', fetchVideo)} className="text-gray-500 p-1"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => swapPost(videoPosts, post.id, 'down', fetchVideo)} className="text-gray-500 p-1"><ArrowDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deletePost(post.id, 'video')} className="text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-white font-bold">🎓 Video za Mwongozo</h3>
                <label className="btn-primary text-xs py-1.5 px-3 cursor-pointer">+ Pakia<input type="file" accept="video/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const title = prompt('Kichwa cha video:') || 'Video ya Mwongozo'; await uploadHowVideo(f, title); }} /></label>
              </div>
              <div className="space-y-2">
                {howVideos.map((hv) => (
                  <div key={hv.id} className="content-box p-3 flex gap-3">
                    <div className="w-14 h-12 rounded-xl overflow-hidden bg-[#1a0a1a] flex-shrink-0">{hv.media_url && <video src={hv.media_url} className="w-full h-full object-cover" muted />}</div>
                    <div className="flex-1 min-w-0"><p className="text-white font-semibold text-sm truncate">{hv.title}</p><p className="text-gray-400 text-xs">Video ya Mwongozo</p></div>
                    <div className="flex flex-col gap-1">
                      <button onClick={async () => { const n = prompt('Jina jipya:', hv.title); if (!n) return; await supabase.from('content_posts').update({ title: n }).eq('id', hv.id); fetchVideo(); }} className="text-primary p-1"><Edit3 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => swapPost(howVideos, hv.id, 'up', fetchVideo)} className="text-gray-500 p-1"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => swapPost(howVideos, hv.id, 'down', fetchVideo)} className="text-gray-500 p-1"><ArrowDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteHowVideo(hv.id)} className="text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── LIVE ── */}
        {tab === 'live' && (
          <div className="mt-2 space-y-3">
            {renderBoxes('live')}
            <button onClick={() => navigate('/live')} className="btn-primary w-full flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Ongeza Live Option</button>
            {livePosts.map((opt, idx) => (
              <div key={opt.id} className="content-box p-4">
                <div className="flex gap-3 items-start">
                  {opt.cover_url && <div className="w-14 h-12 rounded-xl overflow-hidden flex-shrink-0"><img src={opt.cover_url} alt="" className="w-full h-full object-cover" /></div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold truncate">{opt.name}</p>
                    <p className="text-gray-400 text-xs">{opt.type} • TZS {parseFloat(opt.price as any || '0').toLocaleString()}</p>
                    <TiksexyToggle value={!!(opt as any).show_in_tiksexy} onChange={async (v) => { await supabase.from('live_options').update({ show_in_tiksexy: v }).eq('id', opt.id); setLivePosts(prev => prev.map(o => o.id === opt.id ? { ...o, show_in_tiksexy: v } as any : o)); toast.success(v ? '🎬 TikSexy: ON' : '❌ TikSexy: OFF'); }} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => setEditLive({ ...opt })} className="p-1.5 bg-[#1a0a1a] rounded-lg"><Edit3 className="w-3.5 h-3.5 text-primary" /></button>
                    <button onClick={async () => { if (idx > 0) { const prev = livePosts[idx - 1]; await supabase.from('live_options').update({ display_order: idx - 1 }).eq('id', opt.id); await supabase.from('live_options').update({ display_order: idx }).eq('id', prev.id); fetchLive(); } }} className="p-1.5 bg-[#1a0a1a] rounded-lg"><ArrowUp className="w-3 h-3 text-gray-400" /></button>
                    <button onClick={async () => { if (idx < livePosts.length - 1) { const next = livePosts[idx + 1]; await supabase.from('live_options').update({ display_order: idx + 1 }).eq('id', opt.id); await supabase.from('live_options').update({ display_order: idx }).eq('id', next.id); fetchLive(); } }} className="p-1.5 bg-[#1a0a1a] rounded-lg"><ArrowDown className="w-3 h-3 text-gray-400" /></button>
                    <button onClick={async () => { await supabase.from('live_options').update({ is_active: false }).eq('id', opt.id); fetchLive(); }} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── NOTIFICATIONS ── */}
        {tab === 'notifications' && (
          <div className="mt-4 space-y-4">
            <div className="content-box p-4 space-y-3">
              <h3 className="text-white font-bold flex items-center gap-2"><Bell className="w-5 h-5 text-primary" />Tuma Arifa</h3>
              <div className="flex gap-2">
                <button onClick={() => setNotifTarget('all')} className={`flex-1 py-2 rounded-xl text-sm font-semibold ${notifTarget === 'all' ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>Wote</button>
                <button onClick={() => setNotifTarget('one')} className={`flex-1 py-2 rounded-xl text-sm font-semibold ${notifTarget === 'one' ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>Member Mmoja</button>
              </div>
              {notifTarget === 'one' && <select value={selectedMemberId} onChange={e => setSelectedMemberId(e.target.value)} className="input-field"><option value="">Chagua Member</option>{members.map(m => <option key={m.id} value={m.id}>{m.username} ({m.phone || m.email})</option>)}</select>}
              <input value={notifTitle} onChange={e => setNotifTitle(e.target.value)} placeholder="Kichwa cha arifa *" className="input-field" />
              <textarea value={notifMsg} onChange={e => setNotifMsg(e.target.value)} placeholder="Ujumbe *" className="input-field min-h-[80px] resize-none" />
              <input value={notifLink} onChange={e => setNotifLink(e.target.value)} placeholder="Link (hiari)" className="input-field" />
              <button onClick={sendNotification} className="btn-primary w-full flex items-center justify-center gap-2"><Bell className="w-4 h-4" /> Tuma Arifa</button>
            </div>
            <div className="content-box p-4 space-y-3">
              <h3 className="text-white font-bold flex items-center gap-2"><Users className="w-5 h-5 text-blue-400" />📢 Tuma Kwa Wafuasi wa Account</h3>
              <p className="text-gray-500 text-xs">Chagua account ya Business/Admin - arifa itatumwa kwa wafuasi wake wote</p>
              <BroadcastToFollowersPanel members={members} />
            </div>
            {/* WhatsApp Blast Panel */}
            <div className="content-box p-4 space-y-3">
              <h3 className="text-white font-bold flex items-center gap-2"><span className="text-xl">💬</span> WhatsApp Blast - Members Wote</h3>
              <p className="text-gray-500 text-xs">Tuma ujumbe wa WhatsApp kwa members wote wenye namba za simu. Bonyeza jina la member kufungua WhatsApp moja kwa moja.</p>
              <WhatsAppBlastPanel members={members} />
            </div>
          </div>
        )}

        {/* ── SERVICES ── */}
        {tab === 'services' && (
          <div className="mt-4 space-y-3">
            {renderBoxes('services')}
            <h3 className="text-white font-bold">👑 Mipango ya VIP</h3>
            {vipPlans.map(plan => (
              <div key={plan.id} className="content-box p-4 flex items-center justify-between">
                <div><p className="text-white font-bold">{plan.name}</p><p className="text-gray-400 text-sm">Siku {plan.duration_days}</p></div>
                <div className="flex items-center gap-3">
                  <p className="text-primary font-black">TZS {plan.price.toLocaleString()}</p>
                  <button onClick={() => setEditVipPlan({ ...plan })} className="p-1.5 bg-[#1a0a1a] rounded-lg"><Edit3 className="w-3.5 h-3.5 text-primary" /></button>
                  <button onClick={async () => { await supabase.from('vip_plans').delete().eq('id', plan.id); fetchAll(); }} className="text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            <button onClick={async () => { const name = prompt('Jina la mpango:'); if (!name) return; const days = parseInt(prompt('Siku ngapi?') || '30'); const price = parseInt(prompt('Bei (TZS):') || '5000'); await supabase.from('vip_plans').insert({ name, duration_days: days, price, features: [], is_active: true, display_order: vipPlans.length + 1 }); fetchAll(); toast.success('Mpango umeongezwa!'); }} className="btn-outline w-full text-sm">+ Ongeza Mpango wa VIP</button>
            <h3 className="text-white font-bold mt-4">📱 APK App Download</h3>
            <div className="content-box p-3">
              <input value={editSettings.app_apk_url || ''} onChange={e => setEditSettings(p => ({ ...p, app_apk_url: e.target.value }))} placeholder="Link ya APK au pakia chini" className="input-field mb-2" />
              <label className="block btn-outline text-center cursor-pointer py-2 text-sm mb-2">
                <Upload className="w-4 h-4 inline mr-2" />{editSettings.app_apk_url ? '✓ APK imewekwa - Badilisha' : 'Pakia APK (.apk file)'}
                <input type="file" accept=".apk,application/vnd.android.package-archive,application/octet-stream" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  try {
                    toast.info('Inapakia APK... Subiri (inaweza kuchukua muda)');
                    setUploadingFile(true); setUploadPct(0); setUploadFileName(f.name); setUploadFileSize(f.size); setUploadedBytes(0);
                    const apkPath2 = `apk/app_${Date.now()}.apk`;
                    // Use Supabase SDK directly - most reliable for APK (bypasses MIME type issues)
                    setUploadPct(10);
                    const apkBlob = new Blob([await f.arrayBuffer()], { type: 'application/octet-stream' });
                    const apkFileObj = new File([apkBlob], f.name, { type: 'application/octet-stream' });
                    setUploadPct(30);
                    const { data: upData, error: upErr } = await supabase.storage.from('content').upload(apkPath2, apkFileObj, { upsert: true, contentType: 'application/octet-stream' });
                    setUploadPct(90);
                    if (upErr) throw new Error(upErr.message);
                    const { data: urlData } = supabase.storage.from('content').getPublicUrl(apkPath2);
                    const url = urlData.publicUrl;
                    setUploadPct(100); setUploadedBytes(f.size);
                    setEditSettings(p => ({ ...p, app_apk_url: url }));
                    await supabase.from('app_settings').upsert({ key: 'app_apk_url', value: url, updated_at: new Date().toISOString() }, { onConflict: 'key' });
                    setUploadingFile(false);
                    toast.success('✅ APK imepakiwa! Watu wanaweza kudownload sasa.');
                  } catch (apkE: any) { toast.error('APK upload imeshindwa: ' + (apkE?.message || 'Jaribu tena')); setUploadingFile(false); }
                }} />
              </label>
              {uploadingFile && <div className="mb-2"><DetailedProgress progress={uploadPct} fileName={uploadFileName} fileSize={uploadFileSize} uploadedBytes={uploadedBytes} /></div>}
              {editSettings.app_apk_url && <div className="flex items-center gap-2 mb-2 p-2 bg-green-500/10 rounded-xl border border-green-500/20"><span className="text-green-400 text-xs">✓ APK ipo - mtu akibonyeza Download App itadownload otomatiki</span></div>}
              <button onClick={async () => { if (editSettings.app_apk_url) { await supabase.from('app_settings').upsert({ key: 'app_apk_url', value: editSettings.app_apk_url }, { onConflict: 'key' }); toast.success('Link imehifadhiwa!'); } }} className="btn-primary w-full mt-2 text-sm">💾 Hifadhi Link ya APK</button>
            </div>
            <h3 className="text-white font-bold mt-4">🛠️ Huduma</h3>
            {services.map((svc, idx) => (
              <div key={svc.id} className="content-box overflow-hidden">
                {(svc as any).video_url && <div className="relative w-full bg-black" style={{ minHeight: '160px' }}><video src={(svc as any).video_url} className="w-full" style={{ maxHeight: '240px', objectFit: 'cover' }} controls muted playsInline preload="metadata" /></div>}
                {!(svc as any).video_url && (svc as any).image_url && <img src={(svc as any).image_url} alt={svc.name} className="w-full" style={{ objectFit: 'cover', objectPosition: 'top', maxHeight: '240px' }} />}
                <div className="p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold">{svc.name}</p>
                    {svc.description && <p className="text-gray-400 text-sm">{svc.description}</p>}
                    <p className="text-primary font-black">TZS {svc.price.toLocaleString()}</p>
                    <TiksexyToggle value={!!(svc as any).show_in_tiksexy} onChange={async (v) => { await supabase.from('services').update({ show_in_tiksexy: v }).eq('id', svc.id); setServices(prev => prev.map(s => s.id === svc.id ? { ...s, show_in_tiksexy: v } as any : s)); toast.success(v ? '🎬 TikSexy: ON' : '❌ TikSexy: OFF'); }} />
                  </div>
                  <div className="flex gap-1 flex-col">
                    <button onClick={async () => { if (idx > 0) { await supabase.from('services').update({ display_order: (services[idx-1].display_order||0)+1 }).eq('id', svc.id); await supabase.from('services').update({ display_order: (svc.display_order||0)-1 }).eq('id', services[idx-1].id); fetchAll(); } }} className="p-1.5 bg-[#1a0a1a] rounded-lg"><ArrowUp className="w-3 h-3 text-gray-400" /></button>
                    <button onClick={async () => { if (idx < services.length-1) { await supabase.from('services').update({ display_order: (services[idx+1].display_order||0)-1 }).eq('id', svc.id); await supabase.from('services').update({ display_order: (svc.display_order||0)+1 }).eq('id', services[idx+1].id); fetchAll(); } }} className="p-1.5 bg-[#1a0a1a] rounded-lg"><ArrowDown className="w-3 h-3 text-gray-400" /></button>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditService(svc)} className="p-2 bg-[#1a0a1a] rounded-xl"><Edit3 className="w-4 h-4 text-primary" /></button>
                    <button onClick={async () => { await supabase.from('services').delete().eq('id', svc.id); fetchAll(); }} className="p-2 bg-red-500/20 rounded-xl"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => { setNewServiceData({ name: '', description: '', price: '0', action_link: '' }); setNewServiceShowTiksexy(false); setShowAddService(true); }} className="btn-outline w-full text-sm flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Ongeza Huduma Mpya</button>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <div className="mt-4 space-y-3" onFocus={markEditing} onChange={markEditing} onInput={markEditing}>
            <h3 className="text-white font-bold mb-2">🏠 Majina ya Kadi za Nyumbani</h3>
            {[{ key: 'home_card_malaya_title', label: 'Jina la kadi ya Malaya', placeholder: 'MALAYA' }, { key: 'home_card_video_title', label: 'Jina la kadi ya Video', placeholder: 'VIDEO' }, { key: 'home_card_live_title', label: 'Jina la kadi ya Live', placeholder: 'LIVE' }, { key: 'referral_target', label: 'Idadi ya Rufaa kwa Bonus (mtu akifika hii, anapata bonus)', placeholder: '10' }, { key: 'referral_bonus', label: 'Kiasi cha Bonus ya Rufaa (TZS) - Mtu akifikia lengo anapata hii', placeholder: '20000' }].map(item => (
              <div key={item.key}><label className="text-gray-400 text-xs font-semibold mb-1 block">{item.label}</label><input value={editSettings[item.key] || ''} onChange={e => setEditSettings(prev => ({ ...prev, [item.key]: e.target.value }))} placeholder={item.placeholder} className="input-field" /></div>
            ))}
            <h3 className="text-white font-bold mb-2 mt-4">💳 Mipangilio ya Malipo</h3>
            {[{ key: 'payment_network', label: 'Mtandao wa Malipo' }, { key: 'payment_number', label: 'Namba ya Malipo' }, { key: 'payment_name', label: 'Jina la Mpokea Pesa' }, { key: 'business_price_monthly', label: 'Bei ya Business Account (TZS/mwezi)' }, { key: 'blue_tick_price', label: 'Bei ya Blue Tick (TZS)' }, { key: 'live_room_price', label: 'Bei ya Live Room (TZS)' }, { key: 'boost_price', label: 'Bei ya Boost Post (TZS)' }, { key: 'boost_duration_hours', label: 'Muda wa Boost (masaa)' }, { key: 'referral_target', label: 'Idadi ya Rufaa kwa Bonus' }, { key: 'whatsapp_support', label: 'WhatsApp ya Msaada' }, { key: 'support_agent_name', label: 'Jina la Agent wa Msaada/AI' }, { key: 'room_name', label: 'Jina la SexyRoom' }].map(item => (
              <div key={item.key}><label className="text-gray-400 text-xs font-semibold mb-1 block">{item.label}</label><input value={editSettings[item.key] || ''} onChange={e => setEditSettings(prev => ({ ...prev, [item.key]: e.target.value }))} className="input-field" /></div>
            ))}
            <button onClick={saveSettings} disabled={saving} className="btn-primary w-full">{saving ? 'Inahifadhi...' : '💾 Hifadhi Mipangilio'}</button>
          </div>
        )}

        {/* ── THEME ── */}
        {tab === 'theme' && (
          <div className="mt-4 space-y-4" onFocus={markEditing} onChange={markEditing} onInput={markEditing}>
            <h3 className="text-white font-bold">🎨 Rangi za Background</h3>
            {[{ label: 'SexyRoom Background', key1: 'room_color_from', key2: 'room_color_to' }, { label: 'Messenger/Chat Background', key1: 'chat_color_from', key2: 'chat_color_to' }, { label: 'AI Support Background', key1: 'ai_color_from', key2: 'ai_color_to' }].map(({ label, key1, key2 }) => {
              const from = editSettings[key1] || '#0a030f'; const to = editSettings[key2] || '#1a0a2a';
              return (
                <div key={key1} className="content-box p-4 space-y-3">
                  <p className="text-gray-300 text-sm font-semibold">{label}</p>
                  <div className="flex gap-3">
                    <div className="flex-1"><label className="text-gray-500 text-xs">From</label><div className="flex gap-2 mt-1"><input type="color" value={from} onChange={e => setEditSettings(p => ({ ...p, [key1]: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer border border-primary/30" /><input value={from} onChange={e => setEditSettings(p => ({ ...p, [key1]: e.target.value }))} className="input-field flex-1 text-sm" /></div></div>
                    <div className="flex-1"><label className="text-gray-500 text-xs">To</label><div className="flex gap-2 mt-1"><input type="color" value={to} onChange={e => setEditSettings(p => ({ ...p, [key2]: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer border border-primary/30" /><input value={to} onChange={e => setEditSettings(p => ({ ...p, [key2]: e.target.value }))} className="input-field flex-1 text-sm" /></div></div>
                  </div>
                  <div className="rounded-xl h-10 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}><p className="text-white/60 text-xs">Preview</p></div>
                </div>
              );
            })}
            {[{ key: 'room_bg_image', label: 'SexyRoom BG', bucket: 'room-media', path: 'bg/room' }, { key: 'chat_bg_image', label: 'Messenger BG', bucket: 'chat-media', path: 'bg/chat' }, { key: 'ai_bg_image', label: 'AI Support BG', bucket: 'avatars', path: 'bg/ai' }, { key: 'room_cover', label: 'Cover ya SexyRoom', bucket: 'room-media', path: 'cover/room' }, { key: 'support_agent_photo', label: 'Picha ya AI Agent', bucket: 'avatars', path: 'cover/ai' }].map(item => (
              <div key={item.key} className="content-box p-3 space-y-2">
                <p className="text-gray-400 text-xs font-semibold">{item.label}</p>
                <label className="block btn-outline text-center cursor-pointer py-2 text-sm"><Upload className="w-4 h-4 inline mr-2" />Chagua Picha<input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const url = await uploadWithProgress(item.bucket, `${item.path}_${Date.now()}.${f.name.split('.').pop()}`, f); setEditSettings(prev => ({ ...prev, [item.key]: url })); await supabase.from('app_settings').upsert({ key: item.key, value: url }, { onConflict: 'key' }); toast.success('✅ Imepakiwa!'); } catch { toast.error('Hitilafu ya upload'); setUploadingFile(false); } }} /></label>
                {editSettings[item.key] && (
                  <div className="space-y-1">
                    <img src={editSettings[item.key]} alt="" className="w-full h-16 object-cover rounded-xl border border-primary/30" />
                    <button onClick={async () => { setEditSettings(prev => ({ ...prev, [item.key]: '' })); await supabase.from('app_settings').upsert({ key: item.key, value: '', updated_at: new Date().toISOString() }, { onConflict: 'key' }); toast.success('Background imeondolewa!'); window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: { [item.key]: '' } })); }} className="w-full py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/30">🗑 Ondoa Background</button>
                  </div>
                )}
              </div>
            ))}

            {/* Blue Tick settings */}
            <div className="content-box p-4 space-y-4">
              <p className="text-yellow-400 font-bold text-sm border-b border-yellow-400/20 pb-2">✓ Blue Tick & Profaili ya Members</p>
              <div><label className="text-gray-400 text-xs font-semibold mb-1 block">Ukubwa wa Blue Tick: {editSettings.blue_tick_size || '18'}px</label>
              <input type="range" min="10" max="36" value={parseInt(editSettings.blue_tick_size || '18')} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, blue_tick_size: e.target.value })); }} className="w-full" style={{ accentColor: '#FFD700' }} />
              {/* PREVIEW - live update of tick size */}
              <div className="flex items-center gap-3 mt-2 p-2 rounded-lg bg-[#0d0d0d] border border-white/8">
                {(['blue','gold','pink','green'] as const).map(tick => (
                  <div key={tick} className="flex items-center gap-1">
                    <span className="text-white text-xs">{tick}</span>
                    <BlueTick tickId={tick} forceSize={parseInt(editSettings.blue_tick_size || '18')} />
                  </div>
                ))}
              </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-semibold mb-2 block">Nafasi ya Blue Tick kwenye Jina</label>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setEditSettings(p => ({ ...p, blue_tick_position: 'left' }))} className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${editSettings.blue_tick_position === 'left' ? 'gradient-pink text-white border-transparent' : 'bg-[#1a0a1a] text-gray-400 border-gray-700'}`}>← Kabla ya Jina</button>
                  <button onClick={() => setEditSettings(p => ({ ...p, blue_tick_position: 'right' }))} className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${(editSettings.blue_tick_position === 'right' || !editSettings.blue_tick_position) ? 'gradient-pink text-white border-transparent' : 'bg-[#1a0a1a] text-gray-400 border-gray-700'}`}>Baada ya Jina →</button>
                  <button onClick={() => setEditSettings(p => ({ ...p, blue_tick_position: 'inside' }))} className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${editSettings.blue_tick_position === 'inside' ? 'gradient-pink text-white border-transparent' : 'bg-[#1a0a1a] text-gray-400 border-gray-700'}`}>Ndani ya Jina</button>
                </div>
                {editSettings.blue_tick_position === 'inside' && (
                  <div className="mb-3 p-3 bg-[#1a0a1a] rounded-xl border border-primary/20">
                    <label className="text-gray-400 text-xs mb-1 block">Sogeza Ndani ya Jina (overlap): -{editSettings.blue_tick_offset || '4'}px</label>
                    <input type="range" min="0" max="24" value={parseInt(editSettings.blue_tick_offset || '4')} onChange={e => setEditSettings(p => ({ ...p, blue_tick_offset: e.target.value }))} className="w-full mb-1" style={{ accentColor: '#FF1493' }} />
                    <p className="text-gray-600 text-[10px]">Tick itaingiana na mwisho wa jina la mtumiaji</p>
                  </div>
                )}
                {/* Preview ya Blue Tick - live update */}
                <div className="rounded-xl p-3 bg-[#0d0d0d] border border-white/8">
                  <p className="text-gray-500 text-[10px] mb-2">Preview (inabadilika mara moja):</p>
                  {(['blue','gold'] as const).map((tick, ti) => (
                    <div key={tick} className={`flex items-center gap-2 ${ti > 0 ? 'mt-2' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${tick === 'gold' ? 'bg-yellow-500/20' : 'bg-primary/30'}`}>
                        {tick === 'gold' ? '👑' : '👤'}
                      </div>
                      <div className="flex items-center relative">
                        {editSettings.blue_tick_position === 'left' && (
                          <span style={{ marginRight: '4px' }}><BlueTick tickId={tick} size={parseInt(editSettings.blue_tick_size || '18')} /></span>
                        )}
                        <span style={{ fontSize: parseInt(editSettings.username_font_size || '16'), fontFamily: getFontFamily('username_font_style'), fontWeight: 600, color: 'white' }}>
                          {tick === 'gold' ? 'VIP User' : 'Username'}
                        </span>
                        {(editSettings.blue_tick_position === 'right' || !editSettings.blue_tick_position) && (
                          <span style={{ marginLeft: '4px' }}><BlueTick tickId={tick} size={parseInt(editSettings.blue_tick_size || '18')} /></span>
                        )}
                        {editSettings.blue_tick_position === 'inside' && (
                          <span style={{ marginLeft: `-${editSettings.blue_tick_offset || '4'}px`, verticalAlign: 'middle' }}>
                            <BlueTick tickId={tick} size={parseInt(editSettings.blue_tick_size || '18')} />
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div><label className="text-gray-400 text-xs font-semibold mb-1 block">Ukubwa wa Jina: {editSettings.username_font_size || '16'}px</label><input type="range" min="12" max="28" value={parseInt(editSettings.username_font_size || '16')} onChange={e => setEditSettings(p => ({ ...p, username_font_size: e.target.value }))} className="w-full" style={{ accentColor: '#FF1493' }} /></div>
              <div><label className="text-gray-400 text-xs font-semibold mb-1 block">Font Style ya Majina</label><select value={editSettings.username_font_style || 'default'} onChange={e => setEditSettings(p => ({ ...p, username_font_style: e.target.value }))} className="input-field"><option value="default">Default (Inter)</option><option value="dancing">Dancing Script ✨</option><option value="pacifico">Pacifico 🌸</option><option value="lobster">Lobster 🔥</option><option value="bold">Bold Italic</option></select></div>
            </div>

            {/* ── CHAT BUBBLES SETTINGS ── */}
            <div className="content-box p-4 space-y-4">
              <p className="text-blue-400 font-bold text-sm border-b border-blue-400/20 pb-2">💬 Messenger/Inbox Bubble Settings (Huru)</p>
              <div className="space-y-3">
                {[
                  { label: 'Sent Bubble - From', key: 'bubble_sent_from', def: '#7C3AED' },
                  { label: 'Sent Bubble - To', key: 'bubble_sent_to', def: '#FF1493' },
                  { label: 'Received Bubble - From', key: 'bubble_recv_from', def: '#1a0a2a' },
                  { label: 'Received Bubble - To', key: 'bubble_recv_to', def: '#2d1040' },
                ].map(item => (
                  <div key={item.key}>
                    <label className="text-gray-400 text-xs mb-1 block">{item.label}</label>
                    <div className="flex gap-2">
                      <input type="color" value={editSettings[item.key] || item.def} onChange={e => { markEditing(); const v = e.target.value; setEditSettings(p => ({ ...p, [item.key]: v })); }} className="w-10 h-10 rounded-lg cursor-pointer border border-primary/30" />
                      <input value={editSettings[item.key] || item.def} onChange={e => { markEditing(); const v = e.target.value; setEditSettings(p => ({ ...p, [item.key]: v })); }} className="input-field flex-1 text-sm font-mono" />
                    </div>
                  </div>
                ))}
                {/* Bubble preview - live update */}
                <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <p className="text-gray-500 text-[10px] mb-2">Preview (inabadilika mara moja):</p>
                  <div className="flex justify-end">
                    <div className="max-w-[70%] px-3 py-2" style={{
                      borderRadius: `${editSettings.bubble_radius || '18'}px`,
                      background: `linear-gradient(135deg, ${editSettings.bubble_sent_from || '#7C3AED'}, ${editSettings.bubble_sent_to || '#FF1493'})`,
                      color: editSettings.chat_text_color || '#fff',
                      fontSize: `${editSettings.chat_font_size || '14'}px`,
                      fontFamily: editSettings.chat_font_family === 'dancing' ? 'Dancing Script, cursive' : editSettings.chat_font_family === 'pacifico' ? 'Pacifico, cursive' : editSettings.chat_font_family === 'mono' ? 'monospace' : editSettings.chat_font_family === 'serif' ? 'serif' : 'inherit',
                    }}>
                      Habari! Uko nzuri leo? 😊
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[70%] px-3 py-2" style={{
                      borderRadius: `${editSettings.bubble_radius || '18'}px`,
                      background: `linear-gradient(135deg, ${editSettings.bubble_recv_from || '#1a0a2a'}, ${editSettings.bubble_recv_to || '#2d1040'})`,
                      color: '#fff',
                      fontSize: `${editSettings.chat_font_size || '14'}px`,
                      fontFamily: editSettings.chat_font_family === 'dancing' ? 'Dancing Script, cursive' : editSettings.chat_font_family === 'pacifico' ? 'Pacifico, cursive' : editSettings.chat_font_family === 'lobster' ? 'Lobster, cursive' : editSettings.chat_font_family === 'mono' ? 'monospace' : editSettings.chat_font_family === 'serif' ? 'serif' : 'inherit',
                    }}>
                      Nzuri sana! Nakushukuru 💋
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[70%] px-3 py-2" style={{
                      borderRadius: `${editSettings.bubble_radius || '18'}px`,
                      background: `linear-gradient(135deg, ${editSettings.bubble_sent_from || '#7C3AED'}, ${editSettings.bubble_sent_to || '#FF1493'})`,
                      color: editSettings.chat_text_color || '#fff',
                      fontSize: `${editSettings.chat_font_size || '14'}px`,
                      fontFamily: editSettings.chat_font_family === 'dancing' ? 'Dancing Script, cursive' : editSettings.chat_font_family === 'pacifico' ? 'Pacifico, cursive' : editSettings.chat_font_family === 'lobster' ? 'Lobster, cursive' : editSettings.chat_font_family === 'mono' ? 'monospace' : editSettings.chat_font_family === 'serif' ? 'serif' : 'inherit',
                    }}>
                      Nakupenda sana ❤️
                    </div>
                  </div>
                </div>
                <div><label className="text-gray-400 text-xs mb-1 block">Border Radius ya Bubble: {editSettings.msg_bubble_radius || '18'}px</label><input type="range" min="0" max="28" value={parseInt(editSettings.msg_bubble_radius || '18')} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, msg_bubble_radius: e.target.value })); }} className="w-full" style={{ accentColor: '#7C3AED' }} /></div>
                <div><label className="text-gray-400 text-xs mb-1 block">Ukubwa wa Font ya Chat: {editSettings.msg_bubble_font_size || '14'}px</label><input type="range" min="10" max="22" value={parseInt(editSettings.msg_bubble_font_size || '14')} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, msg_bubble_font_size: e.target.value })); }} className="w-full" style={{ accentColor: '#7C3AED' }} /></div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Rangi ya Maandishi (Sent Message)</label>
                  <div className="flex gap-2"><input type="color" value={editSettings.msg_bubble_text_color || '#ffffff'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, msg_bubble_text_color: e.target.value })); }} className="w-10 h-10 rounded-lg cursor-pointer border border-primary/30" /><input value={editSettings.msg_bubble_text_color || '#ffffff'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, msg_bubble_text_color: e.target.value })); }} className="input-field flex-1 text-sm font-mono" /></div>
                </div>
                <div><label className="text-gray-400 text-xs mb-1 block">Font Style ya Messenger</label><select value={editSettings.msg_bubble_font_family || 'default'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, msg_bubble_font_family: e.target.value })); }} className="input-field"><option value="default">Default (System)</option><option value="dancing">Dancing Script ✨</option><option value="pacifico">Pacifico 🌸</option><option value="mono">Monospace 💻</option><option value="serif">Serif 📖</option></select></div>
              </div>
            </div>

            {/* ── AI SUPPORT BUBBLE SETTINGS ── */}
            <div className="content-box p-4 space-y-4">
              <p className="text-cyan-400 font-bold text-sm border-b border-cyan-400/20 pb-2">🤖 AI Support Bubble Settings (Huru)</p>
              <div className="space-y-3">
                {[
                  { label: 'My Message - From', key: 'ai_bubble_my_from', def: '#7C3AED' },
                  { label: 'My Message - To', key: 'ai_bubble_my_to', def: '#FF1493' },
                  { label: 'AI Reply Color', key: 'ai_bubble_other', def: '#1a2a3a' },
                ].map(item => (
                  <div key={item.key}>
                    <label className="text-gray-400 text-xs mb-1 block">{item.label}</label>
                    <div className="flex gap-2">
                      <input type="color" value={editSettings[item.key] || item.def} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, [item.key]: e.target.value })); }} className="w-10 h-10 rounded-lg cursor-pointer border border-cyan-500/30" />
                      <input value={editSettings[item.key] || item.def} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, [item.key]: e.target.value })); }} className="input-field flex-1 text-sm font-mono" />
                    </div>
                  </div>
                ))}
                <div className="rounded-xl p-3 space-y-2" style={{ background: `linear-gradient(135deg, ${editSettings.ai_color_from || '#0a030f'}, ${editSettings.ai_color_to || '#1a0a2a'})` }}>
                  <p className="text-gray-500 text-[10px] mb-2">AI Preview:</p>
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-cyan-500/30 flex items-center justify-center flex-shrink-0 text-sm">🤖</div>
                    <div className="max-w-[70%] px-3 py-2 rounded-2xl" style={{ background: editSettings.ai_bubble_other || '#1a2a3a', color: '#fff', fontSize: `${editSettings.ai_bubble_font_size || '14'}px`, fontFamily: editSettings.ai_bubble_font_family === 'dancing' ? 'Dancing Script,cursive' : editSettings.ai_bubble_font_family === 'mono' ? 'monospace' : 'inherit' }}>Habari! Naweza kukusaidia? 😊</div>
                  </div>
                  <div className="flex justify-end"><div className="max-w-[70%] px-3 py-2 rounded-2xl" style={{ background: `linear-gradient(135deg, ${editSettings.ai_bubble_my_from || '#7C3AED'}, ${editSettings.ai_bubble_my_to || '#FF1493'})`, color: '#fff', fontSize: `${editSettings.ai_bubble_font_size || '14'}px` }}>Asante sana! 🙏</div></div>
                </div>
                <div><label className="text-gray-400 text-xs mb-1 block">AI Font Size: {editSettings.ai_bubble_font_size || '14'}px</label><input type="range" min="10" max="22" value={parseInt(editSettings.ai_bubble_font_size || '14')} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, ai_bubble_font_size: e.target.value })); }} className="w-full" style={{ accentColor: '#06b6d4' }} /></div>
                <div><label className="text-gray-400 text-xs mb-1 block">AI Bubble Radius: {editSettings.ai_bubble_radius || '18'}px</label><input type="range" min="0" max="28" value={parseInt(editSettings.ai_bubble_radius || '18')} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, ai_bubble_radius: e.target.value })); }} className="w-full" style={{ accentColor: '#06b6d4' }} /></div>
                <div><label className="text-gray-400 text-xs mb-1 block">AI Font Style</label><select value={editSettings.ai_bubble_font_family || 'default'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, ai_bubble_font_family: e.target.value })); }} className="input-field"><option value="default">Default</option><option value="dancing">Dancing Script ✨</option><option value="pacifico">Pacifico 🌸</option><option value="mono">Monospace 💻</option><option value="serif">Serif 📖</option></select></div>
              </div>
            </div>

            {/* SexyRoom Bubble Settings - Separate */}
            <div className="content-box p-4 space-y-4">
              <p className="text-primary font-bold text-sm border-b border-primary/20 pb-2">💋 SexyRoom Bubble Settings (Huru)</p>
              <div className="space-y-3">
                {[
                  { label: 'SexyRoom Sent - From', key: 'room_bubble_sent_from', def: '#7B2FBE' },
                  { label: 'SexyRoom Sent - To', key: 'room_bubble_sent_to', def: '#5B1F9E' },
                  { label: 'SexyRoom Received - From', key: 'room_bubble_recv_from', def: '#1a0a2a' },
                  { label: 'SexyRoom Received - To', key: 'room_bubble_recv_to', def: '#2d1040' },
                ].map(item => (
                  <div key={item.key}>
                    <label className="text-gray-400 text-xs mb-1 block">{item.label}</label>
                    <div className="flex gap-2">
                      <input type="color" value={editSettings[item.key] || item.def} onChange={e => { markEditing(); const v = e.target.value; setEditSettings(p => ({ ...p, [item.key]: v })); }} className="w-10 h-10 rounded-lg cursor-pointer border border-primary/30" />
                      <input value={editSettings[item.key] || item.def} onChange={e => { markEditing(); const v = e.target.value; setEditSettings(p => ({ ...p, [item.key]: v })); }} className="input-field flex-1 text-sm font-mono" />
                    </div>
                  </div>
                ))}
                <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <p className="text-gray-500 text-[10px] mb-2">SexyRoom Preview:</p>
                  <div className="flex justify-end"><div className="max-w-[70%] px-3 py-2" style={{ borderRadius: `${editSettings.room_bubble_radius || '18'}px 18px 4px 18px`, background: `linear-gradient(135deg, ${editSettings.room_bubble_sent_from || '#7B2FBE'}, ${editSettings.room_bubble_sent_to || '#5B1F9E'})`, color: editSettings.room_bubble_text_color || '#fff', fontSize: `${editSettings.room_bubble_font_size || '14'}px` }}>Habari room! 💋</div></div>
                  <div className="flex justify-start"><div className="max-w-[70%] px-3 py-2" style={{ borderRadius: '18px 18px 18px 4px', background: `linear-gradient(135deg, ${editSettings.room_bubble_recv_from || '#1a0a2a'}, ${editSettings.room_bubble_recv_to || '#2d1040'})`, color: '#fff', fontSize: `${editSettings.room_bubble_font_size || '14'}px` }}>Nzuri! 😊</div></div>
                </div>
                <div><label className="text-gray-400 text-xs mb-1 block">SexyRoom Border Radius: {editSettings.room_bubble_radius || '18'}px</label><input type="range" min="0" max="28" value={parseInt(editSettings.room_bubble_radius || '18')} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, room_bubble_radius: e.target.value })); }} className="w-full" style={{ accentColor: '#FF1493' }} /></div>
                <div><label className="text-gray-400 text-xs mb-1 block">SexyRoom Font Size: {editSettings.room_bubble_font_size || '14'}px</label><input type="range" min="10" max="22" value={parseInt(editSettings.room_bubble_font_size || '14')} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, room_bubble_font_size: e.target.value })); }} className="w-full" style={{ accentColor: '#FF1493' }} /></div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">SexyRoom Rangi ya Maandishi</label>
                  <div className="flex gap-2"><input type="color" value={editSettings.room_bubble_text_color || '#ffffff'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, room_bubble_text_color: e.target.value })); }} className="w-10 h-10 rounded-lg cursor-pointer border border-primary/30" /><input value={editSettings.room_bubble_text_color || '#ffffff'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, room_bubble_text_color: e.target.value })); }} className="input-field flex-1 text-sm font-mono" /></div>
                </div>
                <div><label className="text-gray-400 text-xs mb-1 block">SexyRoom Font Style</label><select value={editSettings.room_bubble_font_family || 'default'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, room_bubble_font_family: e.target.value })); }} className="input-field"><option value="default">Default</option><option value="dancing">Dancing Script ✨</option><option value="pacifico">Pacifico 🌸</option><option value="mono">Monospace 💻</option><option value="serif">Serif 📖</option></select></div>
              </div>
            </div>

            {/* ── WEB / APP FONT SETTINGS ── */}
            <div className="content-box p-4 space-y-4">
              <p className="text-green-400 font-bold text-sm border-b border-green-400/20 pb-2">🌐 Mipangilio ya App (Global Font & Colors)</p>
              <div><label className="text-gray-400 text-xs font-semibold mb-1 block">Ukubwa wa Maandishi wa App: {editSettings.app_font_size || '16'}px</label><input type="range" min="12" max="22" value={parseInt(editSettings.app_font_size || '16')} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, app_font_size: e.target.value })); }} className="w-full" style={{ accentColor: '#22c55e' }} /></div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Rangi ya Maandishi ya App (Global Text Color)</label>
                <div className="flex gap-2"><input type="color" value={editSettings.app_text_color || '#ffffff'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, app_text_color: e.target.value })); }} className="w-10 h-10 rounded-lg cursor-pointer border border-green-500/30" /><input value={editSettings.app_text_color || '#ffffff'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, app_text_color: e.target.value })); }} className="input-field flex-1 text-sm font-mono" /></div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Rangi ya Primary (Accent - Buttons, Links)</label>
                <div className="flex gap-2"><input type="color" value={editSettings.primary_color || '#FF1493'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, primary_color: e.target.value })); }} className="w-10 h-10 rounded-lg cursor-pointer border border-green-500/30" /><input value={editSettings.primary_color || '#FF1493'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, primary_color: e.target.value })); }} className="input-field flex-1 text-sm font-mono" /></div>
              </div>
              <div><label className="text-gray-400 text-xs mb-1 block">Font Style ya App (Global)</label><select value={editSettings.app_font_family || 'default'} onChange={e => { markEditing(); setEditSettings(p => ({ ...p, app_font_family: e.target.value })); }} className="input-field"><option value="default">Default (System UI)</option><option value="dancing">Dancing Script ✨</option><option value="pacifico">Pacifico 🌸</option><option value="lobster">Lobster 🔥</option><option value="inter">Inter (Modern)</option><option value="poppins">Poppins (Clean)</option></select></div>
              <div className="rounded-xl p-4 border border-green-500/20" style={{ background: 'rgba(34,197,94,0.05)', fontFamily: editSettings.app_font_family === 'dancing' ? 'Dancing Script, cursive' : editSettings.app_font_family === 'pacifico' ? 'Pacifico, cursive' : editSettings.app_font_family === 'lobster' ? 'Lobster, cursive' : editSettings.app_font_family === 'inter' ? 'Inter, system-ui' : editSettings.app_font_family === 'poppins' ? 'Poppins, system-ui' : 'system-ui', fontSize: parseInt(editSettings.app_font_size || '16'), color: editSettings.app_text_color || '#fff' }}>
                <p className="font-bold mb-1">🔍 Preview (inabadilika mara moja)</p>
                <p style={{ opacity: 0.7, fontSize: parseInt(editSettings.app_font_size || '16') - 2 }}>Hii ni jinsi maandishi yataonekana kwenye app yako nzima.</p>
                <button className="mt-2 px-4 py-2 rounded-xl font-bold text-sm" style={{ background: editSettings.primary_color || '#FF1493', color: '#fff' }}>Kitufe cha Primary</button>
              </div>
            </div>

            {uploadingFile && <div className="mt-2"><DetailedProgress progress={uploadPct} fileName={uploadFileName} fileSize={uploadFileSize} uploadedBytes={uploadedBytes} /></div>}
            <button onClick={saveSettings} disabled={saving} className="btn-primary w-full text-base py-4 font-black">{saving ? '⏳ Inahifadhi...' : '💾 Hifadhi Mabadiliko Yote'}</button>
          </div>
        )}

        {/* ── GIFTS ── */}
        {tab === 'gifts' && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between"><h3 className="text-white font-bold flex items-center gap-2"><span className="text-xl">🎀</span> Zawadi (Gifts)</h3><button onClick={() => setEditGift({ emoji: '🎁', name: '', amount: 0, isNew: true })} className="btn-primary text-xs py-1.5 px-3">+ Ongeza</button></div>
            <div className="space-y-2">
              {giftOptions.map((g: any, idx: number) => (
                <div key={idx} className="content-box p-3 flex items-center gap-3">
                  <span className="text-3xl flex-shrink-0">{g.emoji}</span>
                  <div className="flex-1 min-w-0"><p className="text-white font-bold">{g.name}</p><p className="text-primary font-black text-sm">TZS {g.amount?.toLocaleString()}</p></div>
                  <div className="flex gap-1">
                    <button onClick={() => { if (idx > 0) { const o = [...giftOptions]; [o[idx], o[idx-1]] = [o[idx-1], o[idx]]; saveGiftOptions(o); } }} className="p-1.5 bg-[#1a0a1a] rounded-lg"><ArrowUp className="w-3 h-3 text-gray-400" /></button>
                    <button onClick={() => { if (idx < giftOptions.length-1) { const o = [...giftOptions]; [o[idx], o[idx+1]] = [o[idx+1], o[idx]]; saveGiftOptions(o); } }} className="p-1.5 bg-[#1a0a1a] rounded-lg"><ArrowDown className="w-3 h-3 text-gray-400" /></button>
                    <button onClick={() => setEditGift({ ...g, idx })} className="p-1.5 bg-[#1a0a1a] rounded-lg"><Edit3 className="w-3.5 h-3.5 text-primary" /></button>
                    <button onClick={() => { const o = giftOptions.filter((_, i) => i !== idx); saveGiftOptions(o); }} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                </div>
              ))}
            </div>
            {giftOptions.length === 0 && <button onClick={() => saveGiftOptions(DEFAULT_GIFTS)} className="btn-outline w-full text-sm">↩ Rudisha Zawadi za Default</button>}
          </div>
        )}

        {/* ── GIFT CARDS ── */}
        {tab === 'giftcards' && (
          <div className="mt-4 space-y-4">
            <h3 className="text-white font-bold flex items-center gap-2"><span className="text-xl">🎁</span> Tengeneza Gift Card</h3>
            <div className="content-box p-4 space-y-3">
              <div><label className="text-gray-400 text-xs mb-1 block">Aina ya Zawadi</label><select id="gc-type" className="input-field"><option value="balance">💰 Pesa (Balance)</option><option value="vip">👑 VIP Member</option><option value="unlock_video">🎬 Unlock Video</option><option value="unlock_malaya">💋 Unlock Malaya</option><option value="unlock_live">🔴 Unlock Live Room</option><option value="blue_tick">✓ Blue Tick</option><option value="download">⬇️ Download (VIP download)</option><option value="unlock_profile">🔓 Unlock Profile</option><option value="withdraw">💸 Toa Pesa (Withdraw)</option><option value="save_items">💾 Hifadhi Vitu kwenye Simu</option></select></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Blue Tick Type</label><select id="gc-bluetick" className="input-field"><option value="blue">🔵 Blue</option><option value="gold">🟡 Gold</option><option value="pink">🩷 Pink</option><option value="green">🟢 Green</option><option value="diamond">💎 Diamond</option><option value="rainbow">🌈 Rainbow</option></select></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Muda wa Blue Tick (siku)</label><input id="gc-bluetick-days" type="number" placeholder="30" defaultValue="30" className="input-field" /></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Kiasi (TZS)</label><input id="gc-amount" type="number" placeholder="5000" className="input-field" /></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Siku (kwa VIP)</label><input id="gc-days" type="number" placeholder="30" className="input-field" /></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Idadi (video/malaya/live/etc)</label><input id="gc-count" type="number" placeholder="3" className="input-field" /></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Max Uses</label><input id="gc-max-uses" type="number" placeholder="100" defaultValue="100" className="input-field" /></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Inaisha (hiari)</label><input id="gc-expires" type="datetime-local" className="input-field" /></div>
              <button onClick={async () => {
                const type = (document.getElementById('gc-type') as HTMLSelectElement)?.value || 'balance';
                const amount = parseFloat((document.getElementById('gc-amount') as HTMLInputElement)?.value || '0');
                const days = parseInt((document.getElementById('gc-days') as HTMLInputElement)?.value || '0');
                const expiresInput = (document.getElementById('gc-expires') as HTMLInputElement)?.value;
                const code = Math.random().toString(36).substring(2, 10).toUpperCase();
                const countInput = parseInt((document.getElementById('gc-count') as HTMLInputElement)?.value || '1');
                const maxUses = parseInt((document.getElementById('gc-max-uses') as HTMLInputElement)?.value || '1');
                const bluetickVal = (document.getElementById('gc-bluetick') as HTMLSelectElement)?.value || 'blue';
                const bluetickDays = parseInt((document.getElementById('gc-bluetick-days') as HTMLInputElement)?.value || '30');
                const ins: any = { code, type, amount: type === 'balance' ? amount : 0, duration_days: type === 'vip' ? days : 0, max_uses: maxUses, use_count: 0, is_active: true, is_used: false, created_by: user?.id, expires_at: expiresInput ? new Date(expiresInput).toISOString() : null };
                if (type === 'unlock_video') { ins.unlock_video_count = countInput; ins.unlock_count = countInput; }
                else if (type === 'unlock_malaya') { ins.unlock_malaya_count = countInput; ins.unlock_count = countInput; }
                else if (type === 'unlock_live') { ins.unlock_live_count = countInput; ins.unlock_count = countInput; }
                else if (type === 'blue_tick') { ins.blue_tick_type = bluetickVal; if (bluetickDays > 0) { const exp = new Date(); exp.setDate(exp.getDate() + bluetickDays); ins.expires_at = exp.toISOString(); } }
                else if (type === 'download') { ins.download_count = countInput; }
                else if (type === 'unlock_profile') { ins.unlock_profile_count = countInput; }
                else if (type === 'withdraw') { ins.withdraw_count = countInput; }
                else if (type === 'save_items') { ins.save_item_count = countInput; }
                const { error } = await supabase.from('gift_cards').insert(ins);
                if (error) { toast.error('Hitilafu: ' + error.message); return; }
                toast.success(`✅ Gift Card: ${code}`);
                alert(`🎁 Gift Card Code: ${code}\n\nMax matumizi: ${maxUses}`);
                fetchGiftCards();
              }} className="btn-primary w-full">🎁 Tengeneza Gift Card</button>
            </div>
            <h3 className="text-white font-bold">Gift Cards Zote</h3>
            <div className="space-y-2">
              {giftCards.map((gc: any) => (
                <div key={gc.id} className={`content-box p-3 ${gc.is_used ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-white font-mono font-bold text-lg">{gc.code}</p>
                      <p className="text-gray-400 text-xs">{gc.type === 'balance' ? `TZS ${gc.amount?.toLocaleString()}` : gc.type === 'vip' ? `VIP ${gc.duration_days} siku` : gc.type === 'blue_tick' ? `Blue Tick (${gc.blue_tick_type || 'blue'})` : gc.type === 'download' ? `Download ${gc.download_count}` : gc.type === 'unlock_profile' ? `Fungua Profile ${gc.unlock_profile_count}` : gc.type === 'withdraw' ? `Toa Pesa mara ${gc.withdraw_count}` : gc.type === 'save_items' ? `Hifadhi ${gc.save_item_count}` : `Fungua ${gc.unlock_count || 1}`}</p>
                      <p className="text-blue-400 text-xs font-semibold">Watu: {gc.use_count || 0}/{gc.max_uses || 1}</p>
                      {gc.expires_at && <p className="text-gray-500 text-[10px]">Inaisha: {new Date(gc.expires_at).toLocaleDateString()}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { navigator.clipboard.writeText(gc.code).then(() => toast.success('Code imenakiliwa!')).catch(() => {}); }} className="p-1.5 bg-blue-500/20 rounded-lg" title="Nakili code">
                        <span className="text-blue-400 text-xs font-bold">📋</span>
                      </button>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${(gc.use_count || 0) >= (gc.max_uses || 1) ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{(gc.use_count || 0) >= (gc.max_uses || 1) ? '✗ Imejaa' : '✓ Inapatikana'}</span>
                      {!gc.is_used && <button onClick={async () => { await supabase.from('gift_cards').update({ is_active: false, is_used: true }).eq('id', gc.id); toast.success('Imefutwa!'); fetchGiftCards(); }} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                    </div>
                  </div>
                </div>
              ))}
              {giftCards.length === 0 && <p className="text-gray-500 text-center py-4">Hakuna gift cards bado</p>}
            </div>
          </div>
        )}

        {/* ── SAVE CODES ── */}
        {tab === 'savecodes' && (
          <div className="mt-4 space-y-4">
            <h3 className="text-white font-bold flex items-center gap-2"><span className="text-xl">💾</span> Save Codes</h3>
            <div className="content-box p-4 space-y-3">
              <div><label className="text-gray-400 text-xs mb-1 block">Max vitu</label><input id="sc-max-items" type="number" placeholder="10" defaultValue="10" className="input-field" /></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Max matumizi</label><input id="sc-max-uses" type="number" placeholder="1" defaultValue="1" className="input-field" /></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Inaisha (hiari)</label><input id="sc-expires" type="datetime-local" className="input-field" /></div>
              <button onClick={async () => {
                const maxItems = parseInt((document.getElementById('sc-max-items') as HTMLInputElement)?.value || '10');
                const maxUses = parseInt((document.getElementById('sc-max-uses') as HTMLInputElement)?.value || '1');
                const expiresInput = (document.getElementById('sc-expires') as HTMLInputElement)?.value;
                const code = Math.random().toString(36).substring(2, 10).toUpperCase();
                const { error } = await supabase.from('save_codes').insert({ code, max_items: maxItems, max_uses: maxUses, use_count: 0, uses: [], is_active: true, created_by: user?.id, expires_at: expiresInput ? new Date(expiresInput).toISOString() : null });
                if (error) { toast.error('Hitilafu: ' + error.message); return; }
                toast.success(`✅ Save Code: ${code}`);
                fetchSaveCodes();
              }} className="btn-primary w-full">💾 Tengeneza Save Code</button>
            </div>
            <div className="space-y-2">
              {saveCodes.map((sc: any) => {
                const totalUsed = (sc.uses || []).reduce((s: number, u: any) => s + (u.items_used || 0), 0);
                return (
                  <div key={sc.id} className={`content-box p-3 ${!sc.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-mono font-bold text-base">{sc.code}</p>
                        <p className="text-gray-400 text-xs">Max vitu: {sc.max_items} | Watu: {sc.use_count || 0}/{sc.max_uses}</p>
                        <p className="text-primary text-xs">Vitu: {totalUsed}</p>
                        {sc.expires_at && <p className="text-gray-500 text-[10px]">Inaisha: {new Date(sc.expires_at).toLocaleDateString()}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => { navigator.clipboard.writeText(sc.code).then(() => toast.success('Code imenakiliwa!')).catch(() => {}); }} className="p-1.5 bg-blue-500/20 rounded-lg" title="Nakili code">
                          <span className="text-blue-400 text-xs font-bold">📋</span>
                        </button>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sc.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{sc.is_active ? '✓' : '✗'}</span>
                        <button onClick={async () => { await supabase.from('save_codes').update({ is_active: !sc.is_active }).eq('id', sc.id); fetchSaveCodes(); }} className={`p-1.5 rounded-lg text-xs font-bold ${sc.is_active ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{sc.is_active ? 'Zima' : 'Washa'}</button>
                        <button onClick={async () => { await supabase.from('save_codes').delete().eq('id', sc.id); fetchSaveCodes(); }} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {saveCodes.length === 0 && <p className="text-gray-500 text-center py-4">Hakuna save codes bado</p>}
            </div>
          </div>
        )}

        {/* ── HOME EDIT ── */}
        {tab === 'homeedit' && (
          <div className="mt-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">🏠 Hariri Kadi za Nyumbani</h3>
              <button onClick={() => { const newCard = { id: `custom_${Date.now()}`, title: 'Kadi Mpya', icon: '⭐', visible: true, order: homeCards.length, route: '/', isCustom: true }; setHomeCards([...homeCards, newCard]); }} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Ongeza</button>
            </div>
            <div className="space-y-2">
              {homeCards.sort((a, b) => a.order - b.order).map((card, idx) => (
                <div key={card.id} className={`content-box p-3 ${!card.visible ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl flex-shrink-0">{card.icon}</span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <input value={card.title} onChange={e => setHomeCards(homeCards.map(c => c.id === card.id ? { ...c, title: e.target.value } : c))} className="input-field py-1.5 text-sm w-full" placeholder="Jina la kadi" />
                      {card.isCustom && <input value={card.route || '/'} onChange={e => setHomeCards(homeCards.map(c => c.id === card.id ? { ...c, route: e.target.value } : c))} className="input-field py-1 text-xs w-full" placeholder="Route (mfano: /malaya)" />}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => { if (idx === 0) return; const sorted = [...homeCards].sort((a, b) => a.order - b.order); const [a, b] = [sorted[idx], sorted[idx - 1]]; setHomeCards(homeCards.map(c => c.id === a.id ? { ...c, order: b.order } : c.id === b.id ? { ...c, order: a.order } : c)); }} disabled={idx === 0} className="p-1.5 bg-[#1a0a1a] rounded-lg disabled:opacity-30"><ArrowUp className="w-3 h-3 text-gray-400" /></button>
                      <button onClick={() => { const sorted = [...homeCards].sort((a, b) => a.order - b.order); if (idx === sorted.length - 1) return; const [a, b] = [sorted[idx], sorted[idx + 1]]; setHomeCards(homeCards.map(c => c.id === a.id ? { ...c, order: b.order } : c.id === b.id ? { ...c, order: a.order } : c)); }} disabled={idx === homeCards.length - 1} className="p-1.5 bg-[#1a0a1a] rounded-lg disabled:opacity-30"><ArrowDown className="w-3 h-3 text-gray-400" /></button>
                      <button onClick={() => setHomeCards(homeCards.map(c => c.id === card.id ? { ...c, visible: !c.visible } : c))} className={`p-1.5 rounded-lg text-xs font-bold px-2 ${card.visible ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{card.visible ? 'ON' : 'OFF'}</button>
                      {card.isCustom && <button onClick={() => { if (!window.confirm('Futa kadi hii?')) return; setHomeCards(homeCards.filter(c => c.id !== card.id)); }} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => saveHomeCards(homeCards)} disabled={savingHomeCards} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">{savingHomeCards ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Inahifadhi...</> : '💾 Hifadhi Mpangilio wa Nyumbani'}</button>
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-bold">🔲 Kadi Ndogo za Chini</h3>
                <button onClick={() => { const newCard = { id: `small_custom_${Date.now()}`, title: 'Kadi Mpya', icon: '⭐', visible: true, order: smallCards.length, isCustom: true }; setSmallCards([...smallCards, newCard]); }} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Ongeza</button>
              </div>
              <div className="space-y-2">
                {smallCards.sort((a, b) => a.order - b.order).map((card, idx) => (
                  <div key={card.id} className={`content-box p-3 ${!card.visible ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl flex-shrink-0">{card.icon}</span>
                      <div className="flex-1 min-w-0 space-y-1">
                        <input value={card.title} onChange={e => setSmallCards(prev => prev.map(c => c.id === card.id ? { ...c, title: e.target.value } : c))} className="input-field py-1.5 text-sm w-full" placeholder="Jina la kadi" />
                        <input value={card.icon} onChange={e => setSmallCards(prev => prev.map(c => c.id === card.id ? { ...c, icon: e.target.value } : c))} className="input-field py-1 text-sm w-full" placeholder="Emoji/Icon" maxLength={4} />
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => { if (idx === 0) return; const sorted = [...smallCards].sort((a, b) => a.order - b.order); const [a, b] = [sorted[idx], sorted[idx - 1]]; setSmallCards(smallCards.map(c => c.id === a.id ? { ...c, order: b.order } : c.id === b.id ? { ...c, order: a.order } : c)); }} disabled={idx === 0} className="p-1.5 bg-[#1a0a1a] rounded-lg disabled:opacity-30"><ArrowUp className="w-3 h-3 text-gray-400" /></button>
                        <button onClick={() => { const sorted = [...smallCards].sort((a, b) => a.order - b.order); if (idx === sorted.length - 1) return; const [a, b] = [sorted[idx], sorted[idx + 1]]; setSmallCards(smallCards.map(c => c.id === a.id ? { ...c, order: b.order } : c.id === b.id ? { ...c, order: a.order } : c)); }} disabled={idx === smallCards.length - 1} className="p-1.5 bg-[#1a0a1a] rounded-lg disabled:opacity-30"><ArrowDown className="w-3 h-3 text-gray-400" /></button>
                        <button onClick={() => setSmallCards(prev => prev.map(c => c.id === card.id ? { ...c, visible: !c.visible } : c))} className={`p-1.5 rounded-lg text-xs font-bold px-2 ${card.visible ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{card.visible ? 'ON' : 'OFF'}</button>
                        {card.isCustom && <button onClick={() => setSmallCards(smallCards.filter(c => c.id !== card.id))} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => saveSmallCards(smallCards)} disabled={savingSmallCards} className="btn-primary w-full mt-3 flex items-center justify-center gap-2 disabled:opacity-50">{savingSmallCards ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Inahifadhi...</> : '💾 Hifadhi Kadi Ndogo'}</button>
            </div>
          </div>
        )}

        {/* ── ADMIN SERVICES 2 ── */}
        {tab === 'adminservices' && (
          <div className="mt-2 space-y-3">
            {renderBoxes('admin_services')}
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">💋 Huduma za Admin ({adminServices2.length})</h3>
              <button onClick={() => { setNewAdminService2Data({ name: '', description: '', price: '0', action_link: '', show_in_tiksexy: false, image_url: '', video_url: '' }); setShowAddAdminService2(true); }} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Ongeza</button>
            </div>
            <div className="space-y-2">
              {adminServices2.map((svc: any, idx: number) => (
                <div key={svc.id} className="content-box overflow-hidden">
                  {svc.video_url && <video src={svc.video_url} className="w-full" style={{ maxHeight: 160, objectFit: 'cover' }} muted controls preload="metadata" />}
                  {!svc.video_url && svc.image_url && <img src={svc.image_url} alt={svc.name} className="w-full" style={{ objectFit: 'cover', objectPosition: 'top', maxHeight: 160 }} />}
                  <div className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold truncate">{svc.name}</p>
                      {svc.description && <p className="text-gray-400 text-xs truncate">{svc.description}</p>}
                      <p className="text-primary font-black text-sm">TZS {svc.price?.toLocaleString()}</p>
                      <TiksexyToggle value={!!svc.show_in_tiksexy} onChange={async (v) => { await supabase.from('services').update({ show_in_tiksexy: v }).eq('id', svc.id); fetchAdminServices2(); toast.success(v ? '🎬 TikSexy: ON' : '❌ TikSexy: OFF'); }} />
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={async () => { if (idx > 0) { await supabase.from('services').update({ display_order: (adminServices2[idx-1].display_order||0)+1 }).eq('id', svc.id); await supabase.from('services').update({ display_order: (svc.display_order||0)-1 }).eq('id', adminServices2[idx-1].id); fetchAdminServices2(); } }} className="p-1.5 bg-[#1a0a1a] rounded-lg"><ArrowUp className="w-3 h-3 text-gray-400" /></button>
                      <button onClick={async () => { if (idx < adminServices2.length-1) { await supabase.from('services').update({ display_order: (adminServices2[idx+1].display_order||0)-1 }).eq('id', svc.id); await supabase.from('services').update({ display_order: (svc.display_order||0)+1 }).eq('id', adminServices2[idx+1].id); fetchAdminServices2(); } }} className="p-1.5 bg-[#1a0a1a] rounded-lg"><ArrowDown className="w-3 h-3 text-gray-400" /></button>
                      <button onClick={() => setEditAdminService2(svc)} className="p-1.5 bg-[#1a0a1a] rounded-lg"><Edit3 className="w-3.5 h-3.5 text-primary" /></button>
                      <button onClick={async () => { if (!window.confirm('Futa huduma hii?')) return; await supabase.from('services').delete().eq('id', svc.id); fetchAdminServices2(); toast.success('Imefutwa!'); }} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </div>
                </div>
              ))}
              {adminServices2.length === 0 && <div className="text-center py-8 text-gray-500"><p className="text-3xl mb-2">💋</p><p>Hakuna huduma za admin bado</p></div>}
            </div>
          </div>
        )}

        {tab === 'tikposts' && (
          <div className="mt-2 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">🎬 TikSexy Posts ({tikPosts.length})</h3>
              <button onClick={fetchTikPosts} className="text-primary text-xs font-semibold flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
              <button onClick={() => { setTikBulkMode(v => !v); setTikBulkSelected([]); }}
                className={`text-xs font-semibold px-2 py-1 rounded-lg ${tikBulkMode ? 'bg-primary/20 text-primary' : 'bg-[#1a0a1a] text-gray-400'}`}>
                {tikBulkMode ? '✓ Chagua Mengi' : '☑ Chagua'}
              </button>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <p className="text-blue-400 text-xs">Posts zote zilizopakiwa kwenye TikSexy zinaonyeshwa hapa. Admin anaweza kufuta, kuhariri, kubadilisha mpangilio, na kupin post.</p>
            </div>
            {tikPosts.length === 0 ? (
              <div className="text-center py-10 text-gray-500 bg-[#0d0d0d] rounded-2xl border border-white/5">
                <span className="text-4xl block mb-3">🎬</span>
                <p>Hakuna posts za TikSexy bado</p>
              </div>
            ) : (
            <>
              {/* Bulk action bar */}
              {tikBulkMode && tikBulkSelected.length > 0 && (
                <div className="flex gap-2 p-3 rounded-xl mb-2" style={{ background: 'rgba(255,20,147,0.1)', border: '1px solid rgba(255,20,147,0.3)' }}>
                  <span className="text-primary text-sm font-bold flex-1">{tikBulkSelected.length} zimechaguliwa</span>
                  <button onClick={async () => {
                    await Promise.all(tikBulkSelected.map(id => supabase.from('content_posts').update({ is_pinned: true, pinned_at: new Date().toISOString(), sort_order: 999999 }).eq('id', id)));
                    toast.success('📌 Posts zimepinniwa!'); setTikBulkSelected([]); fetchTikPosts();
                  }} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">📌 Pin</button>
                  <button onClick={async () => {
                    await Promise.all(tikBulkSelected.map(id => supabase.from('content_posts').update({ is_pinned: false, pinned_at: null, sort_order: 0 }).eq('id', id)));
                    toast.success('✅ Pin imeondolewa!'); setTikBulkSelected([]); fetchTikPosts();
                  }} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">Unpin</button>
                  <button onClick={async () => {
                    if (!window.confirm(`Futa posts ${tikBulkSelected.length}?`)) return;
                    await Promise.all(tikBulkSelected.map(id => supabase.from('content_posts').delete().eq('id', id)));
                    toast.success('Zimefutwa!'); setTikBulkSelected([]); fetchTikPosts();
                  }} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">🗑 Futa</button>
                </div>
              )}
              {tikPosts.map((post) => {
                const isPinned = !!(post as any).is_pinned;
                const mediaUrls = ((post as any).media_urls?.length > 0) ? (post as any).media_urls : (post.media_url ? [post.media_url] : []);
                const isVideo = post.media_url && /\.(mp4|webm|mov)/i.test(post.media_url);
                const isSelected = tikBulkSelected.includes(post.id);
                return (
                  <div key={post.id} className={`content-box p-3 ${isPinned ? 'border-yellow-500/50' : ''} ${isSelected ? 'border-primary/70 bg-primary/5' : ''}`}
                    onClick={tikBulkMode ? () => setTikBulkSelected(prev => prev.includes(post.id) ? prev.filter(x => x !== post.id) : [...prev, post.id]) : undefined}>
                    {isPinned && <div className="flex items-center gap-1 mb-2"><span className="text-yellow-400 text-[10px] font-black">📌 PINNED - Inakaa juu daima</span></div>}
                    <div className="flex gap-3">
                      {tikBulkMode && (
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 self-center ${isSelected ? 'bg-primary border-primary' : 'border-gray-600'}`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      )}
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#1a0a1a] flex-shrink-0">
                        {post.thumbnail_url ? <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" /> :
                          post.media_url ? (isVideo ? <video src={post.media_url} className="w-full h-full object-cover" muted /> : <img src={post.media_url} alt="" className="w-full h-full object-cover" />) :
                          <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm truncate">{post.title || 'Post'}</p>
                        <p className="text-gray-400 text-xs">{(post as any).uploader?.username || 'Unknown'} • {post.type}</p>
                        {mediaUrls.length > 1 && <p className="text-gray-500 text-xs">{mediaUrls.length} faili</p>}
                        {!post.is_free && <p className="text-primary text-xs font-bold">TZS {post.price?.toLocaleString()}</p>}
                      </div>
                      {!tikBulkMode && (
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button onClick={() => pinTikPost(post, !isPinned)}
                            className={`p-1.5 rounded-lg text-xs ${isPinned ? 'bg-yellow-500/20 text-yellow-400' : 'bg-[#1a0a1a] text-gray-500'}`}
                            title={isPinned ? 'Unpin' : 'Pin juu'}>
                            📌
                          </button>
                          <button onClick={() => setEditTikPost({ ...post })} className="p-1.5 bg-[#1a0a1a] rounded-lg"><Edit3 className="w-3.5 h-3.5 text-primary" /></button>
                          <button onClick={() => swapTikPost(tikPosts, post.id, 'up')} className="p-1.5 bg-[#1a0a1a] rounded-lg"><ArrowUp className="w-3 h-3 text-gray-400" /></button>
                          <button onClick={() => swapTikPost(tikPosts, post.id, 'down')} className="p-1.5 bg-[#1a0a1a] rounded-lg"><ArrowDown className="w-3 h-3 text-gray-400" /></button>
                          <button onClick={() => deleteTikPost(post.id)} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>)}
          </div>
        )}

        {/* ── SECURITY ── */}
        {tab === 'security' && (
          <div className="mt-4 space-y-4" onFocus={markEditing} onChange={markEditing}>
            <div className="content-box p-4 space-y-4">
              <p className="text-red-400 font-bold text-sm border-b border-red-400/20 pb-2">🛡️ Usalama wa Maudhui</p>
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-white font-bold text-sm">🔒 Zuia Screenshot & Screen Record</p>
                  <p className="text-gray-500 text-xs mt-0.5">Wazuia wasiwe picha/skrini za maudhui ya kulipwa</p>
                </div>
                <button onClick={() => { markEditing(); setEditSettings(p => ({ ...p, block_screenshots: p.block_screenshots === 'true' ? 'false' : 'true' })); }}
                  className={`w-14 h-7 rounded-full transition-colors flex items-center flex-shrink-0 ${editSettings.block_screenshots === 'true' ? 'bg-red-500' : 'bg-gray-600'}`}>
                  <div className={`w-6 h-6 bg-white rounded-full shadow transition-transform mx-0.5 ${editSettings.block_screenshots === 'true' ? 'translate-x-7' : ''}`} />
                </button>
              </div>
              {editSettings.block_screenshots === 'true' ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <p className="text-red-400 text-xs font-semibold">⚠️ IMEWASHWA: Watu hawataweza kufanya screenshot au screen recording kwenye app</p>
                  <p className="text-gray-500 text-xs mt-1">Kumbuka: Baadhi ya vifaa vya Android vinaweza kupita kizuizi hiki. iOS/Safari imezuiwa vizuri zaidi.</p>
                </div>
              ) : (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                  <p className="text-green-400 text-xs font-semibold">✅ IMEZIMWA: Screenshot na screen recording inaruhusiwa kwa sasa</p>
                </div>
              )}
            </div>
            <div className="content-box p-4 space-y-3">
              <p className="text-yellow-400 font-bold text-sm">📋 Maelezo ya Kizuizi</p>
              <div className="space-y-2 text-xs text-gray-400">
                <div className="flex items-start gap-2"><span>🔴</span><span>Inazuia right-click na context menu kwenye picha/video zote kwenye browser yote</span></div>
                <div className="flex items-start gap-2"><span>🔴</span><span>Inazuia long-press kwenye picha/video kwenye simu za Android na iOS</span></div>
                <div className="flex items-start gap-2"><span>🔴</span><span>Inazuia drag & drop ya picha/video</span></div>
                <div className="flex items-start gap-2"><span>🔴</span><span>Inazuia Print Screen / Ctrl+P / Ctrl+S shortcuts za keyboard</span></div>
                <div className="flex items-start gap-2"><span>🔴</span><span>Inaongeza CSS protection (-webkit-user-select: none kwenye media)</span></div>
                <div className="flex items-start gap-2"><span>🟡</span><span>Baadhi ya njia za kisasa za screen record zinaweza kupita (hardware-level)</span></div>
              </div>
            </div>
            <button onClick={saveSettings} disabled={saving} className="btn-primary w-full">{saving ? 'Inahifadhi...' : '💾 Hifadhi Mipangilio ya Usalama'}</button>
          </div>
        )}

        {tab === 'sounds' && (
          <div className="mt-4 space-y-4">
            <h3 className="text-white font-bold">🔊 Sauti za App</h3>
            {[{ key: 'sound_notification', label: '🔔 Notification', desc: 'Kila notification mpya' }, { key: 'sound_sexyroom', label: '💋 SexyRoom', desc: 'Ujumbe kwenye SexyRoom' }, { key: 'sound_messenger', label: '💬 Messenger', desc: 'Ujumbe kwenye Messenger' }, { key: 'sound_ai', label: '🤖 AI Support', desc: 'Jibu la AI' }, { key: 'sound_call', label: '📞 Ringtone ya Simu', desc: 'Simu inayoingia' }].map(item => (
              <div key={item.key} className="content-box p-4 space-y-3">
                <div><p className="text-gray-300 font-semibold text-sm">{item.label}</p><p className="text-gray-500 text-xs">{item.desc}</p></div>
                {settings[item.key] && <div className="flex items-center gap-2"><audio src={settings[item.key]} controls preload="auto" style={{ height: '36px', flex: 1, borderRadius: '8px' }} /><button onClick={() => { const a = new Audio(settings[item.key]); a.volume = 1.0; a.play().then(() => toast.success('Inalia!')).catch(() => toast.error('Hitilafu')); }} className="gradient-pink text-white text-xs px-3 py-1.5 rounded-xl font-semibold flex-shrink-0">▶ Test</button></div>}
                <label className="block btn-outline text-center cursor-pointer py-2 text-sm"><Upload className="w-4 h-4 inline mr-2" />Pakia Sauti (MP3/WAV/OGG)<input type="file" accept="audio/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) await uploadSound(item.key, f); }} /></label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Service Modal */}
      {showAddService && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">➕ Ongeza Huduma Mpya</h3><button onClick={() => setShowAddService(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="space-y-3">
              <input value={newServiceData.name} onChange={e => setNewServiceData(p => ({ ...p, name: e.target.value }))} placeholder="Jina la huduma *" className="input-field" autoFocus />
              <textarea value={newServiceData.description} onChange={e => setNewServiceData(p => ({ ...p, description: e.target.value }))} placeholder="Maelezo ya huduma" className="input-field min-h-[60px] resize-none" />
              <input type="number" value={newServiceData.price} onChange={e => setNewServiceData(p => ({ ...p, price: e.target.value }))} placeholder="Bei (TZS)" className="input-field" />
              <input value={newServiceData.action_link} onChange={e => setNewServiceData(p => ({ ...p, action_link: e.target.value }))} placeholder="Link ya kitufe (hiari)" className="input-field" />
              <label className="block btn-outline text-center cursor-pointer py-2 text-sm"><Upload className="w-3 h-3 inline mr-1" />{newServiceImage ? '✓ Picha imechaguliwa' : 'Pakia Picha (hiari)'}<input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setUploadingNewService(true); try { const url = await uploadWithProgress('content', `services/${Date.now()}.${f.name.split('.').pop()}`, f); setNewServiceImage(url); toast.success('Picha imepakiwa!'); } catch { toast.error('Hitilafu ya upload'); } finally { setUploadingNewService(false); setUploadingFile(false); } }} /></label>
              {newServiceImage && <img src={newServiceImage} alt="" className="w-full h-20 object-cover rounded-xl border border-primary/30" />}
              <label className="block btn-outline text-center cursor-pointer py-2 text-sm"><Upload className="w-3 h-3 inline mr-1" />{newServiceVideo ? '✓ Video imechaguliwa' : 'Pakia Video (hiari)'}<input type="file" accept="video/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setUploadingNewService(true); try { const url = await uploadWithProgress('content', `services/vid_${Date.now()}.${f.name.split('.').pop()}`, f); setNewServiceVideo(url); if (!newServiceImage) { const thumbBlob = await generateVideoThumbnail(f); if (thumbBlob) { const tf = new File([thumbBlob], 'thumb.jpg', { type: 'image/jpeg' }); const tu = await uploadFile('content', `services/thumb_${Date.now()}.jpg`, tf); setNewServiceImage(tu); } } toast.success('Video imepakiwa!'); } catch { toast.error('Hitilafu ya upload'); } finally { setUploadingNewService(false); setUploadingFile(false); } }} /></label>
              {newServiceVideo && <video src={newServiceVideo} className="w-full h-20 object-cover rounded-xl" muted />}
              {uploadingNewService && <DetailedProgress progress={uploadPct} fileName={uploadFileName} fileSize={uploadFileSize} uploadedBytes={uploadedBytes} />}
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl border border-primary/20">
                <div className="flex flex-col"><span className="text-white text-sm font-semibold">🎬 Onyesha kwenye TIK-SEXY?</span><span className="text-gray-500 text-xs">{newServiceShowTiksexy ? 'Itaonekana kwenye TikSexy feed' : 'Haitaonekana TikSexy'}</span></div>
                <button onClick={() => setNewServiceShowTiksexy(v => !v)} className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${newServiceShowTiksexy ? 'bg-primary' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${newServiceShowTiksexy ? 'translate-x-6' : ''}`} /></button>
              </div>
              <button onClick={async () => {
                if (!newServiceData.name.trim()) { toast.error('Weka jina la huduma'); return; }
                await supabase.from('services').insert({ name: newServiceData.name, description: newServiceData.description, price: parseFloat(newServiceData.price) || 0, action_link: newServiceData.action_link || null, image_url: newServiceImage || null, video_url: newServiceVideo || null, thumbnail_url: newServiceImage || null, type: 'admin_service', is_active: true, display_order: services.length + 1, show_in_tiksexy: newServiceShowTiksexy });
                setShowAddService(false); setNewServiceImage(''); setNewServiceVideo('');
                fetchAll(); toast.success('✅ Huduma imeongezwa!');
              }} disabled={uploadingNewService} className="btn-primary w-full">💾 Hifadhi Huduma</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {editMember && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">Hariri: {editMember.username}</h3><button onClick={() => setEditMember(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="space-y-3">
              <input value={editMember.username || ''} onChange={e => setEditMember(m => m ? { ...m, username: e.target.value } : null)} placeholder="Jina" className="input-field" />
              <input value={editMember.phone || ''} onChange={e => setEditMember(m => m ? { ...m, phone: e.target.value } : null)} placeholder="Namba ya simu" className="input-field" />
              <input type="number" value={editMember.balance || 0} onChange={e => setEditMember(m => m ? { ...m, balance: parseFloat(e.target.value) || 0 } : null)} placeholder="Salio (TZS)" className="input-field" />
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Badilisha Passcode ya Kufuli</label>
                <div className="flex gap-2">
                  <input type="text" placeholder="Passcode mpya (namba 4-6)" maxLength={6} inputMode="numeric" id={`passcode-input-${editMember.id}`} className="input-field flex-1 text-lg tracking-widest font-mono" />
                  <button onClick={async () => { const inp = document.getElementById(`passcode-input-${editMember.id}`) as HTMLInputElement; const val = (inp?.value || '').replace(/\D/g, ''); if (val.length < 4) { toast.error('Passcode lazima iwe namba 4 au zaidi'); return; } await supabase.from('user_profiles').update({ app_passcode: val }).eq('id', editMember.id); await supabase.from('app_settings').upsert({ key: `user_passcode_${editMember.id}`, value: val, updated_at: new Date().toISOString() }, { onConflict: 'key' }); toast.success(`✅ Passcode imewekwa: ${val}`); if (inp) inp.value = ''; }} className="btn-primary text-sm px-4 flex-shrink-0">Weka</button>
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">🔑 Badilisha Password ya Login</label>
                <div className="flex gap-2">
                  <input type="text" placeholder="Password mpya (herufi 6+)" id={`password-input-${editMember.id}`} className="input-field flex-1" />
                  <button onClick={async () => { const inp = document.getElementById(`password-input-${editMember.id}`) as HTMLInputElement; const val = inp?.value?.trim(); if (!val || val.length < 6) { toast.error('Password lazima iwe herufi 6 au zaidi'); return; } try { const { data, error } = await supabase.functions.invoke('admin-reset-password', { body: { userId: editMember.id, password: val } }); if (error) { toast.error('Hitilafu: ' + error.message); } else if (data?.success) { toast.success(`✅ Password imebadilishwa!`); if (inp) inp.value = ''; } else { toast.error(data?.error || 'Hitilafu'); } } catch (e: any) { toast.error('Hitilafu: ' + (e?.message || 'Imeshindwa')); } }} className="btn-primary text-sm px-3 flex-shrink-0">Badilisha</button>
                </div>
              </div>
              {[{ label: '👑 VIP Member', key: 'is_vip', color: 'bg-yellow-500' }, { label: '💼 Business Account', key: 'is_business', color: 'bg-blue-500' }, { label: '⚡ Admin', key: 'is_admin', color: 'bg-primary' }, { label: '🚫 Blocked', key: 'is_blocked', color: 'bg-red-500' }].map(item => (
                <div key={item.key} className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl">
                  <span className="text-gray-300 text-sm">{item.label}</span>
                  <button onClick={() => setEditMember(m => m ? { ...m, [item.key]: !(m as any)[item.key] } : null)} className={`w-12 h-6 rounded-full transition-colors flex items-center ${(editMember as any)[item.key] ? item.color : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${(editMember as any)[item.key] ? 'translate-x-6' : ''}`} /></button>
                </div>
              ))}
              <select value={editMember.blue_tick || ''} onChange={e => setEditMember(m => m ? { ...m, blue_tick: e.target.value || undefined } : null)} className="input-field">
                <option value="">Hakuna Blue Tick</option>
                {['blue','gold','pink','green','purple','red','orange','silver','diamond','rainbow','teal','crimson'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
              </select>
              <button onClick={updateMember} className="btn-primary w-full">💾 Hifadhi Mabadiliko</button>
            </div>
          </div>
        </div>
      )}

      {editVipPlan && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">Hariri Mpango</h3><button onClick={() => setEditVipPlan(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="space-y-3">
              <input value={editVipPlan.name} onChange={e => setEditVipPlan(p => p ? { ...p, name: e.target.value } : null)} placeholder="Jina la mpango" className="input-field" />
              <input type="number" value={editVipPlan.duration_days} onChange={e => setEditVipPlan(p => p ? { ...p, duration_days: parseInt(e.target.value) || 30 } : null)} placeholder="Siku ngapi" className="input-field" />
              <input type="number" value={editVipPlan.price} onChange={e => setEditVipPlan(p => p ? { ...p, price: parseFloat(e.target.value) || 0 } : null)} placeholder="Bei (TZS)" className="input-field" />
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl"><span className="text-gray-300 text-sm">Inaonyeshwa?</span><button onClick={() => setEditVipPlan(p => p ? { ...p, is_active: !p.is_active } : null)} className={`w-12 h-6 rounded-full ${editVipPlan.is_active ? 'bg-green-500' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editVipPlan.is_active ? 'translate-x-6' : ''}`} /></button></div>
              <button onClick={updateVipPlan} className="btn-primary w-full">💾 Hifadhi</button>
            </div>
          </div>
        </div>
      )}

      {editPost && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">Hariri Post</h3><button onClick={() => setEditPost(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="space-y-3">
              <input value={editPost.title || ''} onChange={e => setEditPost(p => p ? { ...p, title: e.target.value } : null)} placeholder="Kichwa" className="input-field" />
              {/* Region field for malaya posts */}
              {(tab === 'malaya' || (editPost as any).type === 'malaya') && (
                <select value={(editPost as any).region || ''} onChange={e => setEditPost(p => p ? { ...p, region: e.target.value } as any : null)} className="input-field">
                  <option value="">Chagua Mkoa</option>
                  {['Dar es Salaam','Mwanza','Arusha','Dodoma','Mbeya','Morogoro','Tanga','Kahama','Tabora','Kigoma','Sumbawanga','Kasulu','Musoma','Songea','Lindi','Mtwara','Iringa','Njombe','Singida','Shinyanga','Moshi','Zanzibar','Pemba','Simiyu','Geita','Katavi','Rukwa','Ruvuma','Pwani'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              <input value={editPost.location || ''} onChange={e => setEditPost(p => p ? { ...p, location: e.target.value } : null)} placeholder="Eneo/Mtaa" className="input-field" />
              <input value={editPost.phone || ''} onChange={e => setEditPost(p => p ? { ...p, phone: e.target.value } : null)} placeholder="Namba" className="input-field" />
              <input value={editPost.whatsapp || ''} onChange={e => setEditPost(p => p ? { ...p, whatsapp: e.target.value } : null)} placeholder="WhatsApp" className="input-field" />
              <input value={editPost.section || ''} onChange={e => setEditPost(p => p ? { ...p, section: e.target.value } : null)} placeholder="Section/Category" className="input-field" />
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl"><span className="text-gray-300 text-sm">Ni bure?</span><button onClick={() => setEditPost(p => p ? { ...p, is_free: !p.is_free } : null)} className={`w-12 h-6 rounded-full ${editPost.is_free ? 'bg-green-500' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editPost.is_free ? 'translate-x-6' : ''}`} /></button></div>
              {!editPost.is_free && <input type="number" value={editPost.price || 0} onChange={e => setEditPost(p => p ? { ...p, price: parseFloat(e.target.value) } : null)} placeholder="Bei" className="input-field" />}
              {/* Replace media - upload new image/video */}
              <div className="border border-primary/20 rounded-xl p-3 space-y-2">
                <p className="text-gray-400 text-xs font-semibold">🔄 Badilisha Picha/Video</p>
                <label className="block btn-outline text-center cursor-pointer py-2 text-xs">
                  <Upload className="w-3 h-3 inline mr-1" />Chagua Faili Jipya
                  <input type="file" accept="image/*,video/*" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f || !editPost) return;
                    try {
                      toast.info('Inapakia media mpya...');
                      const ext = f.name.split('.').pop() || 'jpg';
                      const path = `${editPost.type === 'video' ? 'video' : 'malaya'}/${user?.id || 'admin'}/${Date.now()}.${ext}`;
                      const url = await uploadWithProgress('content', path, f);
                      // If video, generate thumbnail
                      let thumbUrl = (editPost as any).thumbnail_url || '';
                      if (f.type.startsWith('video')) {
                        try {
                          const blob = await generateVideoThumbnail(f);
                          if (blob) {
                            const tf = new File([blob], `thumb_${Date.now()}.jpg`, { type: 'image/jpeg' });
                            thumbUrl = await uploadFile('content', `${editPost.type === 'video' ? 'video' : 'malaya'}/thumb/${user?.id || 'admin'}/${Date.now()}.jpg`, tf);
                          }
                        } catch {}
                      }
                      setEditPost(p => p ? { ...p, media_url: url, thumbnail_url: thumbUrl, media_urls: [url] } as any : null);
                      toast.success('✅ Media imebadilishwa! Bonyeza Hifadhi kumaliza.');
                    } catch { toast.error('Hitilafu ya upload'); setUploadingFile(false); }
                  }} />
                </label>
                {editPost.media_url && (
                  <div className="text-xs text-green-400 flex items-center gap-1">
                    <span>✓</span><span className="truncate">{editPost.media_url.split('/').pop()?.split('?')[0]?.slice(0, 30)}</span>
                  </div>
                )}
                {uploadingFile && <DetailedProgress progress={uploadPct} fileName={uploadFileName} fileSize={uploadFileSize} uploadedBytes={uploadedBytes} />}
              </div>
              <button onClick={async () => {
                if (!editPost) return;
                await supabase.from('content_posts').update({
                  title: editPost.title, location: editPost.location,
                  phone: editPost.phone, whatsapp: editPost.whatsapp,
                  region: (editPost as any).region,
                  section: editPost.section, price: editPost.price,
                  is_free: editPost.is_free, media_url: editPost.media_url,
                  thumbnail_url: editPost.thumbnail_url,
                  media_urls: (editPost as any).media_urls,
                }).eq('id', editPost.id);
                toast.success('Imebadilishwa!'); setEditPost(null);
                if (tab === 'malaya') fetchMalaya(); else if (tab === 'video') fetchVideo();
              }} className="btn-primary w-full">💾 Hifadhi Mabadiliko</button>
            </div>
          </div>
        </div>
      )}

      {editLive && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">Hariri Live Option</h3><button onClick={() => setEditLive(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="space-y-3">
              <input value={editLive.name} onChange={e => setEditLive(p => p ? { ...p, name: e.target.value } : null)} placeholder="Jina" className="input-field" />
              <input type="number" value={editLive.price} onChange={e => setEditLive(p => p ? { ...p, price: parseFloat(e.target.value) } : null)} placeholder="Bei" className="input-field" />
              <input value={editLive.whatsapp || ''} onChange={e => setEditLive(p => p ? { ...p, whatsapp: e.target.value } : null)} placeholder="WhatsApp" className="input-field" />
              <input value={editLive.link || ''} onChange={e => setEditLive(p => p ? { ...p, link: e.target.value } : null)} placeholder="Link" className="input-field" />
              {/* Replace cover image */}
              <div className="border border-primary/20 rounded-xl p-3 space-y-2">
                <p className="text-gray-400 text-xs font-semibold">🔄 Badilisha Picha ya Cover</p>
                <label className="block btn-outline text-center cursor-pointer py-2 text-xs">
                  Chagua Picha Mpya
                  <input type="file" accept="image/*" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f || !editLive) return;
                    try {
                      const ext = f.name.split('.').pop() || 'jpg';
                      const url = await uploadWithProgress('content', `live/${Date.now()}_cover.${ext}`, f);
                      setEditLive(p => p ? { ...p, cover_url: url } as any : null);
                      toast.success('✅ Picha imebadilishwa!');
                    } catch { toast.error('Hitilafu ya upload'); }
                    finally { setUploadingFile(false); }
                  }} />
                </label>
                {(editLive as any).cover_url && <img src={(editLive as any).cover_url} alt="" className="w-full h-16 object-cover rounded-xl border border-primary/30" />}
                {uploadingFile && <DetailedProgress progress={uploadPct} fileName={uploadFileName} fileSize={uploadFileSize} uploadedBytes={uploadedBytes} />}
              </div>
              <div className="flex items-center justify-between p-2 bg-[#1a0a1a] rounded-xl"><span className="text-gray-300 text-sm">Inaonyeshwa?</span><button onClick={() => setEditLive(p => p ? { ...p, is_active: !p.is_active } : null)} className={`w-12 h-6 rounded-full ${editLive.is_active ? 'bg-green-500' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editLive.is_active ? 'translate-x-6' : ''}`} /></button></div>
              <button onClick={async () => {
                if (!editLive) return;
                await supabase.from('live_options').update({
                  name: editLive.name, price: editLive.price,
                  whatsapp: editLive.whatsapp, link: editLive.link,
                  is_active: editLive.is_active,
                  cover_url: (editLive as any).cover_url || null,
                }).eq('id', editLive.id);
                toast.success('Imebadilishwa!'); setEditLive(null); fetchLive();
              }} className="btn-primary w-full">💾 Hifadhi</button>
            </div>
          </div>
        </div>
      )}

      {editGift && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">{editGift.isNew ? 'Ongeza Zawadi' : 'Hariri Zawadi'}</h3><button onClick={() => setEditGift(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="space-y-3">
              <div><label className="text-gray-400 text-xs mb-1 block">Icon/Emoji</label><input value={editGift.emoji} onChange={e => setEditGift((p: any) => ({ ...p, emoji: e.target.value }))} placeholder="🎁" className="input-field text-2xl" maxLength={4} /></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Jina</label><input value={editGift.name} onChange={e => setEditGift((p: any) => ({ ...p, name: e.target.value }))} placeholder="Waridi" className="input-field" /></div>
              <div><label className="text-gray-400 text-xs mb-1 block">Bei (TZS)</label><input type="number" value={editGift.amount} onChange={e => setEditGift((p: any) => ({ ...p, amount: parseInt(e.target.value) || 0 }))} placeholder="100" className="input-field" /></div>
              <div className="bg-[#1a0a1a] rounded-xl p-3 text-center"><span className="text-4xl">{editGift.emoji}</span><p className="text-white font-bold mt-1">{editGift.name || 'Jina'}</p><p className="text-primary font-black">TZS {Number(editGift.amount).toLocaleString()}</p></div>
              <button onClick={() => { if (!editGift.emoji || !editGift.name || !editGift.amount) { toast.error('Jaza kila kitu'); return; } let newOpts; if (editGift.isNew) { newOpts = [...giftOptions, { emoji: editGift.emoji, name: editGift.name, amount: editGift.amount }]; } else { newOpts = giftOptions.map((g: any, i: number) => i === editGift.idx ? { emoji: editGift.emoji, name: editGift.name, amount: editGift.amount } : g); } saveGiftOptions(newOpts); setEditGift(null); }} className="btn-primary w-full">💾 Hifadhi Zawadi</button>
            </div>
          </div>
        </div>
      )}

      {showAddAdminService2 && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">➕ Ongeza Huduma ya Admin</h3><button onClick={() => setShowAddAdminService2(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="space-y-3">
              <input value={newAdminService2Data.name} onChange={e => setNewAdminService2Data(p => ({ ...p, name: e.target.value }))} placeholder="Jina la huduma *" className="input-field" autoFocus />
              <textarea value={newAdminService2Data.description} onChange={e => setNewAdminService2Data(p => ({ ...p, description: e.target.value }))} placeholder="Maelezo" className="input-field min-h-[60px] resize-none" />
              <input type="number" value={newAdminService2Data.price} onChange={e => setNewAdminService2Data(p => ({ ...p, price: e.target.value }))} placeholder="Bei (TZS)" className="input-field" />
              <input value={newAdminService2Data.action_link} onChange={e => setNewAdminService2Data(p => ({ ...p, action_link: e.target.value }))} placeholder="Link ya kitufe (hiari)" className="input-field" />
              <label className="block btn-outline text-center cursor-pointer py-2 text-sm"><Upload className="w-3 h-3 inline mr-1" />Pakia Picha<input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const url = await uploadWithProgress('content', `services/${Date.now()}.${f.name.split('.').pop()}`, f); setNewAdminService2Data(p => ({ ...p, image_url: url })); } catch { toast.error('Hitilafu ya upload'); } finally { setUploadingFile(false); } }} /></label>
              {newAdminService2Data.image_url && <img src={newAdminService2Data.image_url} alt="" className="w-full h-20 object-cover rounded-xl border border-primary/30" />}
              <label className="block btn-outline text-center cursor-pointer py-2 text-sm"><Upload className="w-3 h-3 inline mr-1" />Pakia Video<input type="file" accept="video/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const url = await uploadWithProgress('content', `services/vid_${Date.now()}.${f.name.split('.').pop()}`, f); setNewAdminService2Data(p => ({ ...p, video_url: url })); } catch { toast.error('Hitilafu ya upload'); } finally { setUploadingFile(false); } }} /></label>
              {newAdminService2Data.video_url && <video src={newAdminService2Data.video_url} className="w-full h-20 object-cover rounded-xl" muted />}
              {uploadingFile && <DetailedProgress progress={uploadPct} fileName={uploadFileName} fileSize={uploadFileSize} uploadedBytes={uploadedBytes} />}
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl border border-primary/20">
                <span className="text-white text-sm font-semibold">🎬 Onyesha kwenye TIK-SEXY?</span>
                <button onClick={() => setNewAdminService2Data(p => ({ ...p, show_in_tiksexy: !p.show_in_tiksexy }))} className={`w-12 h-6 rounded-full transition-colors ${newAdminService2Data.show_in_tiksexy ? 'bg-primary' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${newAdminService2Data.show_in_tiksexy ? 'translate-x-6' : ''}`} /></button>
              </div>
              <button onClick={async () => {
                if (!newAdminService2Data.name.trim()) { toast.error('Weka jina'); return; }
                await supabase.from('services').insert({ name: newAdminService2Data.name, description: newAdminService2Data.description, price: parseFloat(newAdminService2Data.price) || 0, action_link: newAdminService2Data.action_link || null, image_url: newAdminService2Data.image_url || null, video_url: newAdminService2Data.video_url || null, type: 'admin_service', is_active: true, display_order: adminServices2.length + 1, show_in_tiksexy: newAdminService2Data.show_in_tiksexy });
                setShowAddAdminService2(false); fetchAdminServices2(); fetchAll(); toast.success('✅ Huduma imeongezwa!');
              }} className="btn-primary w-full">💾 Hifadhi Huduma</button>
            </div>
          </div>
        </div>
      )}

      {editAdminService2 && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">Hariri Huduma</h3><button onClick={() => setEditAdminService2(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="space-y-3">
              <input value={editAdminService2.name} onChange={e => setEditAdminService2((p: any) => ({ ...p, name: e.target.value }))} placeholder="Jina" className="input-field" />
              <textarea value={editAdminService2.description || ''} onChange={e => setEditAdminService2((p: any) => ({ ...p, description: e.target.value }))} placeholder="Maelezo" className="input-field min-h-[60px] resize-none" />
              <input type="number" value={editAdminService2.price} onChange={e => setEditAdminService2((p: any) => ({ ...p, price: parseFloat(e.target.value) }))} placeholder="Bei" className="input-field" />
              <input value={editAdminService2.action_link || ''} onChange={e => setEditAdminService2((p: any) => ({ ...p, action_link: e.target.value }))} placeholder="Link ya kitufe" className="input-field" />
              <label className="block btn-outline text-center cursor-pointer py-2 text-sm"><Upload className="w-3 h-3 inline mr-1" />Badilisha Picha<input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const url = await uploadWithProgress('content', `services/${Date.now()}.${f.name.split('.').pop()}`, f); setEditAdminService2((p: any) => ({ ...p, image_url: url })); setUploadingFile(false); }} /></label>
              {editAdminService2.image_url && <img src={editAdminService2.image_url} alt="" className="w-full h-16 object-cover rounded-xl border border-primary/30" />}
              {uploadingFile && <DetailedProgress progress={uploadPct} fileName={uploadFileName} fileSize={uploadFileSize} uploadedBytes={uploadedBytes} />}
              <div className="flex items-center justify-between p-2 bg-[#1a0a1a] rounded-xl"><span className="text-gray-300 text-sm">Inaonyeshwa?</span><button onClick={() => setEditAdminService2((p: any) => ({ ...p, is_active: !p.is_active }))} className={`w-12 h-6 rounded-full ${editAdminService2.is_active ? 'bg-green-500' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editAdminService2.is_active ? 'translate-x-6' : ''}`} /></button></div>
              <div className="flex items-center justify-between p-2 bg-[#1a0a1a] rounded-xl"><span className="text-gray-300 text-sm">🎬 TikSexy?</span><button onClick={() => setEditAdminService2((p: any) => ({ ...p, show_in_tiksexy: !p.show_in_tiksexy }))} className={`w-12 h-6 rounded-full ${editAdminService2.show_in_tiksexy ? 'bg-primary' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editAdminService2.show_in_tiksexy ? 'translate-x-6' : ''}`} /></button></div>
              <button onClick={async () => { await supabase.from('services').update({ name: editAdminService2.name, description: editAdminService2.description, price: editAdminService2.price, action_link: editAdminService2.action_link, image_url: editAdminService2.image_url, video_url: editAdminService2.video_url, is_active: editAdminService2.is_active, show_in_tiksexy: editAdminService2.show_in_tiksexy }).eq('id', editAdminService2.id); setEditAdminService2(null); fetchAdminServices2(); fetchAll(); toast.success('Imebadilishwa!'); }} className="btn-primary w-full">💾 Hifadhi</button>
            </div>
          </div>
        </div>
      )}

      {editTikPost && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">Hariri TikSexy Post</h3><button onClick={() => setEditTikPost(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="space-y-3">
              <input value={editTikPost.title || ''} onChange={e => setEditTikPost(p => p ? { ...p, title: e.target.value } : null)} placeholder="Kichwa" className="input-field" />
              <textarea value={editTikPost.description || ''} onChange={e => setEditTikPost(p => p ? { ...p, description: e.target.value } : null)} placeholder="Maelezo" className="input-field min-h-[60px] resize-none" />
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl">
                <span className="text-gray-300 text-sm">Ni bure?</span>
                <button onClick={() => setEditTikPost(p => p ? { ...p, is_free: !p.is_free } : null)} className={`w-12 h-6 rounded-full ${editTikPost.is_free ? 'bg-green-500' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editTikPost.is_free ? 'translate-x-6' : ''}`} /></button>
              </div>
              {!editTikPost.is_free && <input type="number" value={editTikPost.price || 0} onChange={e => setEditTikPost(p => p ? { ...p, price: parseFloat(e.target.value) } : null)} placeholder="Bei" className="input-field" />}
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl">
                <span className="text-gray-300 text-sm">📌 Pin juu daima?</span>
                <button onClick={() => setEditTikPost(p => p ? { ...p, is_pinned: !(p as any).is_pinned } : null)} className={`w-12 h-6 rounded-full ${(editTikPost as any).is_pinned ? 'bg-yellow-500' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${(editTikPost as any).is_pinned ? 'translate-x-6' : ''}`} /></button>
              </div>
              <button onClick={async () => {
                if (!editTikPost) return;
                await supabase.from('content_posts').update({
                  title: editTikPost.title, description: editTikPost.description,
                  price: editTikPost.price, is_free: editTikPost.is_free,
                  is_pinned: !!(editTikPost as any).is_pinned,
                  pinned_at: (editTikPost as any).is_pinned ? new Date().toISOString() : null,
                  sort_order: (editTikPost as any).is_pinned ? 999999 : (editTikPost.sort_order || 0),
                }).eq('id', editTikPost.id);
                toast.success('Imebadilishwa!'); setEditTikPost(null); fetchTikPosts();
              }} className="btn-primary w-full">💾 Hifadhi</button>
            </div>
          </div>
        </div>
      )}

      {editService && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold">Hariri Huduma</h3><button onClick={() => setEditService(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="space-y-3">
              <input value={editService.name} onChange={e => setEditService(p => p ? { ...p, name: e.target.value } : null)} placeholder="Jina" className="input-field" />
              <textarea value={editService.description || ''} onChange={e => setEditService(p => p ? { ...p, description: e.target.value } : null)} placeholder="Maelezo" className="input-field min-h-[60px] resize-none" />
              <input type="number" value={editService.price} onChange={e => setEditService(p => p ? { ...p, price: parseFloat(e.target.value) } : null)} placeholder="Bei" className="input-field" />
              <input value={(editService as any).action_link || ''} onChange={e => setEditService(p => p ? { ...p, action_link: e.target.value } as any : null)} placeholder="Link ya kitufe" className="input-field" />
              <label className="block btn-outline text-center cursor-pointer py-2 text-sm"><Upload className="w-3 h-3 inline mr-1" />Pakia Picha<input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const url = await uploadWithProgress('content', `services/${Date.now()}.${f.name.split('.').pop()}`, f); setEditService(p => p ? { ...p, image_url: url } as any : null); setUploadingFile(false); }} /></label>
              {(editService as any).image_url && <img src={(editService as any).image_url} alt="" className="w-full h-16 object-cover rounded-xl border border-primary/30" />}
              {uploadingFile && <DetailedProgress progress={uploadPct} fileName={uploadFileName} fileSize={uploadFileSize} uploadedBytes={uploadedBytes} />}
              <div className="flex items-center justify-between p-2 bg-[#1a0a1a] rounded-xl"><span className="text-gray-300 text-sm">Inaonyeshwa?</span><button onClick={() => setEditService(p => p ? { ...p, is_active: !p.is_active } : null)} className={`w-12 h-6 rounded-full ${editService.is_active ? 'bg-green-500' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editService.is_active ? 'translate-x-6' : ''}`} /></button></div>
              <button onClick={updateService} className="btn-primary w-full">💾 Hifadhi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
