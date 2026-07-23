
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Download as DlType } from '@/types';
import { ArrowLeft, Download, Trash2, Play, Image, X, Clock, Grid3X3, Images, Video, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import { PlanPickerModal } from '@/pages/Services';
import { generateVideoThumbnail } from '@/lib/generateThumbnail';

// ─── Global download manager ─────────────────────────────────────────────────
export const downloadManager = {
  activeDownloads: new Map<string, { progress: number; name: string; controller: AbortController; speed?: number; remaining?: number; loaded?: number; total?: number }>(),
  listeners: new Set<() => void>(),
  notify() { this.listeners.forEach(l => l()); },

  async startDownload(item: { id: string; url: string; name: string; type: string; userId: string; size?: number; thumbUrl?: string }) {
    if (this.activeDownloads.has(item.id)) return;
    const controller = new AbortController();
    this.activeDownloads.set(item.id, { progress: 0, name: item.name, controller });
    this.notify();

    try {
      await supabase.from('user_downloads').upsert({
        id: item.id, user_id: item.userId, content_url: item.url,
        content_name: item.name, content_type: item.type,
        file_size: item.size || 0, progress: 0, status: 'downloading',
        thumbnail_url: item.thumbUrl || null,
        created_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      const response = await fetch(item.url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentLength = parseInt(response.headers.get('content-length') || '0');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const chunks: Uint8Array[] = [];
      let received = 0;
      let lastTime = Date.now();
      let lastReceived = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) return;
        chunks.push(value);
        received += value.length;
        const pct = contentLength ? Math.round((received / contentLength) * 100) : Math.min(Math.round(received / 10000), 95);

        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        let speed = 0;
        let remaining = 0;
        if (elapsed > 0.5) {
          speed = (received - lastReceived) / elapsed;
          if (contentLength > 0 && speed > 0) remaining = (contentLength - received) / speed;
          lastTime = now;
          lastReceived = received;
        }

        const entry = this.activeDownloads.get(item.id);
        if (entry) {
          entry.progress = pct;
          entry.speed = speed;
          entry.remaining = remaining;
          entry.loaded = received;
          entry.total = contentLength || undefined;
          this.notify();
        }
        if (pct % 10 === 0) {
          await supabase.from('user_downloads').update({ progress: pct, file_size: contentLength || received }).eq('id', item.id);
        }
      }

      const blob = new Blob(chunks);

      // Auto-generate thumbnail for video downloads
      let thumbUrl = item.thumbUrl || '';
      if (item.type === 'video' && !thumbUrl) {
        try {
          const videoFile = new File([blob], item.name || 'video.mp4', { type: blob.type || 'video/mp4' });
          const thumbBlob = await generateVideoThumbnail(videoFile);
          if (thumbBlob) {
            // Store thumb in IndexedDB
            await storeInIndexedDB(`${item.id}_thumb`, thumbBlob, `${item.name}_thumb`, 'image/jpeg');
            thumbUrl = `idb:${item.id}_thumb`;
          }
        } catch (e) { console.log('Thumb gen error:', e); }
      }

      await storeInIndexedDB(item.id, blob, item.name, item.type);
      await supabase.from('user_downloads').update({
        progress: 100, status: 'completed', file_size: blob.size,
        thumbnail_url: thumbUrl || null,
      }).eq('id', item.id);

      this.activeDownloads.delete(item.id);
      this.notify();
      toast.success(`✅ "${item.name}" imedownload!`);
      await supabase.from('notifications').insert({
        user_id: item.userId, title: '⬇️ Download Imekamilika!',
        message: `"${item.name}" imedownload.`, type: 'general',
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Download error:', err);
      this.activeDownloads.delete(item.id);
      this.notify();
      await supabase.from('user_downloads').update({ status: 'failed', progress: 0 }).eq('id', item.id).catch(() => { });
      toast.error('Download imeshindwa. Jaribu tena.');
    }
  },

  cancelDownload(id: string) {
    const dl = this.activeDownloads.get(id);
    if (dl) { dl.controller.abort(); this.activeDownloads.delete(id); this.notify(); }
  }
};

// ─── IndexedDB helpers ────────────────────────────────────────────────────────
async function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('slr-downloads', 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeInIndexedDB(id: string, blob: Blob, name: string, type: string) {
  try {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({ id, blob, name, type, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) { console.error('IndexedDB store error:', err); }
}

export async function getFromIndexedDB(id: string): Promise<Blob | null> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(id);
      req.onsuccess = () => resolve(req.result?.blob || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function deleteFromIndexedDB(id: string) {
  try {
    const db = await getDB();
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').delete(id);
    tx.objectStore('files').delete(`${id}_thumb`);
  } catch { }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function triggerDownload(item: {
  id?: string; url: string; name: string; type: 'video' | 'image';
  userId: string; size?: number; thumbUrl?: string;
}) {
  const id = item.id || generateUUID();
  // Start download in background - no navigation
  downloadManager.startDownload({ ...item, id });
}

// Format file size
function formatSize(bytes: number) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Format speed
function formatSpeed(bytesPerSec: number) {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
}

// Format remaining time
function formatRemaining(seconds: number) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
}

// ─── In-Progress download card ─────────────────────────────────────────────────
function ActiveDownloadBar({ dl, progress, speed, remaining, loaded, total, onCancel }: {
  dl: DlType; progress: number; speed?: number; remaining?: number; loaded?: number; total?: number; onCancel: () => void;
}) {
  return (
    <div className="bg-[#0d0d0d] border border-[#2a0a2a] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-10 h-10 rounded-lg bg-[#1a0a1a] flex items-center justify-center flex-shrink-0">
          {dl.content_type === 'video' ? <Video className="w-5 h-5 text-primary" /> : <Image className="w-5 h-5 text-blue-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{dl.content_name || 'Faili'}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-primary text-xs font-bold animate-pulse">{Math.round(progress)}%</span>
            {loaded !== undefined && total !== undefined && total > 0 && (
              <span className="text-gray-500 text-xs">{formatSize(loaded)} / {formatSize(total)}</span>
            )}
            {speed && speed > 100 && <span className="text-green-400 text-xs">{formatSpeed(speed)}</span>}
            {remaining && remaining > 0 && isFinite(remaining) && <span className="text-gray-500 text-xs">~{formatRemaining(remaining)}</span>}
          </div>
        </div>
        <button onClick={onCancel} className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <X className="w-4 h-4 text-red-400" />
        </button>
      </div>
      <div className="h-1 bg-[#1a0a1a]">
        <div className="h-full gradient-pink transition-all duration-300 rounded-full" style={{ width: `${Math.max(2, progress)}%` }} />
      </div>
    </div>
  );
}

// ─── Gallery grid item with select mode ────────────────────────────────────────
function GalleryItem({ dl, onPlay, onDelete, isSelectMode, isSelected, onToggleSelect, onEnterSelectMode }: {
  dl: DlType & { localThumb?: string };
  onPlay: (dl: DlType) => void;
  onDelete: (id: string) => void;
  isSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEnterSelectMode: (id: string) => void;
}) {
  const [thumb, setThumb] = useState<string | null>(dl.localThumb || null);
  const isVideo = dl.content_type === 'video';
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!thumb && isVideo) {
      getFromIndexedDB(`${dl.id}_thumb`).then(blob => {
        if (blob) {
          setThumb(URL.createObjectURL(blob));
        } else if (dl.thumbnail_url && !dl.thumbnail_url.startsWith('idb:')) {
          setThumb(dl.thumbnail_url);
        }
      }).catch(() => {
        if (dl.thumbnail_url && !dl.thumbnail_url.startsWith('idb:')) setThumb(dl.thumbnail_url);
      });
    } else if (!thumb && !isVideo) {
      if (dl.thumbnail_url && !dl.thumbnail_url.startsWith('idb:')) setThumb(dl.thumbnail_url);
      else if (dl.content_url) setThumb(dl.content_url);
    }
  }, [dl.id, dl.thumbnail_url, dl.content_url, isVideo, thumb]); // Added `isVideo, thumb` to dependencies

  const handleClick = () => {
    if (isSelectMode) {
      onToggleSelect(dl.id);
    } else {
      onPlay(dl);
    }
  };

  // Clicking checkbox icon directly enters select mode (even when not in select mode)
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelectMode) {
      onToggleSelect(dl.id);
    } else {
      onEnterSelectMode(dl.id);
    }
  };

  // Long press to enter select mode
  const handleTouchStart = () => {
    if (!isSelectMode) {
      longPressTimer.current = setTimeout(() => {
        onEnterSelectMode(dl.id);
      }, 600);
    }
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  return (
    <div className={`relative rounded-xl overflow-hidden bg-[#0d0d0d] cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary scale-[0.97]' : ''}`}
      style={{ aspectRatio: '0.75' }}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}>
      {thumb ? (
        <img src={thumb} alt={dl.content_name || ''} className="w-full h-full object-cover object-top" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#1a0a1a]">
          {isVideo ? <Video className="w-8 h-8 text-gray-600" /> : <Image className="w-8 h-8 text-gray-600" />}
        </div>
      )}
      {isVideo && !isSelectMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}
      {dl.file_size > 0 && !isSelectMode && (
        <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded-full">
          {formatSize(dl.file_size)}
        </div>
      )}
      {/* Checkbox icon - always visible in top-left corner, clicking it directly enters select mode */}
      <div
        className={`absolute top-1.5 left-1.5 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all z-20 active:scale-90
          ${isSelectMode
            ? (isSelected ? 'bg-primary border-primary shadow-lg shadow-primary/40' : 'bg-black/60 border-white/70')
            : 'bg-black/50 border-white/50 hover:border-primary hover:bg-primary/20'}`}
        onClick={handleCheckboxClick}
        title={isSelectMode ? (isSelected ? 'Ondoa' : 'Chagua') : 'Chagua kufuta'}>
        {isSelected
          ? <span className="text-white font-black text-xs">✓</span>
          : <span className="text-white/70 font-black text-[10px]">☐</span>}
      </div>
      {/* Type badge - right corner */}
      {!isSelectMode && (
        <div className={`absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isVideo ? 'bg-primary/80 text-white' : 'bg-blue-500/80 text-white'}`}>
          {isVideo ? '🎬' : '🖼️'}
        </div>
      )}
      {/* Select mode dim overlay */}
      {isSelectMode && !isSelected && (
        <div className="absolute inset-0 bg-black/30" />
      )}
      {isSelectMode && isSelected && (
        <div className="absolute inset-0 bg-primary/20" />
      )}
    </div>
  );
}

// ─── Downloads Page ───────────────────────────────────────────────────────────
export default function Downloads() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [downloads, setDownloads] = useState<DlType[]>([]);
  const [activeProgress, setActiveProgress] = useState<Map<string, { progress: number; speed?: number; remaining?: number; loaded?: number; total?: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'gallery' | 'downloading'>('gallery');
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'video' | 'image'>('all');
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [settings] = useState<any>({});
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title: string } | null>(null);
  // Multi-select mode
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Save to device with save code
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveCode, setSaveCode] = useState('');
  const [saving, setSaving] = useState(false);

  const isPrivileged = profile?.is_vip || profile?.is_business || profile?.is_admin;

  // Add watermark to image blob using Canvas API
  async function addWatermarkToImage(blob: Blob): Promise<Blob> {
    return new Promise((resolve) => {
      const img = document.createElement('img');
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        // Semi-transparent watermark background
        const text = '💋SEXY LIVE ROOM💋';
        const fontSize = Math.max(20, Math.min(48, canvas.width / 14));
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
        const textW = ctx.measureText(text).width;
        const padX = 16, padY = 10;
        const x = (canvas.width - textW) / 2;
        const y = canvas.height - fontSize - 20;
        // Background pill
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(x - padX, y - fontSize, textW + padX * 2, fontSize + padY * 2, 8);
        ctx.fill();
        // Text
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(text, x, y);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => resolve(b || blob), 'image/jpeg', 0.92);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
      img.src = url;
    });
  }

  // Helper: download a blob/URL directly to device
  async function downloadBlobToDevice(url: string, filename: string) {
    try {
      // Try fetch+blob for proper download (works better on mobile)
      const resp = await fetch(url, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
        return;
      }
    } catch {}
    // Fallback: direct anchor click
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
  }

  async function saveSelectedToDevice() {
    setSaving(true);
    try {
      const selectedItems = galleryItems.filter(d => selectedIds.has(d.id));
      const isVipOrAdmin = (profile as any)?.is_vip || (profile as any)?.is_admin;
      const giftSaveCredits = user ? parseInt(localStorage.getItem(`gift_save_credits_${user.id}`) || '0') : 0;

      // Validate: require VIP/admin OR valid save code OR gift credits
      if (!isVipOrAdmin && giftSaveCredits < selectedItems.length && !saveCode.trim()) {
        toast.error('Weka Save Code au pata VIP membership!');
        setSaving(false);
        return;
      }

      // Validate save code against database (admin-created codes only)
      let sc: any = null;
      if (saveCode.trim()) {
        const { data: scData } = await supabase.from('save_codes').select('*').eq('code', saveCode.trim().toUpperCase()).eq('is_active', true).maybeSingle();
        if (!scData) { toast.error('Code si sahihi! Tumia code halisi kutoka kwa Admin.'); setSaving(false); return; }
        if (scData.expires_at && new Date(scData.expires_at) < new Date()) { toast.error('Code imeisha muda!'); setSaving(false); return; }
        if ((scData.use_count || 0) >= (scData.max_uses || 1)) { toast.error('Code imefika kikomo cha matumizi!'); setSaving(false); return; }
        if (selectedItems.length > scData.max_items) { toast.error(`Code inaruhusu vitu ${scData.max_items} tu. Umechagua ${selectedItems.length}.`); setSaving(false); return; }
        sc = scData;
      } else if (!isVipOrAdmin && giftSaveCredits < selectedItems.length) {
        toast.error('Salio la zawadi halitooshi! Weka save code.');
        setSaving(false);
        return;
      }

      // Save files using File System Access API (showSaveFilePicker) or fallback
      for (const dl of selectedItems) {
        const blob = await getFromIndexedDB(dl.id);
        const isVideo = dl.content_type === 'video';
        const ext = isVideo ? 'mp4' : 'jpg';
        const filename = (dl.content_name || (isVideo ? 'video' : 'image')) + '.' + ext;
        const sourceUrl = dl.content_url;

        // Apply watermark for non-VIP/non-admin/non-code users on images
        let finalBlob: Blob | null = blob;
        const hasCodeOrCredits = !!sc || giftSaveCredits > 0;
        if (!isVideo && !isVipOrAdmin && !hasCodeOrCredits) {
          if (finalBlob) {
            try { finalBlob = await addWatermarkToImage(finalBlob); } catch {}
          } else if (sourceUrl) {
            try { const r = await fetch(sourceUrl); if (r.ok) finalBlob = await addWatermarkToImage(await r.blob()); } catch {}
          }
        }

        try {
          // Try File System Access API (native file manager picker)
          if ('showSaveFilePicker' in window) {
            const fileHandle = await (window as any).showSaveFilePicker({
              suggestedName: filename,
              types: isVideo
                ? [{ description: 'Video', accept: { 'video/mp4': ['.mp4'], 'video/webm': ['.webm'] } }]
                : [{ description: 'Image', accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] } }],
            });
            const data = finalBlob || (sourceUrl ? await (await fetch(sourceUrl)).blob() : null);
            if (data) {
              const writable = await fileHandle.createWritable();
              await writable.write(data);
              await writable.close();
            }
          } else if (finalBlob) {
            // Fallback: create object URL and trigger download
            const objUrl = URL.createObjectURL(finalBlob);
            const a = document.createElement('a');
            a.href = objUrl; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
          } else if (sourceUrl) {
            const a = document.createElement('a');
            a.href = sourceUrl; a.download = filename; a.target = '_blank';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
          }
          await new Promise(r => setTimeout(r, 600));
        } catch (e: any) {
          if (e?.name === 'AbortError') continue; // User cancelled this file
          // Fallback to direct download
          if (finalBlob) {
            const objUrl = URL.createObjectURL(finalBlob);
            const a = document.createElement('a');
            a.href = objUrl; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
          }
        }
      }

      // Update save code usage
      if (sc && user) {
        const uses: any[] = sc.uses || [];
        const myUse = uses.find((u: any) => u.user_id === user.id);
        const newUses = myUse
          ? uses.map((u: any) => u.user_id === user.id ? { ...u, items_used: u.items_used + selectedItems.length } : u)
          : [...uses, { user_id: user.id, items_used: selectedItems.length, used_at: new Date().toISOString() }];
        // Increment use_count only if first time this user uses it
        const newUseCount = myUse ? sc.use_count : (sc.use_count || 0) + 1;
        await supabase.from('save_codes').update({ uses: newUses, use_count: newUseCount }).eq('id', sc.id);
      } else if (saveCode.trim() === '' && giftSaveCredits >= selectedItems.length && user) {
        const newCreds = Math.max(0, giftSaveCredits - selectedItems.length);
        try { localStorage.setItem(`gift_save_credits_${user.id}`, String(newCreds)); } catch {}
      }

      toast.success(`✅ Vitu ${selectedItems.length} vimehifadhiwa!`);
      setShowSaveModal(false); setSaveCode(''); setSelectedIds(new Set()); setIsSelectMode(false);
    } catch { toast.error('Hitilafu ya kuhifadhi'); }
    finally { setSaving(false); }
  }

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchDownloads();

    const listener = () => {
      const prog = new Map<string, any>();
      downloadManager.activeDownloads.forEach((v, k) => prog.set(k, {
        progress: v.progress, speed: v.speed, remaining: v.remaining,
        loaded: v.loaded, total: v.total,
      }));
      setActiveProgress(new Map(prog));
    };
    downloadManager.listeners.add(listener);
    const interval = setInterval(fetchDownloads, 4000);
    return () => { clearInterval(interval); downloadManager.listeners.delete(listener); };
  }, [user, navigate]); // Added navigate to dependencies

  async function fetchDownloads() {
    if (!user) return;
    const { data } = await supabase.from('user_downloads').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setDownloads((data || []) as DlType[]);
    setLoading(false);
  }

  async function deleteDownload(id: string) {
    downloadManager.cancelDownload(id);
    await deleteFromIndexedDB(id);
    await supabase.from('user_downloads').delete().eq('id', id);
    setDownloads(prev => prev.filter(d => d.id !== id));
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      downloadManager.cancelDownload(id);
      await deleteFromIndexedDB(id);
      await supabase.from('user_downloads').delete().eq('id', id);
    }
    setDownloads(prev => prev.filter(d => !selectedIds.has(d.id)));
    setSelectedIds(new Set());
    setIsSelectMode(false);
    setShowDeleteConfirm(false);
    toast.success(`✅ ${ids.length} faili zimefutwa!`);
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function playItem(dl: DlType) {
    if (!isPrivileged) { setShowPlanPicker(true); return; }
    const blob = await getFromIndexedDB(dl.id);
    const blobUrl = blob ? URL.createObjectURL(blob) : null;
    const mediaUrl = blobUrl || dl.content_url;
    if (!mediaUrl) { toast.error('Faili haipatikani'); return; }

    if (dl.content_type === 'video') {
      navigate('/play', { state: { url: mediaUrl, title: dl.content_name } });
    } else {
      setLightboxImage({ src: mediaUrl, title: dl.content_name || 'Picha' });
    }
  }

  const getProgress = (id: string) => activeProgress.get(id)?.progress ?? 0;
  const getProgressData = (id: string) => activeProgress.get(id) || {};
  const activeCount = downloadManager.activeDownloads.size;

  const inProgressDownloads = downloads.filter(d =>
    d.status === 'downloading' || d.status === 'failed' || downloadManager.activeDownloads.has(d.id)
  );
  const completedDownloads = downloads.filter(d =>
    d.status === 'completed' && !downloadManager.activeDownloads.has(d.id)
  );

  const galleryItems = completedDownloads.filter(d => {
    if (galleryFilter === 'video') return d.content_type === 'video';
    if (galleryFilter === 'image') return d.content_type === 'image';
    return true;
  });

  const videoCount = completedDownloads.filter(d => d.content_type === 'video').length;
  const imageCount = completedDownloads.filter(d => d.content_type === 'image').length;

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="top-bar px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (isSelectMode) { setIsSelectMode(false); setSelectedIds(new Set()); } else navigate(-1); }} className="text-gray-400">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-white font-bold text-xl flex-1">⬇️ Downloads</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#1a0a1a] rounded-full px-2.5 py-1">
              <Video className="w-3.5 h-3.5 text-primary" />
              <span className="text-white text-xs font-bold">{videoCount}</span>
            </div>
            <div className="flex items-center gap-1 bg-[#1a0a1a] rounded-full px-2.5 py-1">
              <Images className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-white text-xs font-bold">{imageCount}</span>
            </div>
            {activeCount > 0 && (
              <span className="bg-primary text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">{activeCount}</span>
            )}
            {/* Select mode toggle */}
            {tab === 'gallery' && galleryItems.length > 0 && (
              <button onClick={() => { setIsSelectMode(!isSelectMode); setSelectedIds(new Set()); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isSelectMode ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
                {isSelectMode ? 'Ghairi' : 'Chagua'}
              </button>
            )}
          </div>
        </div>
        {/* Select mode action bar */}
        {isSelectMode && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-gray-400 text-sm">{selectedIds.size} zilizochaguliwa</span>
            <div className="flex gap-2">
              <button onClick={() => setSelectedIds(new Set(galleryItems.map(d => d.id)))}
                className="text-primary text-sm font-semibold">Chagua Zote</button>
              {selectedIds.size > 0 && (
                <div className="flex gap-2">
                  <button onClick={() => setShowSaveModal(true)}
                    className="gradient-pink text-white text-sm font-bold px-3 py-1.5 rounded-xl flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" /> Hifadhi ({selectedIds.size})
                  </button>
                  <button onClick={() => setShowDeleteConfirm(true)}
                    className="bg-red-600 text-white text-sm font-bold px-3 py-1.5 rounded-xl flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Futa ({selectedIds.size})
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pt-3 flex gap-2">
        <button onClick={() => setTab('gallery')}
          className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${tab === 'gallery' ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
          <Grid3X3 className="w-4 h-4" /> Gallery
          {completedDownloads.length > 0 && (
            <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${tab === 'gallery' ? 'bg-white/20 text-white' : 'bg-primary/20 text-primary'}`}>{completedDownloads.length}</span>
          )}
        </button>
        <button onClick={() => setTab('downloading')}
          className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${tab === 'downloading' ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
          <Clock className="w-4 h-4" /> Zinadownload
          {inProgressDownloads.length > 0 && (
            <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${tab === 'downloading' ? 'bg-white/20 text-white' : 'bg-yellow-500/20 text-yellow-400'}`}>{inProgressDownloads.length}</span>
          )}
        </button>
      </div>

      <div className="max-w-md mx-auto">
        {/* GALLERY TAB */}
        {tab === 'gallery' && (
          <div className="px-4 pt-3">
            <div className="flex gap-2 mb-4">
              {([
                { key: 'all', label: `Zote (${completedDownloads.length})`, icon: Grid3X3 },
                { key: 'video', label: `Video (${videoCount})`, icon: Video },
                { key: 'image', label: `Picha (${imageCount})`, icon: Images },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setGalleryFilter(f.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${galleryFilter === f.key ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
                  <f.icon className="w-3.5 h-3.5" />
                  {f.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : galleryItems.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <Grid3X3 className="w-16 h-16 mx-auto mb-4 opacity-20 text-primary" />
                <p className="font-semibold text-lg">Gallery tupu</p>
                <p className="text-xs text-gray-600 mt-2">Downloads zitaonekana hapa kama gallery</p>
                <button onClick={() => navigate('/')} className="btn-primary text-sm px-6 mt-4">Rudi Nyumbani</button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {galleryItems.map(dl => (
                  <GalleryItem
                    key={dl.id}
                    dl={dl as any}
                    onPlay={playItem}
                    onDelete={deleteDownload}
                    isSelectMode={isSelectMode}
                    isSelected={selectedIds.has(dl.id)}
                    onToggleSelect={toggleSelect}
                    onEnterSelectMode={(id) => {
                      setIsSelectMode(true);
                      setSelectedIds(new Set([id]));
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* DOWNLOADING TAB */}
        {tab === 'downloading' && (
          <div className="px-4 pt-3 space-y-2">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : inProgressDownloads.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <Clock className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="font-semibold">Hakuna downloads zinazoendelea</p>
                <p className="text-xs text-gray-600 mt-2">Bonyeza ⬇️ kwenye video au picha yoyote kuanza</p>
                <button onClick={() => navigate('/')} className="btn-primary text-sm px-6 mt-4">Rudi Nyumbani</button>
              </div>
            ) : (
              inProgressDownloads.map(dl => {
                const active = downloadManager.activeDownloads.has(dl.id);
                const pd = getProgressData(dl.id) as any;

                if (active) {
                  return (
                    <ActiveDownloadBar
                      key={dl.id} dl={dl}
                      progress={getProgress(dl.id)}
                      speed={pd.speed} remaining={pd.remaining}
                      loaded={pd.loaded} total={pd.total}
                      onCancel={() => downloadManager.cancelDownload(dl.id)}
                     />
                  );
                }

                return (
                  <div key={dl.id} className="content-box p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl">⚠️</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{dl.content_name}</p>
                        <p className="text-green-400 text-xs">✓ Hifadhi Gallery</p>
                      </div>
                      <button onClick={() => deleteDownload(dl.id)} className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                    <button onClick={() => {
                      if (dl.content_url && user) triggerDownload({ id: dl.id, url: dl.content_url, name: dl.content_name || 'file', type: dl.content_type as any, userId: user.id });
                    }} className="w-full gradient-pink text-white font-semibold py-2 rounded-xl text-xs mt-3">
                      🔄 Jaribu Tena
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Save to device modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold text-lg mb-2">💾 Hifadhi kwenye Simu</h3>
            <p className="text-gray-400 text-sm mb-4">Hifadhi vitu {selectedIds.size} kwenye simu yako moja kwa moja.</p>
            {user && parseInt(localStorage.getItem(`gift_save_credits_${user.id}`) || '0') > 0 ? (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mb-3">
                <p className="text-green-400 text-sm font-semibold">🎁 Gift Credits: {localStorage.getItem(`gift_save_credits_${user.id}`)} zilizobaki</p>
                <p className="text-gray-400 text-xs mt-1">Bonyeza Hifadhi Sasa bila code</p>
              </div>
            ) : (
              <input value={saveCode} onChange={e => setSaveCode(e.target.value.toUpperCase())} placeholder="Mfano: SAVE1234" className="input-field text-center font-mono text-lg tracking-widest mb-3" autoCapitalize="characters" />
            )}
            <div className="flex gap-3">
              <button onClick={() => { setShowSaveModal(false); setSaveCode(''); }} className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-400 font-semibold">Ghairi</button>
              <button onClick={saveSelectedToDevice} disabled={saving} className="flex-1 py-3 rounded-xl gradient-pink text-white font-black disabled:opacity-40">
                {saving ? 'Inafanya...' : '💾 Hifadhi Sasa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlanPicker && (
        <PlanPickerModal onClose={() => setShowPlanPicker(false)} settings={settings} onSuccess={() => setShowPlanPicker(false)} />
      )}

      {/* Image lightbox */}
      {lightboxImage && (
        <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center" onClick={() => setLightboxImage(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center z-10" onClick={() => setLightboxImage(null)}>
            <X className="w-5 h-5 text-white" />
          </button>
          <img src={lightboxImage.src} alt={lightboxImage.title} className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Bulk delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm text-center">
            <Trash2 className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h3 className="text-white font-bold text-lg mb-2">Futa {selectedIds.size} faili?</h3>
            <p className="text-gray-400 text-sm mb-6">Mabadiliko hayabadilishwi. Faili zitafutwa kabisa.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-400 font-semibold">Ghairi</button>
              <button onClick={deleteSelected} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-black">Futa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
