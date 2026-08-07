import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  X, Share2, Users, Send, Mic, MicOff, Camera, CameraOff,
  MoreVertical, Crown, Eye, RotateCcw, Heart, UserPlus,
  Swords, RefreshCw, Bell, CheckCircle, AlertCircle, Loader2, Wifi, WifiOff,
  Circle, StopCircle as StopCircleIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import BlueTick from '@/components/features/BlueTick';
import {
  fmtCoins, fmtTime, Avatar, GuestGrid, LeaderboardPanel, GiftPanel,
  ViewersPanel, QueuePanel, GUEST_COLORS, GIFTS,
} from '@/components/features/LivePanels';

// ─── RTC CONFIG ───────────────────────────────────────────────────────────────
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:80?transport=tcp',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: ['turn:turn.anyfirewall.com:3478?transport=tcp'],
      username: 'webrtc',
      credential: 'webrtc',
    },
  ],
  iceCandidatePoolSize: 15,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all',
};

const REACTIONS = ['❤️', '👏', '😂', '😍', '🔥', '💋', '👍', '🤩'];
const REACTION_TRACK = ['❤️', '🔥', '😍'];
const BATTLE_DURATION = 120;

// ─── DB Signaling helpers ─────────────────────────────────────────────────────
async function dbSignalSend(sessionId: string, fromId: string, toId: string, type: string, payload: any) {
  console.log(`[DBSig] ${type} → ${toId.slice(-4)}`);
  const { error } = await supabase.from('live_signals').insert({ session_id: sessionId, from_id: fromId, to_id: toId, type, payload });
  if (error) console.error('[DBSig] Send error:', error);
  return !error;
}

async function dbSignalGet(sessionId: string, toId: string, types: string[], afterTime: string) {
  const { data, error } = await supabase
    .from('live_signals').select('*')
    .eq('session_id', sessionId).eq('to_id', toId)
    .in('type', types).gte('created_at', afterTime)
    .order('created_at', { ascending: true }).limit(30);
  if (error) console.error('[DBSig] Get error:', error);
  return data || [];
}

async function dbSignalCleanup(sessionId: string) {
  const cutoff = new Date(Date.now() - 120000).toISOString();
  await supabase.from('live_signals').delete().eq('session_id', sessionId).lt('created_at', cutoff);
}

// ─── Guest connection steps ───────────────────────────────────────────────────
type GuestStep = 'idle' | 'checking_camera' | 'camera_ready' | 'waiting_host'
  | 'creating_connection' | 'exchanging_session' | 'connecting_video'
  | 'connecting_audio' | 'finalizing' | 'connected' | 'failed';

const STEP_LABELS: Record<GuestStep, string> = {
  idle: '', checking_camera: 'Inathibitisha kamera...',
  camera_ready: 'Kamera iko tayari ✓', waiting_host: 'Inasubiri mwenyeji...',
  creating_connection: 'Inatengeneza muunganisho...', exchanging_session: 'Inabadilishana kikao...',
  connecting_video: 'Inaunganisha video...', connecting_audio: 'Inaunganisha sauti...',
  finalizing: 'Inakamilisha...', connected: 'Umejiunga! ✓', failed: 'Imeshindwa kuunganika',
};

function GuestConnectionProgress({ step, retryCount, onRetry, onCancel }: {
  step: GuestStep; retryCount: number; onRetry: () => void; onCancel: () => void;
}) {
  const steps: GuestStep[] = ['checking_camera','camera_ready','waiting_host','creating_connection','exchanging_session','connecting_video','connecting_audio','finalizing'];
  const currentIdx = steps.indexOf(step);
  const isFailed = step === 'failed';
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.94)' }} onClick={e => e.stopPropagation()}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          {isFailed
            ? <><AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-3" />
                <p className="text-white font-black text-xl">Imeshindwa Kuunganika</p>
                <p className="text-gray-400 text-sm mt-1">Angalia muunganisho wa intaneti</p>
                {retryCount > 0 && <p className="text-gray-600 text-xs mt-1">Jaribio {retryCount}/3</p>}</>
            : <><div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4" />
                <p className="text-white font-black text-xl">Inajiunga Live...</p>
                {retryCount > 0 && <p className="text-yellow-400 text-xs mt-1">Jaribio {retryCount + 1}/3</p>}</>}
        </div>
        <div className="space-y-2 mb-6">
          {steps.map((s, idx) => {
            const done = currentIdx > idx && !isFailed;
            const active = currentIdx === idx && !isFailed;
            const failedHere = isFailed && currentIdx === idx;
            return (
              <div key={s} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-500' : active ? 'bg-primary' : failedHere ? 'bg-red-500' : 'bg-white/10'}`}>
                  {done ? <CheckCircle className="w-3.5 h-3.5 text-white" />
                    : active ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    : failedHere ? <X className="w-3 h-3 text-white" />
                    : <div className="w-1.5 h-1.5 rounded-full bg-white/30" />}
                </div>
                <span className={`text-sm ${done ? 'text-green-400' : active ? 'text-white font-semibold' : failedHere ? 'text-red-400' : 'text-gray-600'}`}>
                  {STEP_LABELS[s]}
                </span>
              </div>
            );
          })}
        </div>
        {isFailed
          ? <div className="flex gap-3">
              <button onClick={onCancel} className="flex-1 py-3 rounded-2xl border border-white/20 text-gray-300 font-semibold text-sm">Acha</button>
              {retryCount < 3 && (
                <button onClick={onRetry} className="flex-1 py-3 rounded-2xl font-black text-white text-sm flex items-center justify-center gap-2"
                  style={{ background: 'rgba(255,20,147,0.8)' }}>
                  <RefreshCw className="w-4 h-4" /> Jaribu Tena
                </button>
              )}
            </div>
          : <button onClick={onCancel} className="w-full py-3 rounded-2xl border border-white/15 text-gray-400 text-sm">Ghairi</button>}
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i, left: `${Math.random() * 100}%`,
    color: ['#FF1493','#FFD700','#00BFFF','#32CD32','#FF6347','#9400D3'][i % 6],
    delay: `${Math.random() * 1.5}s`, size: 6 + Math.random() * 8, duration: `${2 + Math.random() * 2}s`,
  }));
  return (
    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'absolute', top: '-20px', left: p.left, width: p.size, height: p.size,
          borderRadius: 2, background: p.color, animationDelay: p.delay,
          animation: `confettiFall ${p.duration} ease-in forwards`,
        }} />
      ))}
    </div>
  );
}

function BattlePanel({ battle, myProfile, onClose }: { battle: any; myProfile: any; onClose: () => void }) {
  const myPct = battle.myScore + battle.theirScore === 0 ? 50
    : Math.round(battle.myScore / (battle.myScore + battle.theirScore) * 100);
  const isLast60 = battle.timer <= 60 && battle.timer > 0;
  if (battle.winner) {
    const won = battle.winner === 'me', draw = battle.winner === 'draw';
    return (
      <>
        {won && <Confetti />}
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.92)' }}>
          <div className="text-center px-6">
            <div className="text-8xl mb-4" style={{ animation: 'bounceIn 0.5s' }}>{draw ? '🤝' : won ? '🏆' : '💔'}</div>
            <p className="text-white font-black text-3xl mb-2">{draw ? 'Sawa!' : won ? 'Umeshinda!' : 'Umeshindwa!'}</p>
            <p className="text-gray-400 text-sm mb-6">{fmtCoins(battle.myScore)} vs {fmtCoins(battle.theirScore)} coins</p>
            <button onClick={onClose} className="gradient-pink text-white font-black px-8 py-3 rounded-full">Funga</button>
          </div>
        </div>
      </>
    );
  }
  return (
    <div className="absolute top-20 inset-x-3 z-30 rounded-2xl p-3 border border-white/10"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Swords className="w-4 h-4 text-yellow-400" />
          <span className="text-white font-black text-sm">BATTLE LIVE</span>
        </div>
        <span className={`font-black text-sm ${isLast60 ? 'text-red-400' : 'text-white'}`}
          style={isLast60 ? { animation: 'timerPulse 1s ease-in-out infinite' } : {}}>
          {fmtTime(battle.timer)}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <Avatar url={myProfile?.avatar_url} name={myProfile?.username} size={6} />
        <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: 'rgba(26,10,26,0.9)' }}>
          <div className="h-full relative rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="absolute left-0 top-0 h-full gradient-pink transition-all duration-700 ease-out rounded-l-full" style={{ width: `${myPct}%` }} />
            <div className="absolute right-0 top-0 h-full transition-all duration-700 ease-out rounded-r-full" style={{ width: `${100 - myPct}%`, background: 'rgba(255,215,0,0.6)' }} />
          </div>
        </div>
        <Avatar url={battle.opponentAvatar} name={battle.opponentName} size={6} />
      </div>
      <div className="flex justify-between text-[9px]">
        <span className="text-primary font-bold truncate max-w-[80px]">{myProfile?.username}</span>
        <span className="text-white/50">{fmtCoins(battle.myScore)} vs {fmtCoins(battle.theirScore)}</span>
        <span className="text-yellow-400 font-bold truncate max-w-[80px] text-right">{battle.opponentName}</span>
      </div>
    </div>
  );
}

function ReactionCounter({ counts }: { counts: { emoji: string; count: number }[] }) {
  const active = counts.filter(c => c.count > 0);
  if (!active.length) return null;
  return (
    <div className="flex items-center gap-1.5">
      {active.map(c => (
        <div key={c.emoji} className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span className="text-[11px]">{c.emoji}</span>
          <span className="text-white text-[9px] font-black">{fmtCoins(c.count)}</span>
        </div>
      ))}
    </div>
  );
}

function NetBars({ quality }: { quality: number }) {
  return (
    <div className="flex items-end gap-0.5">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`rounded-sm transition-colors ${i <= quality ? 'bg-green-400' : 'bg-white/20'}`}
          style={{ width: 3, height: 2 + i * 2 }} />
      ))}
    </div>
  );
}

// ─── Get media stream ─────────────────────────────────────────────────────────
async function getLocalStream(facing: 'user' | 'environment' = 'user', quality = '720p') {
  const q = ({ '360p': [640,360], '480p': [854,480], '720p': [1280,720], '1080p': [1920,1080], '16:9': [1280,720], '9:16': [720,1280], '4:3': [960,720], '1:1': [720,720] } as any)[quality] || [1280,720];
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: q[0] }, height: { ideal: q[1] } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
  });
}

// ─── Safe video play ──────────────────────────────────────────────────────────
async function safePlay(videoEl: HTMLVideoElement | null, stream: MediaStream, muted = false) {
  if (!videoEl) return;
  try {
    videoEl.srcObject = stream;
    videoEl.muted = muted;
    if (!muted) videoEl.volume = 1;
    await videoEl.play();
  } catch (e) {
    console.warn('[Video] play() failed, user interaction needed:', e);
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LiveStream() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isHost = searchParams.get('host') === '1';
  const quality = searchParams.get('quality') || '720p';
  const aspectRatio = searchParams.get('aspect') || '9:16';
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  // ── Refs ──────────────────────────────────────────────────────────────────
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const iceQueueRef = useRef<Map<string, RTCIceCandidate[]>>(new Map());
  const guestStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const autoRecorderRef = useRef<MediaRecorder | null>(null);
  const autoChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const pollRef = useRef<any>(null);
  const sigPollRef = useRef<any>(null);
  const battleTimerRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const channelReadyRef = useRef(false);
  const hostIdRef = useRef('');
  const lastSignalTimeRef = useRef(new Date(Date.now() - 5000).toISOString());
  const processedSignalsRef = useRef(new Set<string>());
  const streamReadyRef = useRef(false);

  const viewerConnectedRef = useRef(false);
  const viewerJoinSentRef = useRef(false);
  const viewerJoinTimeRef = useRef(0);

  const guestStepRef = useRef<GuestStep>('idle');
  const guestTimeoutRef = useRef<any>(null);
  const guestAbortRef = useRef(false);

  // ── Paid live unlock state ──────────────────────────────────────────────
  const [isPaidLocked, setIsPaidLocked] = useState(false);
  const [payingEntry, setPayingEntry] = useState(false);
  const [totalEntryEarned, setTotalEntryEarned] = useState(0);

  // ── State ────────────────────────────────────────────────────────────────
  const [session, setSession] = useState<any>(null);
  const [hostProfile, setHostProfile] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [comment, setComment] = useState('');
  const [viewers, setViewers] = useState(0);
  const [viewerAnimating, setViewerAnimating] = useState(false);
  const prevViewersRef = useRef(0);
  const [likeCount, setLikeCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const [floatEmojis, setFloatEmojis] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [floatGift, setFloatGift] = useState<{ emoji: string; sender: string; label: string } | null>(null);
  const [topGifters, setTopGifters] = useState<any[]>([]);
  const [selGift, setSelGift] = useState(GIFTS[0]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [followed, setFollowed] = useState(false);
  const [viewerList, setViewerList] = useState<any[]>([]);
  const [netQuality, setNetQuality] = useState(4);
  const [isRecording, setIsRecording] = useState(false);
  const [moderators, setModerators] = useState<string[]>([]);
  const [mutedUsers, setMutedUsers] = useState<string[]>([]);
  const [guests, setGuests] = useState<{ userId: string; username: string; avatarUrl?: string; color: string }[]>([]);
  const [guestMuted, setGuestMuted] = useState<Set<string>>(new Set());
  const [reqQueue, setReqQueue] = useState<{ userId: string; username: string; avatarUrl?: string; timestamp: number }[]>([]);
  const [isGuest, setIsGuest] = useState(false);
  const [reqSent, setReqSent] = useState(false);
  const [hasRemote, setHasRemote] = useState(false);
  const [camFlipping, setCamFlipping] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [peakViewers, setPeakViewers] = useState(0);
  const [modMenu, setModMenu] = useState<string | null>(null);
  const [battle, setBattle] = useState<any>(null);
  const [showBattleInvite, setShowBattleInvite] = useState<any>(null);
  const [giftTarget, setGiftTarget] = useState<'host' | 'battle'>('host');
  const [reactionCounts, setReactionCounts] = useState(REACTION_TRACK.map(e => ({ emoji: e, count: 0 })));
  const [guestStep, setGuestStep] = useState<GuestStep>('idle');
  const [guestRetryCount, setGuestRetryCount] = useState(0);
  const [viewerConnected, setViewerConnected] = useState(false);
  const [viewerConnecting, setViewerConnecting] = useState(!isHost);
  const [viewerStatus, setViewerStatus] = useState('Inasubiri ishara...');
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [bellCount, setBellCount] = useState(0);
  const [bellItems, setBellItems] = useState<{ type: string; text: string; time: number }[]>([]);
  const [showBell, setShowBell] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [showVipRecordModal, setShowVipRecordModal] = useState(false);
  const [vipPlans, setVipPlans] = useState<any[]>([]);
  const [loadingVipPlans, setLoadingVipPlans] = useState(false);
  const [payingVip, setPayingVip] = useState<string | null>(null);
  const [showBannedModal, setShowBannedModal] = useState(false);
  const [adminWhatsApp, setAdminWhatsApp] = useState('');
  const [adminUserId, setAdminUserId] = useState('');
  const [isUserBanned, setIsUserBanned] = useState(false);

  // ── Broadcast helper ──────────────────────────────────────────────────────
  const sendBroadcast = useCallback((payload: any) => {
    if (channelRef.current && channelReadyRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'sig', payload }).catch(() => {});
    }
  }, []);

  // ── ICE helpers ───────────────────────────────────────────────────────────
  const flushIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const q = iceQueueRef.current.get(peerId) || [];
    iceQueueRef.current.set(peerId, []);
    for (const c of q) {
      try { await pc.addIceCandidate(c); } catch (e) { console.warn('[ICE] add failed', e); }
    }
  }, []);

  const closePc = useCallback((peerId: string, fromMap: boolean) => {
    if (fromMap) {
      const pc = pcMapRef.current.get(peerId);
      if (pc) { try { pc.close(); } catch {} pcMapRef.current.delete(peerId); }
    } else {
      if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    }
    iceQueueRef.current.delete(peerId);
  }, []);

  const handleIce = useCallback(async (fromId: string, cand: any) => {
    const candidate = new RTCIceCandidate(cand);
    const pc = isHost ? pcMapRef.current.get(fromId) : pcRef.current;
    if (!pc || !pc.remoteDescription) {
      const q = iceQueueRef.current.get(fromId) || [];
      q.push(candidate);
      iceQueueRef.current.set(fromId, q);
      return;
    }
    await pc.addIceCandidate(candidate).catch(e => console.warn('[ICE]', e));
  }, [isHost]);

  const setGuestStepSafe = useCallback((step: GuestStep) => {
    guestStepRef.current = step;
    setGuestStep(step);
  }, []);

  const createViewerPC = useCallback(async (hostId: string, offerSdp: RTCSessionDescriptionInit) => {
    if (!id || !user || viewerConnectedRef.current) return;
    setViewerStatus('Inapokea video...');
    closePc(hostId, false);
    iceQueueRef.current.set(hostId, []);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;
    const remoteStream = new MediaStream();
    const attachVideo = () => {
      if (!remoteVideoRef.current || remoteStream.getTracks().length === 0) return;
      safePlay(remoteVideoRef.current, remoteStream, false).then(() => {
        viewerConnectedRef.current = true;
        setViewerConnected(true);
        setViewerConnecting(false);
        setNetQuality(4);
      });
    };
    pc.ontrack = e => {
      const stream = e.streams[0] || remoteStream;
      stream.getTracks().forEach(t => {
        if (!remoteStream.getTracks().find(x => x.id === t.id)) remoteStream.addTrack(t);
      });
      e.track.onunmute = () => attachVideo();
      setTimeout(attachVideo, 300);
    };
    pc.onicecandidate = e => {
      if (!e.candidate) return;
      sendBroadcast({ type: 'ice', to: hostId, from: user.id, sid: id, cand: e.candidate.toJSON() });
      dbSignalSend(id, user.id, hostId, 'ice', { cand: e.candidate.toJSON() });
    };
    const onConnect = () => {
      viewerConnectedRef.current = true;
      setViewerConnected(true);
      setViewerConnecting(false);
      setNetQuality(4);
      setViewerStatus('Imeunganika!');
      setTimeout(attachVideo, 300);
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') onConnect();
      else if (s === 'failed') { setNetQuality(1); try { pc.restartIce(); } catch {} }
      else if (s === 'disconnected') { setNetQuality(2); setTimeout(() => { if (pc.connectionState !== 'connected') try { pc.restartIce(); } catch {} }, 3000); }
    };
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') onConnect();
      else if (s === 'failed') try { pc.restartIce(); } catch {}
    };
    try {
      setViewerStatus('Inaweka maelezo...');
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      await flushIce(hostId, pc);
      setViewerStatus('Inaandaa jibu...');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await dbSignalSend(id, user.id, hostId, 'answer', { sdp: answer });
      sendBroadcast({ type: 'viewer_answer', to: hostId, from: user.id, sid: id, sdp: answer });
      setViewerStatus('Inasubiri video...');
    } catch (e) {
      console.error('[Viewer] handleOffer error:', e);
      setViewerStatus('Kosa! Jaribu tena');
    }
  }, [id, user, closePc, flushIce, sendBroadcast]);

  const hostOfferToViewer = useCallback(async (viewerId: string, attempt = 0) => {
    if (!id || !user) return;
    if (!localStreamRef.current || !streamReadyRef.current) {
      if (attempt < 25) { setTimeout(() => hostOfferToViewer(viewerId, attempt + 1), 400); }
      return;
    }
    const existing = pcMapRef.current.get(viewerId);
    if (existing && !['failed','closed','disconnected'].includes(existing.connectionState)) return;
    closePc(viewerId, true);
    iceQueueRef.current.set(viewerId, []);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcMapRef.current.set(viewerId, pc);
    localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    pc.onicecandidate = e => {
      if (!e.candidate) return;
      sendBroadcast({ type: 'ice', to: viewerId, from: user.id, sid: id, cand: e.candidate.toJSON() });
      dbSignalSend(id, user.id, viewerId, 'ice', { cand: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') try { pc.restartIce(); } catch {}
    };
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      await dbSignalSend(id, user.id, viewerId, 'offer', { sdp: offer });
      sendBroadcast({ type: 'viewer_offer', to: viewerId, from: user.id, sid: id, sdp: offer });
    } catch (e) {
      console.error('[Host] Offer error:', e);
      closePc(viewerId, true);
    }
  }, [id, user, sendBroadcast, closePc]);

  const guestHandleAnswer = useCallback(async (hostId: string, sdp: RTCSessionDescriptionInit) => {
    if (!pcRef.current) return;
    const pc = pcRef.current;
    if (pc.signalingState !== 'have-local-offer') return;
    setGuestStepSafe('finalizing');
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushIce(hostId, pc);
    } catch (e) {
      setGuestStepSafe('failed');
    }
  }, [flushIce, setGuestStepSafe]);

  const hostAnswerGuestOffer = useCallback(async (
    guestId: string, sdp: RTCSessionDescriptionInit, guestUsername: string, guestAvatar?: string
  ) => {
    if (!id || !user || !localStreamRef.current) return;
    closePc(guestId, true);
    iceQueueRef.current.set(guestId, []);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcMapRef.current.set(guestId, pc);
    localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    const guestStream = new MediaStream();
    guestStreamsRef.current.set(guestId, guestStream);
    pc.ontrack = e => {
      const stream = e.streams[0] || guestStream;
      stream.getTracks().forEach(t => {
        if (!guestStream.getTracks().find(x => x.id === t.id)) guestStream.addTrack(t);
      });
      setGuests(prev => [...prev]);
    };
    pc.onicecandidate = e => {
      if (!e.candidate) return;
      sendBroadcast({ type: 'ice', to: guestId, from: user.id, sid: id, cand: e.candidate.toJSON() });
      dbSignalSend(id, user.id, guestId, 'ice', { cand: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') try { pc.restartIce(); } catch {}
      if (pc.connectionState === 'connected') setGuests(prev => [...prev]);
    };
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushIce(guestId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const colorIdx = Math.floor(Math.random() * GUEST_COLORS.length);
      setGuests(prev => {
        if (prev.find(g => g.userId === guestId)) return prev;
        return [...prev, { userId: guestId, username: guestUsername || 'Guest', avatarUrl: guestAvatar, color: GUEST_COLORS[colorIdx] }];
      });
      await dbSignalSend(id, user.id, guestId, 'guest_answer', { sdp: answer });
      sendBroadcast({ type: 'guest_answer', to: guestId, from: user.id, sid: id, sdp: answer });
      await supabase.from('live_comments').insert({
        session_id: id, user_id: user.id,
        content: `👥 @${guestUsername || 'Guest'} amejiunga!`, is_moderator_msg: true,
      });
    } catch (e) {
      closePc(guestId, true);
      guestStreamsRef.current.delete(guestId);
    }
  }, [id, user, sendBroadcast, closePc, flushIce]);

  const cancelGuestJoin = useCallback(() => {
    guestAbortRef.current = true;
    clearTimeout(guestTimeoutRef.current);
    setGuestStepSafe('idle');
    setIsGuest(false);
    setReqSent(false);
    if (!isHost) {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    }
    closePc('guest_host', false);
  }, [setGuestStepSafe, closePc, isHost]);

  const doGuestJoin = useCallback(async (retryCount: number = 0) => {
    if (!id || !user || guestAbortRef.current) return;
    setGuestRetryCount(retryCount);
    guestAbortRef.current = false;
    setGuestStepSafe('checking_camera');
    let stream: MediaStream;
    try {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      stream = await getLocalStream(facing, quality);
      localStreamRef.current = stream;
      await safePlay(localVideoRef.current, stream, true);
      if (guestAbortRef.current) return;
    } catch (e) {
      setGuestStepSafe('failed');
      return;
    }
    setGuestStepSafe('camera_ready');
    await new Promise(r => setTimeout(r, 200));
    if (guestAbortRef.current) return;
    setIsGuest(true);
    setGuestStepSafe('creating_connection');
    closePc(hostIdRef.current || 'guest_host', false);
    iceQueueRef.current.set(hostIdRef.current || 'guest_host', []);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    const remoteStream = new MediaStream();
    pc.ontrack = e => {
      const s = e.streams[0] || remoteStream;
      s.getTracks().forEach(t => {
        if (!remoteStream.getTracks().find(x => x.id === t.id)) remoteStream.addTrack(t);
      });
      e.track.onunmute = () => {
        safePlay(remoteVideoRef.current, remoteStream, false).then(() => {
          setHasRemote(true); setViewerConnected(true); setViewerConnecting(false);
        });
      };
      setTimeout(() => {
        if (remoteStream.getTracks().length > 0) {
          safePlay(remoteVideoRef.current, remoteStream, false).then(() => {
            setHasRemote(true); setViewerConnected(true); setViewerConnecting(false);
          });
        }
      }, 500);
    };
    pc.onicecandidate = e => {
      if (!e.candidate || guestAbortRef.current) return;
      const toId = hostIdRef.current;
      if (!toId) return;
      sendBroadcast({ type: 'ice', to: toId, from: user.id, sid: id, cand: e.candidate.toJSON() });
      dbSignalSend(id, user.id, toId, 'ice', { cand: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') {
        setGuestStepSafe('connected');
        setNetQuality(4);
        clearTimeout(guestTimeoutRef.current);
        setTimeout(() => setGuestStepSafe('idle'), 1500);
      } else if (s === 'failed' && !guestAbortRef.current) {
        clearTimeout(guestTimeoutRef.current);
        if (retryCount < 2) setTimeout(() => doGuestJoin(retryCount + 1), 1000);
        else setGuestStepSafe('failed');
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (['connected','completed'].includes(pc.iceConnectionState)) {
        setGuestStepSafe('connected');
        setNetQuality(4);
        clearTimeout(guestTimeoutRef.current);
        setTimeout(() => setGuestStepSafe('idle'), 1500);
      }
    };
    setGuestStepSafe('exchanging_session');
    if (guestAbortRef.current) return;
    guestTimeoutRef.current = setTimeout(() => {
      if (!['connected','idle'].includes(guestStepRef.current) && !guestAbortRef.current) {
        if (retryCount < 2) doGuestJoin(retryCount + 1);
        else setGuestStepSafe('failed');
      }
    }, 20000);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      if (hostIdRef.current) {
        await dbSignalSend(id, user.id, hostIdRef.current, 'guest_offer', {
          sdp: offer, username: profile?.username, avatar: profile?.avatar_url,
        });
        sendBroadcast({
          type: 'guest_offer', to: hostIdRef.current, from: user.id, sid: id,
          sdp: offer, username: profile?.username, avatar: profile?.avatar_url,
        });
      }
    } catch (e) {
      clearTimeout(guestTimeoutRef.current);
      if (!guestAbortRef.current) {
        if (retryCount < 2) doGuestJoin(retryCount + 1);
        else setGuestStepSafe('failed');
      }
      return;
    }
    setGuestStepSafe('connecting_video');
    await flushIce(hostIdRef.current || 'guest_host', pc);
    setGuestStepSafe('connecting_audio');
  }, [id, user, profile, facing, quality, sendBroadcast, closePc, flushIce, setGuestStepSafe]);

  const pollSignals = useCallback(async () => {
    if (!id || !user) return;
    const since = lastSignalTimeRef.current;
    const signals = await dbSignalGet(id, user.id, ['join','offer','answer','ice','cohost_req','guest_offer','guest_answer'], since);
    if (signals.length > 0) lastSignalTimeRef.current = signals[signals.length - 1].created_at;
    for (const sig of signals) {
      if (processedSignalsRef.current.has(sig.id)) continue;
      processedSignalsRef.current.add(sig.id);
      if (isHost) {
        if (sig.type === 'join' && sig.from_id !== user.id) hostOfferToViewer(sig.from_id);
        if (sig.type === 'answer' && sig.from_id !== user.id) {
          const pc = pcMapRef.current.get(sig.from_id);
          if (pc && pc.signalingState === 'have-local-offer') {
            pc.setRemoteDescription(new RTCSessionDescription(sig.payload.sdp))
              .then(() => flushIce(sig.from_id, pc)).catch(() => {});
          }
        }
        if (sig.type === 'ice' && sig.from_id !== user.id) handleIce(sig.from_id, sig.payload.cand);
        if (sig.type === 'guest_offer' && sig.from_id !== user.id) hostAnswerGuestOffer(sig.from_id, sig.payload.sdp, sig.payload.username, sig.payload.avatar);
        if (sig.type === 'cohost_req' && sig.from_id !== user.id) {
          const fromId = sig.from_id;
          setReqQueue(prev => prev.find(r => r.userId === fromId) ? prev : [...prev, { userId: fromId, username: sig.payload.username || 'Guest', avatarUrl: sig.payload.avatar, timestamp: Date.now() }]);
          setBellItems(prev => [{ type: 'cohost', text: `@${sig.payload.username} anaomba kujiunga`, time: Date.now() }, ...prev].slice(0,20));
          setBellCount(n => n + 1);
        }
      } else {
        if (sig.type === 'offer' && sig.from_id !== user.id && !viewerConnectedRef.current) {
          hostIdRef.current = sig.from_id;
          createViewerPC(sig.from_id, sig.payload.sdp);
        }
        if (sig.type === 'ice' && sig.from_id !== user.id) handleIce(sig.from_id, sig.payload.cand);
        if (sig.type === 'guest_answer' && sig.from_id !== user.id) guestHandleAnswer(sig.from_id, sig.payload.sdp);
      }
    }
  }, [id, user, isHost, hostOfferToViewer, createViewerPC, flushIce, handleIce, hostAnswerGuestOffer, guestHandleAnswer]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`live_sig_${id}`, { config: { broadcast: { self: false, ack: false } } });
    ch.on('broadcast', { event: 'sig' }, ({ payload: msg }) => {
      if (!msg || msg.sid !== id) return;
      if (msg.type === 'ice' && msg.to === user?.id) { handleIce(msg.from, msg.cand); return; }
      if (!isHost && msg.type === 'viewer_offer' && msg.to === user?.id && !viewerConnectedRef.current) { hostIdRef.current = msg.from; createViewerPC(msg.from, msg.sdp); }
      if (!isHost && msg.type === 'guest_answer' && msg.to === user?.id) guestHandleAnswer(msg.from, msg.sdp);
      if (isHost && msg.type === 'viewer_answer' && msg.to === user?.id) {
        const pc = pcMapRef.current.get(msg.from);
        if (pc && pc.signalingState === 'have-local-offer') pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(() => flushIce(msg.from, pc)).catch(() => {});
      }
      if (isHost && msg.type === 'guest_offer' && msg.to === user?.id) hostAnswerGuestOffer(msg.from, msg.sdp, msg.username, msg.avatar);
      if (isHost && msg.type === 'cohost_req' && msg.to === user?.id) {
        setReqQueue(prev => prev.find(r => r.userId === msg.from) ? prev : [...prev, { userId: msg.from, username: msg.username || 'Guest', avatarUrl: msg.avatar, timestamp: Date.now() }]);
        setBellItems(prev => [{ type: 'cohost', text: `@${msg.username} anaomba kujiunga`, time: Date.now() }, ...prev].slice(0,20));
        setBellCount(n => n + 1);
      }
      if (!isHost && msg.type === 'kicked' && msg.to === user?.id) {
        toast.error('🚫 Umeondolewa kwenye live hii na mwenyeji!');
        setTimeout(() => navigate(-1), 1500);
      }
      if (!isHost && msg.type === 'cohost_accepted' && msg.to === user?.id) { setReqSent(false); guestAbortRef.current = false; doGuestJoin(0); }
      if (isHost && msg.type === 'battle_req' && msg.to === user?.id) setShowBattleInvite({ from: msg.from, name: msg.username, avatar: msg.avatar });
      if (isHost && msg.type === 'battle_gift' && battle) setBattle((prev: any) => prev ? { ...prev, theirScore: prev.theirScore + (msg.coins || 0) } : prev);
      if (!isHost && msg.type === 'battle_start' && msg.to === user?.id) { setBattle({ active: true, opponentId: msg.from, opponentName: msg.hostName, opponentAvatar: msg.hostAvatar, myScore: 0, theirScore: 0, timer: BATTLE_DURATION }); startBattleTimer(); }
    });
    ch.subscribe(status => { if (status === 'SUBSCRIBED') { channelRef.current = ch; channelReadyRef.current = true; } });
    channelRef.current = ch;
    return () => { channelReadyRef.current = false; supabase.removeChannel(ch); channelRef.current = null; };
  }, [id, isHost, user?.id]);

  useEffect(() => {
    if (!id) return;
    lastSignalTimeRef.current = new Date(Date.now() - 5000).toISOString();
    loadSession();
    if (user) { registerViewer(); checkFollow(); if (isHost) loadEntryEarnings(); checkUserBan(); loadAdminInfo(); }
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    pollRef.current = setInterval(() => { loadComments(); updateViewers(); loadReactionFloats(); }, 3500);
    if (isHost) {
      getLocalStream('user', quality).then(stream => {
        localStreamRef.current = stream;
        streamReadyRef.current = true;
        safePlay(localVideoRef.current, stream, true);
        startAutoRecord(stream);
      }).catch(e => { console.error('[Host] Camera error:', e); toast.error('Kamera haifanyi kazi!'); });
      sigPollRef.current = setInterval(pollSignals, 1500);
      setInterval(() => dbSignalCleanup(id), 120000);
    } else {
      setTimeout(async () => {
        if (!user || viewerJoinSentRef.current) return;
        viewerJoinSentRef.current = true;
        viewerJoinTimeRef.current = Date.now();
        if (!hostIdRef.current) {
          const { data } = await supabase.from('live_sessions').select('host_id').eq('id', id!).single();
          if (data) hostIdRef.current = (data as any).host_id;
        }
        if (hostIdRef.current) {
          setViewerStatus('Inatuma ishara...');
          await dbSignalSend(id, user.id, hostIdRef.current, 'join', { username: profile?.username, avatar: profile?.avatar_url });
          sendBroadcast({ type: 'viewer_join', from: user.id, sid: id, to: hostIdRef.current, username: profile?.username });
          setViewerStatus('Inasubiri video...');
        }
      }, 1500);
      sigPollRef.current = setInterval(() => {
        pollSignals();
        if (!viewerConnectedRef.current && viewerJoinSentRef.current && hostIdRef.current) {
          const elapsed = Date.now() - viewerJoinTimeRef.current;
          if (elapsed > 12000 && elapsed < 60000) {
            const period = Math.floor(elapsed / 12000);
            const withinPeriod = elapsed % 12000;
            if (withinPeriod < 1500 && period <= 3) {
              setViewerStatus('Inajaribu tena...');
              dbSignalSend(id, user!.id, hostIdRef.current, 'join', { username: profile?.username });
            }
          }
        }
      }, 1500);
    }
    if (isHost) {
      const ch2 = supabase.channel(`live_vjoin_${id}`);
      ch2.on('broadcast', { event: 'sig' }, ({ payload: msg }) => {
        if (msg?.type === 'viewer_join' && msg.sid === id && msg.from !== user?.id) hostOfferToViewer(msg.from);
      }).subscribe();
      return () => {
        clearInterval(timerRef.current); clearInterval(pollRef.current);
        clearInterval(sigPollRef.current); clearInterval(battleTimerRef.current);
        clearTimeout(guestTimeoutRef.current);
        if (isHost) cleanupLive();
        if (user && !isHost) leaveStream();
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        pcMapRef.current.forEach(pc => { try { pc.close(); } catch {} }); pcMapRef.current.clear();
        if (pcRef.current) { try { pcRef.current.close(); } catch {} }
        recorderRef.current?.stop();
        supabase.removeChannel(ch2);
      };
    }
    return () => {
      clearInterval(timerRef.current); clearInterval(pollRef.current);
      clearInterval(sigPollRef.current); clearInterval(battleTimerRef.current);
      clearTimeout(guestTimeoutRef.current);
      if (user && !isHost) leaveStream();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      pcMapRef.current.forEach(pc => { try { pc.close(); } catch {} }); pcMapRef.current.clear();
      if (pcRef.current) { try { pcRef.current.close(); } catch {} }
      recorderRef.current?.stop();
    };
  }, [id, user?.id]);

  useEffect(() => {
    if (!isGuest && !isHost) return;
    const t = setTimeout(() => {
      if (localStreamRef.current && localVideoRef.current) {
        if (!localVideoRef.current.srcObject || (localVideoRef.current.srcObject as MediaStream).id !== localStreamRef.current.id) {
          safePlay(localVideoRef.current, localStreamRef.current, true);
        }
      }
    }, 100);
    return () => clearTimeout(t);
  }, [isGuest, guests.length]);

  useEffect(() => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = micOn; }); }, [micOn]);
  useEffect(() => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = camOn; }); }, [camOn]);

  function startBattleTimer() {
    clearInterval(battleTimerRef.current);
    battleTimerRef.current = setInterval(() => {
      setBattle((prev: any) => {
        if (!prev?.active) return prev;
        const t = prev.timer - 1;
        if (t <= 0) { clearInterval(battleTimerRef.current); return { ...prev, timer: 0, winner: prev.myScore > prev.theirScore ? 'me' : prev.theirScore > prev.myScore ? 'them' : 'draw' }; }
        return { ...prev, timer: t };
      });
    }, 1000);
  }

  async function checkUserBan() {
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('is_blocked,account_status').eq('id', user.id).single();
    if (data?.is_blocked || data?.account_status === 'blocked' || data?.account_status === 'live_banned') {
      setIsUserBanned(true);
      // Load admin info first, then show modal
      const [{ data: wa }, { data: admins }] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key', 'whatsapp_support').maybeSingle(),
        supabase.from('user_profiles').select('id').eq('is_admin', true).limit(1),
      ]);
      if (wa?.value) setAdminWhatsApp(wa.value);
      if (admins?.[0]) setAdminUserId(admins[0].id);
      setShowBannedModal(true);
    }
  }

  async function loadVipPlans() {
    setLoadingVipPlans(true);
    const { data } = await supabase.from('vip_plans').select('*').eq('is_active', true).order('price');
    setVipPlans(data || []);
    setLoadingVipPlans(false);
  }

  async function purchaseVip(plan: any) {
    if (!user || !profile) return;
    setPayingVip(plan.id);
    try {
      const bal = (profile as any).balance || 0;
      if (bal < plan.price) {
        toast.error('Salio halitooshi! Weka pesa kwanza.');
        setPayingVip(null);
        return;
      }
      await supabase.from('user_profiles').update({ balance: bal - plan.price }).eq('id', user.id);
      await supabase.from('transactions').insert({ user_id: user.id, amount: plan.price, type: 'vip', status: 'pending', plan_name: plan.name, description: `VIP ${plan.name} - ${plan.duration_days} siku | IMETOKA KWENYE LIVE (Salio la Kawaida)` });
      await supabase.from('notifications').insert({ user_id: null, title: '👑 Ombi Jipya la VIP', message: `${(profile as any).username} ametuma ombi la VIP ${plan.name} - TZS ${plan.price.toLocaleString()}`, type: 'payment_request' });
      toast.success(`✅ Ombi la VIP limetumwa! Admin atakagua hivi karibuni.`);
      setShowVipRecordModal(false);
    } catch { toast.error('Hitilafu ya malipo. Jaribu tena.'); }
    finally { setPayingVip(null); }
  }

  async function loadAdminInfo() {
    const { data: wa } = await supabase.from('app_settings').select('value').eq('key', 'whatsapp_support').maybeSingle();
    if (wa?.value) setAdminWhatsApp(wa.value);
    const { data: admins } = await supabase.from('user_profiles').select('id').eq('is_admin', true).limit(1);
    if (admins?.[0]) setAdminUserId(admins[0].id);
  }

  function startAutoRecord(stream: MediaStream) {
    if (!stream || autoRecorderRef.current) return;
    autoChunksRef.current = [];
    let mime = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mime = 'video/webm;codecs=vp9,opus';
    else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) mime = 'video/webm;codecs=vp8,opus';
    try {
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
      rec.ondataavailable = e => { if (e.data.size > 0) autoChunksRef.current.push(e.data); };
      rec.start(5000);
      autoRecorderRef.current = rec;
      console.log('[AutoRecord] Started');
    } catch (e) { console.warn('[AutoRecord] Failed to start:', e); }
  }

  async function stopAutoRecordAndUpload() {
    if (!autoRecorderRef.current || !id || !user) return;
    return new Promise<void>(resolve => {
      const rec = autoRecorderRef.current!;
      rec.onstop = async () => {
        try {
          const chunks = autoChunksRef.current;
          if (chunks.length === 0) { resolve(); return; }
          const mime = rec.mimeType || 'video/webm';
          const blob = new Blob(chunks, { type: mime.split(';')[0] });
          const ext = mime.includes('mp4') ? 'mp4' : 'webm';
          const fileName = `live_replay_${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`;
          const path = `replays/${id}_${Date.now()}.${ext}`;
          console.log('[AutoRecord] Uploading replay', blob.size, 'bytes');

          // 1. Try to save locally first using File System Access API
          try {
            if ('showSaveFilePicker' in window) {
              const fileHandle = await (window as any).showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: 'Video', accept: { 'video/webm': ['.webm'], 'video/mp4': ['.mp4'] } }],
              });
              const writable = await fileHandle.createWritable();
              await writable.write(blob);
              await writable.close();
              toast.success('🎬 Live imehifadhiwa kwenye simu yako!');
            } else {
              // Fallback: anchor download
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = fileName;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 3000);
              toast.success('🎬 Live recording imedownload!');
            }
          } catch (localErr: any) {
            // User cancelled save picker or not supported - still continue uploading
            if (localErr?.name !== 'AbortError') {
              // Fallback download
              try {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = fileName;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 3000);
              } catch {}
            }
          }

          // 2. Also upload to Supabase storage for replay
          const { data: up } = await supabase.storage.from('content').upload(path, blob, { upsert: true, contentType: mime.split(';')[0] });
          if (!up?.path) { resolve(); return; }
          const { data: pub } = supabase.storage.from('content').getPublicUrl(path);
          await supabase.from('app_settings').upsert({ key: `replay_${id}`, value: pub.publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'key' });
          await supabase.from('live_sessions').update({ replay_available: true }).eq('id', id);
          console.log('[AutoRecord] Replay saved:', pub.publicUrl);
        } catch (e) { console.error('[AutoRecord] Upload failed:', e); }
        resolve();
      };
      try { rec.stop(); } catch { resolve(); }
      autoRecorderRef.current = null;
    });
  }

  async function loadEntryEarnings() {
    if (!id || !user) return;
    const dayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
    const { data } = await supabase.from('transactions').select('amount').eq('user_id', user.id).eq('type', 'live_sale').gte('created_at', dayAgo);
    setTotalEntryEarned((data || []).reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0));
  }

  async function loadSession() {
    const { data } = await supabase.from('live_sessions').select('*').eq('id', id!).single();
    if (!data) { toast.error('Live haipatikani'); navigate(-1); return; }
    setSession(data); setLikeCount(data.like_count || 0); setCommentCount(data.comment_count || 0);
    setPeakViewers(data.peak_viewers || 0); hostIdRef.current = data.host_id;
    const { data: hp } = await supabase.from('user_profiles').select('*').eq('id', data.host_id).single();
    setHostProfile(hp);
    if (!isHost && data.is_paid && (data.entry_price || 0) > 0 && user) {
      const { data: unlocked } = await supabase.from('user_unlocked_content')
        .select('id').eq('user_id', user.id).eq('content_id', id!).maybeSingle();
      if (!unlocked) setIsPaidLocked(true);
    }
    loadComments(); loadTopGifters(); loadMods(); loadMuted();
  }

  async function loadComments() {
    const { data } = await supabase.from('live_comments')
      .select('*, user:user_id(username,avatar_url,blue_tick,is_vip,is_admin)')
      .eq('session_id', id!).eq('is_deleted', false)
      .order('created_at', { ascending: true }).limit(60);
    if (data) { setComments(data); setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50); }
  }

  async function loadReactionFloats() {
    const since = new Date(Date.now() - 4500).toISOString();
    const { data } = await supabase.from('live_reactions').select('id,reaction').eq('session_id', id!).gte('created_at', since);
    if (!data?.length) return;
    data.slice(-5).forEach((r: any, i: number) => {
      const fe = { id: `${r.id}_${i}`, emoji: r.reaction, x: Math.random() * 55 + 10 };
      setFloatEmojis(prev => [...prev, fe]);
      setTimeout(() => setFloatEmojis(prev => prev.filter(x => x.id !== fe.id)), 3000);
    });
    const since2 = new Date(Date.now() - 60000).toISOString();
    const { data: rdata } = await supabase.from('live_reactions').select('reaction').eq('session_id', id!).gte('created_at', since2);
    if (rdata) setReactionCounts(REACTION_TRACK.map(emoji => ({ emoji, count: rdata.filter((r: any) => r.reaction === emoji).length })));
  }

  async function loadTopGifters() {
    const { data } = await supabase.from('live_gift_history').select('sender_id,coin_value,sender:sender_id(username,avatar_url)').eq('session_id', id!);
    if (!data) return;
    const map = new Map<string, any>();
    data.forEach((g: any) => {
      const ex = map.get(g.sender_id) || { ...(g.sender || {}), total: 0 };
      map.set(g.sender_id, { ...ex, total: ex.total + (g.coin_value || 0) });
    });
    setTopGifters(Array.from(map.values()).sort((a, b) => b.total - a.total));
  }

  async function loadMods() {
    const { data } = await supabase.from('live_moderators').select('user_id').eq('session_id', id!);
    setModerators((data || []).map((m: any) => m.user_id));
  }
  async function loadMuted() {
    const { data } = await supabase.from('live_muted_users').select('user_id').eq('session_id', id!);
    setMutedUsers((data || []).map((m: any) => m.user_id));
  }
  async function registerViewer() {
    if (!user || !id) return;
    await supabase.from('live_viewers').upsert({ session_id: id, user_id: user.id, joined_at: new Date().toISOString() }, { onConflict: 'session_id,user_id' });
  }
  async function leaveStream() {
    if (!user || !id) return;
    await supabase.from('live_viewers').update({ left_at: new Date().toISOString() }).eq('session_id', id).eq('user_id', user.id);
  }
  async function checkFollow() {
    if (!user || !hostIdRef.current) return;
    const { data } = await supabase.from('tik_follows').select('id').eq('follower_id', user.id).eq('following_id', hostIdRef.current).maybeSingle();
    setFollowed(!!data);
  }
  async function updateViewers() {
    const { count } = await supabase.from('live_viewers').select('id', { count: 'exact', head: true }).eq('session_id', id!).is('left_at', null);
    const v = Math.max(count || 0, 1);
    if (v !== prevViewersRef.current && prevViewersRef.current > 0) {
      setViewerAnimating(true);
      setTimeout(() => setViewerAnimating(false), 1200);
    }
    prevViewersRef.current = v;
    setViewers(v);
    if (v > peakViewers) { setPeakViewers(v); if (isHost) supabase.from('live_sessions').update({ viewer_count: v, peak_viewers: v }).eq('id', id!).then(() => {}); }
    const { data } = await supabase.from('live_viewers').select('user:user_id(id,username,avatar_url,blue_tick,is_vip,is_admin)').eq('session_id', id!).is('left_at', null).limit(50);
    setViewerList((data || []).map((vw: any) => vw.user).filter(Boolean));
  }

  async function payLiveEntry() {
    if (!user || !session || !id) return;
    const price = session.entry_price || 0;
    if (price <= 0) { setIsPaidLocked(false); return; }
    setPayingEntry(true);
    try {
      const { data: myProf } = await supabase.from('user_profiles').select('balance').eq('id', user.id).single();
      const bal = (myProf as any)?.balance || 0;
      if (bal < price) { toast.error('Salio halitooshi! Weka pesa kwanza.'); setPayingEntry(false); return; }
      const { error: deductErr } = await supabase.from('user_profiles').update({ balance: bal - price }).eq('id', user.id);
      if (deductErr) throw deductErr;
      const { data: hostProf } = await supabase.from('user_profiles').select('live_balance').eq('id', session.host_id).single();
      const hostLiveBal = (hostProf as any)?.live_balance || 0;
      await supabase.from('user_profiles').update({ live_balance: hostLiveBal + price }).eq('id', session.host_id);
      await supabase.from('transactions').insert([
        { user_id: user.id, amount: price, type: 'live_sale', status: 'approved', description: `Ada ya live | Kwa: ${hostProfile?.username || 'Host'} | Chanzo: Live` },
        { user_id: session.host_id, amount: price, type: 'live_sale', status: 'approved', description: `Ada ya kuingia | Kutoka: ${profile?.username || 'Mtumiaji'} | Chanzo: Live` },
      ]);
      await supabase.from('user_unlocked_content').insert({ user_id: user.id, content_id: id, content_type: 'live', amount_paid: price });
      await supabase.from('notifications').insert({ user_id: session.host_id, title: '💰 Ada ya Kuingia!', message: `${profile?.username} amelipa TZS ${price.toLocaleString()} kuingia live yako`, type: 'live', link: `/live/${id}` });
      setIsPaidLocked(false);
      setTotalEntryEarned(prev => prev + price);
      toast.success('✅ Umelipa! Unaweza kutazama live sasa.');
    } catch (e) {
      toast.error('Hitilafu ya malipo. Jaribu tena.');
    } finally {
      setPayingEntry(false);
    }
  }

  async function cleanupLive() {
    if (!isHost || !id) return;
    await stopAutoRecordAndUpload();
    const { data: viewerData } = await supabase.from('live_viewers').select('user_id').eq('session_id', id);
    await supabase.from('live_sessions').update({
      status: 'ended', ended_at: new Date().toISOString(), viewer_count: viewers,
      peak_viewers: peakViewers, like_count: likeCount, comment_count: commentCount,
      replay_available: true, replay_comment_count: comments.length,
    }).eq('id', id);
    await supabase.from('live_options').update({ is_online: false }).eq('uploader_id', user?.id);
    if (viewerData?.length) {
      const totalCoins = topGifters.reduce((s, g) => s + g.total, 0);
      const notifs = viewerData.map((v: any) => ({
        user_id: v.user_id, title: `📺 ${hostProfile?.username || 'Live'} imeisha`,
        message: `Muda: ${fmtTime(duration)} | Zawadi: ${fmtCoins(totalCoins)} coins. Tazama replay!`,
        type: 'live', link: `/live/replay/${id}`, action_label: 'Tazama Replay',
      }));
      for (let i = 0; i < notifs.length; i += 50) await supabase.from('notifications').insert(notifs.slice(i, i + 50)).then(() => {});
    }
    await supabase.from('live_signals').delete().eq('session_id', id);
  }

  async function sendComment() {
    if (!user) { navigate('/login'); return; }
    if (!comment.trim()) return;
    if (isUserBanned) { setShowBannedModal(true); return; }
    if (mutedUsers.includes(user.id)) { toast.error('Umezuiwa'); return; }
    const content = comment.trim(); setComment('');
    await supabase.from('live_comments').insert({ session_id: id, user_id: user.id, content });
    setCommentCount(c => c + 1); loadComments();
  }

  async function sendReaction(emoji: string) {
    const fe = { id: `local_${Date.now()}`, emoji, x: Math.random() * 55 + 10 };
    setFloatEmojis(prev => [...prev, fe]);
    setTimeout(() => setFloatEmojis(prev => prev.filter(r => r.id !== fe.id)), 3000);
    setLikeCount(c => c + 1);
    if (user) await supabase.from('live_reactions').insert({ session_id: id, user_id: user.id, reaction: emoji });
    if (REACTION_TRACK.includes(emoji)) setReactionCounts(prev => prev.map(r => r.emoji === emoji ? { ...r, count: r.count + 1 } : r));
  }

  async function sendGift() {
    if (!user) { navigate('/login'); return; }
    if (isUserBanned) { setShowBannedModal(true); return; }
    const { data: myProf } = await supabase.from('user_profiles').select('balance').eq('id', user.id).single();
    const bal = (myProf as any)?.balance || 0;
    if (bal < selGift.coins) { toast.error('Salio halitooshi!'); setShowGiftPanel(false); return; }
    await supabase.from('user_profiles').update({ balance: bal - selGift.coins }).eq('id', user.id);
    const recipientId = (battle && giftTarget === 'battle') ? battle.opponentId : session?.host_id;
    if (recipientId) {
      const { data: rp } = await supabase.from('user_profiles').select('gift_balance').eq('id', recipientId).single();
      await supabase.from('user_profiles').update({ gift_balance: ((rp as any)?.gift_balance || 0) + selGift.coins }).eq('id', recipientId);
      await supabase.from('live_gift_history').insert({ session_id: id, sender_id: user.id, host_id: recipientId, gift_type: selGift.type, gift_emoji: selGift.emoji, coin_value: selGift.coins });
      await supabase.from('transactions').insert({ user_id: recipientId, amount: selGift.coins, type: 'gift_received', status: 'approved', description: `Zawadi ${selGift.emoji} | Kutoka: ${profile?.username || 'Mtu'} | Chanzo: Live` });
    }
    if (battle) {
      setBattle((prev: any) => prev ? { ...prev, myScore: prev.myScore + selGift.coins } : prev);
      if (giftTarget === 'battle') sendBroadcast({ type: 'battle_gift', to: battle.opponentId, from: user.id, sid: id, coins: selGift.coins });
    }
    setFloatGift({ emoji: selGift.emoji, sender: profile?.username || 'Mtu', label: selGift.label });
    setTimeout(() => setFloatGift(null), 4000);
    loadTopGifters(); toast.success(`${selGift.emoji} Zawadi imetumwa!`); setShowGiftPanel(false);
  }

  async function handleFollow() {
    if (!user || !session) return;
    if (followed) { setFollowed(false); await supabase.from('tik_follows').delete().eq('follower_id', user.id).eq('following_id', session.host_id); }
    else { setFollowed(true); await supabase.from('tik_follows').insert({ follower_id: user.id, following_id: session.host_id }); }
  }

  async function muteUser(uid: string) {
    await supabase.from('live_muted_users').upsert({ session_id: id, user_id: uid, muted_by: user!.id }, { onConflict: 'session_id,user_id' });
    setMutedUsers(m => [...m, uid]); toast.success('Amenyamazishwa'); setModMenu(null);
  }
  async function makeMod(uid: string) {
    await supabase.from('live_moderators').upsert({ session_id: id, user_id: uid, assigned_by: user!.id }, { onConflict: 'session_id,user_id' });
    setModerators(m => [...m, uid]); toast.success('Msimamizi'); setModMenu(null);
  }

  async function acceptCoHost(req: any) {
    if (!user || !id) return;
    sendBroadcast({ type: 'cohost_accepted', to: req.userId, from: user.id, sid: id });
    await dbSignalSend(id, user.id, req.userId, 'cohost_accepted', { hostId: user.id });
    setReqQueue(prev => prev.filter(r => r.userId !== req.userId));
    toast.success(`@${req.username} amekubaliwa!`);
  }

  function toggleGuestMute(uid: string) {
    setGuestMuted(prev => { const n = new Set(prev); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });
  }
  function removeGuest(uid: string) {
    setGuests(prev => prev.filter(g => g.userId !== uid));
    closePc(uid, true);
    guestStreamsRef.current.delete(uid);
  }

  function sendCoHostRequest() {
    if (!user || !id || !hostIdRef.current) return;
    if (reqSent) return;
    setReqSent(true);
    dbSignalSend(id, user.id, hostIdRef.current, 'cohost_req', { username: profile?.username, avatar: profile?.avatar_url });
    sendBroadcast({ type: 'cohost_req', to: hostIdRef.current, from: user.id, sid: id, username: profile?.username, avatar: profile?.avatar_url });
    toast.info('Ombi limetumwa! Subiri mwenyeji akubali...');
    setShowMenu(false);
  }

  async function flipCamera() {
    const nf = facing === 'user' ? 'environment' : 'user';
    setCamFlipping(true); setFacing(nf);
    try {
      const stream = await getLocalStream(nf, quality);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = stream;
      await safePlay(localVideoRef.current, stream, true);
      stream.getAudioTracks().forEach(t => { t.enabled = micOn; });
      stream.getVideoTracks().forEach(t => { t.enabled = camOn; });
      pcMapRef.current.forEach(pc => stream.getTracks().forEach(t => {
        const s = pc.getSenders().find(x => x.track?.kind === t.kind);
        if (s) s.replaceTrack(t).catch(() => {});
      }));
      if (pcRef.current) {
        stream.getTracks().forEach(t => {
          const s = pcRef.current!.getSenders().find(x => x.track?.kind === t.kind);
          if (s) s.replaceTrack(t).catch(() => {});
        });
      }
    } catch {}
    setCamFlipping(false);
  }

  function toggleRecord() {
    if (isRecording) { recorderRef.current?.stop(); recorderRef.current = null; setIsRecording(false); return; }
    // For host: record local stream. For viewers/guests: record remote stream
    const stream = isHost
      ? localStreamRef.current
      : (remoteVideoRef.current?.srcObject instanceof MediaStream ? remoteVideoRef.current.srcObject : null);
    if (!stream) { toast.error('Hakuna video ya kurekodi bado'); return; }
    const chunks: Blob[] = [];
    let mime = 'video/webm'; let ext = 'webm';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mime = 'video/webm;codecs=vp9,opus';
    else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) mime = 'video/webm;codecs=vp8,opus';
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac')) { mime = 'video/mp4;codecs=h264,aac'; ext = 'mp4'; }
    try {
      const recOptions: MediaRecorderOptions = { mimeType: mime };
      if (mime.startsWith('video/webm')) recOptions.videoBitsPerSecond = 2_500_000;
      const rec = new MediaRecorder(stream, recOptions);
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `live_${Date.now()}.${ext}`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        toast.success(`🎬 Recording imedownload! (.${ext})`);
      };
      rec.start(1000); recorderRef.current = rec; setIsRecording(true);
      toast.success('🔴 Recording imeanza!');
    } catch (e) { toast.error('Recording haifanyi kazi kwenye browser hii'); }
  }

  function acceptBattle() {
    if (!showBattleInvite || !user) return;
    const opp = showBattleInvite; setShowBattleInvite(null);
    sendBroadcast({ type: 'battle_start', to: opp.from, from: user.id, sid: id, hostName: profile?.username, hostAvatar: profile?.avatar_url });
    setBattle({ active: true, opponentId: opp.from, opponentName: opp.name, opponentAvatar: opp.avatar, myScore: 0, theirScore: 0, timer: BATTLE_DURATION });
    startBattleTimer();
  }

  async function endLive() {
    if (!window.confirm('Maliza live?')) return;
    // End immediately - navigate first, then cleanup in background
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcMapRef.current.forEach(pc => { try { pc.close(); } catch {} });
    // Notify all viewers immediately via broadcast
    sendBroadcast({ type: 'live_ended', from: user?.id, sid: id });
    // Update DB immediately without waiting for recording upload
    if (id && user) {
      supabase.from('live_sessions').update({
        status: 'ended', ended_at: new Date().toISOString(), viewer_count: viewers,
        peak_viewers: peakViewers, like_count: likeCount, comment_count: commentCount,
      }).eq('id', id).then(() => {});
      supabase.from('live_options').update({ is_online: false }).eq('uploader_id', user.id).then(() => {});
    }
    // Navigate immediately
    navigate(-1);
    // Upload recording in background (don't await)
    if (autoRecorderRef.current) {
      stopAutoRecordAndUpload().catch(() => {});
    }
  }

  // Tap screen → toggle UI visibility; tapping buttons/inputs doesn't toggle
  function handleScreenTap(e: React.MouseEvent) {
    const el = e.target as HTMLElement;
    if (el.closest('button, input, [data-nohide], a')) return;
    setUiVisible(v => !v);
    setShowMenu(false); setModMenu(null);
  }

  function handleRecordClick(e: React.MouseEvent) {
    e.stopPropagation();
    // Works for both host and viewers (viewers record remote stream)
    // Non-VIP members must subscribe first
    if (profile && !(profile as any).is_vip && !(profile as any).is_admin && !(profile as any).is_business) {
      loadVipPlans();
      setShowVipRecordModal(true);
      return;
    }
    toggleRecord();
  }

  function retryViewerConnection() {
    if (!id || !user || !hostIdRef.current) return;
    viewerConnectedRef.current = false;
    closePc(hostIdRef.current, false);
    setViewerConnected(false); setViewerConnecting(true);
    setViewerStatus('Inajaribu tena...');
    dbSignalSend(id, user.id, hostIdRef.current, 'join', { username: profile?.username, avatar: profile?.avatar_url });
    sendBroadcast({ type: 'viewer_join', from: user.id, sid: id, to: hostIdRef.current, username: profile?.username });
    viewerJoinTimeRef.current = Date.now();
  }

  const isMod = moderators.includes(user?.id || '');
  const canMod = isHost || isMod;
  const hasGuests = guests.length > 0;
  const showSplit = (isHost && hasGuests) || isGuest;
  const pinnedComment = comments.find(c => c.is_pinned);
  const showGuestProgress = guestStep !== 'idle' && guestStep !== 'connected';
  const canRequestCoHost = !isHost && !isGuest && session?.enable_co_host && user && user.id !== session?.host_id;
  const entryPrice = session?.entry_price || 0;

  // Aspect ratio for host video
  const videoObjectFit = ['16:9','4:3','1:1'].includes(aspectRatio) ? 'contain' : 'cover';

  useEffect(() => {
    if (!id || !user || isHost) return;
    const checkAccepted = async () => {
      const since = new Date(Date.now() - 30000).toISOString();
      const { data } = await supabase.from('live_signals')
        .select('*').eq('session_id', id).eq('to_id', user.id)
        .eq('type', 'cohost_accepted').gte('created_at', since).limit(1);
      if (data && data.length > 0 && !isGuest && reqSent) {
        const sig = data[0];
        if (!processedSignalsRef.current.has(sig.id)) {
          processedSignalsRef.current.add(sig.id);
          setReqSent(false); guestAbortRef.current = false; doGuestJoin(0);
        }
      }
    };
    const iv = setInterval(checkAccepted, 2000);
    return () => clearInterval(iv);
  }, [id, user?.id, isHost, isGuest, reqSent]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden select-none"
      style={{ fontFamily: 'system-ui' }} onClick={handleScreenTap}>

      {/* ── VIDEO AREA ── z-0, UI overlay z-30 always on top */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        {showSplit ? (
          /* ════ SPLIT VIEW: NUSU KWA NUSU (50% / 50%) ════ */
          <div className="absolute inset-0 flex flex-col">
            {/* TOP 50% — GUEST panel, blue bottom border */}
            <div className="relative bg-black overflow-hidden flex-none" style={{ height: '50%', borderBottom: '2px solid #3b82f6' }}>
              <div className="absolute top-2 left-2 z-10 pointer-events-none">
                <span className="bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">GUEST</span>
              </div>
              {isHost
                ? (guests.length > 0
                    ? <GuestGrid guests={guests} guestStreamsRef={guestStreamsRef} guestMuted={guestMuted}
                        onMuteGuest={toggleGuestMute} onRemoveGuest={removeGuest} isHost={isHost} />
                    : <div className="w-full h-full bg-[#080808] flex items-center justify-center">
                        <p className="text-gray-600 text-xs">Watazamaji wanaweza kuomba kujiunga</p>
                      </div>)
                : <div className="w-full h-full bg-[#080808] overflow-hidden">
                    <video ref={localVideoRef} autoPlay muted playsInline
                      className="absolute inset-0 w-full h-full"
                      style={{ objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
                    <div className="absolute bottom-1 left-2 bg-black/70 rounded-full px-2 py-0.5 pointer-events-none">
                      <span className="text-white text-[9px] font-bold">{profile?.username} (Wewe)</span>
                    </div>
                  </div>}
            </div>

            {/* BOTTOM 50% — HOST panel */}
            <div className="relative bg-black overflow-hidden flex-none" style={{ height: '50%' }}>
              <div className="absolute top-2 left-2 z-10 pointer-events-none">
                <span className="bg-primary text-white text-[9px] font-black px-2 py-0.5 rounded-full">HOST</span>
              </div>
              {isHost
                ? <video ref={localVideoRef} autoPlay muted playsInline
                    className="absolute inset-0 w-full h-full"
                    style={{ objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
                : <>
                    <video ref={remoteVideoRef} autoPlay playsInline
                      className="absolute inset-0 w-full h-full"
                      style={{ objectFit: 'cover', display: hasRemote ? 'block' : 'none' }} />
                    {!hasRemote && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#080808]">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </>}
              <div className="absolute bottom-2 left-2 bg-black/70 rounded-full px-2 py-0.5 pointer-events-none">
                <span className="text-white text-[10px] font-bold">
                  {isHost ? (profile?.username || 'Host') : (hostProfile?.username || 'Host')}
                </span>
              </div>
            </div>
          </div>
        ) : isHost
          ? <video ref={localVideoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full"
              style={{ objectFit: videoObjectFit as any, transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
          : <>
              {session?.cover_url && !viewerConnected && (
                <img src={session.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" style={{ filter: 'blur(12px)' }} />
              )}
              <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full"
                style={{ objectFit: 'contain', display: viewerConnected ? 'block' : 'none' }}
                onClick={() => { if (remoteVideoRef.current?.paused) remoteVideoRef.current.play().catch(() => {}); }} />
              {viewerConnecting && !viewerConnected && (
                <div className="absolute inset-0 flex flex-col items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,rgba(10,3,15,0.95),rgba(26,10,42,0.95))' }}>
                  {hostProfile?.avatar_url
                    ? <img src={hostProfile.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover mb-5 border-2 border-primary" />
                    : <div className="w-20 h-20 rounded-full mb-5 gradient-pink flex items-center justify-center text-3xl font-black text-white">{hostProfile?.username?.[0] || '?'}</div>}
                  <p className="text-white font-black text-lg mb-1">{hostProfile?.username || 'Live'}</p>
                  <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin my-3" />
                  <p className="text-white font-bold text-base mb-1">Inaunganisha...</p>
                  <p className="text-gray-400 text-xs mb-6 px-8 text-center">{viewerStatus}</p>
                  <button onClick={e => { e.stopPropagation(); retryViewerConnection(); }}
                    className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm"
                    style={{ background: 'rgba(255,20,147,0.2)', border: '1px solid rgba(255,20,147,0.4)', color: '#FF1493' }}>
                    <RefreshCw className="w-4 h-4" /> Jaribu Tena
                  </button>
                </div>
              )}
              {isPaidLocked && !isHost && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6"
                  style={{ backdropFilter: 'blur(28px) saturate(0.4) brightness(0.7)', background: 'rgba(0,0,0,0.35)' }}
                  onClick={e => e.stopPropagation()}>
                  <div className="w-full max-w-xs rounded-3xl p-6 text-center border border-white/15"
                    style={{ background: 'rgba(10,3,15,0.92)', backdropFilter: 'blur(20px)' }}>
                    <div className="w-16 h-16 rounded-full gradient-pink flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">🔒</span>
                    </div>
                    <p className="text-white font-black text-xl mb-1">Live ya Kulipwa</p>
                    <p className="text-gray-400 text-sm mb-1">{hostProfile?.username || 'Host'} ameweka ada ya kuingia</p>
                    <p className="text-primary font-black text-4xl my-4">TZS {entryPrice.toLocaleString()}</p>
                    <p className="text-gray-500 text-xs mb-5">Lipia mara moja kwa salio lako</p>
                    <button onClick={payLiveEntry} disabled={payingEntry}
                      className="w-full py-4 rounded-2xl font-black text-white text-lg mb-3 disabled:opacity-70 flex items-center justify-center gap-2"
                      style={{ background: 'linear-gradient(135deg,#e60026,#FF1493)', boxShadow: '0 8px 32px rgba(255,20,147,0.4)' }}>
                      {payingEntry ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Inalipa...</> : <>💳 Lipia TZS {entryPrice.toLocaleString()}</>}
                    </button>
                    <button onClick={() => navigate(-1)} className="w-full py-3 rounded-2xl border border-white/15 text-gray-400 text-sm font-semibold">← Rudi</button>
                  </div>
                </div>
              )}
            </>}
      </div>

      {/* Gradient overlay — z-1 */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1,
        background: showSplit
          ? 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 8%, transparent 88%, rgba(0,0,0,0.95) 100%)'
          : 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 22%, transparent 50%, rgba(0,0,0,0.88) 100%)' }} />

      {/* Floating emojis */}
      {floatEmojis.map(e => (
        <div key={e.id} className="absolute bottom-52 pointer-events-none text-3xl" style={{ zIndex: 20, left: `${e.x}%`, animation: 'liveFloatUp 3s ease-out forwards' }}>{e.emoji}</div>
      ))}
      {floatGift && (
        <div className="absolute z-30 pointer-events-none"
          style={{ top: '35%', left: '50%', transform: 'translateX(-50%)', animation: 'liveGiftPop 4s ease-out forwards' }}>
          <div className="rounded-2xl px-8 py-5 border border-white/20 text-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
            <span className="text-5xl block">{floatGift.emoji}</span>
            <p className="text-white font-black text-base mt-1">@{floatGift.sender}</p>
            <p className="text-yellow-400 text-sm font-bold">{floatGift.label}</p>
          </div>
        </div>
      )}

      {battle && <BattlePanel battle={battle} myProfile={profile} onClose={() => setBattle(null)} />}

      {showBattleInvite && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={e => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10" style={{ background: 'rgba(10,3,15,0.97)' }}>
            <div className="p-5 text-center">
              <Swords className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
              <p className="text-white font-black text-lg mb-1">Changamoto ya Battle!</p>
              <p className="text-gray-400 text-sm mb-4">@{showBattleInvite.name} anakuchangamoto</p>
              <div className="flex gap-3">
                <button onClick={() => setShowBattleInvite(null)} className="flex-1 py-3 rounded-xl font-bold text-gray-300 border border-white/20">Kataa</button>
                <button onClick={acceptBattle} className="flex-1 py-3 rounded-xl font-black text-black" style={{ background: '#FFD700' }}>⚔️ Kubali!</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showGuestProgress && (
        <GuestConnectionProgress step={guestStep} retryCount={guestRetryCount}
          onRetry={() => { const next = guestRetryCount + 1; setGuestRetryCount(next); guestAbortRef.current = false; doGuestJoin(next); }}
          onCancel={cancelGuestJoin} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          UI OVERLAY — z-30, ALWAYS ON TOP, pointer-events-none outer wrapper
          Each interactive section has pointer-events-auto
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30, display: 'flex', flexDirection: 'column', transition: 'opacity 0.25s', opacity: uiVisible ? 1 : 0, pointerEvents: uiVisible ? undefined : 'none' }}>

        {/* TOP BAR */}
        <div className="pointer-events-auto flex items-center gap-2 px-3 pt-12 pb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0 rounded-2xl px-2.5 py-1.5"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Avatar url={hostProfile?.avatar_url} name={hostProfile?.username} size={8} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-white font-black text-xs truncate">{hostProfile?.username || 'Host'}</span>
                {hostProfile?.blue_tick && <BlueTick tickId={hostProfile.blue_tick} size={10} />}
              </div>
              <p className="text-gray-400 text-[9px] truncate">{session?.title || 'Live'}</p>
            </div>
            {!isHost && (
              <button onClick={handleFollow}
                className={`px-2.5 py-1 rounded-full text-[10px] font-black flex-shrink-0 ${followed ? 'border border-white/30 text-white' : 'gradient-pink text-white'}`}>
                {followed ? '✓' : '+ Fuata'}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-0.5 items-end flex-shrink-0">
            <div className="flex items-center gap-1.5 rounded-full px-2 py-1"
              style={{ background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {isRecording && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-[10px] font-black">LIVE</span>
              <span className="text-gray-300 text-[9px]">{fmtTime(duration)}</span>
            </div>
            <button onClick={e => { e.stopPropagation(); setShowViewers(true); }} className="flex items-center gap-1 rounded-full px-2 py-0.5"
              style={{ background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Eye className="w-2.5 h-2.5 text-gray-300" />
              <span className={`text-white text-[10px] font-bold transition-all duration-300 ${viewerAnimating ? 'text-green-400 scale-125' : ''}`}
                style={viewerAnimating ? { textShadow: '0 0 8px rgba(74,222,128,0.8)', animation: 'viewerPop 1.2s ease-out' } : {}}>
                {fmtCoins(viewers)}
              </span>
              {viewerAnimating && <span className="text-green-400 text-[9px] font-black" style={{ animation: 'fadeUpQuick 0.8s ease-out forwards' }}>+1</span>}
            </button>
          </div>
          <button onClick={handleRecordClick}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 relative"
            style={{ background: isRecording ? 'rgba(220,38,38,0.85)' : 'rgba(0,0,0,0.65)', border: `1px solid ${isRecording ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.1)'}` }}
            title="Record">
            {isRecording
              ? <StopCircleIcon className="w-4 h-4 text-white" style={{ animation: 'timerPulse 1s ease-in-out infinite' }} />
              : <Circle className="w-4 h-4 text-white" />}
          </button>
          <button onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <MoreVertical className="w-4 h-4 text-white" />
          </button>
          <button onClick={e => { e.stopPropagation(); isHost ? endLive() : navigate(-1); }}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Sub-bar */}
        <div className="pointer-events-auto px-4 flex items-center gap-2 mt-1">
          <NetBars quality={netQuality} />
          <ReactionCounter counts={reactionCounts} />
          {!isHost && !viewerConnected && viewerConnecting && (
            <div className="flex items-center gap-1 ml-2">
              <WifiOff className="w-3 h-3 text-yellow-400 animate-pulse" />
              <span className="text-yellow-400 text-[9px]">Inaunganisha...</span>
            </div>
          )}
          {!isHost && viewerConnected && (
            <div className="flex items-center gap-1 ml-2">
              <Wifi className="w-3 h-3 text-green-400" />
              <span className="text-green-400 text-[9px]">Live</span>
            </div>
          )}
          {topGifters.length > 0 && (
            <button onClick={e => { e.stopPropagation(); setShowLeaderboard(true); }} className="flex items-center gap-1 rounded-full px-2.5 py-0.5 ml-auto"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,215,0,0.3)' }}>
              <Crown className="w-2.5 h-2.5 text-yellow-400" />
              <span className="text-yellow-400 text-[10px] font-bold">{fmtCoins(topGifters[0]?.total || 0)}</span>
            </button>
          )}
          {isHost && reqQueue.length > 0 && (
            <button onClick={e => { e.stopPropagation(); setShowQueuePanel(true); }} className="flex items-center gap-1 rounded-full px-2.5 py-0.5 animate-pulse"
              style={{ background: 'rgba(0,100,255,0.25)', border: '1px solid rgba(0,150,255,0.4)' }}>
              <Users className="w-2.5 h-2.5 text-blue-400" /><span className="text-blue-300 text-[10px] font-bold">{reqQueue.length}</span>
            </button>
          )}
        </div>

        {pinnedComment && (
          <div className="pointer-events-auto mx-3 mt-2 rounded-xl px-3 py-1.5 flex items-center gap-2"
            style={{ background: 'rgba(255,20,147,0.12)', border: '1px solid rgba(255,20,147,0.25)' }}>
            <span className="text-[9px] text-primary">📌</span>
            <p className="text-white text-xs truncate flex-1">{pinnedComment.content}</p>
          </div>
        )}

        <div className="flex-1" />

        {/* Comments */}
        <div className="pointer-events-auto px-3 pb-2" style={{ maxHeight: '26vh', overflowY: 'auto' }}>
          <div className="space-y-1">
            {comments.slice(-18).filter(c => !mutedUsers.includes(c.user_id)).map(c => (
              <div key={c.id} className="flex items-start gap-1.5 group relative">
                <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 mt-0.5">
                  {c.user?.avatar_url
                    ? <img src={c.user.avatar_url} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full gradient-pink flex items-center justify-center text-[7px] text-white font-bold">{c.user?.username?.[0] || '?'}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-[10px] font-black mr-1 ${c.is_moderator_msg ? 'text-yellow-400' : 'text-primary/90'}`}>
                    {c.user?.is_admin ? '👑 ' : ''}{c.user?.username || 'Mtu'}{moderators.includes(c.user_id) ? ' 🛡️' : ''}
                  </span>
                  <span className="text-white/90 text-[11px] leading-snug" style={{ textShadow: '0 1px 4px rgba(0,0,0,1)' }}>{c.content}</span>
                </div>
                {canMod && !c.is_moderator_msg && (
                  <button onClick={e => { e.stopPropagation(); setModMenu(modMenu === c.id ? null : c.id); }} className="opacity-0 group-hover:opacity-100 flex-shrink-0">
                    <MoreVertical className="w-3 h-3 text-gray-400" />
                  </button>
                )}
                {modMenu === c.id && (
                  <div className="absolute right-0 top-5 z-30 min-w-[140px] rounded-xl overflow-hidden shadow-xl"
                    style={{ background: 'rgba(20,5,20,0.98)', border: '1px solid rgba(255,255,255,0.12)' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { supabase.from('live_comments').update({ is_pinned: true }).eq('id', c.id).then(() => { setModMenu(null); loadComments(); }); }} className="flex items-center gap-2 px-3 py-2.5 text-white text-xs w-full hover:bg-white/5">📌 Pin</button>
                    <button onClick={() => { supabase.from('live_comments').update({ is_deleted: true }).eq('id', c.id).then(() => { setModMenu(null); loadComments(); }); }} className="flex items-center gap-2 px-3 py-2.5 text-red-400 text-xs w-full hover:bg-white/5">🗑 Futa</button>
                    <button onClick={() => muteUser(c.user_id)} className="flex items-center gap-2 px-3 py-2.5 text-orange-400 text-xs w-full hover:bg-white/5">🔇 Nyamazisha</button>
                    {isHost && <button onClick={() => makeMod(c.user_id)} className="flex items-center gap-2 px-3 py-2.5 text-blue-400 text-xs w-full hover:bg-white/5">🛡 Msimamizi</button>}
                    {isHost && (
                      <button onClick={async () => {
                        if (!id || !user) return;
                        // Kick user: remove from viewers and send signal
                        await supabase.from('live_viewers').update({ left_at: new Date().toISOString() }).eq('session_id', id).eq('user_id', c.user_id);
                        await supabase.from('live_comments').insert({ session_id: id, user_id: user.id, content: `🚫 @${c.user?.username || 'Mtu'} ameondolewa kwenye live`, is_moderator_msg: true });
                        sendBroadcast({ type: 'kicked', to: c.user_id, from: user.id, sid: id });
                        await supabase.from('notifications').insert({ user_id: c.user_id, title: '🚫 Umeondolewa kwenye Live', message: 'Mwenyeji amekuondoa kwenye live hii', type: 'system' });
                        setModMenu(null);
                        toast.success(`@${c.user?.username} ameondolewa!`);
                        loadComments();
                      }} className="flex items-center gap-2 px-3 py-2.5 text-red-400 text-xs w-full hover:bg-white/5">🚫 Kick (Ondoa)</button>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>
        </div>

        {/* BOTTOM CONTROLS */}
        <div className="pointer-events-auto px-3 pb-6 pt-1">
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {REACTIONS.map(emoji => (
              <button key={emoji} onClick={e => { e.stopPropagation(); sendReaction(emoji); }}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg active:scale-90"
                style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.15)' }}>{emoji}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-full px-3 py-2.5"
              style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.15)' }} onClick={e => e.stopPropagation()}>
              <input value={comment} onChange={e => setComment(e.target.value)}
                placeholder={user ? 'Andika maoni...' : 'Ingia kutoa maoni'}
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/40"
                onKeyDown={e => e.key === 'Enter' && sendComment()}
                onClick={() => !user && navigate('/login')} />
              {comment.trim() && <button onClick={e => { e.stopPropagation(); sendComment(); }}><Send className="w-4 h-4 text-primary" /></button>}
            </div>
            {session?.enable_gifts !== false && (
              <button onClick={e => { e.stopPropagation(); user ? setShowGiftPanel(true) : navigate('/login'); }}
                className="w-11 h-11 rounded-full gradient-pink flex items-center justify-center flex-shrink-0">
                <span className="text-lg">🎁</span>
              </button>
            )}
            <button onClick={e => {
              e.stopPropagation();
              const url = window.location.href;
              if (navigator.share) navigator.share({ title: session?.title || 'Live', url });
              else { navigator.clipboard.writeText(url); toast.success('Link imenakiliwa!'); }
            }} className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <Share2 className="w-4 h-4 text-white" />
            </button>
            <button onClick={e => { e.stopPropagation(); sendReaction('❤️'); }}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <Heart className="w-4 h-4 text-red-400" />
            </button>
          </div>

          {isHost && (
            <div className="flex items-center justify-center gap-3 mt-3">
              <button onClick={e => { e.stopPropagation(); setMicOn(v => !v); }}
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: micOn ? 'rgba(255,255,255,0.18)' : 'rgba(220,38,38,0.8)' }}>
                {micOn ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-white" />}
              </button>
              <button onClick={e => { e.stopPropagation(); setCamOn(v => !v); }}
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: camOn ? 'rgba(255,255,255,0.18)' : 'rgba(220,38,38,0.8)' }}>
                {camOn ? <Camera className="w-5 h-5 text-white" /> : <CameraOff className="w-5 h-5 text-white" />}
              </button>
              <button onClick={e => { e.stopPropagation(); flipCamera(); }} disabled={camFlipping}
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.18)' }}>
                <RotateCcw className={`w-5 h-5 text-white ${camFlipping ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={e => { e.stopPropagation(); endLive(); }}
                className="flex-1 h-12 rounded-full flex items-center justify-center gap-2 font-black text-white text-sm"
                style={{ background: 'rgba(220,38,38,0.85)' }}>
                <X className="w-4 h-4" /> Maliza
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BELL DROPDOWN */}
      {showBell && (
        <div className="absolute top-24 right-4 z-50 w-72 rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'rgba(10,3,15,0.98)', border: '1px solid rgba(255,255,255,0.12)' }} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-white font-bold text-sm flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Arifa</span>
            <button onClick={() => setShowBell(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {bellItems.length === 0
              ? <p className="text-gray-500 text-xs text-center py-6">Hakuna arifa bado</p>
              : bellItems.map((item, i) => (
                <div key={i} className="px-4 py-3 border-b border-white/5">
                  <p className="text-white text-xs">{item.text}</p>
                  <p className="text-gray-600 text-[9px] mt-0.5">{Math.floor((Date.now() - item.time) / 60000)}m iliyopita</p>
                </div>
              ))}
          </div>
          {reqQueue.length > 0 && (
            <button onClick={() => { setShowBell(false); setShowQueuePanel(true); }} className="w-full py-3 text-center text-blue-400 text-xs font-bold border-t border-white/10 hover:bg-white/5">
              Angalia Maombi ({reqQueue.length}) →
            </button>
          )}
        </div>
      )}

      {/* THREE-DOT MENU */}
      {showMenu && (
        <div className="absolute inset-0 z-40" onClick={() => setShowMenu(false)}>
          <div className="absolute top-16 right-4 min-w-[220px] rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'rgba(12,3,18,0.98)', border: '1px solid rgba(255,255,255,0.12)' }} onClick={e => e.stopPropagation()}>
            <div className="px-4 py-2.5 border-b border-white/8"><p className="text-white font-bold text-sm">Menyu</p></div>
            <button onClick={() => { setShowDashboard(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-white text-sm hover:bg-white/5">📊 Dashboard</button>
            <button onClick={() => { setShowBell(v => !v); setBellCount(0); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-white text-sm hover:bg-white/5 relative">
              🔔 Arifa {bellCount > 0 && <span className="ml-auto bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{bellCount}</span>}
            </button>
            <button onClick={() => { setShowViewers(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-white text-sm hover:bg-white/5">👁 Watazamaji ({viewers})</button>
            <button onClick={() => { setShowLeaderboard(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-white text-sm hover:bg-white/5">🏆 Top Gifters</button>
            <div className="border-t border-white/8" />
            <button onClick={() => { setShowMenu(false); handleRecordClick({ stopPropagation: () => {} } as any); }} className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 ${isRecording ? 'text-red-400' : 'text-white'}`}>
              {isRecording ? '⏹ Simamisha Recording' : '🔴 Anza Recording'}
            </button>
            {canRequestCoHost && (
              <>
                <div className="border-t border-white/8" />
                <button onClick={sendCoHostRequest}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5"
                  style={{ color: reqSent ? '#6b7280' : '#93c5fd' }}>
                  <UserPlus className="w-4 h-4" />
                  {reqSent ? '⏳ Inasubiri mwenyeji...' : 'Omba Kujiunga Live'}
                </button>
              </>
            )}
            {isHost && (
              <>
                <div className="border-t border-white/8" />
                {reqQueue.length > 0 && (
                  <button onClick={() => { setShowQueuePanel(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-blue-300 text-sm hover:bg-white/5">
                    👥 Maombi ya Kujiunga ({reqQueue.length})
                  </button>
                )}
                <div className="border-t border-white/8" />
                <button onClick={() => { setShowMenu(false); endLive(); }} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 text-sm hover:bg-red-500/10">
                  ✕ Maliza Live
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showLeaderboard && (
        <div className="absolute inset-0 z-40" onClick={() => setShowLeaderboard(false)}>
          <div onClick={e => e.stopPropagation()}>
            <LeaderboardPanel gifters={topGifters} onClose={() => setShowLeaderboard(false)} />
          </div>
        </div>
      )}

      {showGiftPanel && (
        <GiftPanel selGift={selGift} setSelGift={setSelGift} onSend={sendGift} onClose={() => setShowGiftPanel(false)}
          battle={battle} giftTarget={giftTarget} setGiftTarget={setGiftTarget}
          hostName={hostProfile?.username} opponentName={battle?.opponentName} />
      )}

      {showViewers && (
        <ViewersPanel viewers={viewers} viewerList={viewerList} onClose={() => setShowViewers(false)}
          isHost={isHost} userId={user?.id} sessionId={id} sendSig={sendBroadcast} setGuests={setGuests} muteUser={muteUser} />
      )}

      {/* BANNED MODAL - Full screen blocking when user is banned */}
      {showBannedModal && (
        <div className="absolute inset-0 z-[60] flex flex-col" style={{ background: 'rgba(0,0,0,0.97)' }} onClick={e => e.stopPropagation()}>
          {/* Red top gradient bar */}
          <div className="h-1.5 w-full flex-shrink-0" style={{ background: 'linear-gradient(90deg,#dc2626,#ef4444,#dc2626)' }} />
          <div className="flex-1 flex items-center justify-center px-5">
            <div className="w-full max-w-sm">
              {/* Icon */}
              <div className="text-center mb-6">
                <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-500/40" style={{ background: 'rgba(220,38,38,0.12)' }}>
                  <span className="text-5xl">🚫</span>
                </div>
                <h2 className="text-white font-black text-2xl mb-2">Umezuiwa kutumia Live</h2>
                <p className="text-gray-400 text-sm leading-relaxed">Akaunti yako imezuiwa na Msimamizi. Huwezi kutazama, kuandika maoni, kutuma zawadi, wala kuanza live mpaka uwasiliane na Admin.</p>
              </div>
              {/* Info card */}
              <div className="rounded-2xl p-4 mb-5" style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.22)' }}>
                <p className="text-red-400 font-semibold text-sm text-center">Wasiliana na Admin kupitia njia moja ya chini ili kujua sababu na kupata ufumbuzi</p>
              </div>
              {/* Action buttons */}
              <div className="space-y-3">
                <button onClick={() => {
                  const num = (adminWhatsApp || '255655299602').replace(/\D/g,'');
                  window.open(`https://wa.me/${num}?text=${encodeURIComponent('Habari Admin, ninaomba kujua sababu ya kuzuiwa Live na naomba ufumbuzi.')}`, '_blank');
                }}
                  className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-3 active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', boxShadow: '0 4px 20px rgba(22,163,74,0.35)' }}>
                  <span className="text-xl">📱</span>
                  WhatsApp ya Admin
                </button>
                {adminUserId && (
                  <button onClick={() => { setShowBannedModal(false); navigate(`/chat/${adminUserId}`); }}
                    className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-3 active:scale-95 transition-transform"
                    style={{ background: 'linear-gradient(135deg, #FF1493, #C2185B)', boxShadow: '0 4px 20px rgba(255,20,147,0.35)' }}>
                    <span className="text-xl">💬</span>
                    Tuma Ujumbe Inbox
                  </button>
                )}
                {/* Show placeholder inbox button while admin info loads */}
                {!adminUserId && (
                  <button onClick={() => navigate('/chat')}
                    className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-3 active:scale-95 transition-transform"
                    style={{ background: 'linear-gradient(135deg, #FF1493, #C2185B)', boxShadow: '0 4px 20px rgba(255,20,147,0.35)' }}>
                    <span className="text-xl">💬</span>
                    Tuma Ujumbe Inbox
                  </button>
                )}
                <button onClick={() => navigate(-1)}
                  className="w-full py-3.5 rounded-2xl font-semibold text-gray-400 text-sm"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  ← Rudi Nyuma
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showVipRecordModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.92)' }} onClick={e => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-3xl border border-yellow-500/30 overflow-hidden" style={{ background: 'rgba(10,3,15,0.98)', maxHeight: '88vh', overflowY: 'auto' }}>
            {/* Header */}
            <div className="p-5 text-center border-b border-yellow-500/20" style={{ background: 'linear-gradient(135deg,rgba(234,179,8,0.15),rgba(245,158,11,0.1))' }}>
              <div className="w-16 h-16 rounded-full bg-yellow-500/20 border-2 border-yellow-500/40 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">👑</span>
              </div>
              <p className="text-white font-black text-xl">VIP Inahitajika</p>
              <p className="text-gray-400 text-sm mt-1">Jiunge na VIP kupata uwezo wa kurekodi live, kupakua replay, na faida nyingi zaidi!</p>
            </div>
            {/* VIP Plans */}
            <div className="p-4 space-y-2">
              {loadingVipPlans ? (
                <div className="flex justify-center py-6"><div className="w-7 h-7 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : vipPlans.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Hakuna mipango ya VIP sasa hivi</p>
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
                    <p className="text-yellow-400/70 text-xs">{plan.duration_days} siku · Rekodi, Download & Zaidi</p>
                  </div>
                  <p className="text-yellow-400 font-black text-base flex-shrink-0">TZS {Number(plan.price).toLocaleString()}</p>
                </button>
              ))}
            </div>
            <div className="px-4 pb-4">
              <button onClick={() => setShowVipRecordModal(false)} className="w-full py-3 rounded-2xl border border-white/15 text-gray-400 text-sm">Funga</button>
            </div>
          </div>
        </div>
      )}

      {showQueuePanel && isHost && (
        <QueuePanel reqQueue={reqQueue}
          onAccept={acceptCoHost}
          onDecline={req => setReqQueue(prev => prev.filter(r => r.userId !== req.userId))}
          onClose={() => setShowQueuePanel(false)} />
      )}

      {showDashboard && (
        <div className="absolute inset-x-0 bottom-0 z-40 rounded-t-3xl"
          style={{ maxHeight: '78vh', display: 'flex', flexDirection: 'column', background: 'rgba(10,3,15,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none' }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
            <span className="text-white font-black text-lg">Dashboard</span>
            <button onClick={() => setShowDashboard(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Watazamaji', v: viewers, e: '👁' }, { label: 'Peak', v: peakViewers, e: '📈' },
                { label: 'Likes', v: likeCount, e: '❤️' }, { label: 'Maoni', v: commentCount, e: '💬' },
                { label: 'Muda (min)', v: Math.floor(duration / 60), e: '⏱️' }, { label: 'Ada Leo (TZS)', v: totalEntryEarned, e: '💰' },
              ].map(stat => (
                <div key={stat.label} className="rounded-2xl p-3 border border-white/5" style={{ background: 'rgba(26,10,42,0.8)' }}>
                  <span className="text-xl">{stat.e}</span>
                  <p className="text-white font-black text-xl mt-1">{fmtCoins(stat.v)}</p>
                  <p className="text-gray-500 text-[10px]">{stat.label}</p>
                </div>
              ))}
            </div>
            {isHost && (
              <button onClick={() => { setShowDashboard(false); toggleRecord(); }}
                className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
                style={{ background: isRecording ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isRecording ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`, color: isRecording ? '#f87171' : '#fff' }}>
                {isRecording ? '⏹ Simamisha Recording' : '🔴 Anza Recording'}
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes liveFloatUp { 0%{transform:translateY(0) scale(1);opacity:1} 100%{transform:translateY(-200px) scale(0.3);opacity:0} }
        @keyframes liveGiftPop { 0%{opacity:0;transform:translateX(-50%) scale(0.2)} 20%{opacity:1;transform:translateX(-50%) scale(1.08)} 80%{opacity:1;transform:translateX(-50%) scale(1)} 100%{opacity:0;transform:translateX(-50%) scale(0.7)} }
        @keyframes confettiFall { 0%{transform:translateY(-20px) rotate(0deg);opacity:1} 100%{transform:translateY(110vh) rotate(720deg);opacity:0} }
        @keyframes timerPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes viewerPop { 0%{color:#4ade80;transform:scale(1.4)} 60%{color:#4ade80;transform:scale(1.1)} 100%{color:#fff;transform:scale(1)} }
        @keyframes fadeUpQuick { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-12px)} }
        @keyframes bounceIn { 0%{transform:scale(0)} 50%{transform:scale(1.3)} 100%{transform:scale(1)} }
        @keyframes speakPulse { 0%,100%{opacity:0.7;box-shadow:0 0 8px currentColor} 50%{opacity:1;box-shadow:0 0 24px currentColor} }
      `}</style>
    </div>
  );
}
