import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { UserProfile } from '@/types';
import BlueTick from '@/components/features/BlueTick';
import { ArrowLeft, MessageCircle, Phone, Share2, Video, X, Mic, MicOff, VideoOff, PhoneOff, Volume2, VolumeX, FlipHorizontal, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { PlanPickerModal } from '@/pages/Services';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

// ─── Pre-call permission screen ────────────────────────────────────────────────
function PreCallScreen({
  isVideo, targetUser, onAllow, onDeny,
}: {
  isVideo: boolean; targetUser: UserProfile; onAllow: () => void; onDeny: () => void;
}) {
  const [checking, setChecking] = useState(false);

  async function requestPermissions() {
    setChecking(true);
    try {
      const constraints = { audio: true, video: isVideo };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(t => t.stop()); // Just check permission
      onAllow();
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        toast.error('Ruhusu mic' + (isVideo ? ' na camera' : '') + ' kwenye browser settings kisha jaribu tena.');
      } else if (err.name === 'NotFoundError') {
        toast.error('Mic' + (isVideo ? ' au camera' : '') + ' haipatikani kwenye kifaa hiki.');
      } else {
        toast.error('Hitilafu: ' + err.message);
      }
      onDeny();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center p-6">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0a030f, #1a0a2a)' }} />
      <div className="relative z-10 w-full max-w-sm text-center">
        {/* Target user avatar */}
        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-primary shadow-2xl mx-auto mb-6"
          style={{ boxShadow: '0 0 40px rgba(255,20,147,0.4)' }}>
          {targetUser.avatar_url ?
            <img src={targetUser.avatar_url} className="w-full h-full object-cover" alt="" /> :
            <div className="w-full h-full gradient-pink flex items-center justify-center">
              <span className="text-white font-black text-4xl">{targetUser.username?.[0]?.toUpperCase()}</span>
            </div>}
        </div>

        <h2 className="text-white font-black text-2xl mb-1">{targetUser.username}</h2>
        <p className="text-gray-400 mb-8">{isVideo ? '📹 Video Call' : '📞 Simu ya Sauti'}</p>

        {/* Permission guide */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6 text-left space-y-3">
          <p className="text-white font-bold text-sm text-center mb-3">🔐 Ruhusa Zinazohitajika</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
              <Mic className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Microphone</p>
              <p className="text-gray-400 text-xs">Inahitajika kusikizana sauti</p>
            </div>
          </div>
          {isVideo && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
                <Video className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Camera</p>
                <p className="text-gray-400 text-xs">Inahitajika kwa video call</p>
              </div>
            </div>
          )}
          <p className="text-gray-500 text-xs text-center pt-1 border-t border-white/10">
            Browser itakuuliza ruhusa - bonyeza "Ruhusu" / "Allow"
          </p>
        </div>

        <button onClick={requestPermissions} disabled={checking}
          className="w-full py-4 rounded-2xl gradient-pink text-white font-black text-lg mb-3 active:scale-95 transition-transform disabled:opacity-60">
          {checking ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Inangojea ruhusa...
            </span>
          ) : (
            `${isVideo ? '📹' : '📞'} Anza ${isVideo ? 'Video Call' : 'Simu'}`
          )}
        </button>
        <button onClick={onDeny} className="w-full py-3 rounded-2xl text-gray-400 font-semibold text-sm">
          Ghairi
        </button>
      </div>
    </div>
  );
}

// ─── WhatsApp-style WebRTC Call ─────────────────────────────────────────────
function WebRTCCall({
  targetUserId, targetUser, myProfile, isVideo, isAnswering, onEnd,
}: {
  targetUserId: string; targetUser: UserProfile; myProfile: UserProfile;
  isVideo: boolean; isAnswering?: boolean; onEnd: () => void;
}) {
  const [status, setStatus] = useState<'calling' | 'ringing' | 'connected' | 'ended'>(isAnswering ? 'ringing' : 'calling');
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [frontCam, setFrontCam] = useState(true);
  const [callTime, setCallTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [swapped, setSwapped] = useState(false); // swap main/pip video
  // PiP drag state
  const [pipPos, setPipPos] = useState({ x: 0, y: 0 }); // offset from default bottom-right
  const [isDragging, setIsDragging] = useState(false);
  const pipRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelIdRef = useRef('');
  const ringAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedSignals = useRef<Set<string>>(new Set());
  const statusRef = useRef(status);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  statusRef.current = status;

  // Auto-hide controls after 4s in connected state
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (status === 'connected') {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
    }
  }, [status]);

  const handleScreenTap = () => {
    if (status === 'connected') {
      setShowControls(c => !c);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      if (!showControls) {
        controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
      }
    }
  };

  useEffect(() => {
    if (status === 'connected') resetControlsTimer();
  }, [status]);

  // PiP drag handlers
  const handlePipTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    dragStart.current = { x: touch.clientX, y: touch.clientY, px: pipPos.x, py: pipPos.y };
    setIsDragging(true);
  };
  const handlePipTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    e.stopPropagation();
    const touch = e.touches[0];
    const dx = touch.clientX - dragStart.current.x;
    const dy = touch.clientY - dragStart.current.y;
    setPipPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  };
  const handlePipTouchEnd = (e: React.TouchEvent) => {
    setIsDragging(false);
    // If barely moved, treat as tap to swap
    const touch = e.changedTouches[0];
    const dx = Math.abs(touch.clientX - dragStart.current.x);
    const dy = Math.abs(touch.clientY - dragStart.current.y);
    if (dx < 10 && dy < 10) {
      setSwapped(s => !s);
    }
  };

  useEffect(() => {
    playRingtone();
    initCall();
    const pollInterval = setInterval(pollSignaling, 1500);
    return () => { clearInterval(pollInterval); cleanup(); if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, []);

  useEffect(() => {
    if (status === 'connected') {
      ringAudioRef.current?.pause(); ringAudioRef.current = null;
      timerRef.current = setInterval(() => setCallTime(t => t + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  async function playRingtone() {
    try {
      const { data: s } = await supabase.from('app_settings').select('value').eq('key', 'sound_call').single();
      if (s?.value) {
        const audio = new Audio(s.value); audio.loop = true; audio.volume = 0.8;
        ringAudioRef.current = audio; audio.play().catch(() => {});
      }
    } catch {}
  }

  async function initCall() {
    try {
      // Simplified audio constraints - complex constraints can block mic on some browsers
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 24, max: 30 } } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current && isVideo) { localVideoRef.current.srcObject = stream; localVideoRef.current.muted = true; await localVideoRef.current.play().catch(() => {}); }
      const pc = new RTCPeerConnection(ICE_SERVERS); pcRef.current = pc;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Use a single shared remote stream for all tracks
      const remoteStream = new MediaStream();
      pc.ontrack = async (event) => {
        console.log('ontrack fired:', event.track.kind);
        event.track.onunmute = () => console.log('Track unmuted:', event.track.kind);
        remoteStream.addTrack(event.track);
        if (event.track.kind === 'video' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.muted = false;
          remoteVideoRef.current.volume = 1.0;
          try { await remoteVideoRef.current.play().catch(() => {}); } catch {}
          setStatus('connected');
        }
        if (event.track.kind === 'audio' && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.muted = false;
          remoteAudioRef.current.volume = 1.0;
          try { await remoteAudioRef.current.play().catch(() => {}); } catch {}
          setStatus('connected');
          console.log('Remote audio stream connected');
        }
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await supabase.from('room_messages').insert({
            user_id: myProfile.id,
            content: JSON.stringify({ type: 'ice', candidate: event.candidate.toJSON(), channel: channelIdRef.current }),
            media_type: 'signal',
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') setStatus('connected');
        if (pc.iceConnectionState === 'failed') { toast.error('Muunganisho umeshindwa.'); cleanup(); onEnd(); }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setStatus('connected');
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { if (statusRef.current !== 'ended') { cleanup(); onEnd(); } }
      };

      if (isAnswering) await answerExistingCall(pc);
      else await startNewCall(pc);
    } catch (err: any) {
      toast.error('Imeshindwa: ' + err.message); onEnd();
    }
  }

  async function startNewCall(pc: RTCPeerConnection) {
    channelIdRef.current = `call_${myProfile.id}_${targetUserId}_${Date.now()}`;
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: isVideo });
    await pc.setLocalDescription(offer);
    await supabase.from('room_messages').insert({
      user_id: myProfile.id,
      content: JSON.stringify({ type: 'offer', sdp: offer, channel: channelIdRef.current, caller: myProfile.username, callerAvatar: myProfile.avatar_url, isVideo, targetUserId }),
      media_type: 'signal',
    });
    await supabase.from('notifications').insert({ user_id: targetUserId, title: `📞 ${myProfile.username} anakupigia simu`, message: isVideo ? 'Video call inaingia' : 'Simu inaingia', type: 'call', link: `/profile/${myProfile.id}` });
    setStatus('calling');
  }

  async function answerExistingCall(pc: RTCPeerConnection) {
    const since = new Date(Date.now() - 30000).toISOString();
    const { data } = await supabase.from('room_messages').select('*').eq('media_type', 'signal').eq('user_id', targetUserId).gte('created_at', since).order('created_at', { ascending: false }).limit(30);
    for (const msg of (data || [])) {
      try {
        const signal = JSON.parse(msg.content || '');
        if (signal.type === 'offer' && (signal.channel?.includes(myProfile.id) || signal.targetUserId === myProfile.id)) {
          channelIdRef.current = signal.channel;
          processedSignals.current.add(msg.id);
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          for (const c of pendingCandidates.current) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
          pendingCandidates.current = [];
          await supabase.from('room_messages').insert({ user_id: myProfile.id, content: JSON.stringify({ type: 'answer', sdp: answer, channel: channelIdRef.current }), media_type: 'signal' });
          return;
        }
      } catch {}
    }
    toast.error('Simu imekwisha'); onEnd();
  }

  async function pollSignaling() {
    if (!pcRef.current || statusRef.current === 'ended') return;
    const since = new Date(Date.now() - 8000).toISOString();
    const { data } = await supabase.from('room_messages').select('*').eq('media_type', 'signal').eq('user_id', targetUserId).gte('created_at', since).order('created_at');
    for (const msg of (data || [])) {
      if (processedSignals.current.has(msg.id)) continue;
      try {
        const signal = JSON.parse(msg.content || '');
        if (!channelIdRef.current) continue;
        const isOurChannel = signal.channel === channelIdRef.current || (signal.channel?.includes(myProfile.id) && signal.channel?.includes(targetUserId));
        if (!isOurChannel) continue;
        processedSignals.current.add(msg.id);
        if (signal.type === 'answer' && pcRef.current?.signalingState === 'have-local-offer' && !pcRef.current?.remoteDescription) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          for (const c of pendingCandidates.current) { try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
          pendingCandidates.current = [];
          setStatus('connected');
        } else if (signal.type === 'ice') {
          if (pcRef.current?.remoteDescription) { try { await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch {} }
          else pendingCandidates.current.push(signal.candidate);
        } else if (signal.type === 'end') { toast.info('Simu imeishwa'); cleanup(); onEnd(); }
      } catch {}
    }
    if (processedSignals.current.size > 300) {
      const arr = Array.from(processedSignals.current);
      processedSignals.current = new Set(arr.slice(-150));
    }
  }

  function cleanup() {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close(); pcRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function toggleMic() {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) t.enabled = !t.enabled;
    setMicMuted(m => !m);
  }

  function toggleCam() {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) t.enabled = !t.enabled;
    setCamOff(c => !c);
  }

  function toggleSpeaker() {
    const newOff = !speakerOff;
    if (remoteVideoRef.current) remoteVideoRef.current.muted = newOff;
    if (remoteAudioRef.current) remoteAudioRef.current.muted = newOff;
    setSpeakerOff(newOff);
  }

  async function flipCamera() {
    if (!isVideo || !localStreamRef.current) return;
    try {
      const newMode = frontCam ? 'environment' : 'user';
      // Get new stream with new facing mode
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) { toast.error('Camera haipatikani'); return; }
      // Stop old video tracks
      const oldVideoTracks = localStreamRef.current.getVideoTracks();
      oldVideoTracks.forEach(t => { t.stop(); localStreamRef.current?.removeTrack(t); });
      // Add new track to local stream
      localStreamRef.current.addTrack(newVideoTrack);
      // Replace in peer connection if available
      if (pcRef.current) {
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          try { await videoSender.replaceTrack(newVideoTrack); } catch (e) { console.error('replaceTrack error:', e); }
        }
      }
      // Update local video display
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play().catch(() => {});
      }
      setFrontCam(f => !f);
      toast.success(newMode === 'environment' ? '📷 Camera ya nyuma' : '🤳 Camera ya mbele');
    } catch (err: any) {
      console.error('Flip camera error:', err);
      toast.error('Imeshindwa kubadilisha camera');
    }
  }

  async function endCall() {
    setStatus('ended');
    // Record call history
    try {
      const duration = callTime;
      const callStatus = status === 'connected' ? 'completed' : 'missed';
      await supabase.from('call_history').insert({
        caller_id: myProfile.id,
        receiver_id: targetUserId,
        call_type: isVideo ? 'video' : 'audio',
        status: callStatus,
        duration_seconds: duration,
      });
    } catch (e) { console.error('Call history insert error:', e); }
    // Send end signal - multiple attempts to ensure it reaches remote peer
    if (channelIdRef.current) {
      const endSignal = JSON.stringify({ type: 'end', channel: channelIdRef.current });
      try {
        await supabase.from('room_messages').insert({ 
          user_id: myProfile.id, 
          content: endSignal, 
          media_type: 'signal' 
        });
        // Second attempt after 200ms for reliability
        setTimeout(async () => {
          await supabase.from('room_messages').insert({ 
            user_id: myProfile.id, 
            content: endSignal, 
            media_type: 'signal' 
          }).catch(() => {});
        }, 200);
      } catch {}
    }
    ringAudioRef.current?.pause();
    ringAudioRef.current = null;
    cleanup();
    onEnd();
  }

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // Main = remote (or local if swapped), PiP = local (or remote if swapped)
  const mainIsRemote = !swapped;

  return (
    <div className="fixed inset-0 z-[300] bg-black" onClick={handleScreenTap}>
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Main video (full screen) */}
      {isVideo ? (
        <video
          ref={mainIsRemote ? remoteVideoRef : localVideoRef}
          autoPlay playsInline muted={!mainIsRemote}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : null}

      {/* Background when no video or not connected */}
      {(!isVideo || status !== 'connected') && (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0a030f, #1a0a2a)' }} />
      )}

      {/* Caller info (when not connected or audio-only) */}
      {(!isVideo || status !== 'connected') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <div className="relative mb-6">
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-primary shadow-2xl">
              {targetUser.avatar_url ? <img src={targetUser.avatar_url} className="w-full h-full object-cover" alt="" /> :
                <div className="w-full h-full gradient-pink flex items-center justify-center">
                  <span className="text-white font-black text-5xl">{targetUser.username?.[0]?.toUpperCase()}</span>
                </div>}
            </div>
            {(status === 'calling' || status === 'ringing') && (
              <div className="absolute inset-0 rounded-full border-4 border-primary/40 animate-ping" />
            )}
          </div>
          <p className="text-white font-black text-3xl mb-2">{targetUser.username}</p>
          <p className="text-gray-300 text-lg">
            {status === 'calling' ? '🔔 Inapiga...' : status === 'ringing' ? '📞 Inajibu...' : status === 'connected' ? `✅ ${fmt(callTime)}` : '📵 Imeisha'}
          </p>
          {!isVideo && status === 'connected' && (
            <div className="mt-4 flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white text-sm">{fmt(callTime)}</span>
            </div>
          )}
        </div>
      )}

      {/* Timer overlay for video calls */}
      {isVideo && status === 'connected' && showControls && (
        <div className="absolute top-12 left-4 z-20 bg-black/50 rounded-xl px-3 py-1.5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-white text-sm font-mono font-bold">{fmt(callTime)}</span>
        </div>
      )}

      {/* PiP local video - draggable */}
      {isVideo && (
        <div
          ref={pipRef}
          className="absolute z-20 rounded-2xl overflow-hidden border-2 border-white/40 shadow-2xl cursor-pointer"
          style={{
            width: '100px', height: '140px',
            bottom: `${16 - pipPos.y}px`,
            right: `${16 - pipPos.x}px`,
            boxShadow: isDragging ? '0 0 20px rgba(255,20,147,0.6)' : '0 4px 20px rgba(0,0,0,0.6)',
            transition: isDragging ? 'none' : 'box-shadow 0.2s',
          }}
          onTouchStart={handlePipTouchStart}
          onTouchMove={handlePipTouchMove}
          onTouchEnd={handlePipTouchEnd}
          onClick={e => e.stopPropagation()}
        >
          <video
            ref={mainIsRemote ? localVideoRef : remoteVideoRef}
            autoPlay playsInline muted={mainIsRemote}
            className="w-full h-full object-cover"
          />
          {camOff && mainIsRemote && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
              <VideoOff className="w-5 h-5 text-gray-400" />
            </div>
          )}
          {/* Swap hint */}
          <div className="absolute bottom-1 left-0 right-0 flex justify-center">
            <span className="text-white/60 text-[9px]">↕ Tap kugeuza</span>
          </div>
        </div>
      )}

      {/* Controls - WhatsApp style: single row, no labels */}
      <div className="absolute bottom-0 left-0 right-0 z-30" onClick={e => e.stopPropagation()}>
        <div className="pb-10 pt-4"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92), transparent)' }}>
          {showControls ? (
            /* Single row: [flip] [video] [mic] [speaker] [RED end] */
            <div className="flex items-center justify-center gap-5">
              {isVideo && (
                <button onPointerDown={(e) => { e.stopPropagation(); flipCamera(); }} onClick={(e) => { e.stopPropagation(); flipCamera(); }}
                  className="w-12 h-12 rounded-full bg-white/20 border border-white/30 flex items-center justify-center active:scale-90 transition-all">
                  <FlipHorizontal className="w-5 h-5 text-white" />
                </button>
              )}
              {isVideo && (
                <button onClick={(e) => { e.stopPropagation(); toggleCam(); }}
                  className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-all ${camOff ? 'bg-white/10' : 'bg-white/20 border border-white/30'}`}>
                  {camOff ? <VideoOff className="w-5 h-5 text-white/50" /> : <Video className="w-5 h-5 text-white" />}
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); toggleMic(); }}
                className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-all ${micMuted ? 'bg-white/10' : 'bg-white/20 border border-white/30'}`}>
                {micMuted ? <MicOff className="w-5 h-5 text-white/50" /> : <Mic className="w-5 h-5 text-white" />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); toggleSpeaker(); }}
                className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-all ${speakerOff ? 'bg-white/10' : 'bg-white/20 border border-white/30'}`}>
                {speakerOff ? <VolumeX className="w-5 h-5 text-white/50" /> : <Volume2 className="w-5 h-5 text-white" />}
              </button>
              {/* Red end call - always center/prominent */}
              <button onPointerDown={(e) => { e.stopPropagation(); endCall(); }} onClick={(e) => { e.stopPropagation(); endCall(); }}
                className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center shadow-2xl active:scale-90 transition-transform"
                style={{ boxShadow: '0 0 24px rgba(220,38,38,0.8)' }}>
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
            </div>
          ) : (
            /* Controls hidden: only end call visible */
            <div className="flex justify-center">
              <button onPointerDown={(e) => { e.stopPropagation(); endCall(); }} onClick={(e) => { e.stopPropagation(); endCall(); }}
                className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center shadow-2xl active:scale-90 transition-transform"
                style={{ boxShadow: '0 0 24px rgba(220,38,38,0.8)' }}>
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Back button (top left) when controls shown */}
      {showControls && (
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}
          onClick={e => e.stopPropagation()}>
          <button onClick={endCall} className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="text-center">
            <p className="text-white font-bold text-sm">{targetUser.username}</p>
            <p className="text-gray-300 text-xs">
              {status === 'calling' ? 'Inapiga simu...' : status === 'ringing' ? 'Inajibu...' : status === 'connected' ? fmt(callTime) : ''}
            </p>
          </div>
          <div className="w-10" />
        </div>
      )}
    </div>
  );
}

// ─── Main ViewProfile ──────────────────────────────────────────────────────
export default function ViewProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile: myProfile, user, requireAuth } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCallOptions, setShowCallOptions] = useState(false);
  const [showVideoOptions, setShowVideoOptions] = useState(false);
  const [activeCall, setActiveCall] = useState<{ type: 'audio' | 'video'; isAnswering?: boolean } | null>(null);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [settings, setSettings] = useState<any>({});
  // Global username font settings from admin
  const [usernameFontSize, setUsernameFontSize] = useState(22);
  const [usernameFontStyle, setUsernameFontStyle] = useState('default');
  const [usernameFontFamily, setUsernameFontFamily] = useState('inherit');
  const [usernameFontWeight, setUsernameFontWeight] = useState(800);
  const [usernameFontItalic, setUsernameFontItalic] = useState('normal');

  const applyFontSettings = (fontStyle: string, fontSize: string) => {
    const size = parseInt(fontSize) || 22;
    setUsernameFontSize(size);
    setUsernameFontStyle(fontStyle);
    const ff = fontStyle === 'dancing' ? 'Dancing Script, cursive' :
      fontStyle === 'pacifico' ? 'Pacifico, cursive' :
      fontStyle === 'lobster' ? 'Lobster, cursive' : 'inherit';
    setUsernameFontFamily(ff);
    setUsernameFontWeight(fontStyle === 'bold' ? 900 : 800);
    setUsernameFontItalic(fontStyle === 'bold' ? 'italic' : 'normal');
  };

  const isPrivileged = myProfile?.is_vip || myProfile?.is_business || myProfile?.is_admin;
  // Also check gift profile unlock credits
  const giftProfileCredits = user ? parseInt(localStorage.getItem(`gift_profile_credits_${user.id}`) || '0') : 0;
  const canInteractWithProfile = isPrivileged || giftProfileCredits > 0 || profile?.is_admin || profile?.is_business;
  const isOwnProfile = user && id === user.id;

  // Handle username_handle lookup (for /u/:handle routes)
  useEffect(() => {
    if (!id) return;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(id);
    if (!isUUID) {
      supabase.from('user_profiles').select('id').eq('username_handle', id.toLowerCase()).maybeSingle().then(({ data }) => {
        if (data?.id) navigate(`/profile/${data.id}`, { replace: true });
      });
    }
  }, [id]);

  useEffect(() => {
    if (!id) { navigate(-1); return; }
    fetchProfile();

    // Load blue tick expiry from gift_cards DB
    const loadBlueTickExpiry = async () => {
      const { data } = await supabase.from('gift_card_uses').select('card:card_id(blue_tick_type, expires_at)').eq('user_id', id);
      if (data) {
        for (const use of data) {
          const card = (use as any).card;
          if (card?.expires_at) {
            try { localStorage.setItem(`bt_expiry_${id}`, card.expires_at); } catch {}
            break;
          }
        }
      }
    };
    loadBlueTickExpiry();

    // Load settings: try localStorage cache first (instant), then DB
    const loadSettings = async () => {
      try {
        const cached = localStorage.getItem('slr_settings_cache');
        if (cached) {
          const m = JSON.parse(cached);
          setSettings(m);
          applyFontSettings(m.username_font_style || 'default', m.username_font_size || '22');
        }
      } catch {}
      const { data } = await supabase.from('app_settings').select('*');
      const m: any = {}; data?.forEach((r: any) => { m[r.key] = r.value; }); setSettings(m);
      applyFontSettings(m.username_font_style || 'default', m.username_font_size || '22');
      try { localStorage.setItem('slr_settings_cache', JSON.stringify(m)); } catch {}
    };
    loadSettings();

    // Listen to admin settings updates in real-time
    const settingsListener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      setSettings((prev: any) => ({ ...prev, ...detail }));
      // Apply username font settings whenever ANY setting changes
      const newStyle = detail.username_font_style ?? undefined;
      const newSize = detail.username_font_size ?? undefined;
      if (newStyle !== undefined || newSize !== undefined) {
        applyFontSettings(
          newStyle !== undefined ? newStyle : (detail.username_font_style || 'default'),
          newSize !== undefined ? newSize : (detail.username_font_size || '22')
        );
      }
    };
    // Also listen to localStorage changes (cross-tab sync)
    const storageListener = (e: StorageEvent) => {
      if (e.key === 'slr_settings_cache' && e.newValue) {
        try {
          const m = JSON.parse(e.newValue);
          setSettings(m);
          applyFontSettings(m.username_font_style || 'default', m.username_font_size || '22');
        } catch {}
      }
    };
    window.addEventListener('app-settings-updated', settingsListener);
    window.addEventListener('storage', storageListener);
    // Poll profile every 5s so admin changes (VIP, blue_tick, username) show without reload
    const profileInterval = setInterval(fetchProfile, 5000);
    return () => {
      window.removeEventListener('app-settings-updated', settingsListener);
      window.removeEventListener('storage', storageListener);
      clearInterval(profileInterval);
    };
  }, [id]);

  useEffect(() => {
    if (!id || !user || !profile || id === user.id) return;
    const checkIncoming = async () => {
      const since = new Date(Date.now() - 20000).toISOString();
      const { data } = await supabase.from('room_messages').select('*').eq('media_type', 'signal').eq('user_id', id).gte('created_at', since).order('created_at', { ascending: false }).limit(15);
      for (const msg of (data || [])) {
        try {
          const signal = JSON.parse(msg.content || '');
          if (signal.type === 'offer' && (signal.channel?.includes(user.id) || signal.targetUserId === user.id)) {
            // Go directly to call without pre-call screen
            setActiveCall({ type: signal.isVideo ? 'video' : 'audio', isAnswering: true });
            break;
          }
        } catch {}
      }
    };
    checkIncoming();
  }, [id, user, profile]);

  async function fetchProfile() {
    const { data } = await supabase.from('user_profiles').select('*').eq('id', id).single();
    setProfile(data as UserProfile);
    setLoading(false);
  }

  async function shareProfile() {
    const link = `${window.location.origin}/profile/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: profile?.username || 'Profile', url: link });
      else { await navigator.clipboard.writeText(link); toast.success('Link imenakiliwa!'); }
    } catch { await navigator.clipboard.writeText(`${window.location.origin}/profile/${id}`).catch(() => {}); }
  }

  function handleMessage() {
    requireAuth(() => {
      const targetIsAdminOrBusiness = profile?.is_admin || profile?.is_business;
      if (!canInteractWithProfile && !targetIsAdminOrBusiness) { setShowPlanPicker(true); return; }
      // Deduct gift profile credit if used
      if (!isPrivileged && giftProfileCredits > 0) {
        const newCreds = Math.max(0, giftProfileCredits - 1);
        try { localStorage.setItem(`gift_profile_credits_${user!.id}`, String(newCreds)); } catch {}
      }
      navigate(`/chat/${id}`);
    });
  }

  function handleCallWhatsApp() {
    const canView = canInteractWithProfile;
    if (!canView) { setShowPlanPicker(true); return; }
    if (!isPrivileged && giftProfileCredits > 0) {
      const newCreds = Math.max(0, giftProfileCredits - 1);
      try { localStorage.setItem(`gift_profile_credits_${user!.id}`, String(newCreds)); } catch {}
    }
    const num = (profile?.whatsapp || profile?.phone || '').replace(/\D/g, '');
    if (num) window.open(`https://wa.me/${num}`, '_blank');
    else toast.info('Mtu huyu hana namba ya mawasiliano');
  }

  function handleVideoCallWhatsApp() {
    const canView = canInteractWithProfile;
    if (!canView) { setShowPlanPicker(true); return; }
    if (!isPrivileged && giftProfileCredits > 0) {
      const newCreds = Math.max(0, giftProfileCredits - 1);
      try { localStorage.setItem(`gift_profile_credits_${user!.id}`, String(newCreds)); } catch {}
    }
    const num = (profile?.whatsapp || profile?.phone || '').replace(/\D/g, '');
    if (num) window.open(`https://wa.me/${num}?text=Nataka%20Video%20Call`, '_blank');
    else toast.info('Mtu huyu hana namba ya mawasiliano');
  }

  function startPreCall(type: 'audio' | 'video') {
    requireAuth(() => {
      if (!canInteractWithProfile) { setShowCallOptions(false); setShowVideoOptions(false); setShowPlanPicker(true); return; }
      // Deduct gift profile credit
      if (!isPrivileged && giftProfileCredits > 0) {
        const newCreds = Math.max(0, giftProfileCredits - 1);
        try { localStorage.setItem(`gift_profile_credits_${user!.id}`, String(newCreds)); } catch {}
      }
      setShowCallOptions(false); setShowVideoOptions(false);
      setActiveCall({ type });
    });
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-gray-400">Profaili haipatikani</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* No pre-call permission screen - go directly to call */}

      {/* Active WebRTC call overlay */}
      {activeCall && myProfile && profile && (
        <WebRTCCall
          targetUserId={id!} targetUser={profile} myProfile={myProfile}
          isVideo={activeCall.type === 'video'} isAnswering={activeCall.isAnswering}
          onEnd={() => setActiveCall(null)}
        />
      )}

      {/* Cover photo */}
      <div className="relative h-52 bg-[#1a0a1a]">
        {profile.cover_url ?
          <img src={profile.cover_url} alt="Cover" className="w-full h-full object-cover" /> :
          <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, rgba(255,20,147,0.5), rgba(155,31,232,0.5))' }} />}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex gap-2">
            {/* Gift icon where share was - anyone can send gift */}
            {!isOwnProfile && (
              <button onClick={() => requireAuth(() => setShowGiftModal(true))} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,140,0,0.75)', backdropFilter: 'blur(8px)' }}>
                <span className="text-base">🎁</span>
              </button>
            )}
          </div>
        </div>
        <div className="absolute -bottom-14 left-4">
          <div className="w-28 h-28 rounded-full overflow-hidden" style={{ border: '3px solid #FF1493', boxShadow: '0 4px 20px rgba(255,20,147,0.4)' }}>
            {profile.avatar_url ?
              <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" /> :
              <div className="w-full h-full gradient-pink flex items-center justify-center">
                <span className="text-white font-bold text-4xl">{profile.username?.[0]?.toUpperCase()}</span>
              </div>}
          </div>
        </div>
      </div>

      <div className="px-4 pt-16 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="text-white font-black" style={{
                fontSize: `${usernameFontSize}px`,
                fontFamily: usernameFontFamily,
                fontWeight: usernameFontWeight,
                fontStyle: usernameFontItalic,
              }}>{profile.username}</h2>
              {profile.blue_tick && <BlueTick tickId={profile.blue_tick} size={22} />}
              {/* Blue tick countdown */}
              {profile.blue_tick && (() => {
                // Read expiry from gift_cards if available
                const storageKey = `bt_expiry_${profile.id}`;
                const stored = localStorage.getItem(storageKey);
                if (stored) {
                  const exp = new Date(stored);
                  const now = new Date();
                  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  if (daysLeft <= 0) return <span className="text-red-400 text-[10px] font-semibold">⚠️ Imeisha</span>;
                  return <span className="text-yellow-400 text-[10px] font-semibold">⏰ {daysLeft} siku</span>;
                }
                return null;
              })()}
            </div>
            <div className="flex gap-2 flex-wrap">
              {profile.is_vip && <span className="vip-badge">👑 VIP Member</span>}
              {profile.is_business && <span className="text-xs bg-blue-600/30 text-blue-300 px-2 py-1 rounded-full font-semibold">💼 Business</span>}
              {profile.is_admin && <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full font-semibold">⚡ Admin</span>}
            </div>
          </div>
          {isOwnProfile && (
            <button onClick={() => navigate('/profile/edit')} className="btn-primary text-sm py-2 px-4">Hariri</button>
          )}
        </div>

        {!isOwnProfile && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            <button onClick={handleMessage} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl active:scale-95 transition-transform" style={{ background: 'rgba(255,20,147,0.15)', border: '1px solid rgba(255,20,147,0.3)' }}>
              <MessageCircle className="w-5 h-5 text-primary" />
              <span className="text-primary text-xs font-semibold">Ujumbe</span>
            </button>
            <button onClick={() => requireAuth(() => setShowCallOptions(true))} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl active:scale-95 transition-transform" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <Phone className="w-5 h-5 text-green-400" />
              <span className="text-green-400 text-xs font-semibold">Simu</span>
            </button>
            <button onClick={() => requireAuth(() => setShowVideoOptions(true))} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl active:scale-95 transition-transform" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
              <Video className="w-5 h-5 text-blue-400" />
              <span className="text-blue-400 text-xs font-semibold">Video</span>
            </button>
            <button onClick={() => requireAuth(() => setShowGiftModal(true))} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl active:scale-95 transition-transform" style={{ background: 'rgba(255,140,0,0.15)', border: '1px solid rgba(255,140,0,0.3)' }}>
              <Gift className="w-5 h-5 text-orange-400" />
              <span className="text-orange-400 text-xs font-semibold">Zawadi</span>
            </button>
          </div>
        )}

        <button onClick={shareProfile} className="btn-outline w-full flex items-center justify-center gap-2">
          <Share2 className="w-5 h-5" /> Shiriki Profaili
        </button>
      </div>

      {/* Call Options Modal */}
      {showCallOptions && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center" onClick={() => setShowCallOptions(false)}>
          <div className="w-full max-w-md bg-[#0d0d0d] border-t border-[#3d0b3d] rounded-t-3xl p-6 slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-bold text-lg">📞 Piga Simu</h3>
              <button onClick={() => setShowCallOptions(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <button onClick={() => startPreCall('audio')} className="w-full flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'rgba(255,20,147,0.15)', border: '1px solid rgba(255,20,147,0.3)' }}>
                <div className="w-12 h-12 rounded-full gradient-pink flex items-center justify-center flex-shrink-0"><Phone className="w-6 h-6 text-white" /></div>
                <div className="text-left">
                  <p className="text-white font-bold">Simu ya App (Audio)</p>
                  <p className="text-gray-400 text-xs">Sauti tu ndani ya app</p>
                </div>
              </button>
              <button onClick={() => startPreCall('video')} className="w-full flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0"><Video className="w-6 h-6 text-white" /></div>
                <div className="text-left">
                  <p className="text-white font-bold">Video Call ya App</p>
                  <p className="text-gray-400 text-xs">Camera + sauti ndani ya app</p>
                </div>
              </button>
              <button onClick={() => { setShowCallOptions(false); handleCallWhatsApp(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)' }}>
                <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"><span className="text-white text-xl font-bold">W</span></div>
                <div className="text-left">
                  <p className="text-white font-bold">WhatsApp</p>
                  <p className="text-gray-400 text-xs">Simu kupitia WhatsApp</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Call Options Modal */}
      {showVideoOptions && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center" onClick={() => setShowVideoOptions(false)}>
          <div className="w-full max-w-md bg-[#0d0d0d] border-t border-[#3d0b3d] rounded-t-3xl p-6 slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-bold text-lg">🎥 Video Call</h3>
              <button onClick={() => setShowVideoOptions(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <button onClick={() => startPreCall('video')} className="w-full flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0"><Video className="w-6 h-6 text-white" /></div>
                <div className="text-left">
                  <p className="text-white font-bold">Video Call ya App</p>
                  <p className="text-gray-400 text-xs">Camera + sauti ndani ya app</p>
                </div>
              </button>
              <button onClick={() => { setShowVideoOptions(false); handleVideoCallWhatsApp(); }} className="w-full flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)' }}>
                <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"><span className="text-white text-xl font-bold">W</span></div>
                <div className="text-left">
                  <p className="text-white font-bold">Video Call WhatsApp</p>
                  <p className="text-gray-400 text-xs">Video kupitia WhatsApp</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlanPicker && (
        <PlanPickerModal onClose={() => setShowPlanPicker(false)} settings={settings} onSuccess={() => setShowPlanPicker(false)} />
      )}

      {/* Gift Modal for ViewProfile */}
      {showGiftModal && profile && myProfile && (
        <ViewProfileGiftModal targetUser={profile} myProfile={myProfile} settings={settings} onClose={() => setShowGiftModal(false)} />
      )}
    </div>
  );
}

// Gift modal component for ViewProfile
function ViewProfileGiftModal({ targetUser, myProfile, settings, onClose }: { targetUser: any; myProfile: any; settings: any; onClose: () => void }) {
  const GIFT_OPTIONS = [
    { emoji: '🌹', name: 'Waridi', amount: 100 },
    { emoji: '💐', name: 'Maua', amount: 200 },
    { emoji: '🍫', name: 'Chokoleti', amount: 500 },
    { emoji: '💍', name: 'Pete', amount: 1000 },
    { emoji: '🧸', name: 'Teddy', amount: 2000 },
    { emoji: '💎', name: 'Almasi', amount: 5000 },
    { emoji: '🏆', name: 'Trophy', amount: 10000 },
    { emoji: '🚗', name: 'Gari', amount: 50000 },
  ];
  const [selected, setSelected] = useState<typeof GIFT_OPTIONS[0] | null>(null);
  const [walletPass, setWalletPass] = useState('');
  const [sending, setSending] = useState(false);
  const { supabase: _, user, profile: myProf, refreshProfile } = useAuth() as any;
  const giftBal = (myProf as any)?.gift_balance || 0;
  const mainBal = (myProf as any)?.balance || 0;

  async function handleSend() {
    if (!selected || !user) return;
    const amt = selected.amount;
    const canUseGift = giftBal >= amt;
    if (!canUseGift && mainBal < amt) return toast.error(`Salio halitooshi. Unahitaji TZS ${amt.toLocaleString()}`);
    if (myProf?.wallet_password && walletPass !== myProf.wallet_password) return toast.error('Password ya wallet si sahihi!');
    setSending(true);
    try {
      const { supabase: sb } = await import('@/lib/supabase');
      if (canUseGift) {
        await sb.from('user_profiles').update({ gift_balance: giftBal - amt }).eq('id', user.id);
      } else {
        await sb.from('user_profiles').update({ balance: mainBal - amt }).eq('id', user.id);
      }
      const { data: recvProf } = await sb.from('user_profiles').select('gift_balance').eq('id', targetUser.id).single();
      await sb.from('user_profiles').update({ gift_balance: ((recvProf as any)?.gift_balance || 0) + amt }).eq('id', targetUser.id);
      await sb.from('notifications').insert({ user_id: targetUser.id, title: `🎁 Umepata Zawadi!`, message: `${myProf?.username} amekutumia ${selected.emoji} ${selected.name} - TZS ${amt.toLocaleString()} (Profaili)!`, type: 'gift', link: '/wallet?tab=gifts' });
      await sb.from('transactions').insert({ user_id: targetUser.id, amount: amt, type: 'gift_received', status: 'approved', description: `Zawadi ${selected.emoji} ${selected.name} | Kutoka: ${myProf?.username} | Chanzo: Profaili` });
      await sb.from('transactions').insert({ user_id: user.id, amount: amt, type: 'gift_sent', status: 'approved', description: `Zawadi ${selected.emoji} ${selected.name} | Kwa: ${targetUser.username} | Chanzo: Profaili` });
      // Sender notification too
      await sb.from('notifications').insert({ user_id: user.id, title: `🎁 Zawadi Imetumwa`, message: `Umetuma ${selected.emoji} ${selected.name} kwa ${targetUser.username} - TZS ${amt.toLocaleString()} (Profaili)`, type: 'gift', link: '/wallet?tab=gifts' });
      if (refreshProfile) await refreshProfile();
      toast.success(`🎁 ${selected.emoji} Zawadi ya TZS ${amt.toLocaleString()} imetumwa kwa ${targetUser.username}!`);
      onClose();
    } catch { toast.error('Hitilafu ya kutuma zawadi'); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-5 slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-3">
          <h3 className="text-white font-bold flex items-center gap-2"><Gift className="w-5 h-5 text-orange-400" /> Tuma Zawadi kwa {targetUser.username}</h3>
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
              <span className="text-gray-400 text-sm">{selected.emoji} {selected.name}</span>
              <span className="text-primary font-bold">TZS {selected.amount.toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#1a0a1a] rounded-lg p-2 text-center"><p className="text-gray-500">Zawadi</p><p className="text-orange-400 font-bold">TZS {giftBal.toLocaleString()}</p></div>
              <div className="bg-[#1a0a1a] rounded-lg p-2 text-center"><p className="text-gray-500">Salio Kuu</p><p className="text-green-400 font-bold">TZS {mainBal.toLocaleString()}</p></div>
            </div>
            {myProf?.wallet_password && (
              <input value={walletPass} onChange={e => setWalletPass(e.target.value)} placeholder="Password ya wallet" type="password" className="input-field text-sm" />
            )}
            <button onClick={handleSend} disabled={sending} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>{selected.emoji}</span>}
              {sending ? 'Inatuma...' : `Tuma ${selected.emoji} - TZS ${selected.amount.toLocaleString()}`}
            </button>
            <p className="text-gray-600 text-xs text-center">Pesa zitatoka: {giftBal >= selected.amount ? '🎁 Zawadi' : '💰 Salio Kuu'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
