import { useRef, useEffect, useState } from 'react';
import { X, Crown, Gift, Users, BarChart3, Mic, MicOff, Minus, Shield, VolumeX, Trash2, PhoneCall, MoreVertical } from 'lucide-react';
import BlueTick from '@/components/features/BlueTick';
import { supabase } from '@/lib/supabase';

export function fmtCoins(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function fmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function Avatar({ url, name, size = 8 }: { url?: string; name?: string; size?: number }) {
  const s = size * 4;
  if (url) return (
    <div className="rounded-full overflow-hidden flex-shrink-0" style={{ width: s, height: s }}>
      <img src={url} className="w-full h-full object-cover" alt="" />
    </div>
  );
  return (
    <div className="rounded-full overflow-hidden flex-shrink-0 gradient-pink flex items-center justify-center"
      style={{ width: s, height: s }}>
      <span className="text-white font-bold" style={{ fontSize: size * 1.5 }}>{name?.[0]?.toUpperCase() || '?'}</span>
    </div>
  );
}

// ─── Speaking detector ───────────────────────────────────────────────────────
export function useSpeakingDetector(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (!stream) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const check = () => {
        analyser.getByteFrequencyData(data);
        setSpeaking(data.reduce((a, b) => a + b, 0) / data.length > 15);
        rafRef.current = requestAnimationFrame(check);
      };
      check();
    } catch {}
    return () => { cancelAnimationFrame(rafRef.current); try { ctx?.close(); } catch {} };
  }, [stream]);
  return speaking;
}

// ─── Guest Video Panel ───────────────────────────────────────────────────────
export const GUEST_COLORS = ['#FF1493', '#00BFFF', '#32CD32', '#FFD700', '#FF6347', '#9400D3'];

export function GuestVideoPanel({ guest, stream, muted, onMute, onRemove, isHost }: {
  guest: { userId: string; username: string; avatarUrl?: string; color: string };
  stream?: MediaStream; muted: boolean;
  onMute: () => void; onRemove: () => void; isHost: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const speaking = useSpeakingDetector(stream || null);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    if (videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div className="relative overflow-hidden bg-[#080808] h-full w-full"
      style={{
        border: `2px solid ${speaking ? guest.color : 'transparent'}`,
        borderRadius: 8,
        boxShadow: speaking ? `0 0 16px ${guest.color}88` : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}>
      <video ref={videoRef} autoPlay playsInline muted={muted}
        className="w-full h-full" style={{ objectFit: 'contain', background: '#080808' }} />
      {speaking && (
        <div className="absolute inset-0 pointer-events-none rounded"
          style={{ border: `3px solid ${guest.color}`, animation: 'speakPulse 0.8s ease-in-out infinite', borderRadius: 6 }} />
      )}
      <div className="absolute bottom-1 left-1 bg-black/70 rounded-full px-1.5 py-0.5 flex items-center gap-1">
        <div className={`w-1.5 h-1.5 rounded-full ${speaking ? 'bg-green-400' : muted ? 'bg-red-500' : 'bg-gray-500'}`} />
        <span className="text-white text-[9px] font-bold truncate max-w-[55px]">{guest.username}</span>
      </div>
      {isHost && (
        <div className="absolute top-1 right-1 flex gap-0.5">
          <button onClick={onMute}
            className={`w-6 h-6 rounded-full flex items-center justify-center ${muted ? 'bg-red-500/90' : 'bg-black/60'}`}>
            {muted ? <MicOff className="w-3 h-3 text-white" /> : <Mic className="w-3 h-3 text-white" />}
          </button>
          <button onClick={onRemove} className="w-6 h-6 rounded-full bg-red-500/90 flex items-center justify-center">
            <Minus className="w-3 h-3 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Guest Grid ──────────────────────────────────────────────────────────────
export function GuestGrid({ guests, guestStreamsRef, guestMuted, onMuteGuest, onRemoveGuest, isHost }: {
  guests: { userId: string; username: string; avatarUrl?: string; color: string }[];
  guestStreamsRef: React.MutableRefObject<Map<string, MediaStream>>;
  guestMuted: Set<string>;
  onMuteGuest: (uid: string) => void;
  onRemoveGuest: (uid: string) => void;
  isHost: boolean;
}) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  const count = guests.length;
  const cols = count <= 1 ? 1 : count <= 2 ? 2 : count <= 4 ? 2 : 3;
  return (
    <div className="w-full h-full" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2 }}>
      {guests.map(g => (
        <GuestVideoPanel key={g.userId} guest={g}
          stream={guestStreamsRef.current.get(g.userId)}
          muted={guestMuted.has(g.userId)}
          onMute={() => onMuteGuest(g.userId)}
          onRemove={() => onRemoveGuest(g.userId)}
          isHost={isHost} />
      ))}
    </div>
  );
}

// ─── Leaderboard Panel ───────────────────────────────────────────────────────
export function LeaderboardPanel({ gifters, onClose }: { gifters: any[]; onClose: () => void }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="absolute inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-white/10 pb-6"
      style={{ maxHeight: '60vh', background: 'rgba(10,3,15,0.98)', overflowY: 'auto' }}
      onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0"
        style={{ background: 'rgba(10,3,15,0.98)' }}>
        <div className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-yellow-400" />
          <span className="text-white font-black text-base">Top Gifters</span>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <X className="w-4 h-4 text-white" />
        </button>
      </div>
      <div className="px-4 py-3 space-y-2">
        {gifters.length === 0
          ? <p className="text-gray-500 text-center py-8">Hakuna zawadi bado</p>
          : gifters.slice(0, 10).map((g, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl px-4 py-3 border border-white/8"
              style={{ background: 'rgba(26,10,26,0.8)' }}>
              <span className="text-xl flex-shrink-0">{medals[i] || `#${i + 1}`}</span>
              <Avatar url={g.avatar_url} name={g.username} size={9} />
              <span className="text-white font-semibold text-sm flex-1 truncate">@{g.username}</span>
              <div className="text-right flex-shrink-0">
                <p className="text-yellow-400 font-black">{fmtCoins(g.total)}</p>
                <p className="text-gray-600 text-[9px]">coins</p>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Gift Panel ──────────────────────────────────────────────────────────────
export const GIFTS = [
  { type: 'rose', emoji: '🌹', label: 'Waridi', coins: 100 },
  { type: 'heart', emoji: '❤️', label: 'Moyo', coins: 200 },
  { type: 'diamond', emoji: '💎', label: 'Almasi', coins: 500 },
  { type: 'lion', emoji: '🦁', label: 'Simba', coins: 1000 },
  { type: 'car', emoji: '🚗', label: 'Gari', coins: 2000 },
  { type: 'castle', emoji: '🏰', label: 'Kasri', coins: 5000 },
  { type: 'rocket', emoji: '🚀', label: 'Roketi', coins: 10000 },
  { type: 'universe', emoji: '🌌', label: 'Ulimwengu', coins: 50000 },
];

export function GiftPanel({ selGift, setSelGift, onSend, onClose, battle, giftTarget, setGiftTarget, hostName, opponentName }: {
  selGift: typeof GIFTS[0]; setSelGift: (g: typeof GIFTS[0]) => void;
  onSend: () => void; onClose: () => void;
  battle?: any; giftTarget: 'host' | 'battle'; setGiftTarget: (t: 'host' | 'battle') => void;
  hostName?: string; opponentName?: string;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 rounded-t-3xl"
      style={{ maxHeight: '65vh', overflowY: 'auto', background: 'rgba(10,3,15,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none' }}
      onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0"
        style={{ background: 'rgba(10,3,15,0.98)' }}>
        <span className="text-white font-black text-lg">Zawadi 🎁</span>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <X className="w-4 h-4 text-white" />
        </button>
      </div>
      {battle?.active && !battle.winner && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-gray-400 text-xs mb-2 font-semibold">⚔️ Tuma zawadi kwa:</p>
          <div className="flex gap-2">
            <button onClick={() => setGiftTarget('host')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold ${giftTarget === 'host' ? 'gradient-pink text-white' : 'bg-white/8 text-gray-400'}`}>
              {hostName}
            </button>
            <button onClick={() => setGiftTarget('battle')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold ${giftTarget === 'battle' ? 'text-black' : 'bg-white/8 text-gray-400'}`}
              style={giftTarget === 'battle' ? { background: '#FFD700' } : {}}>
              {opponentName} ⚔️
            </button>
          </div>
        </div>
      )}
      <div className="p-4">
        <div className="grid grid-cols-4 gap-3 mb-5">
          {GIFTS.map(g => (
            <button key={g.type} onClick={() => setSelGift(g)}
              className="flex flex-col items-center gap-1 p-2.5 rounded-2xl transition-all"
              style={{
                border: `2px solid ${selGift.type === g.type ? 'rgba(255,20,147,0.8)' : 'transparent'}`,
                background: selGift.type === g.type ? 'rgba(255,20,147,0.15)' : 'rgba(255,255,255,0.05)',
                transform: selGift.type === g.type ? 'scale(1.05)' : 'scale(1)',
              }}>
              <span className="text-2xl">{g.emoji}</span>
              <span className="text-[9px] text-gray-400">{g.label}</span>
              <span className="text-[9px] text-yellow-400 font-bold">{fmtCoins(g.coins)}</span>
            </button>
          ))}
        </div>
        <button onClick={onSend}
          className="w-full py-4 gradient-pink rounded-2xl text-white font-black text-base flex items-center justify-center gap-2">
          {selGift.emoji} Tuma {selGift.label} — {fmtCoins(selGift.coins)} coins
        </button>
      </div>
    </div>
  );
}

// ─── Viewers Panel ───────────────────────────────────────────────────────────
export function ViewersPanel({ viewers, viewerList, onClose, isHost, userId, sessionId, sendSig, setGuests, muteUser }: {
  viewers: number; viewerList: any[]; onClose: () => void; isHost: boolean;
  userId?: string; sessionId?: string; sendSig: (p: any) => void;
  setGuests: React.Dispatch<React.SetStateAction<any[]>>; muteUser: (uid: string) => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 rounded-t-3xl"
      style={{ maxHeight: '72vh', display: 'flex', flexDirection: 'column', background: 'rgba(10,3,15,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none' }}
      onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <span className="text-white font-black text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />Watazamaji ({viewers})
        </span>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <X className="w-4 h-4 text-white" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {viewerList.length === 0
          ? <div className="flex items-center justify-center py-12 text-gray-500"><p>Hakuna watazamaji</p></div>
          : viewerList.map((v: any, i) => v && (
            <div key={v.id || i} className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
              <Avatar url={v.avatar_url} name={v.username} size={10} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-white font-semibold text-sm truncate">{v.username}</span>
                  {v.blue_tick && <BlueTick tickId={v.blue_tick} size={11} />}
                  {v.is_vip && <span className="text-[8px] bg-yellow-500/20 text-yellow-400 px-1 rounded-full">VIP</span>}
                </div>
              </div>
              {isHost && v.id !== userId && (
                <div className="flex gap-1.5">
                  <button onClick={() => {
                    sendSig({ type: 'cohost_accepted', to: v.id, from: userId, sid: sessionId });
                    setGuests(prev => prev.find((g: any) => g.userId === v.id) ? prev : [...prev, { userId: v.id, username: v.username, avatarUrl: v.avatar_url, color: GUEST_COLORS[prev.length % GUEST_COLORS.length] }]);
                    onClose();
                  }} className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                    <PhoneCall className="w-3.5 h-3.5 text-blue-400" />
                  </button>
                  <button onClick={() => muteUser(v.id)}
                    className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                    <VolumeX className="w-3.5 h-3.5 text-orange-400" />
                  </button>
                </div>
              )}
            </div>
          ))}
        <div className="h-4" />
      </div>
    </div>
  );
}

// ─── Queue Panel ─────────────────────────────────────────────────────────────
export function QueuePanel({ reqQueue, onAccept, onDecline, onClose }: {
  reqQueue: any[]; onAccept: (req: any) => void; onDecline: (req: any) => void; onClose: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 rounded-t-3xl"
      style={{ maxHeight: '65vh', display: 'flex', flexDirection: 'column', background: 'rgba(10,3,15,0.98)', border: '1px solid rgba(59,130,246,0.3)', borderBottom: 'none' }}
      onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <span className="text-white font-black text-base">Maombi ({reqQueue.length})</span>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <X className="w-4 h-4 text-white" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {reqQueue.length === 0
          ? <div className="text-center py-10 text-gray-500"><p>Hakuna maombi</p></div>
          : reqQueue.map((req, idx) => (
            <div key={req.userId} className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: 'rgba(26,10,42,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                style={{ background: 'rgba(255,20,147,0.5)' }}>{idx + 1}</div>
              <Avatar url={req.avatarUrl} name={req.username} size={10} />
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">@{req.username}</p>
                <p className="text-gray-500 text-xs">Anaomba kujiunga</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => onAccept(req)}
                  className="px-4 py-2 rounded-xl text-sm font-black text-white"
                  style={{ background: 'rgba(34,197,94,0.8)' }}>✓</button>
                <button onClick={() => onDecline(req)}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-red-400"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>✗</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Mod menu ────────────────────────────────────────────────────────────────
export function ModMenu({ commentId, userId, isHost, onPin, onDelete, onMute, onMod, onClose }: {
  commentId: string; userId: string; isHost: boolean;
  onPin: () => void; onDelete: () => void; onMute: () => void; onMod: () => void; onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-5 z-30 min-w-[150px] rounded-xl overflow-hidden shadow-xl"
      style={{ background: 'rgba(20,5,20,0.98)', border: '1px solid rgba(255,255,255,0.12)' }}
      onClick={e => e.stopPropagation()}>
      <button onClick={onPin} className="flex items-center gap-2 px-3 py-2.5 text-white text-xs w-full hover:bg-white/5">📌 Pin</button>
      <button onClick={onDelete} className="flex items-center gap-2 px-3 py-2.5 text-red-400 text-xs w-full hover:bg-white/5">
        <Trash2 className="w-3 h-3" /> Futa
      </button>
      <button onClick={onMute} className="flex items-center gap-2 px-3 py-2.5 text-orange-400 text-xs w-full hover:bg-white/5">
        <VolumeX className="w-3 h-3" /> Nyamazisha
      </button>
      {isHost && (
        <button onClick={onMod} className="flex items-center gap-2 px-3 py-2.5 text-blue-400 text-xs w-full hover:bg-white/5">
          <Shield className="w-3 h-3" /> Msimamizi
        </button>
      )}
    </div>
  );
}
