import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { UserProfile, Message } from '@/types';
import BlueTick from '@/components/features/BlueTick';
import { Search, ArrowLeft, Edit } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { PlanPickerModal } from '@/pages/Services';
import { useApp } from '@/contexts/AppContext';
import { toast } from 'sonner';

interface ChatThread {
  user: UserProfile;
  lastMessage?: Message;
  unreadCount: number;
  isOnline?: boolean;
  lastSeen?: string | null;
}

export default function Chat() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t, language } = useApp();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'chats' | 'members'>('chats');
  const [loading, setLoading] = useState(true);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [planMsg, setPlanMsg] = useState('');
  const [planSettings, setPlanSettings] = useState<any>({});
  const [threadOptions, setThreadOptions] = useState<{ userId: string; user: UserProfile } | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchThreads();
    fetchMembers();
    // Load settings for plan picker
    supabase.from('app_settings').select('*').then(({ data }) => {
      const m: any = {}; data?.forEach((r: any) => { m[r.key] = r.value; }); setPlanSettings(m);
    });
    const interval = setInterval(fetchThreads, 4000);
    // Update my online status every 6s
    const updateOnline = () => supabase.from('user_profiles').update({ is_online: !document.hidden, last_seen: new Date().toISOString() }).eq('id', user.id);
    updateOnline();
    const onlineInterval = setInterval(updateOnline, 8000);
    const handleVisibility = () => { supabase.from('user_profiles').update({ is_online: !document.hidden, last_seen: new Date().toISOString() }).eq('id', user.id); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      clearInterval(onlineInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      supabase.from('user_profiles').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', user.id);
    };
  }, [user]);

  async function fetchThreads() {
    if (!user) return;
    const { data: msgs } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id,username,avatar_url,blue_tick,is_vip,is_admin,is_business,last_seen,is_online), receiver:receiver_id(id,username,avatar_url,blue_tick,is_vip,is_admin,is_business,last_seen,is_online)')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (!msgs) return;

    const threadMap = new Map<string, ChatThread>();
    msgs.forEach(msg => {
      const other = msg.sender_id === user.id ? msg.receiver : msg.sender;
      if (!other || !other.id) return;
      if (!threadMap.has(other.id)) {
        const diff = other.last_seen ? Date.now() - new Date(other.last_seen).getTime() : 999999;
        const isOnline = !!other.is_online && diff < 30000;
        threadMap.set(other.id, { user: other as UserProfile, lastMessage: msg as Message, unreadCount: 0, isOnline, lastSeen: isOnline ? null : other.last_seen });
      }
      if (msg.receiver_id === user.id && !msg.read) {
        const t = threadMap.get(other.id)!;
        t.unreadCount++;
      }
    });

    setThreads(Array.from(threadMap.values()));
    setLoading(false);
  }

  async function fetchMembers() {
    // Show ALL members to everyone - restriction is only on opening chat
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .neq('id', user?.id || '')
      .eq('account_status', 'active')
      .order('is_admin', { ascending: false })
      .order('is_business', { ascending: false })
      .limit(200);
    setMembers((data || []) as UserProfile[]);
  }

  const filteredThreads = threads.filter(t =>
    t.user.username?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredMembers = members.filter(m =>
    m.username?.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenChat = (userId: string, targetUser?: UserProfile) => {
    // Non-VIP can freely chat with admin and business - only block regular member chats
    const isPrivileged = profile?.is_vip || profile?.is_business || profile?.is_admin;
    if (!isPrivileged && targetUser && !targetUser.is_admin && !targetUser.is_business) {
      setPlanMsg('Kutuma ujumbe kwa member wa kawaida unahitaji VIP au Business Account');
      setShowPlanPicker(true);
      return;
    }
    navigate(`/chat/${userId}`);
  };

  async function deleteChat(otherUserId: string) {
    if (!user || !window.confirm('Futa mazungumzo yote?')) return;
    await supabase.from('messages').update({ deleted_by_sender: true }).eq('sender_id', user.id).eq('receiver_id', otherUserId);
    await supabase.from('messages').update({ deleted_by_receiver: true }).eq('sender_id', otherUserId).eq('receiver_id', user.id);
    fetchThreads();
    toast.success('Mazungumzo yamefutwa!');
  }

  async function blockUserFromList(otherUserId: string) {
    if (!user) return;
    await supabase.from('user_blocks').upsert({ blocker_id: user.id, blocked_id: otherUserId }, { onConflict: 'blocker_id,blocked_id' });
    toast.success('Mtumiaji amezuiwa!');
  }

  async function reportUserFromList(otherUserId: string, username: string) {
    if (!user) return;
    const { data: adminProf } = await supabase.from('user_profiles').select('id').eq('is_admin', true).limit(1).single();
    if (adminProf) {
      await supabase.from('messages').insert({ sender_id: user.id, receiver_id: adminProf.id, content: `[RIPOTI] Mtumiaji: ${username} (ID: ${otherUserId}) - tafadhali niambie zaidi kuhusu tatizo.` });
      navigate(`/chat/${adminProf.id}`);
      toast.info('Uko kwenye inbox ya Admin. Andika tatizo lako.');
    }
  }

  return (
    <div className="full-screen-page">
      {/* Header */}
      <div className="top-bar px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-white font-bold text-xl flex-1">{t('chat_title')}</h1>
        <button onClick={() => navigate('/sexyroom')} className="text-gray-400">
          <Edit className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder={t('search') + ' member...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-10 py-2"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-2 mb-2">
        {(['chats', 'members'] as const).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`flex-1 py-2 rounded-xl font-semibold text-sm transition-all ${
              tab === tabKey ? 'gradient-pink text-white' : 'text-gray-400 bg-[#1a0a1a]'
            }`}
          >
            {tabKey === 'chats' ? (language === 'en' ? 'Chats' : 'Mazungumzo') : t('members')}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'chats' ? (
          filteredThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
              <p>{t('chat_no_msgs')}</p>
              <p className="text-sm">{t('chat_start')}</p>
            </div>
          ) : (
            filteredThreads.map(thread => (
              <button
                key={thread.user.id}
                onClick={() => handleOpenChat(thread.user.id, thread.user)}
                onContextMenu={e => { e.preventDefault(); setThreadOptions({ userId: thread.user.id, user: thread.user }); }}
                onMouseDown={e => { if (e.button === 2) return; }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-[#1a0a1a] relative"
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-primary/30">
                    {thread.user.avatar_url ? (
                      <img src={thread.user.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full gradient-pink flex items-center justify-center">
                        <span className="text-white font-bold">{thread.user.username?.[0]?.toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                  {thread.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {thread.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1">
                    <span className={`font-semibold ${thread.unreadCount > 0 ? 'text-white' : 'text-gray-200'}`}>{thread.user.username}</span>
                    {thread.user.blue_tick && <BlueTick tickId={thread.user.blue_tick} size={14} />}
                    {thread.user.is_vip && <span className="vip-badge text-[8px]">VIP</span>}
                  </div>
                  <p className={`text-sm truncate ${thread.unreadCount > 0 ? 'text-white font-semibold' : 'text-gray-400'}`}>
                    {thread.lastMessage?.content
                      ? (thread.lastMessage.sender_id === thread.user.id ? '' : 'Wewe: ') + thread.lastMessage.content
                      : thread.lastMessage?.media_type === 'image' ? '📷 Picha'
                      : thread.lastMessage?.media_type === 'video' ? '🎬 Video'
                      : thread.lastMessage?.media_type === 'audio' ? '🎤 Sauti'
                      : 'Bonyeza kuanza mazungumzo'}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  {/* Online status indicator */}
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${thread.isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span className={`text-[10px] ${thread.isOnline ? 'text-green-400 font-bold' : 'text-gray-500'}`}>
                      {thread.isOnline ? 'Online' : (() => {
                        if (!thread.lastSeen) return '';
                        const diff = Date.now() - new Date(thread.lastSeen).getTime();
                        const mins = Math.floor(diff / 60000);
                        const hours = Math.floor(diff / 3600000);
                        if (mins < 1) return 'sasa hivi';
                        if (mins < 60) return `${mins}m`;
                        if (hours < 24) return `${hours}h`;
                        return `${Math.floor(hours / 24)}d`;
                      })()}
                    </span>
                  </div>
                  {thread.lastMessage && (
                    <p className="text-gray-500 text-xs">
                      {formatDistanceToNow(new Date(thread.lastMessage.created_at), { addSuffix: false }).replace('about ', '').replace('less than a minute', 'sasa hivi')}
                    </p>
                  )}
                  {thread.unreadCount > 0 && (
                    <span className="bg-primary text-white text-[10px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                      {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
                    </span>
                  )}
                </div>
              </button>
            ))
          )
        ) : (
          filteredMembers.map(member => (
            <button
              key={member.id}
              onClick={() => handleOpenChat(member.id, member)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-[#1a0a1a]"
            >
              <div className="w-12 h-12 rounded-full overflow-hidden border border-primary/30">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full gradient-pink flex items-center justify-center">
                    <span className="text-white font-bold">{member.username?.[0]?.toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-1">
                  <span className="text-white font-semibold">{member.username}</span>
                  {member.blue_tick && <BlueTick tickId={member.blue_tick} size={14} />}
                  {member.is_vip && <span className="vip-badge text-[9px]">VIP</span>}
                </div>
                <p className="text-gray-500 text-xs">{member.is_business ? 'Business Account' : 'Member'}</p>
              </div>
              <div className="text-primary text-sm">{t('send')}</div>
            </button>
          ))
        )}
      </div>

      {/* Thread long-press options */}
      {threadOptions && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" onClick={() => setThreadOptions(null)}>
          <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-5 slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#1a0a1a]">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-primary/30">
                {threadOptions.user.avatar_url ? <img src={threadOptions.user.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-bold">{threadOptions.user.username?.[0]?.toUpperCase()}</span></div>}
              </div>
              <div><p className="text-white font-bold">{threadOptions.user.username}</p><p className="text-gray-500 text-xs">{threadOptions.user.is_admin ? 'Admin' : threadOptions.user.is_business ? 'Business' : 'Member'}</p></div>
            </div>
            <div className="space-y-1">
              <button onClick={() => { navigate(`/profile/${threadOptions.userId}`); setThreadOptions(null); }} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-white"><span className="text-lg">👤</span> Angalia Profaili</button>
              <button onClick={() => { navigate(`/chat/${threadOptions.userId}`); setThreadOptions(null); }} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-white"><span className="text-lg">💬</span> Fungua Mazungumzo</button>
              <button onClick={() => { deleteChat(threadOptions.userId); setThreadOptions(null); }} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-red-400"><span className="text-lg">🗑️</span> Futa Mazungumzo</button>
              <button onClick={() => { blockUserFromList(threadOptions.userId); setThreadOptions(null); }} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-orange-400"><span className="text-lg">🚫</span> Zuia (Block)</button>
              <button onClick={() => { reportUserFromList(threadOptions.userId, threadOptions.user.username || ''); setThreadOptions(null); }} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-yellow-400"><span className="text-lg">⚠️</span> Ripoti</button>
            </div>
          </div>
        </div>
      )}

      {showPlanPicker && (
        <PlanPickerModal
          onClose={() => setShowPlanPicker(false)}
          settings={planSettings}
          message={planMsg}
          onSuccess={() => setShowPlanPicker(false)}
        />
      )}
    </div>
  );
}
