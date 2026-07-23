import { useState, useRef, useEffect } from 'react';
import { X, ImageIcon, Video, Download, Lock, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface GalleryPickerProps {
  onSelect: (files: File[]) => void;
  onClose: () => void;
  accept?: string;
  multiple?: boolean;
  title?: string;
}

// ── Save Code Modal ────────────────────────────────────────────────────────────
function SaveCodeModal({ items, onClose }: { items: { file: File; url: string; type: string }[]; onClose: () => void }) {
  const { user, profile } = useAuth();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verified, setVerified] = useState(false);
  const [maxItems, setMaxItems] = useState(0);
  const [codeData, setCodeData] = useState<any>(null);

  // Also check gift save credits
  const giftSaveCredits = user ? parseInt(localStorage.getItem(`gift_save_credits_${user.id}`) || '0') : 0;
  // VIP/business users can save without code
  const canSaveFree = profile?.is_vip || profile?.is_admin || profile?.is_business;

  async function verifyCode() {
    if (!code.trim() || !user) return;
    setVerifying(true);
    try {
      // Check save_codes table
      const { data: sc } = await supabase.from('save_codes').select('*').eq('code', code.trim().toUpperCase()).eq('is_active', true).maybeSingle();
      if (sc) {
        if (sc.expires_at && new Date(sc.expires_at) < new Date()) { toast.error('Code hii imeisha muda!'); setVerifying(false); return; }
        // Check if this user has already used this code
        const uses: any[] = sc.uses || [];
        const myUse = uses.find((u: any) => u.user_id === user.id);
        if (myUse && myUse.items_used >= sc.max_items) { toast.error('Umeshakutumia code hii kwa kikomo chake!'); setVerifying(false); return; }
        // Check total uses
        if ((sc.use_count || 0) >= (sc.max_uses || 1)) { toast.error('Code hii imefikiwa kikomo chake!'); setVerifying(false); return; }
        const remaining = sc.max_items - (myUse?.items_used || 0);
        setMaxItems(remaining);
        setCodeData(sc);
        setVerified(true);
        toast.success(`✅ Code sahihi! Unaweza kuhifadhi vitu ${remaining}`);
        return;
      }
      // Check gift_cards table for save_items type
      const { data: gc } = await supabase.from('gift_cards').select('*').eq('code', code.trim().toUpperCase()).eq('is_active', true).eq('type', 'save_items').maybeSingle();
      if (gc) {
        if (gc.expires_at && new Date(gc.expires_at) < new Date()) { toast.error('Code hii imeisha muda!'); setVerifying(false); return; }
        const { data: existingUse } = await supabase.from('gift_card_uses').select('id').eq('card_id', gc.id).eq('user_id', user.id).maybeSingle();
        if (existingUse) { toast.error('Umeshachukua zawadi hii tayari!'); setVerifying(false); return; }
        if ((gc.use_count || 0) >= (gc.max_uses || 1)) { toast.error('Code hii imefikiwa kikomo chake!'); setVerifying(false); return; }
        const remaining = gc.save_item_count || gc.unlock_count || 1;
        setMaxItems(remaining);
        setCodeData({ ...gc, _isGiftCard: true });
        setVerified(true);
        toast.success(`✅ Code sahihi! Unaweza kuhifadhi vitu ${remaining}`);
        return;
      }
      toast.error('Code si sahihi au haipo!');
    } catch { toast.error('Hitilafu ya kukagua code'); }
    finally { setVerifying(false); }
  }

  async function startSave() {
    if (!user) return;
    const itemsToSave = items.slice(0, canSaveFree ? items.length : (giftSaveCredits > 0 ? giftSaveCredits : (verified ? maxItems : 0)));
    if (itemsToSave.length === 0) { toast.error('Hakuna vitu vya kuhifadhi'); return; }
    setSaving(true);

    let saved = 0;
    for (const item of itemsToSave) {
      try {
        const a = document.createElement('a');
        a.href = item.url;
        a.download = item.file.name || `download_${Date.now()}.${item.type === 'video' ? 'mp4' : 'jpg'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        saved++;
        await new Promise(r => setTimeout(r, 400));
      } catch { console.error('Failed to save item'); }
    }

    // Deduct credits
    if (!canSaveFree) {
      if (giftSaveCredits > 0) {
        const newCreds = Math.max(0, giftSaveCredits - saved);
        try { localStorage.setItem(`gift_save_credits_${user.id}`, String(newCreds)); } catch {}
      } else if (verified && codeData) {
        // Update save_codes usage
        if (!codeData._isGiftCard) {
          const uses: any[] = codeData.uses || [];
          const myUseIdx = uses.findIndex((u: any) => u.user_id === user.id);
          if (myUseIdx >= 0) uses[myUseIdx].items_used = (uses[myUseIdx].items_used || 0) + saved;
          else uses.push({ user_id: user.id, items_used: saved, used_at: new Date().toISOString() });
          const newCount = (codeData.use_count || 0) + 1;
          const isNowFull = newCount >= (codeData.max_uses || 1);
          await supabase.from('save_codes').update({ uses, use_count: newCount, is_active: !isNowFull }).eq('id', codeData.id);
        } else {
          // Gift card save_items
          const newCount = (codeData.use_count || 0) + 1;
          await supabase.from('gift_cards').update({ use_count: newCount, is_used: newCount >= (codeData.max_uses || 1) }).eq('id', codeData.id);
          await supabase.from('gift_card_uses').insert({ card_id: codeData.id, user_id: user.id });
        }
      }
    }

    setSaving(false);
    toast.success(`✅ Vitu ${saved} vimehifadhiwa kwenye simu yako!`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4">
      <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 w-full max-w-sm">
        <div className="flex justify-between mb-4">
          <h3 className="text-white font-bold flex items-center gap-2"><Download className="w-5 h-5 text-primary" /> Hifadhi kwenye Simu</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="mb-4 p-3 bg-[#1a0a1a] rounded-xl">
          <p className="text-gray-400 text-xs">Vitu vilichaguliwa: <span className="text-white font-bold">{items.length}</span></p>
        </div>

        {canSaveFree ? (
          <div className="space-y-3">
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
              <p className="text-green-400 text-sm font-semibold">✓ VIP/Business - Unaweza kuhifadhi bila code</p>
            </div>
            <button onClick={startSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
              {saving ? 'Inahifadhi...' : `Hifadhi Vitu ${items.length}`}
            </button>
          </div>
        ) : giftSaveCredits > 0 ? (
          <div className="space-y-3">
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl">
              <p className="text-primary text-sm font-semibold">🎁 Zawadi: Unaweza kuhifadhi vitu {giftSaveCredits} zaidi</p>
            </div>
            <button onClick={startSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
              {saving ? 'Inahifadhi...' : `Hifadhi (${Math.min(items.length, giftSaveCredits)} vitu)`}
            </button>
          </div>
        ) : !verified ? (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm text-center">Weka code ya kuhifadhi iliyotolewa na Admin</p>
            <div className="flex gap-2">
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="CODE YA KUHIFADHI" className="input-field flex-1 font-mono tracking-widest text-center text-sm" autoCapitalize="characters" />
              <button onClick={verifyCode} disabled={verifying || !code.trim()} className="btn-primary px-4 disabled:opacity-50 flex-shrink-0">
                {verifying ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-gray-600 text-xs text-center">Code inaweza kuhifadhi picha/video idadi iliyowekwa na Admin</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
              <p className="text-green-400 text-sm font-semibold">✅ Code imekaguliwa!</p>
              <p className="text-gray-400 text-xs mt-0.5">Unaweza kuhifadhi vitu {Math.min(items.length, maxItems)} kati ya {items.length}</p>
            </div>
            <button onClick={startSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
              {saving ? 'Inahifadhi...' : `Hifadhi Vitu ${Math.min(items.length, maxItems)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function GalleryPicker({ onSelect, onClose, accept = 'image/*,video/*,audio/*', multiple = true, title = 'Chagua Media' }: GalleryPickerProps) {
  const [galleryItems, setGalleryItems] = useState<{ file: File; url: string; type: 'image' | 'video' | 'audio' }[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openFileManager() { fileInputRef.current?.click(); }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setLoading(true);
    const items = files.map(f => ({
      file: f,
      url: URL.createObjectURL(f),
      type: f.type.startsWith('video') ? 'video' as const : f.type.startsWith('audio') ? 'audio' as const : 'image' as const,
    }));
    setGalleryItems(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return items; });
    if (files.length === 1) setSelected(new Set([0]));
    setLoading(false);
  }

  function toggleSelect(idx: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else { if (!multiple) next.clear(); next.add(idx); }
      return next;
    });
  }

  function confirmSelection() {
    const files = Array.from(selected).sort().map(i => galleryItems[i].file);
    if (files.length === 0) return;
    onSelect(files);
    onClose();
  }

  const selectedItems = Array.from(selected).sort().map(i => galleryItems[i]);

  useEffect(() => {
    return () => { galleryItems.forEach(item => URL.revokeObjectURL(item.url)); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#050208' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a0a1a]">
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-white font-bold">{title}</h3>
        <button onClick={confirmSelection} disabled={selected.size === 0}
          className="px-4 py-1.5 rounded-xl font-bold text-sm disabled:opacity-40 disabled:pointer-events-none"
          style={{ background: selected.size > 0 ? 'linear-gradient(135deg,#FF1493,#C2185B)' : 'rgba(255,20,147,0.2)', color: 'white' }}>
          {selected.size > 0 ? `Tuma (${selected.size})` : 'Chagua'}
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-4 py-3 border-b border-[#1a0a1a]">
        <button onClick={openFileManager}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
          style={{ background: 'rgba(255,20,147,0.15)', border: '1px solid rgba(255,20,147,0.3)', color: '#FF1493' }}>
          <ImageIcon className="w-4 h-4" />
          Chagua Picha/Video
        </button>
        {galleryItems.length > 0 && (
          <button
            onClick={() => { if (selected.size === 0) { toast.info('Chagua picha/video kwanza'); return; } setShowSaveModal(true); }}
            className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl font-semibold text-sm flex-shrink-0"
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}>
            <Download className="w-4 h-4" />
            Hifadhi
          </button>
        )}
        <input ref={fileInputRef} type="file" accept={accept} multiple={multiple} className="hidden"
          onChange={handleFileChange} />
      </div>

      {/* Gallery grid */}
      <div className="flex-1 overflow-y-auto px-1 py-2">
        {galleryItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-600">
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,20,147,0.08)', border: '1px solid rgba(255,20,147,0.15)' }}>
              <ImageIcon className="w-10 h-10 text-primary/40" />
            </div>
            <div className="text-center">
              <p className="text-gray-400 font-semibold">Bonyeza "Chagua Picha/Video"</p>
              <p className="text-gray-600 text-sm mt-1">Chagua faili kutoka kwenye simu yako</p>
            </div>
            <button onClick={openFileManager}
              className="px-6 py-3 rounded-xl font-bold text-sm"
              style={{ background: 'linear-gradient(135deg,#FF1493,#C2185B)', color: 'white' }}>
              📂 Fungua Gallery
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {galleryItems.map((item, idx) => {
              const isSelected = selected.has(idx);
              const selIdx = Array.from(selected).sort().indexOf(idx);
              return (
                <div key={idx} className="relative aspect-square cursor-pointer overflow-hidden"
                  onClick={() => toggleSelect(idx)}>
                  {item.type === 'image' ? (
                    <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : item.type === 'video' ? (
                    <div className="w-full h-full bg-[#0d0d0d] flex items-center justify-center relative">
                      <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                          <Video className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-[#1a0a1a] flex flex-col items-center justify-center gap-1">
                      <span className="text-3xl">🎵</span>
                      <span className="text-gray-400 text-[10px] px-1 text-center truncate w-full">{item.file.name}</span>
                    </div>
                  )}
                  {isSelected && <div className="absolute inset-0 bg-primary/30" />}
                  <div className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${isSelected ? 'gradient-pink border-white text-white font-bold text-xs' : 'border-white/60 bg-black/30'}`}>
                    {isSelected && selIdx >= 0 ? selIdx + 1 : ''}
                  </div>
                  {item.type === 'video' && (
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded font-mono">
                      {(item.file.size / 1024 / 1024).toFixed(1)}MB
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="px-4 py-3 border-t border-[#1a0a1a] flex items-center gap-3"
          style={{ background: 'rgba(8,3,12,0.98)' }}>
          <div className="flex-1 flex gap-1 overflow-x-auto">
            {Array.from(selected).sort().map(i => (
              <div key={i} className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 border-primary relative">
                {galleryItems[i]?.type === 'image' ? (
                  <img src={galleryItems[i].url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-[#1a0a1a] flex items-center justify-center">
                    <Video className="w-5 h-5 text-primary" />
                  </div>
                )}
                <button onClick={(e) => { e.stopPropagation(); toggleSelect(i); }}
                  className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-bl-lg flex items-center justify-center">
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            ))}
          </div>
          <button onClick={confirmSelection}
            className="flex-shrink-0 px-5 py-2.5 rounded-xl font-black text-white text-sm"
            style={{ background: 'linear-gradient(135deg,#FF1493,#C2185B)' }}>
            Tuma {selected.size}
          </button>
        </div>
      )}

      {showSaveModal && selectedItems.length > 0 && (
        <SaveCodeModal items={selectedItems} onClose={() => setShowSaveModal(false)} />
      )}
    </div>
  );
}
