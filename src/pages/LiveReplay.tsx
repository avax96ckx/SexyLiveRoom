import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, MessageCircle, Gift, Crown, Share2, Play, TrendingUp, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';
import BlueTick from '@/components/features/BlueTick';
import { toast } from 'sonner';
import { triggerDownload } from '@/pages/Downloads';

// ─── Engagement chart data builder ───────────────────────────────────────────
function buildEngagementData(
  startedAt: string,
  endedAt: string,
  comments: any[],
  gifts: any[],
  peakViewers: number
) {
  if (!startedAt || !endedAt) return [];
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  const durationMs = endMs - startMs;
  const BUCKETS = 10;
  const bucketMs = durationMs / BUCKETS;

  return Array.from({ length: BUCKETS }, (_, i) => {
    const bucketStart = startMs + i * bucketMs;
    const bucketEnd = bucketStart + bucketMs;
    const label = formatBucketLabel(bucketStart - startMs, bucketEnd - startMs);

    const commentsInBucket = comments.filter(c => {
      const ts = new Date(c.created_at).getTime();
      return ts >= bucketStart && ts < bucketEnd;
    }).length;

    const giftsInBucket = gifts.filter(g => {
      const ts = new Date(g.created_at).getTime();
      return ts >= bucketStart && ts < bucketEnd;
    }).length;

    const activityFactor = (commentsInBucket + giftsInBucket * 3);
    const viewerEstimate = Math.max(
      Math.round((peakViewers || 0) * (0.3 + (i / BUCKETS) * 0.7 * Math.random() * 0.5 + activityFactor * 0.02)),
      commentsInBucket + giftsInBucket
    );

    return { label, comments: commentsInBucket, gifts: giftsInBucket, viewers: Math.min(viewerEstimate, peakViewers || 100) };
  });
}

function formatBucketLabel(startMs: number, endMs: number): string {
  const midMs = (startMs + endMs) / 2;
  const totalSecs = Math.floor(midMs / 1000);
  const m = Math.floor(totalSecs / 60);
  return `${m}m`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs border"
      style={{ background: 'rgba(10,3,15,0.95)', border: '1px solid rgba(255,20,147,0.3)' }}>
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-bold">
          {p.name === 'comments' ? '💬' : p.name === 'gifts' ? '🎁' : '👁'} {p.value}
        </p>
      ))}
    </div>
  );
}

export default function LiveReplay() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session, setSession] = useState<any>(null);
  const [hostProfile, setHostProfile] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [giftHistory, setGiftHistory] = useState<any[]>([]);
  const [topGifters, setTopGifters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'chart' | 'comments' | 'gifters'>('info');
  const [commentFilter, setCommentFilter] = useState('');
  const [chartMetric, setChartMetric] = useState<'comments' | 'gifts' | 'viewers'>('comments');
  const [showVipModal, setShowVipModal] = useState(false);
  const [vipPlans, setVipPlans] = useState<any[]>([]);
  const [payingVip, setPayingVip] = useState<string | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    loadReplay();
  }, [id]);

  async function loadReplay() {
    const { data: sess } = await supabase.from('live_sessions').select('*').eq('id', id!).single();
    if (!sess) { navigate(-1); return; }
    setSession(sess);

    const { data: host } = await supabase.from('user_profiles').select('*').eq('id', sess.host_id).single();
    setHostProfile(host);

    if (user) {
      const { data: up } = await supabase.from('user_profiles').select('is_vip,is_admin,balance').eq('id', user.id).single();
      setUserProfile(up);
    }

    const [{ data: cmts }, { data: gifts }] = await Promise.all([
      supabase.from('live_comments')
        .select('*, user:user_id(username,avatar_url,blue_tick,is_vip,is_admin)')
        .eq('session_id', id!).eq('is_deleted', false)
        .order('created_at', { ascending: true }).limit(500),
      supabase.from('live_gift_history')
        .select('sender_id,coin_value,gift_emoji,gift_type,created_at,sender:sender_id(username,avatar_url)')
        .eq('session_id', id!),
    ]);
    setComments(cmts || []);
    setGiftHistory(gifts || []);

    if (gifts) {
      const map = new Map<string, any>();
      gifts.forEach((g: any) => {
        const ex = map.get(g.sender_id) || { ...(g.sender || {}), total: 0, gifts: [] };
        map.set(g.sender_id, { ...ex, total: ex.total + (g.coin_value || 0), gifts: [...ex.gifts, { emoji: g.gift_emoji, coins: g.coin_value }] });
      });
      setTopGifters(Array.from(map.values()).sort((a, b) => b.total - a.total));
    }
    setLoading(false);
  }

  async function loadVipPlans() {
    const { data } = await supabase.from('vip_plans').select('*').eq('is_active', true).order('price');
    setVipPlans(data || []);
  }

  async function handleDownload() {
    if (!user) { navigate('/login'); return; }
    const isVip = userProfile?.is_vip;
    const isAdmin = userProfile?.is_admin;
    if (!isVip && !isAdmin) {
      await loadVipPlans();
      setShowVipModal(true);
      return;
    }
    const { data: replaySetting } = await supabase.from('app_settings').select('value').eq('key', `replay_${id}`).maybeSingle();
    const replayUrl = replaySetting?.value;
    if (!replayUrl) {
      toast.info('Replay video bado haijaandaliwa. Subiri mwenyeji atakapofunga live.');
      return;
    }
    // Use showSaveFilePicker if available (modern browsers) to save directly to device file manager
    try {
      if ('showSaveFilePicker' in window) {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: `replay_${session.title || id || 'live'}.mp4`,
          types: [{ description: 'Video', accept: { 'video/mp4': ['.mp4'], 'video/webm': ['.webm'] } }],
        });
        toast.info('Inahifadhi video... Subiri kidogo');
        const resp = await fetch(replayUrl);
        const blob = await resp.blob();
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        toast.success('✅ Replay imehifadhiwa kwenye simu yako!');
      } else {
        // Fallback: open in new tab so user can long-press save
        const a = document.createElement('a');
        a.href = replayUrl;
        a.download = `replay_${session.title || id || 'live'}.mp4`;
        a.target = '_blank';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        toast.success('⬇️ Video inasave...');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        // Final fallback
        const a = document.createElement('a');
        a.href = replayUrl; a.download = `replay_${session.title || id || 'live'}.mp4`; a.target = '_blank';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        toast.success('⬇️ Video inafunguliwa...');
      }
    }
  }

  async function purchaseVip(plan: any) {
    if (!user || !userProfile) return;
    setPayingVip(plan.id);
    try {
      const bal = userProfile.balance || 0;
      if (bal < plan.price) {
        toast.error('Salio halitooshi! Weka pesa kwanza.');
        setPayingVip(null);
        return;
      }
      await supabase.from('user_profiles').update({ balance: bal - plan.price }).eq('id', user.id);
      await supabase.from('transactions').insert({ user_id: user.id, amount: plan.price, type: 'vip', status: 'pending', plan_name: plan.name, description: `VIP ${plan.name} - ${plan.duration_days} siku` });
      await supabase.from('notifications').insert({ user_id: null, title: '👑 Ombi Jipya la VIP', message: `Ombi la VIP ${plan.name} - TZS ${plan.price.toLocaleString()}`, type: 'payment_request' });
      toast.success('✅ Ombi la VIP limetumwa! Admin atakagua na kukuwezesha hivi karibuni.');
      setShowVipModal(false);
    } catch { toast.error('Hitilafu ya malipo. Jaribu tena.'); }
    finally { setPayingVip(null); }
  }

  function formatDuration(startedAt: string, endedAt: string) {
    const secs = Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatCoins(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }

  function timeSince(ts: string) {
    const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
    if (d === 0) return 'Leo';
    if (d === 1) return 'Jana';
    if (d < 7) return `Siku ${d} zilizopita`;
    if (d < 30) return `Wiki ${Math.floor(d / 7)} zilizopita`;
    return `Mwezi ${Math.floor(d / 30)} uliopita`;
  }

  const filteredComments = commentFilter
    ? comments.filter(c =>
        c.content.toLowerCase().includes(commentFilter.toLowerCase()) ||
        c.user?.username?.toLowerCase().includes(commentFilter.toLowerCase())
      )
    : comments;

  const medals = ['🥇', '🥈', '🥉'];
  const totalGiftsCoins = topGifters.reduce((s, g) => s + g.total, 0);

  const engagementData = session?.ended_at
    ? buildEngagementData(session.started_at, session.ended_at, comments, giftHistory, session.peak_viewers || 0)
    : [];

  const metricColors = { comments: '#FF1493', gifts: '#FFD700', viewers: '#00BFFF' };
  const metricLabels = { comments: 'Maoni', gifts: 'Zawadi', viewers: 'Watazamaji' };

  if (loading) return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!session) return null;

  const duration = session.ended_at ? formatDuration(session.started_at, session.ended_at) : 'N/A';

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden" style={{ fontFamily: 'system-ui' }}>

      {/* Cover */}
      <div className="relative flex-shrink-0" style={{ height: '35vh' }}>
        {session.cover_url ? (
          <img src={session.cover_url} alt="" className="w-full h-full object-cover" />
        ) : hostProfile?.avatar_url ? (
          <img src={hostProfile.avatar_url} alt="" className="w-full h-full object-cover"
            style={{ filter: 'blur(8px)', transform: 'scale(1.1)' }} />
        ) : (
          <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #1a0a2a, #3d0b3d)' }} />
        )}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 30%, rgba(0,0,0,0.85) 100%)' }} />

        <button onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-md">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        <button onClick={() => {
          const url = window.location.href;
          if (navigator.share) navigator.share({ title: session.title || 'Live Replay', url });
          else { navigator.clipboard.writeText(url); toast.success('Link imenakiliwa!'); }
        }} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-md">
          <Share2 className="w-4 h-4 text-white" />
        </button>

        {/* Download replay button — VIP/Admin only */}
        {session.replay_available && (
          <button onClick={handleDownload}
            className="absolute top-4 right-16 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-md mr-2"
            title={userProfile?.is_vip || userProfile?.is_admin ? 'Download Replay' : 'VIP tu'}>
            <Download className="w-4 h-4 text-white" />
          </button>
        )}

        <div className="absolute top-4 right-28 flex items-center gap-1.5 bg-gray-700/80 px-3 py-1.5 rounded-full backdrop-blur-md">
          <Play className="w-3 h-3 text-gray-300 fill-gray-300" />
          <span className="text-white text-xs font-bold">REPLAY</span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center gap-3">
          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white flex-shrink-0">
            {hostProfile?.avatar_url
              ? <img src={hostProfile.avatar_url} className="w-full h-full object-cover" alt="" />
              : <div className="w-full h-full gradient-pink flex items-center justify-center text-white font-bold text-xl">
                  {hostProfile?.username?.[0]?.toUpperCase()}
                </div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-white font-black text-xl">{hostProfile?.username}</p>
              {hostProfile?.blue_tick && <BlueTick tickId={hostProfile.blue_tick} size={16} />}
            </div>
            <p className="text-gray-300 text-sm line-clamp-1">{session.title || 'Live Session'}</p>
            <p className="text-gray-500 text-xs mt-0.5">{timeSince(session.started_at)}</p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex-shrink-0 grid grid-cols-5 bg-[#0d0d0d] border-b border-white/8">
        {[
          { icon: '👁', label: 'Peak', value: formatCoins(session.peak_viewers || 0) },
          { icon: '❤️', label: 'Likes', value: formatCoins(session.like_count || 0) },
          { icon: '💬', label: 'Maoni', value: formatCoins(session.comment_count || 0) },
          { icon: '🎁', label: 'Coins', value: formatCoins(totalGiftsCoins) },
          { icon: '⏱️', label: 'Muda', value: duration },
        ].map(stat => (
          <div key={stat.label} className="flex flex-col items-center py-2.5 border-r border-white/5 last:border-0">
            <span className="text-base mb-0.5">{stat.icon}</span>
            <p className="text-white font-black text-sm">{stat.value}</p>
            <p className="text-gray-500 text-[9px]">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-white/10 bg-[#0a0a0a]">
        {(['info', 'chart', 'comments', 'gifters'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-xs font-bold transition-colors relative ${activeTab === tab ? 'text-white' : 'text-gray-500'}`}>
            {tab === 'info' ? '📋 Info'
              : tab === 'chart' ? '📊 Mwelekeo'
              : tab === 'comments' ? `💬 (${comments.length})`
              : `🏆 (${topGifters.length})`}
            {activeTab === tab && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-[#050505]">

        {activeTab === 'info' && (
          <div className="p-4 space-y-3">
            <div className="bg-[#1a0a1a] rounded-2xl p-4 border border-white/5">
              <p className="text-gray-500 text-xs mb-1">Kichwa</p>
              <p className="text-white font-bold text-lg">{session.title || 'Live Session'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Watazamaji Wengi', value: formatCoins(session.peak_viewers || 0), emoji: '👥' },
                { label: 'Muda wa Live', value: duration, emoji: '⏱️' },
                { label: 'Likes Zote', value: formatCoins(session.like_count || 0), emoji: '❤️' },
                { label: 'Maoni Yote', value: formatCoins(session.comment_count || 0), emoji: '💬' },
                { label: 'Total Coins', value: formatCoins(totalGiftsCoins), emoji: '🪙' },
                { label: 'Watoa Zawadi', value: String(topGifters.length), emoji: '🎁' },
                { label: 'Category', value: session.category || 'general', emoji: '📂' },
                { label: 'Lugha', value: session.language || 'sw', emoji: '🌐' },
              ].map(item => (
                <div key={item.label} className="bg-[#1a0a1a] rounded-xl p-3 border border-white/5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span>{item.emoji}</span>
                    <span className="text-gray-500 text-xs">{item.label}</span>
                  </div>
                  <p className="text-white font-black text-lg">{item.value}</p>
                </div>
              ))}
            </div>
            {session.tags && session.tags.length > 0 && (
              <div className="bg-[#1a0a1a] rounded-2xl p-4 border border-white/5">
                <p className="text-gray-500 text-xs mb-2">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {session.tags.map((tag: string) => (
                    <span key={tag} className="bg-primary/20 text-primary text-xs font-bold px-2.5 py-1 rounded-full">#{tag}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-gradient-to-br from-primary/10 to-purple-500/10 rounded-2xl p-4 border border-primary/20">
              <p className="text-white font-bold mb-3 flex items-center gap-2">
                <Crown className="w-4 h-4 text-yellow-400" /> Muhtasari
              </p>
              <div className="space-y-2">
                {topGifters[0] && (
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🥇</span>
                    <span className="text-gray-400 text-xs flex-1">Mtoaji Mkuu:</span>
                    <span className="text-white font-bold text-sm">@{topGifters[0].username}</span>
                    <span className="text-yellow-400 font-black text-xs">{formatCoins(topGifters[0].total)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-lg">💬</span>
                  <span className="text-gray-400 text-xs flex-1">Maoni:</span>
                  <span className="text-white font-bold">{comments.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎁</span>
                  <span className="text-gray-400 text-xs flex-1">Jumla Zawadi:</span>
                  <span className="text-yellow-400 font-bold">{formatCoins(totalGiftsCoins)} coins</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'chart' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <p className="text-white font-bold">Mwelekeo wa Live</p>
            </div>
            <div className="flex gap-2">
              {(['comments', 'gifts', 'viewers'] as const).map(m => (
                <button key={m} onClick={() => setChartMetric(m)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                    chartMetric === m ? 'text-white border-transparent' : 'border-white/10 text-gray-500'
                  }`}
                  style={chartMetric === m ? { background: metricColors[m] + '33', borderColor: metricColors[m] + '66', color: metricColors[m] } : {}}>
                  {m === 'comments' ? '💬 Maoni' : m === 'gifts' ? '🎁 Zawadi' : '👁 Viewers'}
                </button>
              ))}
            </div>
            {engagementData.length > 0 ? (
              <div className="bg-[#1a0a1a] rounded-2xl p-4 border border-white/5">
                <p className="text-gray-500 text-xs mb-4">
                  {metricLabels[chartMetric]} wakati wa live · kila sehemu ≈ {Math.floor((session.ended_at ? (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) : 0) / 10 / 60000)}m
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={engagementData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={metricColors[chartMetric]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={metricColors[chartMetric]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey={chartMetric} stroke={metricColors[chartMetric]} strokeWidth={2.5}
                      fill="url(#areaGrad)"
                      dot={{ fill: metricColors[chartMetric], r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bg-[#1a0a1a] rounded-2xl p-8 border border-white/5 text-center">
                <TrendingUp className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Hakuna data ya kutosha kwa chart</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Peak Maoni/min', value: engagementData.length ? Math.max(...engagementData.map(d => d.comments)) : 0, emoji: '💬', color: metricColors.comments },
                { label: 'Peak Zawadi/min', value: engagementData.length ? Math.max(...engagementData.map(d => d.gifts)) : 0, emoji: '🎁', color: metricColors.gifts },
                { label: 'Peak Viewers', value: session.peak_viewers || 0, emoji: '👁', color: metricColors.viewers },
              ].map(stat => (
                <div key={stat.label} className="bg-[#1a0a1a] rounded-xl p-3 border border-white/5 text-center">
                  <span className="text-lg">{stat.emoji}</span>
                  <p className="font-black text-lg mt-1" style={{ color: stat.color }}>{formatCoins(stat.value)}</p>
                  <p className="text-gray-600 text-[9px]">{stat.label}</p>
                </div>
              ))}
            </div>
            {engagementData.length > 0 && (
              <div className="bg-[#1a0a1a] rounded-2xl p-4 border border-white/5">
                <p className="text-gray-500 text-xs mb-4">Kulinganisha vipimo vyote</p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={engagementData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="comments" stroke={metricColors.comments} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="gifts" stroke={metricColors.gifts} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="viewers" stroke={metricColors.viewers} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2">
                  {[
                    { color: metricColors.comments, label: 'Maoni' },
                    { color: metricColors.gifts, label: 'Zawadi' },
                    { color: metricColors.viewers, label: 'Viewers' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-1">
                      <div className="w-3 h-0.5 rounded-full" style={{ background: item.color }} />
                      <span className="text-gray-500 text-[9px]">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'comments' && (
          <div>
            <div className="px-4 pt-3 pb-2 sticky top-0 bg-[#050505] z-10">
              <input value={commentFilter} onChange={e => setCommentFilter(e.target.value)}
                placeholder="Tafuta maoni..."
                className="w-full bg-white/8 border border-white/10 rounded-full px-4 py-2 text-white text-sm outline-none placeholder:text-gray-600" />
            </div>
            {filteredComments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <MessageCircle className="w-12 h-12 mb-3 opacity-20" />
                <p className="font-semibold">Hakuna maoni</p>
              </div>
            ) : (
              <div className="px-4 pb-6 space-y-2">
                {filteredComments.map(c => (
                  <div key={c.id} className="flex items-start gap-2.5 py-1">
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-primary/20 mt-0.5">
                      {c.user?.avatar_url
                        ? <img src={c.user.avatar_url} className="w-full h-full object-cover" alt="" />
                        : <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold gradient-pink">
                            {c.user?.username?.[0]?.toUpperCase() || '?'}
                          </div>}
                    </div>
                    <div className="flex-1 bg-[#1a0a1a] rounded-2xl px-3 py-2.5 border border-white/5">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className={`text-xs font-black ${c.is_moderator_msg ? 'text-yellow-400' : 'text-primary'}`}>
                          {c.user?.is_admin ? '👑 ' : ''}{c.user?.username || 'Mtu'}
                        </span>
                        {c.user?.blue_tick && <BlueTick tickId={c.user.blue_tick} size={10} />}
                        {c.user?.is_vip && <span className="text-[8px] bg-yellow-500/20 text-yellow-400 px-1 rounded-full font-bold">VIP</span>}
                        <span className="text-gray-600 text-[9px] ml-auto">
                          {new Date(c.created_at).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-white text-sm leading-snug">{c.content}</p>
                    </div>
                  </div>
                ))}
                <div ref={commentsEndRef} className="h-4" />
              </div>
            )}
          </div>
        )}

        {activeTab === 'gifters' && (
          <div className="px-4 pt-3 pb-6 space-y-2">
            {topGifters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <Gift className="w-12 h-12 mb-3 opacity-20" />
                <p className="font-semibold">Hakuna zawadi zilizotumwa</p>
              </div>
            ) : (
              <>
                <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-2xl p-3 border border-yellow-500/20 flex items-center gap-3 mb-3">
                  <span className="text-3xl">🏆</span>
                  <div>
                    <p className="text-gray-400 text-xs">Jumla ya Zawadi</p>
                    <p className="text-yellow-400 font-black text-xl">{formatCoins(totalGiftsCoins)} coins</p>
                  </div>
                </div>
                {topGifters.map((g, i) => (
                  <div key={i} className="flex items-center gap-3 bg-[#1a0a1a] rounded-2xl px-4 py-3 border border-white/5">
                    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                      {medals[i] ? <span className="text-xl">{medals[i]}</span>
                        : <span className="text-gray-500 font-bold text-sm">#{i + 1}</span>}
                    </div>
                    <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-primary/20">
                      {g.avatar_url
                        ? <img src={g.avatar_url} className="w-full h-full object-cover" alt="" />
                        : <div className="w-full h-full gradient-pink flex items-center justify-center text-white font-bold">
                            {g.username?.[0]?.toUpperCase()}
                          </div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm truncate">@{g.username}</p>
                      <div className="flex gap-1 flex-wrap mt-0.5">
                        {(g.gifts || []).slice(0, 5).map((gft: any, j: number) => (
                          <span key={j} className="text-xs">{gft.emoji}</span>
                        ))}
                        {g.gifts?.length > 5 && <span className="text-gray-600 text-[10px]">+{g.gifts.length - 5}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-yellow-400 font-black text-base">{formatCoins(g.total)}</p>
                      <p className="text-gray-600 text-[9px]">coins</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* VIP Modal — shown when non-VIP/non-admin tries to download */}
      {showVipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.93)' }} onClick={() => setShowVipModal(false)}>
          <div className="w-full max-w-sm rounded-3xl border border-yellow-500/30 overflow-hidden" style={{ background: 'rgba(10,3,15,0.98)', maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="p-5 text-center border-b border-yellow-500/20" style={{ background: 'linear-gradient(135deg,rgba(234,179,8,0.15),rgba(245,158,11,0.1))' }}>
              <div className="w-16 h-16 rounded-full bg-yellow-500/20 border-2 border-yellow-500/40 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">👑</span>
              </div>
              <p className="text-white font-black text-xl">VIP Inahitajika</p>
              <p className="text-gray-400 text-sm mt-1">Download ya replay inahitaji VIP membership. Jiunge na VIP kupata uwezo huu na faida nyingi zaidi!</p>
            </div>
            <div className="p-4 space-y-2">
              {vipPlans.length === 0 ? (
                <div className="flex justify-center py-6"><div className="w-7 h-7 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : vipPlans.map(plan => (
                <button key={plan.id} onClick={() => purchaseVip(plan)} disabled={!!payingVip}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border border-yellow-500/30 active:scale-95 transition-transform disabled:opacity-60"
                  style={{ background: 'rgba(234,179,8,0.08)' }}>
                  <div className="w-12 h-12 rounded-2xl bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                    {payingVip === plan.id
                      ? <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                      : <span className="text-xl">👑</span>}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-white font-black">{plan.name}</p>
                    <p className="text-yellow-400/70 text-xs">{plan.duration_days} siku · Download, Rekodi & Zaidi</p>
                  </div>
                  <p className="text-yellow-400 font-black text-base flex-shrink-0">TZS {Number(plan.price).toLocaleString()}</p>
                </button>
              ))}
            </div>
            <div className="px-4 pb-5">
              <button onClick={() => setShowVipModal(false)} className="w-full py-3 rounded-2xl border border-white/15 text-gray-400 text-sm">Funga</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
