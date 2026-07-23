// Shared utilities, types, and small components for TikSexy
import { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import BlueTick from '@/components/features/BlueTick';

export interface TikPost {
  id: string;
  type: string;
  media_url: string;
  thumbnail_url?: string;
  title?: string;
  description?: string;
  views: number;
  price: number;
  is_free: boolean;
  uploader_id?: string;
  uploader?: { username: string; avatar_url?: string; blue_tick?: string; is_admin?: boolean; is_business?: boolean };
  created_at: string;
  media_urls?: string[];
}

export interface LiveStream {
  id: string;
  name: string;
  cover_url?: string;
  type: string;
  price: number;
  whatsapp?: string;
  link?: string;
  is_online: boolean;
  is_active: boolean;
  display_order: number;
  uploader_id?: string;
  uploader?: { username: string; avatar_url?: string; blue_tick?: string; is_admin?: boolean; is_business?: boolean };
}

// ─── Video Cache Manager (IndexedDB + Cache API) ─────────────────────────────
const CACHE_NAME = 'tiksexy-videos-v3';
const IDB_NAME = 'tiksexy-cache';
const IDB_STORE = 'videos';
const MAX_CACHE_MB = 800; // max 800MB in cache

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(url: string): Promise<string | null> {
  try {
    const db = await openIDB();
    return new Promise(resolve => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(url);
      req.onsuccess = () => {
        if (req.result) resolve(URL.createObjectURL(req.result));
        else resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbPut(url: string, blob: Blob): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise(resolve => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(blob, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export const videoCache = {
  cacheName: CACHE_NAME,
  // Check Cache API first, then IndexedDB
  async get(url: string): Promise<string | null> {
    if (!url) return null;
    try {
      // 1. Try Cache API
      if ('caches' in window) {
        const cache = await caches.open(CACHE_NAME);
        const resp = await cache.match(url);
        if (resp) {
          const blob = await resp.blob();
          if (blob.size > 0) return URL.createObjectURL(blob);
        }
      }
      // 2. Try IndexedDB
      const idbResult = await idbGet(url);
      if (idbResult) return idbResult;
    } catch {}
    return null;
  },
  // Download and store in both Cache API and IndexedDB
  async put(url: string, onProgress?: (pct: number) => void): Promise<string | null> {
    if (!url) return null;
    try {
      // Check if already cached
      const existing = await this.get(url);
      if (existing) return existing;

      // Fetch with progress tracking
      const resp = await fetch(url, { mode: 'cors' });
      if (!resp.ok) return null;

      const contentLength = parseInt(resp.headers.get('Content-Length') || '0');
      const reader = resp.body?.getReader();
      if (!reader) return null;

      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (contentLength > 0 && onProgress) onProgress(Math.round(received / contentLength * 100));
      }

      const blob = new Blob(chunks, { type: resp.headers.get('Content-Type') || 'video/mp4' });

      // Store in Cache API
      if ('caches' in window) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(url, new Response(blob.slice(), { headers: { 'Content-Type': blob.type } }));
        } catch {}
      }

      // Store in IndexedDB as backup
      await idbPut(url, blob);

      return URL.createObjectURL(blob);
    } catch (e) {
      console.log('Cache put error:', e);
      return null;
    }
  },
  // Pre-fetch next video silently (no progress callback)
  async prefetch(url: string): Promise<void> {
    if (!url) return;
    const existing = await this.get(url);
    if (existing) { URL.revokeObjectURL(existing); return; } // already cached
    // Fetch silently in background
    fetch(url, { mode: 'cors' }).then(async resp => {
      if (!resp.ok) return;
      const blob = await resp.blob();
      if ('caches' in window) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(url, new Response(blob.slice(), { headers: { 'Content-Type': blob.type } }));
      }
      await idbPut(url, blob);
    }).catch(() => {});
  },
  async has(url: string): Promise<boolean> {
    if (!url) return false;
    const r = await this.get(url);
    if (r) { URL.revokeObjectURL(r); return true; }
    return false;
  },
};

export function getSaveData(): boolean {
  try { return localStorage.getItem('tiksexy_save_data') === '1'; } catch { return false; }
}
export function persistSaveData(v: boolean) {
  try { localStorage.setItem('tiksexy_save_data', v ? '1' : '0'); } catch {}
}

export const isVideoFile = (url: string) => /\.(mp4|webm|mov|avi|mkv|3gp|m4v)/i.test(url || '');

// ─── TikSexyLogo ──────────────────────────────────────────────────────────────
export function TikSexyLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M17 8 C17 8 17 22 17 26 C17 29.3 14.3 32 11 32 C7.7 32 5 29.3 5 26 C5 22.7 7.7 20 11 20 C12.1 20 13.1 20.3 14 20.8 L14 14.5 C13.1 14.2 12.1 14 11 14 C4.4 14 -1 19.4 -1 26 C-1 32.6 4.4 38 11 38 C17.6 38 23 32.6 23 26 L23 14 C25.3 15.8 28.1 17 31 17 L31 11 C27.7 11 25 8.3 25 5 L19 5 C19 6.7 18.2 8.2 17 9.2 Z"
        fill="rgba(0,255,255,0.35)" transform="translate(2, 2)" />
      <path d="M17 8 C17 8 17 22 17 26 C17 29.3 14.3 32 11 32 C7.7 32 5 29.3 5 26 C5 22.7 7.7 20 11 20 C12.1 20 13.1 20.3 14 20.8 L14 14.5 C13.1 14.2 12.1 14 11 14 C4.4 14 -1 19.4 -1 26 C-1 32.6 4.4 38 11 38 C17.6 38 23 32.6 23 26 L23 14 C25.3 15.8 28.1 17 31 17 L31 11 C27.7 11 25 8.3 25 5 L19 5 C19 6.7 18.2 8.2 17 9.2 Z"
        fill="rgba(255,20,147,0.35)" transform="translate(-2, -2)" />
      <path d="M17 8 C17 8 17 22 17 26 C17 29.3 14.3 32 11 32 C7.7 32 5 29.3 5 26 C5 22.7 7.7 20 11 20 C12.1 20 13.1 20.3 14 20.8 L14 14.5 C13.1 14.2 12.1 14 11 14 C4.4 14 -1 19.4 -1 26 C-1 32.6 4.4 38 11 38 C17.6 38 23 32.6 23 26 L23 14 C25.3 15.8 28.1 17 31 17 L31 11 C27.7 11 25 8.3 25 5 L19 5 C19 6.7 18.2 8.2 17 9.2 Z"
        fill="white" />
    </svg>
  );
}

// ─── Comment Panel ────────────────────────────────────────────────────────────
export function CommentPanel({ post, onClose }: { post: TikPost; onClose: () => void }) {
  const { user, profile } = useAuth();
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);

  useEffect(() => { loadComments(); }, [post.id]);

  async function loadComments() {
    const { data } = await supabase.from('room_messages')
      .select('*, user:user_id(username,avatar_url)')
      .eq('reply_to', post.id as any).is('is_deleted', false)
      .order('created_at', { ascending: false }).limit(50);
    setComments(data || []);
  }

  async function sendComment() {
    if (!user || !comment.trim()) return;
    await supabase.from('room_messages').insert({ user_id: user.id, content: comment.trim(), reply_to: post.id as any });
    setComment(''); loadComments();
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 bg-[#1a0a1a]/95 rounded-t-3xl"
      style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
      onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-white font-bold">Maoni</span>
        <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {comments.length === 0 && <p className="text-gray-500 text-center py-8 text-sm">Hakuna maoni bado.</p>}
        {comments.map((c: any) => (
          <div key={c.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-primary/20">
              {c.user?.avatar_url ? <img src={c.user.avatar_url} className="w-full h-full object-cover" alt="" /> :
                <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">{c.user?.username?.[0]?.toUpperCase() || '?'}</div>}
            </div>
            <div>
              <p className="text-primary text-xs font-bold">{c.user?.username || 'Mtu'}</p>
              <p className="text-white text-sm">{c.content}</p>
            </div>
          </div>
        ))}
      </div>
      {user && (
        <div className="px-4 py-3 border-t border-white/10 flex gap-2">
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-primary/20">
            {profile?.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" /> :
              <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">{profile?.username?.[0]?.toUpperCase() || '?'}</div>}
          </div>
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Andika maoni..."
            className="flex-1 bg-white/10 rounded-full px-4 text-white text-sm outline-none border border-white/10 focus:border-primary/50"
            onKeyDown={e => e.key === 'Enter' && sendComment()} />
          <button onClick={sendComment} className="w-9 h-9 rounded-full gradient-pink flex items-center justify-center flex-shrink-0">
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Gift Modal ───────────────────────────────────────────────────────────────
export function TikGiftModal({ post, myProfile, onClose }: { post: TikPost; myProfile: any; onClose: () => void }) {
  const GIFTS = [
    { emoji: '🌹', name: 'Waridi', amount: 100 },
    { emoji: '💐', name: 'Maua', amount: 200 },
    { emoji: '🍫', name: 'Chokoleti', amount: 500 },
    { emoji: '💎', name: 'Almasi', amount: 1000 },
    { emoji: '🏆', name: 'Trophy', amount: 5000 },
    { emoji: '🚀', name: 'Roketi', amount: 10000 },
  ];
  const [selected, setSelected] = useState(GIFTS[0]);
  const [sending, setSending] = useState(false);
  const { user } = useAuth();

  async function send() {
    if (!user || !post.uploader_id) return;
    setSending(true);
    const { data: myProf } = await supabase.from('user_profiles').select('balance,gift_balance').eq('id', user.id).single();
    const giftBal = (myProf as any)?.gift_balance || 0;
    const mainBal = (myProf as any)?.balance || 0;
    const canUseGift = giftBal >= selected.amount;
    if (!canUseGift && mainBal < selected.amount) {
      import('sonner').then(m => m.toast.error('Salio halitooshi!')); setSending(false); return;
    }
    if (canUseGift) {
      await supabase.from('user_profiles').update({ gift_balance: giftBal - selected.amount }).eq('id', user.id);
    } else {
      await supabase.from('user_profiles').update({ balance: mainBal - selected.amount }).eq('id', user.id);
    }
    const { data: recv } = await supabase.from('user_profiles').select('gift_balance,username').eq('id', post.uploader_id).single();
    await supabase.from('user_profiles').update({ gift_balance: ((recv as any)?.gift_balance || 0) + selected.amount }).eq('id', post.uploader_id);
    const recvName = (recv as any)?.username || 'Creator';
    // Save transaction for receiver (shows sender name and source)
    await supabase.from('transactions').insert({ user_id: post.uploader_id, amount: selected.amount, type: 'gift_received', status: 'approved', description: `Zawadi ${selected.emoji} ${selected.name} | Kutoka: ${myProfile.username} | Chanzo: TikSexy` });
    // Save transaction for sender
    await supabase.from('transactions').insert({ user_id: user.id, amount: selected.amount, type: 'gift_sent', status: 'approved', description: `Zawadi ${selected.emoji} ${selected.name} | Kwa: ${recvName} | Chanzo: TikSexy` });
    // Notify receiver
    await supabase.from('notifications').insert({ user_id: post.uploader_id, title: `🎁 Umepata Zawadi!`, message: `${myProfile.username} amekutumia ${selected.emoji} ${selected.name} (TZS ${selected.amount.toLocaleString()}) kwenye TikSexy!`, type: 'gift', link: '/wallet?tab=gifts' });
    // Notify sender
    await supabase.from('notifications').insert({ user_id: user.id, title: `🎁 Zawadi Imetumwa`, message: `Umetuma ${selected.emoji} ${selected.name} kwa ${recvName} - TZS ${selected.amount.toLocaleString()} (TikSexy)`, type: 'gift', link: '/wallet?tab=gifts' });
    import('sonner').then(m => m.toast.success(`${selected.emoji} Zawadi imetumwa!`));
    setSending(false); onClose();
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 bg-[#1a0a1a]/97 rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
      <div className="flex justify-between mb-3">
        <h3 className="text-white font-bold">Tuma Zawadi 🎁</h3>
        <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
      </div>
      <div className="grid grid-cols-6 gap-2 mb-4">
        {GIFTS.map(g => (
          <button key={g.name} onClick={() => setSelected(g)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${selected.name === g.name ? 'bg-primary/20 border-2 border-primary' : 'bg-[#2a0a2a] border border-transparent'}`}>
            <span className="text-2xl">{g.emoji}</span>
            <span className="text-[9px] text-gray-400">{g.amount >= 1000 ? `${g.amount / 1000}K` : g.amount}</span>
          </button>
        ))}
      </div>
      <button onClick={send} disabled={sending}
        className="w-full py-3 gradient-pink text-white font-black rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60">
        {sending ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : `${selected.emoji} Tuma TZS ${selected.amount.toLocaleString()}`}
      </button>
    </div>
  );
}

// Share wrapper - shows VIP plan for non-privileged members instead of share dialog
export function TikShareGate({
  myProfile, post, children, onNeedVip,
}: { myProfile: any; post: TikPost; children: React.ReactNode; onNeedVip: () => void }) {
  const isPrivileged = myProfile?.is_vip || myProfile?.is_business || myProfile?.is_admin;
  return isPrivileged ? <>{children}</> : <button className="flex flex-col items-center gap-0.5" onClick={onNeedVip}>{children}</button>;
}
export function NotifBell({ userId }: { userId: string }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);

  useEffect(() => { fetchCount(); const t = setInterval(fetchCount, 10000); return () => clearInterval(t); }, [userId]);

  async function fetchCount() {
    if (!userId) return;
    const { count: c } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('read', false);
    setCount(c || 0);
  }

  async function openNotifs() {
    setOpen(true);
    const { data } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    setNotifs(data || []);
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    setCount(0);
  }

  return (
    <>
      <button onClick={openNotifs} className="relative w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
        <span className="text-white text-lg">🔔</span>
        {count > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end" onClick={() => setOpen(false)}>
          <div className="w-full bg-[#0d0d0d] rounded-t-3xl max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-4 py-3 border-b border-white/10">
              <span className="text-white font-bold">Arifa</span>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {notifs.length === 0 && <p className="text-gray-500 text-center py-8">Hakuna arifa</p>}
            {notifs.map(n => (
              <div key={n.id} className="px-4 py-3 border-b border-white/5">
                <p className="text-white text-sm font-semibold">{n.title}</p>
                <p className="text-gray-400 text-xs mt-0.5">{n.message}</p>
              </div>
            ))}
            <div className="h-4" />
          </div>
        </div>
      )}
    </>
  );
}
