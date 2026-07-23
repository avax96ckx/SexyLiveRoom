import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, uploadFile } from '@/lib/supabase';
import { ArrowLeft, Plus, Edit3, Trash2, Upload, X, ArrowUp, ArrowDown, EyeOff, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { generateVideoThumbnail } from '@/lib/generateThumbnail';

// ─── Balance confirm modal ────────────────────────────────────────────────────
function BalanceConfirmModal({ amount, name, balance, onConfirm, onCancel }: {
  amount: number; name: string; balance: number; onConfirm: () => void; onCancel: () => void;
}) {
  const canAfford = (balance || 0) >= amount;
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-sm bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 slide-up" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">💋</div>
          <h3 className="text-white font-black text-xl">{name}</h3>
        </div>
        <div className="bg-[#1a0a1a] rounded-xl p-4 mb-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Bei ya Huduma:</span>
            <span className="text-primary font-black">TZS {amount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Salio Lako:</span>
            <span className={`font-black ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
              TZS {(balance || 0).toLocaleString()}
            </span>
          </div>
          {!canAfford && <p className="text-red-400 text-xs text-center pt-1">⚠️ Salio halitooshi. Ongeza pesa kwenye Wallet.</p>}
        </div>
        <p className="text-gray-400 text-sm text-center mb-4">
          Thibitisha kulipa TZS {amount.toLocaleString()} na kupata huduma hii.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-400 font-semibold text-sm">Ghairi</button>
          <button onClick={onConfirm} disabled={!canAfford} className="flex-1 py-3 rounded-xl gradient-pink text-white font-black text-sm disabled:opacity-40">
            ✅ Lipia Sasa
          </button>
        </div>
        {!canAfford && (
          <button onClick={() => { onCancel(); }} className="w-full mt-2 py-2 text-primary text-sm font-semibold text-center">
            + Ongeza Pesa kwenye Wallet
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Gift Modal for Admin Services ───────────────────────────────────────────
function ServiceGiftModal({ svcName, uploaderId, myProfile, onClose }: {
  svcName: string; uploaderId: string; myProfile: any; onClose: () => void;
}) {
  const GIFTS = [
    { emoji: '🌹', name: 'Waridi', amount: 100 }, { emoji: '💐', name: 'Maua', amount: 200 },
    { emoji: '🍫', name: 'Chokoleti', amount: 500 }, { emoji: '💍', name: 'Pete', amount: 1000 },
    { emoji: '🧸', name: 'Teddy', amount: 2000 }, { emoji: '💎', name: 'Almasi', amount: 5000 },
    { emoji: '🏆', name: 'Trophy', amount: 10000 }, { emoji: '🚗', name: 'Gari', amount: 50000 },
  ];
  const [selected, setSelected] = useState<typeof GIFTS[0] | null>(null);
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const giftBal = myProfile?.gift_balance || 0;
  const mainBal = myProfile?.balance || 0;

  async function handleSend() {
    if (!selected || !user) return;
    const amt = selected.amount;
    const canUseGift = giftBal >= amt;
    if (!canUseGift && mainBal < amt) { toast.error(`Salio halitooshi. Unahitaji TZS ${amt.toLocaleString()}`); return; }
    setSending(true);
    try {
      if (canUseGift) await supabase.from('user_profiles').update({ gift_balance: giftBal - amt }).eq('id', user.id);
      else await supabase.from('user_profiles').update({ balance: mainBal - amt }).eq('id', user.id);
      const { data: r } = await supabase.from('user_profiles').select('gift_balance').eq('id', uploaderId).single();
      await supabase.from('user_profiles').update({ gift_balance: ((r as any)?.gift_balance || 0) + amt }).eq('id', uploaderId);
      await supabase.from('notifications').insert({ user_id: uploaderId, title: `🎁 Umepata Zawadi!`, message: `${myProfile?.username} amekutumia ${selected.emoji} ${selected.name} - TZS ${amt.toLocaleString()} (Huduma: ${svcName})`, type: 'gift' });
      await supabase.from('transactions').insert({ user_id: user.id, amount: amt, type: 'gift_sent', status: 'approved', description: `Zawadi ${selected.emoji} kwa huduma: ${svcName}` });
      toast.success(`🎁 Zawadi ya TZS ${amt.toLocaleString()} imetumwa!`);
      onClose();
    } catch { toast.error('Hitilafu ya kutuma zawadi'); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-5 slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-3">
          <h3 className="text-white font-bold flex items-center gap-2"><Gift className="w-5 h-5 text-orange-400" /> Tuma Zawadi - {svcName}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {GIFTS.map(g => (
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
            <button onClick={handleSend} disabled={sending} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>{selected.emoji}</span>}
              {sending ? 'Inatuma...' : `Tuma ${selected.emoji} - TZS ${selected.amount.toLocaleString()}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminServices() {
  const navigate = useNavigate();
  const { isAdmin, user, profile } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editSvc, setEditSvc] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileSize, setUploadFileSize] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [newSvc, setNewSvc] = useState({ name: '', description: '', price: '0', action_link: '', show_in_tiksexy: false, image_url: '', video_url: '', thumbnail_url: '' });
  const [hiddenUpload, setHiddenUpload] = useState(false);
  const [payModal, setPayModal] = useState<any | null>(null);
  const [paidSvcIds, setPaidSvcIds] = useState<Set<string>>(new Set());
  const [giftModal, setGiftModal] = useState<any | null>(null);

  useEffect(() => { fetchServices(); }, []);

  async function fetchServices() {
    const { data } = await supabase.from('services').select('*').eq('type', 'admin_service').eq('is_active', true).order('is_pinned', { ascending: false }).order('display_order').order('created_at', { ascending: false });
    setServices(data || []);
    setLoading(false);
  }

  async function uploadWithProgress(bucket: string, path: string, file: File): Promise<string> {
    setUploading(true); setUploadPct(0); setUploadFileName(file.name); setUploadFileSize(file.size); setUploadedBytes(0);
    const url = await uploadFile(bucket, path, file, (pct) => { setUploadPct(pct); setUploadedBytes(Math.round(file.size * pct / 100)); });
    setUploadPct(100); setUploadedBytes(file.size); setUploading(false);
    return url;
  }

  async function handleAdd() {
    if (!newSvc.name.trim()) { toast.error('Weka jina la huduma'); return; }
    const { error } = await supabase.from('services').insert({
      name: newSvc.name, description: newSvc.description,
      price: parseFloat(newSvc.price) || 0,
      action_link: newSvc.action_link || null,
      image_url: newSvc.image_url || null,
      video_url: newSvc.video_url || null,
      thumbnail_url: newSvc.thumbnail_url || null,
      show_in_tiksexy: newSvc.show_in_tiksexy,
      type: 'admin_service', is_active: true,
      display_order: services.length + 1,
    });
    if (error) { toast.error('Hitilafu: ' + error.message); return; }
    toast.success('✅ Huduma imeongezwa!');
    setShowAdd(false);
    setNewSvc({ name: '', description: '', price: '0', action_link: '', show_in_tiksexy: false, image_url: '', video_url: '', thumbnail_url: '' });
    fetchServices();
  }

  async function handleUpdate() {
    if (!editSvc) return;
    await supabase.from('services').update({
      name: editSvc.name, description: editSvc.description,
      price: editSvc.price, action_link: editSvc.action_link,
      image_url: editSvc.image_url, video_url: editSvc.video_url,
      thumbnail_url: editSvc.thumbnail_url,
      show_in_tiksexy: editSvc.show_in_tiksexy,
      is_active: editSvc.is_active,
    }).eq('id', editSvc.id);
    toast.success('Imebadilishwa!'); setEditSvc(null); fetchServices();
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Futa huduma hii?')) return;
    await supabase.from('services').delete().eq('id', id);
    toast.success('Imefutwa!'); fetchServices();
  }

  async function swapOrder(idx: number, dir: 'up' | 'down') {
    const other = dir === 'up' ? services[idx - 1] : services[idx + 1];
    const cur = services[idx];
    if (!other) return;
    await supabase.from('services').update({ display_order: other.display_order }).eq('id', cur.id);
    await supabase.from('services').update({ display_order: cur.display_order }).eq('id', other.id);
    fetchServices();
  }

  async function confirmPay(svc: any) {
    if (!user || !profile) return;
    const price = svc.price || 0;
    if ((profile.balance || 0) < price) { toast.error('Salio halitooshi. Ongeza pesa kwenye Wallet.'); navigate('/wallet'); return; }
    const { error } = await supabase.from('user_profiles').update({ balance: (profile.balance || 0) - price }).eq('id', user.id);
    if (error) { toast.error('Hitilafu ya malipo'); return; }
    await supabase.from('transactions').insert({ user_id: user.id, amount: price, type: 'admin_service', status: 'approved', description: `Huduma: ${svc.name}` });
    // Notify admin
    const { data: adminProf } = await supabase.from('user_profiles').select('id').eq('is_admin', true).limit(1).single();
    if (adminProf) {
      await supabase.from('notifications').insert({ user_id: (adminProf as any).id, title: '💰 Huduma Imelipwa!', message: `${profile.username} amelipa TZS ${price.toLocaleString()} kwa huduma: ${svc.name}`, type: 'payment_request' });
    }
    if ((window as any).__authRefreshProfile) (window as any).__authRefreshProfile();
    setPaidSvcIds(prev => new Set([...prev, svc.id]));
    setPayModal(null);
    toast.success(`✅ Umelipa TZS ${price.toLocaleString()}!`);
    // Open action link
    const link = (svc.action_link || '').trim();
    if (link) { let l = link; if (!/^https?:\/\//i.test(l)) l = 'https://' + l; window.open(l, '_blank'); }
    else {
      // No link - open WhatsApp to admin
      const { data: s } = await supabase.from('app_settings').select('value').eq('key', 'whatsapp_support').single();
      const num = (s?.value || '').replace(/\D/g, '');
      if (num) window.open(`https://wa.me/${num}?text=Nimetuma malipo ya TZS ${price.toLocaleString()} kwa huduma: ${svc.name}`, '_blank');
      else toast.info('Wasiliana na admin kwa msaada');
    }
  }

  function handleActionButton(svc: any) {
    if (!user) { navigate('/login'); return; }
    const price = svc.price || 0;
    const isPaid = paidSvcIds.has(svc.id);
    if (isPaid || price <= 0) {
      const link = (svc.action_link || '').trim();
      if (link) { let l = link; if (!/^https?:\/\//i.test(l)) l = 'https://' + l; window.open(l, '_blank'); }
      else {
        supabase.from('app_settings').select('value').eq('key', 'whatsapp_support').single().then(({ data: s }) => {
          const num = (s?.value || '').replace(/\D/g, '');
          if (num) window.open(`https://wa.me/${num}?text=Nataka kujua zaidi kuhusu huduma: ${svc.name}`, '_blank');
          else toast.info('Wasiliana na admin kwa msaada');
        });
      }
    } else {
      setPayModal(svc);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => navigate(-1)} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-white font-bold text-xl flex-1">💋 Huduma za Admin</h1>
        {isAdmin && (
          <button onClick={() => setShowAdd(true)} className="gradient-pink text-white font-bold px-3 py-1.5 rounded-xl text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> Ongeza
          </button>
        )}
      </div>

      {/* Hidden upload indicator */}
      {uploading && hiddenUpload && (
        <button onClick={() => setHiddenUpload(false)} className="mx-4 mt-2 mb-0 w-[calc(100%-2rem)] py-2 text-xs text-primary font-semibold bg-primary/10 rounded-xl border border-primary/20 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Upload inaendelea... (Gonga kuona)
        </button>
      )}

      {/* Upload progress card */}
      {uploading && !hiddenUpload && (
        <div className="mx-4 mt-2 mb-0">
          <div className="relative rounded-xl overflow-hidden" style={{ background: 'rgba(255,20,147,0.08)', border: '1px solid rgba(255,20,147,0.2)' }}>
            <div className="absolute top-2 right-2 flex gap-1 z-10">
              <button onClick={() => setHiddenUpload(true)} title="Ficha" className="w-7 h-7 rounded-lg bg-black/60 flex items-center justify-center">
                <EyeOff className="w-3.5 h-3.5 text-gray-300" />
              </button>
            </div>
            <div className="p-3 pr-16">
              {uploadFileName && <p className="text-gray-300 text-xs font-semibold truncate mb-1">📁 {uploadFileName}</p>}
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-primary font-bold animate-pulse">{Math.round(uploadPct)}%</span>
                {uploadFileSize > 0 && <span className="text-gray-500">{(uploadFileSize * uploadPct / 100 / 1024 / 1024).toFixed(1)} / {(uploadFileSize / 1024 / 1024).toFixed(1)} MB</span>}
              </div>
              <div className="h-1.5 bg-[#1a0a1a] rounded-full overflow-hidden">
                <div className="h-full gradient-pink rounded-full transition-all duration-300" style={{ width: `${Math.max(2, uploadPct)}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto mt-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-16 text-gray-500 px-4">
            <p className="text-4xl mb-3">💋</p>
            <p className="font-semibold">Hakuna huduma bado</p>
            {isAdmin && (
              <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 px-6">+ Ongeza Huduma</button>
            )}
          </div>
        ) : (
          <div className="space-y-0">
            {services.map((svc, idx) => {
              const isPaid = paidSvcIds.has(svc.id);
              const price = svc.price || 0;
              const isFree = price <= 0;
              const canGetFree = isFree || isPaid;
              return (
                <div key={svc.id} className="border-b border-[#1a0a1a]">
                  {/* Header */}
                  <div className="flex items-center gap-2 px-4 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold truncate">{svc.name}</p>
                      {!isFree && !isPaid && <span className="text-primary font-black text-sm">TZS {price.toLocaleString()}</span>}
                      {isPaid && <span className="text-green-400 text-xs font-bold">✓ Imelipwa</span>}
                      {isFree && <span className="bg-green-600/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">BURE</span>}
                    </div>
                    {/* Gift icon - only if not own admin service */}
                    {user && !isAdmin && (
                      <button onClick={() => {
                        // Get admin user id for gift
                        supabase.from('user_profiles').select('id').eq('is_admin', true).limit(1).single().then(({ data }) => {
                          if (data) setGiftModal({ svcName: svc.name, uploaderId: (data as any).id });
                        });
                      }} className="text-orange-400 hover:text-orange-300 p-1.5" title="Tuma Zawadi">
                        <Gift className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={async e => {
                        e.stopPropagation();
                        const newPinned = !(svc as any).is_pinned;
                        await supabase.from('services').update({ is_pinned: newPinned, pinned_at: newPinned ? new Date().toISOString() : null }).eq('id', svc.id);
                        toast.success(newPinned ? '📌 Imepinniwa juu!' : '✅ Pin imeondolewa!');
                        fetchServices();
                      }} className={`p-1.5 rounded-lg text-sm ${(svc as any).is_pinned ? 'bg-yellow-500/20 text-yellow-400' : 'bg-[#1a0a1a] text-gray-500'}`} title={(svc as any).is_pinned ? 'Ondoa pin' : 'Pin juu'}>
                        📌
                      </button>
                    )}
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button onClick={() => swapOrder(idx, 'up')} disabled={idx === 0} className="p-1.5 bg-[#1a0a1a] rounded-lg disabled:opacity-30"><ArrowUp className="w-3 h-3 text-gray-400" /></button>
                        <button onClick={() => swapOrder(idx, 'down')} disabled={idx === services.length - 1} className="p-1.5 bg-[#1a0a1a] rounded-lg disabled:opacity-30"><ArrowDown className="w-3 h-3 text-gray-400" /></button>
                        <button onClick={() => setEditSvc({ ...svc })} className="p-1.5 bg-[#1a0a1a] rounded-lg"><Edit3 className="w-3.5 h-3.5 text-primary" /></button>
                        <button onClick={() => handleDelete(svc.id)} className="p-1.5 bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    )}
                  </div>

                  {/* Media - full height like Malaya (520px) */}
                  {svc.video_url ? (
                    <div className="relative w-full bg-black cursor-pointer" style={{ height: 520, overflow: 'hidden' }}
                      onClick={() => navigate('/play', { state: { url: svc.video_url, title: svc.name } })}>
                      {(svc.thumbnail_url || svc.image_url) && (
                        <img src={svc.thumbnail_url || svc.image_url} alt={svc.name}
                          className="w-full h-full object-cover object-top"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.25)' }}>
                        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#FF1493,#C2185B)' }}>
                          <div className="w-0 h-0 border-l-[18px] border-l-white border-t-[12px] border-t-transparent border-b-[12px] border-b-transparent ml-1.5" />
                        </div>
                      </div>
                    </div>
                  ) : svc.image_url ? (
                    <div style={{ height: 520, overflow: 'hidden' }}>
                      <img src={svc.image_url} alt={svc.name} className="w-full h-full object-cover object-top" />
                    </div>
                  ) : null}

                  {/* Description + Actions */}
                  <div className="px-4 py-3">
                    {svc.description && <p className="text-gray-400 text-sm mb-3 leading-relaxed">{svc.description}</p>}
                    
                    {/* Action buttons */}
                    <div className="flex gap-2">
                      {canGetFree ? (
                        <button onClick={() => handleActionButton(svc)}
                          className="flex-1 bg-green-600 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                          🎁 Pata Huduma Sasa
                        </button>
                      ) : (
                        <button onClick={() => setPayModal(svc)}
                          className="flex-1 gradient-pink text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                          💳 Lipia Sasa - TZS {price.toLocaleString()}
                        </button>
                      )}
                      {/* Gift button as secondary */}
                      {user && !isAdmin && (
                        <button onClick={() => {
                          supabase.from('user_profiles').select('id').eq('is_admin', true).limit(1).single().then(({ data }) => {
                            if (data) setGiftModal({ svcName: svc.name, uploaderId: (data as any).id });
                          });
                        }} className="w-12 flex items-center justify-center rounded-xl border border-orange-400/40 bg-orange-400/10 text-orange-400 active:scale-95">
                          <Gift className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Service Modal */}
      {showAdd && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end justify-center">
          <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto slide-up">
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-bold">➕ Ongeza Huduma</h3>
              <div className="flex gap-2">
                {uploading && (
                  <button onClick={() => { setHiddenUpload(true); setShowAdd(false); }} title="Ficha - upload inaendelea" className="w-8 h-8 rounded-xl bg-[#1a0a1a] flex items-center justify-center">
                    <EyeOff className="w-4 h-4 text-gray-400" />
                  </button>
                )}
                <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>
            <div className="space-y-3">
              <input value={newSvc.name} onChange={e => setNewSvc(p => ({ ...p, name: e.target.value }))} placeholder="Jina la huduma *" className="input-field" autoFocus />
              <textarea value={newSvc.description} onChange={e => setNewSvc(p => ({ ...p, description: e.target.value }))} placeholder="Maelezo" className="input-field min-h-[60px] resize-none" />
              <input type="number" value={newSvc.price} onChange={e => setNewSvc(p => ({ ...p, price: e.target.value }))} placeholder="Bei (TZS)" className="input-field" />
              <input value={newSvc.action_link} onChange={e => setNewSvc(p => ({ ...p, action_link: e.target.value }))} placeholder="Link ya kitufe (hiari)" className="input-field" />
              <label className="block btn-outline text-center cursor-pointer py-2 text-sm">
                <Upload className="w-3 h-3 inline mr-1" />{newSvc.image_url ? '✓ Picha imechaguliwa' : 'Pakia Picha'}
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const url = await uploadWithProgress('content', `services/${Date.now()}.${f.name.split('.').pop()}`, f);
                  setNewSvc(p => ({ ...p, image_url: url }));
                }} />
              </label>
              {newSvc.image_url && <img src={newSvc.image_url} alt="" className="w-full h-20 object-cover rounded-xl border border-primary/30" />}
              <label className="block btn-outline text-center cursor-pointer py-2 text-sm">
                <Upload className="w-3 h-3 inline mr-1" />{newSvc.video_url ? '✓ Video imechaguliwa' : 'Pakia Video'}
                <input type="file" accept="video/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const url = await uploadWithProgress('content', `services/vid_${Date.now()}.${f.name.split('.').pop()}`, f);
                  setNewSvc(p => ({ ...p, video_url: url }));
                  if (!newSvc.image_url) {
                    const tb = await generateVideoThumbnail(f).catch(() => null);
                    if (tb) { const tu = await uploadFile('content', `services/thumb_${Date.now()}.jpg`, tb); setNewSvc(p => ({ ...p, thumbnail_url: tu })); }
                  }
                }} />
              </label>
              {newSvc.video_url && <video src={newSvc.video_url} className="w-full h-20 object-cover rounded-xl" muted />}
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl border border-primary/20">
                <span className="text-white text-sm font-semibold">🎬 Onyesha kwenye TIK-SEXY?</span>
                <button onClick={() => setNewSvc(p => ({ ...p, show_in_tiksexy: !p.show_in_tiksexy }))}
                  className={`w-12 h-6 rounded-full transition-colors ${newSvc.show_in_tiksexy ? 'bg-primary' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${newSvc.show_in_tiksexy ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              <button onClick={handleAdd} disabled={uploading || !newSvc.name.trim()} className="btn-primary w-full disabled:opacity-50">💾 Hifadhi Huduma</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editSvc && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end justify-center">
          <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto slide-up">
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-bold">✏️ Hariri Huduma</h3>
              <button onClick={() => setEditSvc(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <input value={editSvc.name} onChange={e => setEditSvc((p: any) => ({ ...p, name: e.target.value }))} placeholder="Jina" className="input-field" />
              <textarea value={editSvc.description || ''} onChange={e => setEditSvc((p: any) => ({ ...p, description: e.target.value }))} placeholder="Maelezo" className="input-field min-h-[60px] resize-none" />
              <input type="number" value={editSvc.price} onChange={e => setEditSvc((p: any) => ({ ...p, price: parseFloat(e.target.value) }))} placeholder="Bei" className="input-field" />
              <input value={editSvc.action_link || ''} onChange={e => setEditSvc((p: any) => ({ ...p, action_link: e.target.value }))} placeholder="Link ya kitufe" className="input-field" />
              <label className="block btn-outline text-center cursor-pointer py-2 text-sm">
                <Upload className="w-3 h-3 inline mr-1" />Badilisha Picha
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const url = await uploadWithProgress('content', `services/${Date.now()}.${f.name.split('.').pop()}`, f);
                  setEditSvc((p: any) => ({ ...p, image_url: url }));
                }} />
              </label>
              {editSvc.image_url && <img src={editSvc.image_url} alt="" className="w-full h-16 object-cover rounded-xl border border-primary/30" />}
              <div className="flex items-center justify-between p-2 bg-[#1a0a1a] rounded-xl">
                <span className="text-gray-300 text-sm">Inaonyeshwa?</span>
                <button onClick={() => setEditSvc((p: any) => ({ ...p, is_active: !p.is_active }))} className={`w-12 h-6 rounded-full ${editSvc.is_active ? 'bg-green-500' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editSvc.is_active ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              <div className="flex items-center justify-between p-2 bg-[#1a0a1a] rounded-xl">
                <span className="text-gray-300 text-sm">🎬 TikSexy?</span>
                <button onClick={() => setEditSvc((p: any) => ({ ...p, show_in_tiksexy: !p.show_in_tiksexy }))} className={`w-12 h-6 rounded-full ${editSvc.show_in_tiksexy ? 'bg-primary' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editSvc.show_in_tiksexy ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              <button onClick={handleUpdate} disabled={uploading} className="btn-primary w-full disabled:opacity-50">💾 Hifadhi</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payModal && (
        <BalanceConfirmModal
          amount={payModal.price || 0}
          name={payModal.name}
          balance={profile?.balance || 0}
          onConfirm={() => confirmPay(payModal)}
          onCancel={() => setPayModal(null)}
        />
      )}

      {/* Gift Modal */}
      {giftModal && profile && (
        <ServiceGiftModal
          svcName={giftModal.svcName}
          uploaderId={giftModal.uploaderId}
          myProfile={profile}
          onClose={() => setGiftModal(null)}
        />
      )}
    </div>
  );
}
