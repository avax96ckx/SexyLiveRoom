import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { UserProfile, Message } from '@/types';
import BlueTick from '@/components/features/BlueTick';
import { ArrowLeft, Send, ImageIcon, Mic, MicOff, Phone, PhoneOff, Video, Trash2, X, Reply, Bookmark, Eye, ShieldCheck, Gift } from 'lucide-react';

import { toast } from 'sonner';
import { PlanPickerModal } from '@/pages/Services';
import { useMediaViewer } from '@/components/features/GlobalMediaViewer';

function ChatAudioPlayer({ url, isOwn }: { url: string; isOwn?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audio.src = url;
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => { if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration); };
    audio.ondurationchange = () => { if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration); };
    audio.ontimeupdate = () => {
      if (audio.duration > 0 && isFinite(audio.duration)) {
        setCurrentTime(audio.currentTime);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    audio.onended = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ''; audioRef.current = null; };
  }, [url]);

  const fmt = (s: number) => isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}` : '0:00';
  const bars = Array.from({ length: 28 });
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * audio.duration;
  };
  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); }
    else { if (audio.readyState < 1) audio.load(); audio.play().catch(() => toast.error('Haiwezekani kucheza sauti')); }
  };
  // Use bubble_sent_from color from settings for play button; fallback to #FF1493
  const sentFrom = (() => { try { const c = JSON.parse(localStorage.getItem('slr_settings_cache') || '{}'); return c.bubble_sent_from || '#FF1493'; } catch { return '#FF1493'; } })();
  const progressColor = isOwn ? 'rgba(255,255,255,0.9)' : sentFrom;
  const trackColor = isOwn ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.22)';
  return (
    <div className="flex items-center gap-2 py-1.5 px-2" style={{ minWidth: '185px', maxWidth: '245px' }}>
      <button onClick={togglePlay} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: isOwn ? 'rgba(255,255,255,0.25)' : `linear-gradient(135deg,${sentFrom},${sentFrom}cc)`, minWidth: '32px' }}>
        {playing ? <div className="flex gap-0.5"><div className="w-0.5 h-3 bg-white rounded-sm" /><div className="w-0.5 h-3 bg-white rounded-sm" /></div>
          : <div className="w-0 h-0 border-l-[8px] border-l-white border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <div className="flex items-end gap-px cursor-pointer" style={{ height: '20px' }} onClick={handleSeek}>
          {bars.map((_, i) => (
            <div key={i} className="flex-1 rounded-full" style={{ height: `${20 + Math.abs(Math.sin(i * 0.6 + 0.5)) * 80}%`, minHeight: '2px', background: (i / bars.length * 100) <= progress ? progressColor : trackColor, transition: 'background 0.08s' }} />
          ))}
        </div>
        <div className="flex justify-between">
          <span className="text-white/55 text-[9px]">{fmt(currentTime)}</span>
          <span className="text-white/55 text-[9px]">{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}

// Simplified in-app WebRTC call overlay for Messenger
function MessengerCallOverlay({ targetUser, myProfile, isVideo, onEnd }: { targetUser: UserProfile; myProfile: any; isVideo: boolean; onEnd: () => void }) {
  const [status, setStatus] = useState<'calling'|'connected'|'ended'>('calling');
  const [callTime, setCallTime] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelIdRef = useRef('');
  const processedSignals = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const statusRef = useRef(status);
  statusRef.current = status;

  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }] };

  useEffect(() => {
    initCall();
    const poll = setInterval(pollSignaling, 1500);
    return () => { clearInterval(poll); cleanup(); };
  }, []);

  useEffect(() => {
    if (status === 'connected') timerRef.current = setInterval(() => setCallTime(t => t + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  async function initCall() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo ? { width: 640, height: 480 } : false });
      localStreamRef.current = stream;
      if (localVideoRef.current && isVideo) { localVideoRef.current.srcObject = stream; localVideoRef.current.muted = true; await localVideoRef.current.play().catch(() => {}); }
      const pc = new RTCPeerConnection(ICE); pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const remoteStream = new MediaStream();
      pc.ontrack = async (e) => {
        remoteStream.addTrack(e.track);
        if (e.track.kind === 'audio' && remoteAudioRef.current) { remoteAudioRef.current.srcObject = remoteStream; await remoteAudioRef.current.play().catch(() => {}); setStatus('connected'); }
        if (e.track.kind === 'video' && remoteVideoRef.current) { remoteVideoRef.current.srcObject = remoteStream; await remoteVideoRef.current.play().catch(() => {}); setStatus('connected'); }
      };
      pc.onicecandidate = async (e) => { if (e.candidate) await supabase.from('room_messages').insert({ user_id: myProfile.id, content: JSON.stringify({ type: 'ice', candidate: e.candidate.toJSON(), channel: channelIdRef.current }), media_type: 'signal' }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') setStatus('connected'); if (['failed','closed'].includes(pc.connectionState)) { if (statusRef.current !== 'ended') { cleanup(); onEnd(); } } };
      channelIdRef.current = `call_${myProfile.id}_${targetUser.id}_${Date.now()}`;
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: isVideo });
      await pc.setLocalDescription(offer);
      await supabase.from('room_messages').insert({ user_id: myProfile.id, content: JSON.stringify({ type: 'offer', sdp: offer, channel: channelIdRef.current, caller: myProfile.username, callerAvatar: myProfile.avatar_url, isVideo, targetUserId: targetUser.id }), media_type: 'signal' });
      await supabase.from('notifications').insert({ user_id: targetUser.id, title: `📞 ${myProfile.username} anakupigia simu`, message: isVideo ? 'Video call inaingia' : 'Simu inaingia', type: 'call', link: `/profile/${myProfile.id}` });
    } catch (err: any) { toast.error('Imeshindwa: ' + err.message); onEnd(); }
  }

  async function pollSignaling() {
    if (!pcRef.current || statusRef.current === 'ended') return;
    const since = new Date(Date.now() - 8000).toISOString();
    const { data } = await supabase.from('room_messages').select('*').eq('media_type', 'signal').eq('user_id', targetUser.id).gte('created_at', since).order('created_at');
    for (const msg of (data || [])) {
      if (processedSignals.current.has(msg.id)) continue;
      try {
        const sig = JSON.parse(msg.content || '');
        if (!channelIdRef.current || !(sig.channel === channelIdRef.current || (sig.channel?.includes(myProfile.id) && sig.channel?.includes(targetUser.id)))) continue;
        processedSignals.current.add(msg.id);
        if (sig.type === 'answer' && pcRef.current?.signalingState === 'have-local-offer' && !pcRef.current?.remoteDescription) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(sig.sdp));
          for (const c of pendingCandidates.current) { try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
          pendingCandidates.current = []; setStatus('connected');
        } else if (sig.type === 'ice') {
          if (pcRef.current?.remoteDescription) { try { await pcRef.current.addIceCandidate(new RTCIceCandidate(sig.candidate)); } catch {} }
          else pendingCandidates.current.push(sig.candidate);
        } else if (sig.type === 'end') { cleanup(); onEnd(); }
      } catch {}
    }
  }

  function cleanup() { localStreamRef.current?.getTracks().forEach(t => t.stop()); pcRef.current?.close(); pcRef.current = null; }

  async function endCall() {
    setStatus('ended');
    if (channelIdRef.current) await supabase.from('room_messages').insert({ user_id: myProfile.id, content: JSON.stringify({ type: 'end', channel: channelIdRef.current }), media_type: 'signal' }).catch(() => {});
    cleanup(); onEnd();
  }

  const fmt = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
      {isVideo && status === 'connected' && <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />}
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: isVideo && status === 'connected' ? 'transparent' : 'linear-gradient(135deg,#0a030f,#1a0a2a)' }}>
        {(!isVideo || status !== 'connected') && (
          <>
            <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-primary mb-5">
              {targetUser.avatar_url ? <img src={targetUser.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-black text-4xl">{targetUser.username?.[0]?.toUpperCase()}</span></div>}
            </div>
            <p className="text-white font-black text-2xl mb-2">{targetUser.username}</p>
            <p className="text-gray-300">{status === 'calling' ? '🔔 Inapiga...' : status === 'connected' ? `✅ ${fmt(callTime)}` : '📵 Imeisha'}</p>
            {status === 'connected' && <div className="mt-3 flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full"><div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /><span className="text-white text-sm">{fmt(callTime)}</span></div>}
          </>
        )}
        {isVideo && <video ref={localVideoRef} autoPlay muted playsInline className="absolute bottom-24 right-4 w-24 h-32 object-cover rounded-2xl border-2 border-white/40" />}
      </div>
      <div className="absolute bottom-0 left-0 right-0 pb-12 pt-4 flex items-center justify-center gap-6" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}>
        <button onClick={() => { const t = localStreamRef.current?.getAudioTracks()[0]; if (t) t.enabled = !t.enabled; setMicMuted(m => !m); }}
          className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: micMuted ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.2)' }}>
          {micMuted ? <MicOff className="w-5 h-5 text-white/50" /> : <Mic className="w-5 h-5 text-white" />}
        </button>
        <button onClick={endCall} className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center" style={{ boxShadow: '0 0 24px rgba(220,38,38,0.8)' }}>
          <PhoneOff className="w-6 h-6 text-white" />
        </button>
      </div>
    </div>
  );
}

function MessageMediaGrid({ urls, type, thumbUrl, onOpen }: { urls: string[]; type: string; thumbUrl?: string; onOpen: (url: string, t: string) => void }) {
  const count = urls.length;
  if (count === 0) return null;
  const isVideoUrl = (url: string) => type === 'video' || /\.(mp4|webm|mov)/i.test(url) || url.includes('video');
  const Thumb = ({ url, style }: { url: string; style: React.CSSProperties }) => (
    <div className="relative overflow-hidden cursor-pointer flex-shrink-0" style={style} onClick={() => onOpen(url, isVideoUrl(url) ? 'video' : 'image')}>
      {isVideoUrl(url) ? (
        <>{thumbUrl ? <img src={thumbUrl} alt="" className="w-full h-full" style={{ objectFit: 'cover', objectPosition: 'top' }} /> : <div className="w-full h-full bg-[#1a0a1a] flex items-center justify-center"><div className="w-0 h-0 border-l-[18px] border-l-white border-t-[12px] border-t-transparent border-b-[12px] border-b-transparent ml-1.5 opacity-30" /></div>}
          <div className="absolute inset-0 flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center"><div className="w-0 h-0 border-l-[14px] border-l-white border-t-[9px] border-t-transparent border-b-[9px] border-b-transparent ml-1" /></div></div></>
      ) : <img src={url} alt="" className="w-full h-full" style={{ objectFit: 'cover', objectPosition: 'top' }} />}
    </div>
  );
  const H1 = 420; const HG = 260; const halfH = Math.floor(HG / 2);
  if (count === 1) return <Thumb url={urls[0]} style={{ width: '100%', height: `${H1}px`, borderRadius: '14px', display: 'block' }} />;
  if (count === 2) return <div className="flex gap-0.5 rounded-xl overflow-hidden" style={{ height: `${HG}px` }}><Thumb url={urls[0]} style={{ flex: 1, height: '100%' }} /><Thumb url={urls[1]} style={{ flex: 1, height: '100%' }} /></div>;
  if (count === 3) return <div className="flex gap-0.5 rounded-xl overflow-hidden" style={{ height: `${HG}px` }}><Thumb url={urls[0]} style={{ flex: '1.2', height: '100%' }} /><div className="flex flex-col gap-0.5" style={{ flex: '0.8' }}><Thumb url={urls[1]} style={{ width: '100%', height: `${halfH}px` }} /><Thumb url={urls[2]} style={{ width: '100%', height: `${halfH}px` }} /></div></div>;
  return <div className="flex flex-col gap-0.5 rounded-xl overflow-hidden" style={{ height: `${HG}px` }}><div className="flex gap-0.5" style={{ height: `${halfH}px` }}><Thumb url={urls[0]} style={{ flex: 1, height: '100%' }} /><Thumb url={urls[1]} style={{ flex: 1, height: '100%' }} /></div><div className="flex gap-0.5" style={{ height: `${halfH}px` }}><Thumb url={urls[2]} style={{ flex: 1, height: '100%' }} /><div className="relative flex-1" style={{ height: '100%' }}><Thumb url={urls[3]} style={{ width: '100%', height: '100%' }} />{count > 4 && <div className="absolute inset-0 bg-black/65 flex items-center justify-center" onClick={() => onOpen(urls[3], 'image')}><span className="text-white font-black text-xl">+{count - 4}</span></div>}</div></div></div>;
}

function PreviewGrid({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  const [videoThumbs, setVideoThumbs] = useState<Record<number, string>>({});

  useEffect(() => {
    files.forEach((f, i) => {
      if (f.type.startsWith('video') && !videoThumbs[i]) {
        const url = URL.createObjectURL(f);
        const video = document.createElement('video');
        video.src = url; video.muted = true; video.playsInline = true; video.currentTime = 0.5;
        video.onloadeddata = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 320; canvas.height = 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            setVideoThumbs(prev => ({ ...prev, [i]: canvas.toDataURL('image/jpeg', 0.7) }));
          }
          URL.revokeObjectURL(url);
        };
        video.onerror = () => URL.revokeObjectURL(url);
        video.load();
      }
    });
  }, [files.length]);

  if (!files.length) return null;
  const count = files.length;

  const Thumb = ({ f, i }: { f: File; i: number }) => (
    <div className="relative overflow-hidden rounded-xl w-full h-full">
      {f.type.startsWith('image') ? (
        <img src={URL.createObjectURL(f)} alt="" className="w-full h-full" style={{ objectFit: 'cover', objectPosition: 'top' }} />
      ) : videoThumbs[i] ? (
        <div className="relative w-full h-full">
          <img src={videoThumbs[i]} alt="" className="w-full h-full" style={{ objectFit: 'cover', objectPosition: 'top' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
              <div className="w-0 h-0 border-l-[8px] border-l-white border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent ml-0.5" />
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full h-full bg-[#1a0a1a] flex flex-col items-center justify-center gap-1">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-primary rounded-full animate-spin" />
          <span className="text-gray-400 text-[10px]">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
        </div>
      )}
      <button onClick={() => onRemove(i)} className="absolute top-0.5 right-0.5 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center z-10"><X className="w-3 h-3 text-white" /></button>
    </div>
  );

  const gridH = count >= 3 ? '180px' : count === 2 ? '140px' : '200px';
  return (
    <div className="px-3 py-2" style={{ background: 'rgba(8,3,12,0.95)' }}>
      <div className="overflow-hidden rounded-xl" style={{ maxWidth: '280px', height: gridH }}>
        {count === 1 ? <Thumb f={files[0]} i={0} /> : count === 3 ? (
          <div className="flex gap-0.5 h-full"><div style={{ flex: '1.2' }}><Thumb f={files[0]} i={0} /></div><div className="flex flex-col gap-0.5" style={{ flex: '0.8' }}><div className="flex-1"><Thumb f={files[1]} i={1} /></div><div className="flex-1"><Thumb f={files[2]} i={2} /></div></div></div>
        ) : (
          <div className={`grid gap-0.5 h-full ${count === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
            {files.slice(0, 4).map((f, i) => (<div key={i} className="relative h-full"><Thumb f={f} i={i} />{count > 4 && i === 3 && <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl z-10"><span className="text-white font-black text-xl">+{count - 4}</span></div>}</div>))}
          </div>
        )}
      </div>
      <p className="text-gray-500 text-[10px] mt-1">{count} faili • {(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB</p>
    </div>
  );
}

// Send Gift Modal for Messenger
function SendGiftModal({ otherUser, profile, onClose, onSuccess }: { otherUser: UserProfile; profile: any; onClose: () => void; onSuccess: () => void }) {
  const DEFAULT_GIFTS = [
    { emoji: '🌹', name: 'Waridi', amount: 100 },
    { emoji: '💐', name: 'Maua', amount: 200 },
    { emoji: '🍫', name: 'Chokoleti', amount: 500 },
    { emoji: '💍', name: 'Pete', amount: 1000 },
    { emoji: '🧸', name: 'Teddy', amount: 2000 },
    { emoji: '💎', name: 'Almasi', amount: 5000 },
    { emoji: '🏆', name: 'Trophy', amount: 10000 },
    { emoji: '🚗', name: 'Gari', amount: 50000 },
  ];
  const [GIFT_OPTIONS, setGIFT_OPTIONS] = useState(DEFAULT_GIFTS);
  const [selected, setSelected] = useState<typeof DEFAULT_GIFTS[0] | null>(null);
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'gift_options').single().then(({ data }) => {
      if (data?.value) { try { setGIFT_OPTIONS(JSON.parse(data.value)); } catch {} }
    });
  }, []);
  const [walletPass, setWalletPass] = useState('');
  const [sending, setSending] = useState(false);
  const { user, refreshProfile } = useAuth();
  const giftBal = (profile as any)?.gift_balance || 0;
  const mainBal = (profile as any)?.balance || 0;

  async function handleSend() {
    if (!selected || !user || !otherUser) return;
    const amt = selected.amount;
    const canUseGift = giftBal >= amt;
    if (!canUseGift && mainBal < amt) return toast.error(`Salio halitooshi. Unahitaji TZS ${amt.toLocaleString()}`);
    if (profile?.wallet_password && walletPass !== profile.wallet_password) return toast.error('Password ya wallet si sahihi!');
    setSending(true);
    try {
      if (canUseGift) {
        await supabase.from('user_profiles').update({ gift_balance: giftBal - amt }).eq('id', user.id);
      } else {
        await supabase.from('user_profiles').update({ balance: mainBal - amt }).eq('id', user.id);
      }
      const { data: recvProf } = await supabase.from('user_profiles').select('gift_balance').eq('id', otherUser.id).single();
      await supabase.from('user_profiles').update({ gift_balance: ((recvProf as any)?.gift_balance || 0) + amt }).eq('id', otherUser.id);
      await supabase.from('messages').insert({
        sender_id: user.id, receiver_id: otherUser.id,
        content: `${selected.emoji} Nimetuma zawadi ya **${selected.name}** (TZS ${amt.toLocaleString()})`,
      });
      await supabase.from('notifications').insert({
        user_id: otherUser.id, title: `🎁 Umepata Zawadi!`,
        message: `${profile?.username} amekutumia ${selected.emoji} ${selected.name} - TZS ${amt.toLocaleString()} (Messenger)!`,
        type: 'gift', link: '/wallet?tab=gifts',
      });
      await supabase.from('notifications').insert({
        user_id: user.id, title: `🎁 Zawadi Imetumwa`,
        message: `Umetuma ${selected.emoji} ${selected.name} kwa ${otherUser.username} - TZS ${amt.toLocaleString()} (Messenger)`,
        type: 'gift', link: '/wallet?tab=gifts',
      });
      // Transactions with clear sender/source format
      await supabase.from('transactions').insert({ user_id: otherUser.id, amount: amt, type: 'gift_received', status: 'approved', description: `Zawadi ${selected.emoji} ${selected.name} | Kutoka: ${profile?.username} | Chanzo: Messenger` });
      await supabase.from('transactions').insert({ user_id: user.id, amount: amt, type: 'gift_sent', status: 'approved', description: `Zawadi ${selected.emoji} ${selected.name} | Kwa: ${otherUser.username} | Chanzo: Messenger` });
      if (refreshProfile) await refreshProfile();
      toast.success(`🎁 ${selected.emoji} Zawadi ya TZS ${amt.toLocaleString()} imetumwa!`);
      onSuccess();
    } catch { toast.error('Hitilafu ya kutuma zawadi'); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-5 slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-3">
          <h3 className="text-white font-bold flex items-center gap-2"><Gift className="w-5 h-5 text-orange-400" /> Tuma Zawadi kwa {otherUser.username}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {GIFT_OPTIONS.map(g => (
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
            <div className="bg-[#1a0a1a] rounded-xl p-3 flex justify-between items-center">
              <span className="text-gray-400 text-sm">Zawadi: {selected.emoji} {selected.name}</span>
              <span className="text-primary font-bold">TZS {selected.amount.toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#1a0a1a] rounded-lg p-2 text-center">
                <p className="text-gray-500">Zawadi</p>
                <p className="text-orange-400 font-bold">TZS {giftBal.toLocaleString()}</p>
              </div>
              <div className="bg-[#1a0a1a] rounded-lg p-2 text-center">
                <p className="text-gray-500">Salio Kuu</p>
                <p className="text-green-400 font-bold">TZS {mainBal.toLocaleString()}</p>
              </div>
            </div>
            {profile?.wallet_password && (
              <input value={walletPass} onChange={e => setWalletPass(e.target.value)} placeholder="Password ya wallet" type="password" className="input-field text-sm" />
            )}
            <button onClick={handleSend} disabled={sending || (!profile?.wallet_password ? false : !walletPass)} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>{selected.emoji}</span>}
              {sending ? 'Inatuma...' : `Tuma ${selected.emoji} ${selected.name} - TZS ${selected.amount.toLocaleString()}`}
            </button>
            <p className="text-gray-600 text-xs text-center">Pesa zitatoka: {giftBal >= selected.amount ? '🎁 Zawadi' : '💰 Salio Kuu'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function playSound(url?: string) {
  if (!url) return;
  try { const a = new Audio(url.split('?')[0] + '?t=' + Date.now()); a.volume = 0.8; a.play().catch(() => {}); } catch {}
}

function MessageText({ content, onNavigate }: { content: string; onNavigate: (userId: string) => void }) {
  const parts = content.split(/(@[\w_.]+)/g);
  return (
    <p className="text-white px-2 py-0.5 leading-snug" style={{ fontSize: 'inherit' }}>
      {parts.map((part, i) => {
        if (/^@[\w_.]+$/.test(part)) {
          return (
            <span key={i} className="text-blue-400 font-semibold cursor-pointer hover:underline"
              onClick={async (e) => {
                e.stopPropagation();
                const handle = part.slice(1);
                const { data } = await supabase.from('user_profiles').select('id').or(`username_handle.eq.${handle},username.eq.${handle}`).maybeSingle();
                if (data?.id) onNavigate(data.id);
                else toast.info(`Mtumiaji @${handle} hajapatikana`);
              }}>
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

export default function ChatDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetMsgId = searchParams.get('msg');
  const { user, profile, isAdmin } = useAuth() as any;
  const { openMedia } = useMediaViewer();
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showOptions, setShowOptions] = useState<string | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastCount, setLastCount] = useState(0);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [swipedMsgId, setSwipedMsgId] = useState<string | null>(null);
  const [isOtherOnline, setIsOtherOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedByOther, setBlockedByOther] = useState(false);
  const [viewOnce, setViewOnce] = useState(false);
  const [openedViewOnce, setOpenedViewOnce] = useState<Set<string>>(new Set());
  const [showSendGift, setShowSendGift] = useState(false);
  const [showContactOptions, setShowContactOptions] = useState(false);
  const [activeCall, setActiveCall] = useState<{type:'audio'|'video'} | null>(null);

  const autoReplyCalled = useRef(false);
  const lastTypingSent = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const swipeStartX = useRef<Record<string, number>>({});
  const swipeStartY = useRef<Record<string, number>>({});
  const settingsRef = useRef<any>({});
  const playedMsgIds = useRef<Set<string>>(new Set());
  const onlineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPrivileged = profile?.is_vip || profile?.is_business || profile?.is_admin;
  // Allow regular member to chat with admin/business freely
  // AND allow them to READ/REPLY to existing threads from admin/business
  const targetIsAdminOrBusiness = (otherUser?.is_admin ?? false) || (otherUser?.is_business ?? false);
  const canSendToThisUser = isPrivileged || targetIsAdminOrBusiness;

  useEffect(() => {
    if (!user || !userId) { navigate('/chat'); return; }
    fetchOtherUser();
    fetchMessages();
    fetchSettings();
    checkBlocks();
    registerSession();

    // Listen for admin settings updates (bubble colors, fonts, etc.) in real-time
    const settingsListener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      setSettings(prev => ({ ...prev, ...detail }));
      settingsRef.current = { ...settingsRef.current, ...detail };
    };
    window.addEventListener('app-settings-updated', settingsListener);

    const msgInterval = setInterval(() => { fetchMessages(); }, 2000);
    const onlineCheckInterval = setInterval(() => { checkOtherOnlineStatus(); }, 4000);

    const updateMyOnline = () => {
      if (document.hidden) return;
      const now = new Date().toISOString();
      try { localStorage.setItem('slr_last_seen_' + user.id, now); } catch {}
      supabase.from('user_profiles').update({ is_online: true, last_seen: now }).eq('id', user.id);
    };
    updateMyOnline();
    onlineIntervalRef.current = setInterval(updateMyOnline, 8000);

    const handleVisibility = () => {
      const now = new Date().toISOString();
      const online = !document.hidden;
      try { if (online) localStorage.setItem('slr_last_seen_' + user.id, now); } catch {}
      supabase.from('user_profiles').update({ is_online: online, last_seen: now }).eq('id', user.id);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const handleFocus = () => { supabase.from('user_profiles').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', user.id); };
    const handleBlur = () => { supabase.from('user_profiles').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', user.id); };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      clearInterval(msgInterval);
      clearInterval(onlineCheckInterval);
      if (onlineIntervalRef.current) clearInterval(onlineIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('app-settings-updated', settingsListener);
      supabase.from('user_profiles').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', user.id);
    };
  }, [userId, user?.id]);

  async function registerSession() {
    if (!user) return;
    const deviceName = navigator.userAgent.includes('Mobile') ? 'Mobile Browser' : 'Desktop Browser';
    const deviceType = navigator.userAgent.includes('Mobile') ? 'mobile' : 'browser';
    const sessionKey = `slr_session_${user.id}`;
    let sessionId = '';
    try { sessionId = localStorage.getItem(sessionKey) || ''; } catch {}
    if (sessionId) {
      await supabase.from('user_sessions').update({ last_active: new Date().toISOString(), is_active: true }).eq('id', sessionId);
    } else {
      const { data } = await supabase.from('user_sessions').insert({
        user_id: user.id, device_name: deviceName, device_type: deviceType,
        is_active: true, last_active: new Date().toISOString(),
      }).select('id').single();
      if (data?.id) { try { localStorage.setItem(sessionKey, data.id); } catch {} }
    }
  }

  useEffect(() => {
    if (targetMsgId && messages.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`msg-${targetMsgId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.background = 'rgba(255,20,147,0.18)';
          el.style.borderRadius = '12px';
          setTimeout(() => { el.style.background = ''; }, 2800);
        }
      }, 600);
    } else if (!targetMsgId) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, targetMsgId]);

  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*');
    const m: any = {}; data?.forEach((r: any) => { m[r.key] = r.value; });
    setSettings(m); settingsRef.current = m;
  }

  function formatLastSeen(ts: string | null): string {
    if (!ts) return 'Offline';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Alionekana sasa hivi';
    if (mins < 60) return `Alionekana dakika ${mins} zilizopita`;
    if (hours < 24) return `Alionekana masaa ${hours} yaliyopita`;
    if (days === 1) return 'Alionekana jana';
    return `Alionekana siku ${days} zilizopita`;
  }

  async function fetchOtherUser() {
    try {
      const { data } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
      if (data) {
        setOtherUser(data as UserProfile);
        const diff = data.last_seen ? Date.now() - new Date(data.last_seen).getTime() : 999999;
        const onl = !!data.is_online && diff < 30000;
        setIsOtherOnline(onl);
        setLastSeen(onl ? null : (data.last_seen || null));
      }
    } catch (err) { console.error('fetchOtherUser error:', err); }
  }

  async function checkBlocks() {
    if (!user || !userId) return;
    const { data } = await supabase.from('user_blocks').select('id,blocker_id').or(`and(blocker_id.eq.${user.id},blocked_id.eq.${userId}),and(blocker_id.eq.${userId},blocked_id.eq.${user.id})`);
    setIsBlocked((data || []).some((b: any) => b.blocker_id === user.id));
    setBlockedByOther((data || []).some((b: any) => b.blocker_id === userId));
  }

  async function checkOtherOnlineStatus() {
    if (!userId) return;
    const { data } = await supabase.from('user_profiles').select('last_seen,is_online').eq('id', userId).single();
    if (data) {
      const diff = data.last_seen ? Date.now() - new Date(data.last_seen).getTime() : 999999;
      const onl = !!data.is_online && diff < 30000;
      setIsOtherOnline(onl);
      setLastSeen(onl ? null : (data.last_seen || null));
    }
  }

  async function triggerAutoReply() {
    if (!user || !userId || autoReplyCalled.current) return;
    autoReplyCalled.current = true;
    try {
      const { error } = await supabase.functions.invoke('auto-reply', {
        body: { senderId: user.id, receiverId: userId }
      });
      if (error) {
        console.error('Auto-reply edge function error:', error);
      } else {
        console.log('✅ Auto-reply triggered successfully');
        setTimeout(() => fetchMessages(), 2000);
      }
    } catch (e) { console.error('triggerAutoReply error:', e); }
  }

  async function fetchMessages() {
    if (!user || !userId) return;
    try {
      const { data } = await supabase
        .from('messages')
        .select('*, sender:sender_id(id,username,avatar_url,blue_tick)')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
        .order('created_at');
      const msgs = (data || []) as Message[];
      if (lastCount > 0 && msgs.length > lastCount) {
        const newMsgs = msgs.slice(lastCount);
        const trulyNew = newMsgs.filter(m => m.sender_id !== user.id && !playedMsgIds.current.has(m.id));
        if (trulyNew.length > 0) {
          playSound(settingsRef.current.sound_messenger);
          trulyNew.forEach(m => playedMsgIds.current.add(m.id));
          if (playedMsgIds.current.size > 500) playedMsgIds.current = new Set(Array.from(playedMsgIds.current).slice(-200));
        }
      }
      setLastCount(msgs.length);
      setMessages(msgs);
      const unread = msgs.filter(m => m.sender_id === userId && m.receiver_id === user.id && !m.read);
      if (unread.length > 0) {
        await supabase.from('messages').update({ read: true, read_at: new Date().toISOString() })
          .eq('sender_id', userId!).eq('receiver_id', user.id).eq('read', false);
      }
    } catch (err) { console.error('fetchMessages error:', err); }
  }

  async function sendMessage() {
    if ((!text.trim() && selectedFiles.length === 0) || !user || !userId) return;
    if (isBlocked || blockedByOther) {
      toast.error(isBlocked ? 'Umemzuia mtumiaji huyu' : 'Umezuiwa na mtumiaji huyu'); return;
    }
    if (!canSendToThisUser) { setShowPlanPicker(true); return; }

    setSending(true); setUploadProgress(0);
    const isFirstMessage = lastCount === 0;

    try {
      const { uploadFile } = await import('@/lib/supabase');
      if (selectedFiles.length > 0) {
        const uploadedUrls: string[] = [];
        let autoThumbUrl = '';
        const firstVideoFile = selectedFiles.find(f => f.type.startsWith('video'));
        if (firstVideoFile) {
          try {
            const { generateVideoThumbnail } = await import('@/lib/generateThumbnail');
            const blob = await generateVideoThumbnail(firstVideoFile);
            if (blob) {
              const thumbFile = new File([blob], `thumb_${Date.now()}.jpg`, { type: 'image/jpeg' });
              autoThumbUrl = await uploadFile('chat-media', `chat/${user.id}/thumb_${Date.now()}.jpg`, thumbFile);
            }
          } catch {}
        }
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          const ext = file.name.split('.').pop() || 'jpg';
          const path = `chat/${user.id}/${Date.now()}_${i}.${ext}`;
          try {
            const url = await uploadFile('chat-media', path, file, (pct) => setUploadProgress(Math.round((i * 100 + pct) / selectedFiles.length)));
            uploadedUrls.push(url);
          } catch { toast.error('Hitilafu ya kupakia'); }
        }
        if (uploadedUrls.length > 0) {
          const firstFile = selectedFiles[0];
          const isVideo = firstFile.type.startsWith('video');
          const isAudio = firstFile.type.startsWith('audio');
          await supabase.from('messages').insert({
            sender_id: user.id, receiver_id: userId,
            content: text.trim() || null,
            media_url: uploadedUrls[0], media_urls: uploadedUrls,
            media_type: isAudio ? 'audio' : isVideo ? 'video' : 'image',
            reply_to: replyTo?.id, view_once: viewOnce,
            ...(autoThumbUrl ? { thumbnail_url: autoThumbUrl } : {}),
          } as any);
        }
        setSelectedFiles([]); setText(''); setViewOnce(false);
      } else {
        await supabase.from('messages').insert({
          sender_id: user.id, receiver_id: userId,
          content: text.trim(), reply_to: replyTo?.id
        });
        setText('');
      }
      setReplyTo(null); setUploadProgress(0);
      await fetchMessages();

      if (isFirstMessage) {
        setTimeout(() => triggerAutoReply(), 1200);
      }
    } catch { toast.error('Imeshindwa kutuma ujumbe'); }
    finally { setSending(false); }
  }

  async function startRecording() {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;
    if (recordTimer.current) { clearInterval(recordTimer.current); recordTimer.current = null; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4', ''];
      const mimeType = mimeTypes.find(t => { try { return !t || MediaRecorder.isTypeSupported(t); } catch { return false; } }) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      const actualMime = recorder.mimeType || 'audio/webm';
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (chunksRef.current.length > 0) await sendVoiceBlob(new Blob(chunksRef.current, { type: actualMime }), actualMime);
      };
      recorder.start(250);
      setMediaRecorder(recorder); setRecording(true); setRecordingTime(0);
      recordTimer.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) { console.error('Mic error:', err); isRecordingRef.current = false; toast.error('Haiwezekani kupiga sauti. Ruhusu mic kwanza.'); }
  }

  function stopRecording() {
    isRecordingRef.current = false;
    if (mediaRecorder && recording) {
      try { mediaRecorder.stop(); } catch {}
      setRecording(false);
      if (recordTimer.current) { clearInterval(recordTimer.current); recordTimer.current = null; }
      setMediaRecorder(null);
    }
  }

  async function sendVoiceBlob(blob: Blob, mimeType: string) {
    if (!user || !userId) return;
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    try {
      const { uploadFile } = await import('@/lib/supabase');
      const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mimeType });
      const path = `chat/${user.id}/voice_${Date.now()}.${ext}`;
      const mediaUrl = await uploadFile('chat-media', path, file);
      if (mediaUrl) {
        await supabase.from('messages').insert({ sender_id: user.id, receiver_id: userId, media_url: mediaUrl, media_type: 'audio' });
        fetchMessages(); toast.success('✅ Sauti imetumwa!');
      }
    } catch (err) { console.error('Voice upload error:', err); toast.error('Imeshindwa kupakia sauti.'); }
  }

  async function deleteMessage(msgId: string) {
    const msg = messages.find(m => m.id === msgId);
    if (isAdmin || msg?.sender_id === user?.id) await supabase.from('messages').delete().eq('id', msgId);
    else await supabase.from('messages').update({ deleted_by_sender: true, content: null, media_url: null }).eq('id', msgId).eq('sender_id', user?.id);
    setShowOptions(null); fetchMessages();
  }

  async function reactToMessage(msgId: string, emoji: string) {
    const msg = messages.find(m => m.id === msgId);
    if (!msg || !user) return;
    const reactions = { ...(msg.reactions || {}) };
    if (!reactions[emoji]) reactions[emoji] = [];
    if (reactions[emoji].includes(user.id)) reactions[emoji] = reactions[emoji].filter((id: string) => id !== user.id);
    else reactions[emoji].push(user.id);
    await supabase.from('messages').update({ reactions }).eq('id', msgId);
    fetchMessages(); setShowOptions(null);
  }

  async function blockUser() {
    if (!user || !userId) return;
    await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: userId });
    setIsBlocked(true); setShowOptions(null);
    toast.success('Mtumiaji amezuiwa.');
  }

  async function unblockUser() {
    if (!user || !userId) return;
    await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', userId!);
    setIsBlocked(false); setShowOptions(null);
    toast.success('Mtumiaji amefunguliwa!');
  }

  async function reportUser() {
    if (!user || !userId || !otherUser) return;
    setShowOptions(null);
    const { data: adminProf } = await supabase.from('user_profiles').select('id').eq('is_admin', true).limit(1).single();
    if (adminProf) {
      await supabase.from('messages').insert({ sender_id: user.id, receiver_id: adminProf.id, content: `[RIPOTI] Mtumiaji: ${otherUser.username} (ID: ${otherUser.id}) - Tafadhali niambie zaidi kuhusu tatizo.` });
      navigate(`/chat/${adminProf.id}`);
      toast.info('Uko kwenye inbox ya Admin. Andika tatizo lako kamili.');
    }
  }

  const handleTouchStartMsg = (msgId: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeStartX.current[msgId] = touch.clientX;
    swipeStartY.current[msgId] = touch.clientY;
    holdFired.current = false;
    holdTimer.current = setTimeout(() => { holdFired.current = true; setShowOptions(msgId); }, 600);
  };
  const handleTouchMoveMsg = (msgId: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    const diffX = Math.abs(touch.clientX - (swipeStartX.current[msgId] ?? touch.clientX));
    const diffY = Math.abs(touch.clientY - (swipeStartY.current[msgId] ?? touch.clientY));
    if (diffX > 8 || diffY > 8) { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } }
  };
  const handleTouchEndMsg = (msg: Message, e: React.TouchEvent) => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (holdFired.current) { holdFired.current = false; return; }
    const startX = swipeStartX.current[msg.id];
    const touch = e.changedTouches[0];
    if (startX !== undefined) {
      const diffX = touch.clientX - startX;
      const diffY = Math.abs(touch.clientY - (swipeStartY.current[msg.id] ?? touch.clientY));
      if (diffX > 60 && diffY < 40) { setReplyTo(msg); setShowOptions(null); setSwipedMsgId(msg.id); setTimeout(() => setSwipedMsgId(null), 400); }
    }
    delete swipeStartX.current[msg.id];
    delete swipeStartY.current[msg.id];
  };

  const formatRecordTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const chatBg = settings.chat_bg_image
    ? `url(${settings.chat_bg_image}) center/cover no-repeat`
    : settings.chat_color_from
    ? `linear-gradient(135deg, ${settings.chat_color_from}, ${settings.chat_color_to || '#1a0a2a'})`
    : '#0a030f';
  const hasContent = text.trim() || selectedFiles.length > 0;
  const canChat = !isBlocked && !blockedByOther;
  const canSend = canChat && canSendToThisUser;

  return (
    <div className="full-screen-page" style={{ background: chatBg }}>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-30 px-3 pt-3 pb-2 flex items-center gap-2">
        <button onClick={() => setShowSendGift(true)} className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg" style={{ background: 'rgba(255,165,0,0.85)', backdropFilter: 'blur(10px)' }} title="Tuma Zawadi">
          <Gift className="w-5 h-5 text-white" />
        </button>
        <button className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-full min-w-0 text-left" style={{ background: 'rgba(10,4,14,0.92)', backdropFilter: 'blur(14px)' }} onClick={() => otherUser ? navigate(`/profile/${otherUser.id}`) : navigate('/chat')}>
          <div className="w-9 h-9 rounded-full overflow-hidden border border-primary/50 flex-shrink-0">
            {otherUser?.avatar_url ? <img src={otherUser.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-bold text-sm">{otherUser?.username?.[0]?.toUpperCase()}</span></div>}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-white font-bold text-sm truncate">{otherUser?.username}</span>
              {otherUser?.blue_tick && <BlueTick tickId={otherUser.blue_tick} size={13} />}
              {otherUser?.is_admin && (
                <span className="text-[9px] font-black text-primary bg-primary/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <ShieldCheck className="w-2.5 h-2.5" />ADMIN
                </span>
              )}
              {otherUser?.is_business && !otherUser?.is_admin && (
                <span className="text-[9px] font-black text-blue-400 bg-blue-400/20 px-1.5 py-0.5 rounded-full">BIZ</span>
              )}
            </div>
          </div>
        </button>
        <button onClick={() => setShowContactOptions(true)} className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg" style={{ background: 'rgba(37,211,102,0.90)', backdropFilter: 'blur(10px)' }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1" style={{ paddingTop: '72px', paddingBottom: '8px' }}>
        {messages.map(msg => {
          const isOwn = msg.sender_id === user?.id;
          const mediaUrls: string[] = ((msg as any).media_urls?.length > 1) ? (msg as any).media_urls : (msg.media_url ? [msg.media_url] : []);
          const hasMedia = mediaUrls.length > 0 && msg.media_type !== 'audio';
          const isSwiped = swipedMsgId === msg.id;
          const isViewOnce = !!(msg as any).view_once;
          const isViewOnceOpened = !!(msg as any).view_once_opened;

          return (
            <div key={msg.id} id={`msg-${msg.id}`}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'} items-end gap-1.5 group transition-transform duration-200 ${isSwiped ? 'translate-x-8' : ''}`}
              onTouchStart={(e) => handleTouchStartMsg(msg.id, e)}
              onTouchMove={(e) => handleTouchMoveMsg(msg.id, e)}
              onTouchEnd={(e) => handleTouchEndMsg(msg, e)}
              onMouseDown={() => { holdFired.current = false; holdTimer.current = setTimeout(() => { holdFired.current = true; setShowOptions(msg.id); }, 600); }}
              onMouseUp={() => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } }}>
              {!isOwn && (
                <div className="w-7 h-7 rounded-full overflow-hidden border border-primary/30 flex-shrink-0 mb-1" style={{ minWidth: '28px' }}>
                  {otherUser?.avatar_url ? <img src={otherUser.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white text-xs font-bold">{otherUser?.username?.[0]?.toUpperCase()}</span></div>}
                </div>
              )}
              <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${hasMedia ? 'flex-1 min-w-0' : 'max-w-[82%]'}`} style={hasMedia ? { maxWidth: 'calc(100vw - 52px)' } : {}}>
                {msg.reply_to && <div className="text-xs text-gray-400 border-l-2 border-primary px-2 py-0.5 mb-0.5 mx-1 bg-black/20 rounded-r-lg">↩ Jibu</div>}
                {(msg as any).is_auto_reply && !isOwn && (
                  <div className="text-[9px] text-blue-400 px-2 mb-0.5">🤖 Jibu la Otomatiki</div>
                )}
                <div style={{
                  background: isOwn
                    ? `linear-gradient(135deg,${settings.msg_bubble_sent_from || settings.bubble_sent_from || settings.chat_bubble_my_from || '#7B2FBE'},${settings.msg_bubble_sent_to || settings.bubble_sent_to || settings.chat_bubble_my_to || '#5B1F9E'})`
                    : `linear-gradient(135deg,${settings.msg_bubble_recv_from || settings.bubble_recv_from || settings.chat_bubble_other || '#1a0a2a'},${settings.msg_bubble_recv_to || settings.bubble_recv_to || '#2d1040'})`,
                  border: isOwn ? 'none' : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: `${settings.msg_bubble_radius || settings.bubble_radius || '18'}px ${settings.msg_bubble_radius || settings.bubble_radius || '18'}px ${isOwn ? '4px 18px' : '18px 4px'}`,
                  padding: hasMedia ? '2px' : '4px 10px 2px 10px',
                  overflow: 'hidden',
                  width: hasMedia ? '100%' : undefined,
                  maxWidth: hasMedia ? '100%' : '260px',
                  fontSize: settings.msg_bubble_font_size ? `${settings.msg_bubble_font_size}px` : '14px',
                  color: isOwn ? (settings.msg_bubble_text_color || '#fff') : '#fff',
                  fontFamily: (() => { const f = settings.msg_bubble_font_family; return f === 'dancing' ? 'Dancing Script, cursive' : f === 'pacifico' ? 'Pacifico, cursive' : f === 'lobster' ? 'Lobster, cursive' : f === 'mono' ? 'monospace' : f === 'serif' ? 'serif' : 'inherit'; })(),
                }}>
                  {hasMedia && isViewOnce && !isOwn && !isViewOnceOpened && !openedViewOnce.has(msg.id) && (
                    <div className="relative cursor-pointer" style={{ minHeight: '120px' }}
                      onClick={async () => {
                        // Mark as opened locally immediately
                        setOpenedViewOnce(prev => new Set([...prev, msg.id]));
                        // Mark in DB
                        await supabase.from('messages').update({ view_once_opened: true }).eq('id', msg.id);
                        const url = mediaUrls[0];
                        const isVid = /\.(mp4|webm|mov)/i.test(url) || msg.media_type === 'video';
                        if (isVid) navigate('/play', { state: { url, title: 'Video', urls: mediaUrls } });
                        else openMedia(mediaUrls.map(u => ({ url: u, type: 'image' as const })), 0);
                      }}>
                      {(msg as any).thumbnail_url || mediaUrls[0] ? (
                        <img src={(msg as any).thumbnail_url || mediaUrls[0]} alt="" className="w-full" style={{ height: '200px', objectFit: 'cover', filter: 'blur(12px)', borderRadius: '14px' }} />
                      ) : (
                        <div className="w-full flex items-center justify-center" style={{ height: '200px', background: '#1a0a1a', borderRadius: '14px' }} />
                      )}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ borderRadius: '14px' }}>
                        <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center">
                          <Eye className="w-7 h-7 text-blue-400" />
                        </div>
                        <p className="text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-full">Tazama Mara Moja</p>
                        <p className="text-white/60 text-xs">Itafutwa baada ya kutazama</p>
                      </div>
                    </div>
                  )}
                  {hasMedia && isViewOnce && !isOwn && (isViewOnceOpened || openedViewOnce.has(msg.id)) && (
                    <div className="flex items-center gap-2 px-4 py-3"><Eye className="w-4 h-4 text-gray-500" /><p className="text-gray-500 text-xs italic">🔒 Imefutwa baada ya kutazama</p></div>
                  )}
                  {hasMedia && isViewOnce && isOwn && (
                    <div className="flex items-center gap-2 px-4 py-3"><Eye className="w-4 h-4 text-blue-400" /><p className="text-white/70 text-xs">{isViewOnceOpened ? '👁 Imetazamwa' : '👁 Tazama Mara Moja'}</p></div>
                  )}
                  {hasMedia && !isViewOnce && (
                    <div style={{ borderRadius: '14px', overflow: 'hidden' }}>
                      <MessageMediaGrid urls={mediaUrls} type={msg.media_type || 'image'} thumbUrl={(msg as any).thumbnail_url}
                        onOpen={(url, t) => {
                          const isVid = /\.(mp4|webm|mov)/i.test(url) || t === 'video';
                          if (isVid) navigate('/play', { state: { url, title: 'Video', urls: mediaUrls.filter(u => /\.(mp4|webm|mov)/i.test(u)) } });
                          else openMedia(mediaUrls.map(u => ({ url: u, type: (/\.(mp4|webm|mov)/i.test(u) || t === 'video') ? 'video' as const : 'image' as const })), mediaUrls.indexOf(url));
                        }} />
                    </div>
                  )}
                  {msg.media_type === 'audio' && msg.media_url && <ChatAudioPlayer key={msg.id + '_audio'} url={msg.media_url} isOwn={isOwn} />}
                  {msg.content && (
                    <MessageText content={msg.content} onNavigate={(uid) => navigate(`/profile/${uid}`)} />
                  )}
                  <div className="flex items-center justify-end gap-1 px-2 pb-0.5">
                    <span className="text-white/50 text-[9px]">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {isOwn && <span className={`text-[9px] font-bold ${msg.read ? 'text-blue-400' : 'text-white/40'}`}>{msg.read ? '✓✓' : '✓'}</span>}
                  </div>
                </div>
                {Object.keys(msg.reactions || {}).length > 0 && (
                  <div className="flex gap-1 mt-0.5 flex-wrap px-1">
                    {Object.entries(msg.reactions || {}).filter(([, ids]) => (ids as string[]).length > 0).map(([emoji, ids]) => (
                      <span key={emoji} onClick={() => reactToMessage(msg.id, emoji)} className="text-xs bg-black/40 border border-white/10 rounded-full px-1.5 py-0.5 cursor-pointer">
                        {emoji} {(ids as string[]).length}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Options menu */}
      {showOptions && showOptions !== 'menu' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowOptions(null)}>
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-4 w-72" onClick={e => e.stopPropagation()}>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {['❤️', '😂', '😮', '😢', '🔥', '👍', '💋', '😍'].map(e => (
                <button key={e} onClick={() => reactToMessage(showOptions, e)} className="text-2xl hover:bg-white/10 p-2 rounded-xl">{e}</button>
              ))}
            </div>
            <div className="space-y-1">
              <button onClick={() => { const m = messages.find(msg => msg.id === showOptions); if (m) { setReplyTo(m); setShowOptions(null); } }} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-white"><Reply className="w-4 h-4 text-primary" /> Jibu</button>
              {(messages.find(m => m.id === showOptions)?.sender_id === user?.id || isAdmin) && (
                <button onClick={() => deleteMessage(showOptions!)} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-red-400"><Trash2 className="w-4 h-4" /> Futa Ujumbe Huu</button>
              )}
              {isAdmin && (
                <button onClick={async () => {
                  if (!window.confirm('Futa mazungumzo yote?')) return;
                  await supabase.from('messages').delete().or(`and(sender_id.eq.${user?.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user?.id})`);
                  setMessages([]); setShowOptions(null); toast.success('Mazungumzo yamefutwa!');
                }} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-red-500"><Trash2 className="w-4 h-4" /> Futa Mazungumzo Yote</button>
              )}
              <button onClick={async () => {
                if (!user || !showOptions) return;
                const msg = messages.find(m => m.id === showOptions);
                if (!msg) return;
                await supabase.from('saved_items').insert({ user_id: user.id, content_id: msg.id, content_type: msg.media_url ? 'chat_image' : 'chat_message', content_url: msg.media_url || '', content_name: msg.content?.slice(0, 50) || 'Ujumbe', thumbnail_url: (msg as any).thumbnail_url || msg.media_url });
                setShowOptions(null); toast.success('✅ Ujumbe umehifadhiwa!');
              }} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-yellow-400"><Bookmark className="w-4 h-4" /> Hifadhi</button>
              <button onClick={() => { setShowOptions(null); setShowSendGift(true); }} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-orange-400"><Gift className="w-4 h-4" /> Tuma Zawadi 🎁</button>
              {isBlocked ? (
                <button onClick={unblockUser} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-green-400"><span className="text-lg">🔓</span> Fungua (Unblock)</button>
              ) : (
                <button onClick={blockUser} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-orange-400"><span className="text-lg">🚫</span> Zuia (Block)</button>
              )}
              <button onClick={reportUser} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-red-400"><span className="text-lg">⚠️</span> Ripoti</button>
            </div>
          </div>
        </div>
      )}

      {/* View-once toggle */}
      {selectedFiles.length > 0 && canChat && (
        <div className="px-3 pb-1 flex items-center gap-2" style={{ background: 'rgba(8,3,12,0.95)' }}>
          <button onClick={() => setViewOnce(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${viewOnce ? 'bg-blue-500 text-white' : 'bg-[#1a0a1a] text-gray-400 border border-gray-700'}`}>
            <Eye className="w-3 h-3" />{viewOnce ? '👁 Tazama Mara Moja (Imewashwa)' : 'Tazama Mara Moja'}
          </button>
        </div>
      )}

      <PreviewGrid files={selectedFiles} onRemove={i => setSelectedFiles(prev => prev.filter((_, j) => j !== i))} />

      {uploadProgress > 0 && uploadProgress < 100 && (
        <div className="px-4 py-2" style={{ background: 'rgba(8,3,12,0.97)', borderTop: '1px solid rgba(255,20,147,0.15)' }}>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-xs truncate flex-1">📁 {selectedFiles[0]?.name?.slice(0, 28) || 'Inapakia...'}</span>
              <span className="text-primary text-xs font-bold ml-2 animate-pulse">{uploadProgress}%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full gradient-pink rounded-full transition-all duration-300" style={{ width: `${Math.max(2, uploadProgress)}%` }} />
              </div>
              <span className="text-gray-400 text-xs font-semibold flex-shrink-0">
                {(selectedFiles.reduce((s, f) => s + f.size, 0) * uploadProgress / 100 / 1024 / 1024).toFixed(1)}/{(selectedFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
          </div>
        </div>
      )}

      {replyTo && (
        <div className="px-4 py-2 flex items-center gap-2" style={{ background: 'rgba(8,3,12,0.95)', borderTop: '1px solid rgba(255,20,147,0.15)' }}>
          <Reply className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-gray-400 text-sm flex-1 truncate">{replyTo.content || 'Media'}</p>
          <button onClick={() => setReplyTo(null)}><X className="w-4 h-4 text-gray-500" /></button>
        </div>
      )}

      {recording && (
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(8,3,12,0.97)', borderTop: '1px solid rgba(255,20,147,0.2)' }}>
          <button onClick={() => { isRecordingRef.current = false; if (mediaRecorder) { try { mediaRecorder.stop(); } catch {} } setRecording(false); if (recordTimer.current) { clearInterval(recordTimer.current); recordTimer.current = null; } setRecordingTime(0); setMediaRecorder(null); chunksRef.current = []; }}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(40,40,40,0.9)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-full" style={{ background: 'linear-gradient(135deg, #1565C0, #1976D2)', minHeight: '44px' }}>
            <div className="flex items-end gap-px flex-1" style={{ height: '22px' }}>
              {Array.from({ length: 28 }).map((_, i) => <div key={i} className="flex-1 rounded-full" style={{ height: `${30 + Math.abs(Math.sin(i * 0.8)) * 70}%`, minHeight: '3px', background: 'rgba(255,255,255,0.75)' }} />)}
            </div>
            <span className="text-white font-mono text-sm font-bold flex-shrink-0">{formatRecordTime(recordingTime)}</span>
          </div>
          <button onClick={stopRecording} className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 gradient-pink shadow-lg"><Send className="w-4 h-4 text-white" /></button>
        </div>
      )}

      {/* Blocked notices */}
      {blockedByOther && (
        <div className="px-6 py-5 text-center" style={{ background: 'linear-gradient(to top, rgba(220,38,38,0.12), rgba(220,38,38,0.04))', borderTop: '1px solid rgba(220,38,38,0.25)' }}>
          <div className="text-3xl mb-2">🚫</div>
          <p className="text-red-400 font-bold text-sm">Umezuiwa na mtumiaji huyu</p>
          <p className="text-gray-500 text-xs mt-1">Huwezi kutuma ujumbe au kupiga simu</p>
        </div>
      )}
      {isBlocked && !blockedByOther && (
        <div className="px-6 py-5 text-center" style={{ background: 'linear-gradient(to top, rgba(255,165,0,0.10), rgba(255,165,0,0.03))', borderTop: '1px solid rgba(255,165,0,0.25)' }}>
          <div className="text-3xl mb-2">🔇</div>
          <p className="text-orange-400 font-bold text-sm">Umemzuia mtumiaji huyu</p>
          <p className="text-gray-500 text-xs mt-1">Hajapokea ujumbe wowote kutoka kwako</p>
          <button onClick={unblockUser} className="mt-3 text-sm bg-orange-500/20 text-orange-300 px-4 py-2 rounded-xl border border-orange-500/30 font-bold">🔓 Fungua (Unblock)</button>
        </div>
      )}

      {/* Input bar */}
      {canChat && (
        <div className="px-3 py-3 flex items-end gap-2" style={{ background: 'transparent' }}>
          {canSend && (
            <label className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg cursor-pointer" style={{ background: 'rgba(10,4,14,0.92)', backdropFilter: 'blur(12px)' }}>
              <ImageIcon className="w-5 h-5 text-gray-300" />
              <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple className="hidden"
                onChange={e => setSelectedFiles(Array.from(e.target.files || []))} />
            </label>
          )}
          <textarea value={text}
            onChange={e => {
              setText(e.target.value);
              const now = Date.now();
              if (now - lastTypingSent.current > 3000) {
                lastTypingSent.current = now;
                supabase.from('user_profiles').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', user!.id);
              }
            }}
            placeholder={canSend ? 'Andika ujumbe...' : 'Unaweza kusoma ujumbe tu...'}
            className="flex-1 text-white rounded-2xl px-4 py-2.5 text-sm resize-none focus:outline-none"
            style={{ background: 'rgba(10,4,14,0.92)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)', minHeight: '44px', maxHeight: '120px' }}
            rows={1}
            readOnly={!canSend}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && canSend) { e.preventDefault(); sendMessage(); } }} />
          {canSend && (hasContent ? (
            <button onClick={sendMessage} disabled={sending} className="w-10 h-10 gradient-pink rounded-full flex items-center justify-center flex-shrink-0 shadow-lg active:scale-90 transition-transform">
              {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          ) : (
            <button
              onMouseDown={(e) => { if ((e.nativeEvent as PointerEvent).pointerType !== 'touch') startRecording(); }}
              onMouseUp={recording ? (e) => { if ((e.nativeEvent as PointerEvent).pointerType !== 'touch') stopRecording(); } : undefined}
              onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
              onTouchEnd={recording ? (e) => { e.preventDefault(); stopRecording(); } : undefined}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all shadow-lg ${recording ? 'bg-red-500 scale-110 animate-pulse' : 'gradient-pink'}`}>
              <Mic className="w-4 h-4 text-white" />
            </button>
          ))}
        </div>
      )}

      {/* Non-VIP notice */}
      {canChat && !canSendToThisUser && (
        <div className="px-6 py-4 text-center" style={{ background: 'rgba(8,3,12,0.95)', borderTop: '1px solid rgba(255,20,147,0.2)' }}>
          <p className="text-gray-400 text-xs mb-2">Ili kutuma ujumbe kwa members wa kawaida, unahitaji VIP</p>
          <button onClick={() => setShowPlanPicker(true)} className="btn-primary text-sm px-6 py-2">👑 Pata VIP</button>
        </div>
      )}

      {showPlanPicker && (
        <PlanPickerModal onClose={() => setShowPlanPicker(false)} settings={settings} message="Kutuma ujumbe kwa member wa kawaida unahitaji VIP au Business Account" onSuccess={() => setShowPlanPicker(false)} />
      )}

      {showSendGift && otherUser && profile && (
        <SendGiftModal otherUser={otherUser} profile={profile} onClose={() => setShowSendGift(false)} onSuccess={() => { setShowSendGift(false); fetchMessages(); }} />
      )}

      {/* Contact Options Modal - Audio, Video, WhatsApp */}
      {showContactOptions && otherUser && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center" onClick={() => setShowContactOptions(false)}>
          <div className="w-full max-w-md bg-[#0d0d0d] border-t border-[#3d0b3d] rounded-t-3xl p-5 slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-bold text-base">📞 Wasiliana na {otherUser.username}</h3>
              <button onClick={() => setShowContactOptions(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <button onClick={() => { setShowContactOptions(false); setActiveCall({type:'audio'}); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl active:scale-95 transition-transform"
                style={{ background: 'rgba(255,20,147,0.15)', border: '1px solid rgba(255,20,147,0.3)' }}>
                <div className="w-12 h-12 rounded-full gradient-pink flex items-center justify-center flex-shrink-0"><span className="text-xl">📞</span></div>
                <div className="text-left">
                  <p className="text-white font-bold">Simu ya App</p>
                  <p className="text-gray-400 text-xs">Audio call ndani ya app</p>
                </div>
              </button>
              <button onClick={() => { setShowContactOptions(false); setActiveCall({type:'video'}); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl active:scale-95 transition-transform"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0"><span className="text-xl">📹</span></div>
                <div className="text-left">
                  <p className="text-white font-bold">Video Call ya App</p>
                  <p className="text-gray-400 text-xs">Camera + sauti ndani ya app</p>
                </div>
              </button>
              <button onClick={() => {
                setShowContactOptions(false);
                const wa = (otherUser.whatsapp || '').replace(/\D/g,'');
                const num = wa.startsWith('255') ? wa : wa.startsWith('0') ? '255' + wa.slice(1) : wa ? '255' + wa : '';
                if (num) window.open(`https://wa.me/${num}`, '_blank');
                else toast.info('Mtumiaji huyu hana namba ya WhatsApp');
              }} className="w-full flex items-center gap-4 p-4 rounded-2xl active:scale-95 transition-transform"
                style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)' }}>
                <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </div>
                <div className="text-left">
                  <p className="text-white font-bold">WhatsApp</p>
                  <p className="text-gray-400 text-xs">Piga kupitia WhatsApp</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app WebRTC Call from Messenger */}
      {activeCall && otherUser && profile && (
        <MessengerCallOverlay
          targetUser={otherUser}
          myProfile={profile as any}
          isVideo={activeCall.type === 'video'}
          onEnd={() => setActiveCall(null)}
        />
      )}
    </div>
  );
}
