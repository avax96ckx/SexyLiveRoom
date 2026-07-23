import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Search, Radio, Eye, X, Clock, Swords, Download } from 'lucide-react';
import BlueTick from '@/components/features/BlueTick';
import { toast } from 'sonner';
import { triggerDownload } from '@/pages/Downloads';

interface LiveDiscoverProps {
  /** When true, renders inline (no fixed overlay) and no back button arrow */
  inline?: boolean;
  /** Called when user navigates to a session (for inline mode) */
  onNavigate?: (path: string) => void;
}

// ─── Battle Challenge Button with countdown ────────────────────────────────
function BattleChallengeButton({ sessionId, hostUsername, requireAuth, goTo }: {
  sessionId: string; hostUsername?: string; requireAuth: (fn: () => void) => void; goTo: (path: string) => void;
}) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<any>(null);

  function startChallenge(e: React.MouseEvent) {
    e.stopPropagation();
    requireAuth(() => {
      if (countdown !== null) return;
      setCountdown(5);
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(timerRef.current);
            // Navigate to live with challenge param
            goTo(`/live/${sessionId}?challenge=1`);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    });
  }

  useEffect(() => () => clearInterval(timerRef.current), []);

  if (countdown !== null) {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm"
        style={{ background: 'rgba(255,215,0,0.85)', color: '#000' }}>
        {countdown}
      </div>
    );
  }
  return (
    <button onClick={startChallenge}
      className="w-8 h-8 rounded-full flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,215,0,0.5)' }}
      title={`Challenge @${hostUsername}`}>
      <Swords className="w-4 h-4 text-yellow-400" />
    </button>
  );
}

export default function LiveDiscover({ inline, onNavigate }: LiveDiscoverProps = {}) {
  const navigate = useNavigate();
  const { requireAuth } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [replays, setReplays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewTab, setViewTab] = useState<'live' | 'replay'>('live');

  const [totalViewers, setTotalViewers] = useState(0);

  useEffect(() => {
    loadSessions();
    const t = setInterval(loadSessions, 8000);
    return () => clearInterval(t);
  }, []);

  async function loadSessions() {
    const { data } = await supabase.from('live_sessions')
      .select('*, host:host_id(id,username,avatar_url,blue_tick,is_admin,is_business,is_vip)')
      .in('status', ['live'])
      .order('viewer_count', { ascending: false })
      .limit(50);
    const { data: replayData } = await supabase.from('live_sessions')
      .select('*, host:host_id(id,username,avatar_url,blue_tick,is_admin,is_business,is_vip)')
      .eq('status', 'ended')
      .order('ended_at', { ascending: false })
      .limit(30);
    setSessions(data || []);
    setReplays(replayData || []);
    // Calculate total viewers across all live sessions
    const total = (data || []).reduce((sum: number, s: any) => sum + (s.viewer_count || 0), 0);
    setTotalViewers(total);
    setLoading(false);
  }

  function formatNum(n: number) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }

  function timeSince(ts: string) {
    const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
    return `${Math.floor(secs / 86400)}d`;
  }

  function goTo(path: string) {
    if (onNavigate) onNavigate(path);
    else navigate(path);
  }

  const filtered = sessions.filter(s =>
    !search ||
    s.title?.toLowerCase().includes(search.toLowerCase()) ||
    s.host?.username?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredReplays = replays.filter(s =>
    !search ||
    s.title?.toLowerCase().includes(search.toLowerCase()) ||
    s.host?.username?.toLowerCase().includes(search.toLowerCase())
  );

  const containerClass = inline
    ? 'flex-1 flex flex-col overflow-hidden bg-black'
    : 'fixed inset-0 z-50 bg-black flex flex-col';

  return (
    <div className={containerClass} style={{ fontFamily: 'system-ui' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-white/5">
        <div className="flex items-center gap-3 mb-3">
          {!inline && (
            <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
              <X className="w-5 h-5 text-white" />
            </button>
          )}
          <div className="flex items-center gap-2 flex-1">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <h1 className="text-white font-black text-xl">LIVE</h1>
            {sessions.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">
                {sessions.length} live
              </span>
            )}
            {totalViewers > 0 && (
              <span className="text-gray-400 text-xs flex items-center gap-1">
                <Eye className="w-3 h-3" />{totalViewers.toLocaleString()} watazamaji
              </span>
            )}
          </div>
          <button
            onClick={() => requireAuth(() => goTo('/live/setup'))}
            className="flex items-center gap-2 gradient-pink px-4 py-2 rounded-full text-white text-sm font-black relative">
            <Radio className="w-4 h-4" /> GO LIVE
            {sessions.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-black text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center min-w-[18px] h-[18px] px-1 border border-black animate-bounce">
                {sessions.length}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tafuta live au jina..."
            className="w-full bg-white/10 border border-white/5 rounded-full pl-10 pr-4 py-2.5 text-white text-sm outline-none focus:border-primary/30 placeholder:text-gray-600"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button onClick={() => setViewTab('live')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold transition-all ${viewTab === 'live' ? 'gradient-pink text-white' : 'bg-white/10 text-gray-400'}`}>
            <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
            LIVE {sessions.length > 0 && <span className="bg-red-500/80 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{sessions.length}</span>}
          </button>
          <button onClick={() => setViewTab('replay')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold transition-all ${viewTab === 'replay' ? 'gradient-pink text-white' : 'bg-white/10 text-gray-400'}`}>
            <Clock className="w-3 h-3" />
            Replay {replays.length > 0 && <span className="bg-white/20 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{replays.length}</span>}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : viewTab === 'live' ? (
          filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <span className="text-7xl mb-4">🔴</span>
              <p className="text-white font-bold text-2xl mb-2">Hakuna Live Sasa</p>
              <p className="text-gray-500 text-sm mb-8">Kuwa wa kwanza kuanza live!</p>
              <button
                onClick={() => requireAuth(() => goTo('/live/setup'))}
                className="gradient-pink text-white font-black px-10 py-4 rounded-full text-lg flex items-center gap-2">
                <Radio className="w-6 h-6" /> Anza Live Sasa
              </button>
            </div>
          ) : (
            <div className="px-4 pt-3 pb-6">
              {/* Featured first live */}
              {filtered[0] && (
                <button
                  onClick={() => requireAuth(() => goTo(`/live/${filtered[0].id}`))}
                  className="relative w-full overflow-hidden rounded-3xl mb-4 block"
                  style={{ aspectRatio: '16/9' }}>
                  {filtered[0].cover_url ? (
                    <img src={filtered[0].cover_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : filtered[0].host?.avatar_url ? (
                    <img src={filtered[0].host.avatar_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #1a0a2a, #3d0b3d)' }}>
                      <Radio className="w-20 h-20 text-white/10" />
                    </div>
                  )}
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 55%)' }} />
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <span className="text-white text-xs font-black">LIVE</span>
                  </div>
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1">
                    <Eye className="w-3.5 h-3.5 text-white" />
                    <span className="text-white text-xs font-bold">{formatNum(filtered[0].viewer_count || 0)}</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white">
                        {filtered[0].host?.avatar_url
                          ? <img src={filtered[0].host.avatar_url} className="w-full h-full object-cover" alt="" />
                          : <div className="w-full h-full gradient-pink flex items-center justify-center text-white font-bold">{filtered[0].host?.username?.[0]}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="text-white font-black text-lg truncate">{filtered[0].host?.username}</p>
                          {filtered[0].host?.blue_tick && <BlueTick tickId={filtered[0].host.blue_tick} size={16} />}
                        </div>
                        <p className="text-gray-300 text-sm truncate">{filtered[0].title || 'Live Session'}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); requireAuth(() => { navigator.clipboard.writeText(`${window.location.origin}/live/${filtered[0].id}`); toast.success('Battle link imenakiliwa!'); }); }}
                          className="flex items-center gap-1.5 bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 text-xs font-black px-3 py-2 rounded-full">
                          <Swords className="w-3.5 h-3.5" /> Battle
                        </button>
                        <div className="gradient-pink text-white text-sm font-black px-5 py-2 rounded-full">
                          Ingia
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )}

              {/* Grid for remaining live sessions */}
              <div className="grid grid-cols-2 gap-3">
                {filtered.slice(1).map(s => (
                  <div
                    key={s.id}
                    className="relative overflow-hidden rounded-2xl text-left"
                    style={{ aspectRatio: '9/14' }}>
                    {s.cover_url ? (
                      <img src={s.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : s.host?.avatar_url ? (
                      <img src={s.host.avatar_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, hsl(${(s.host_id?.charCodeAt(0) || 200) * 7 % 360}, 60%, 12%), hsl(${(s.host_id?.charCodeAt(0) || 200) * 13 % 360}, 50%, 22%))` }}>
                        <Radio className="w-10 h-10 text-white/20" />
                      </div>
                    )}
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)' }} />
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-600 px-2 py-0.5 rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <span className="text-white text-[9px] font-black">LIVE</span>
                    </div>
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 rounded-full px-1.5 py-0.5">
                      <Eye className="w-2.5 h-2.5 text-white" />
                      <span className="text-white text-[9px] font-bold">{formatNum(s.viewer_count || 0)}</span>
                    </div>
                    {/* Paid live badge */}
                    {s.is_paid && (s.entry_price || 0) > 0 && (
                      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-yellow-500/90 rounded-full px-2 py-0.5">
                        <span className="text-black text-[9px] font-black">💰 TZS {formatNum(s.entry_price)}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="w-5 h-5 rounded-full overflow-hidden border border-primary/50 flex-shrink-0">
                          {s.host?.avatar_url
                            ? <img src={s.host.avatar_url} className="w-full h-full object-cover" alt="" />
                            : <div className="w-full h-full gradient-pink flex items-center justify-center text-white text-[7px] font-bold">{s.host?.username?.[0]}</div>}
                        </div>
                        <span className="text-white font-bold text-[11px] truncate">{s.host?.username}</span>
                        {s.host?.blue_tick && <BlueTick tickId={s.host.blue_tick} size={9} />}
                      </div>
                      {s.title && <p className="text-gray-300 text-[10px] line-clamp-1">{s.title}</p>}
                    </div>
                    {/* Battle challenge button */}
                    <div className="absolute top-2 right-7 z-10">
                      <BattleChallengeButton sessionId={s.id} hostUsername={s.host?.username} requireAuth={requireAuth} goTo={goTo} />
                    </div>
                    {/* Tap to join overlay */}
                    <button onClick={() => requireAuth(() => goTo(`/live/${s.id}`))} className="absolute inset-0 z-0" />
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          /* REPLAY TAB */
          filteredReplays.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <Clock className="w-16 h-16 text-gray-700 mb-4" />
              <p className="text-white font-bold text-xl mb-2">Hakuna Replay Bado</p>
              <p className="text-gray-500 text-sm">Live sessions zilizopita zitaonekana hapa</p>
            </div>
          ) : (
            <div className="px-4 pt-3 pb-6 space-y-3">
              {filteredReplays.map(s => (
                <button
                  key={s.id}
                  onClick={() => goTo(`/live/replay/${s.id}`)}
                  className="relative w-full overflow-hidden rounded-2xl flex items-center gap-3 bg-[#1a0a1a] border border-white/5 p-3 text-left">
                  {/* Cover thumbnail */}
                  <div className="w-20 h-24 rounded-xl overflow-hidden flex-shrink-0 relative">
                    {s.cover_url ? (
                      <img src={s.cover_url} alt="" className="w-full h-full object-cover" />
                    ) : s.host?.avatar_url ? (
                      <img src={s.host.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #1a0a2a, #3d0b3d)' }}>
                        <Radio className="w-6 h-6 text-white/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <div className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
                        <span className="text-white text-sm ml-0.5">▶</span>
                      </div>
                    </div>
                    <div className="absolute top-1 left-1 bg-gray-800/90 px-1.5 py-0.5 rounded-full">
                      <span className="text-white text-[8px] font-black">REPLAY</span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-primary/20">
                        {s.host?.avatar_url
                          ? <img src={s.host.avatar_url} className="w-full h-full object-cover" alt="" />
                          : <div className="w-full h-full gradient-pink flex items-center justify-center text-white text-[8px] font-bold">{s.host?.username?.[0]}</div>}
                      </div>
                      <span className="text-white font-bold text-xs truncate">{s.host?.username}</span>
                      {s.host?.blue_tick && <BlueTick tickId={s.host.blue_tick} size={9} />}
                    </div>
                    <p className="text-white text-sm font-semibold line-clamp-1 mb-1">{s.title || 'Live Session'}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-500 text-[10px] flex items-center gap-0.5">
                        <Eye className="w-2.5 h-2.5" /> {formatNum(s.peak_viewers || 0)} viewers
                      </span>
                      <span className="text-gray-500 text-[10px]">❤️ {formatNum(s.like_count || 0)}</span>
                      <span className="text-yellow-400/70 text-[10px]">🪙 {formatNum(s.gift_coin_earned || 0)}</span>
                    </div>
                    {s.ended_at && (
                      <p className="text-gray-600 text-[10px] mt-0.5">{timeSince(s.ended_at)} iliyopita</p>
                    )}
                  </div>
                </button>
              ))}
              <div className="h-2" />
            </div>
          )
        )}
      </div>
    </div>
  );
}
