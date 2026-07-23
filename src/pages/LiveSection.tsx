
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, uploadFile } from '@/lib/supabase';
import { LiveOption, AppSettings } from '@/types';
import { ArrowLeft, Plus, Phone, X, Upload, Share2, Trash2, Radio, Edit3, Bookmark, Wifi, WifiOff, Gift, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import PaymentModal from '@/components/features/PaymentModal';
import UploadProgress from '@/components/features/UploadProgress';
import { PlanPickerModal } from '@/pages/Services';

// ─── Online/Offline indicator badge ─────────────────────────────────────────
function OnlineBadge({ isOnline }: { isOnline: boolean }) {
  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black flex-shrink-0 ${
      isOnline
        ? 'bg-green-500/20 text-green-400 border border-green-500/40'
        : 'bg-gray-600/20 text-gray-500 border border-gray-600/40'
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
      {isOnline ? 'ONLINE' : 'OFFLINE'}
    </div>
  );
}

// Balance confirmation dialog for Live Room
function LiveBalanceModal({ amount, name, balance, onConfirm, onCancel }: {
  amount: number; name: string; balance: number; onConfirm: () => void; onCancel: () => void;
}) {
  const canAfford = (balance || 0) >= amount;
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-sm bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 slide-up" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">🔴</div>
          <h3 className="text-white font-black text-xl">{name}</h3>
          <p className="text-gray-400 text-sm">Live Room</p>
        </div>
        <div className="bg-[#1a0a1a] rounded-xl p-4 mb-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Bei ya Kuingia:</span>
            <span className="text-primary font-black">TZS {amount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 text-sm">Salio Lako:</span>
            <span className={`font-black ${canAfford ? 'text-green-400' : 'text-red-400'}`}>TZS {(balance || 0).toLocaleString()}</span>
          </div>
          {!canAfford && <p className="text-red-400 text-xs text-center pt-1">⚠️ Salio halitooshi. Ongeza pesa kwenye Wallet.</p>}
        </div>
        <p className="text-gray-400 text-sm text-center mb-4">Thibitisha: TZS {amount.toLocaleString()} itakatwa kwenye salio lako na utaingia Live Room.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-400 font-semibold text-sm">Ghairi</button>
          <button onClick={onConfirm} disabled={!canAfford} className="flex-1 py-3 rounded-xl gradient-pink text-white font-black text-sm disabled:opacity-40">
            ✅ Thibitisha &amp; Ingia
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LiveSection() {
  const navigate = useNavigate();
  const { profile, user, requireAuth, isAdmin } = useAuth();
  const [tab, setTab] = useState<'live_room' | 'video_call'>('live_room');
  const [searchParams] = useSearchParams();
  const optRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightOptId, setHighlightOptId] = useState<string | null>(null);
  const [options, setOptions] = useState<LiveOption[]>([]);
  const [settings, setSettings] = useState<AppSettings>({});
  const [showUpload, setShowUpload] = useState(false);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [balanceModal, setBalanceModal] = useState<{ opt: LiveOption; amount: number } | null>(null);
  const [giftChoiceModal, setGiftChoiceModal] = useState<{ opt: LiveOption; amount: number } | null>(null);
  const [unlockedLive, setUnlockedLive] = useState<Set<string>>(new Set());
  const [unlockedLoaded, setUnlockedLoaded] = useState(false);
  const [editData, setEditData] = useState({ name: '', type: 'video_call', price: '0', link: '', whatsapp: '', show_in_tiksexy: false });
  const [editOpt, setEditOpt] = useState<LiveOption | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hiddenUpload, setHiddenUpload] = useState(false);
  const [uploadPctLive, setUploadPctLive] = useState(0);
  const [uploadPct, setUploadPct] = useState(0);
  // Admin: track which opt is being toggled
  const [togglingOnline, setTogglingOnline] = useState<string | null>(null);
  const [giftLive, setGiftLive] = useState<LiveOption | null>(null);

  const isVip = profile?.is_vip || profile?.is_admin;
  const canPostVideoCall = profile?.is_admin || profile?.is_business;
  const isOwnLivePost = (opt: LiveOption) => profile?.is_business && (opt as any).uploader_id === user?.id;

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const optId = searchParams.get('opt');
    if (optId && options.length > 0) {
      const opt = options.find(o => o.id === optId);
      if (opt) {
        setTab(opt.type as 'live_room' | 'video_call');
        setTimeout(() => {
          const el = optRefs.current[optId];
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightOptId(optId);
            setTimeout(() => setHighlightOptId(null), 2500);
          }
        }, 400);
      }
    }
  }, [options.length, searchParams]);

  useEffect(() => { if (user && !unlockedLoaded) loadUnlocked(); }, [user]);

  async function loadUnlocked() {
    if (!user) return;
    const { data } = await supabase.from('user_unlocked_content')
      .select('content_id').eq('user_id', user.id).eq('content_type', 'live');
    setUnlockedLive(new Set((data || []).map((r: any) => r.content_id as string)));
    setUnlockedLoaded(true);
  }

  async function fetchData() {
    const { data: s } = await supabase.from('app_settings').select('*');
    const m: AppSettings = {}; s?.forEach((r: any) => { m[r.key] = r.value; }); setSettings(m);
    const { data } = await supabase.from('live_options').select('*').eq('is_active', true).order('created_at', { ascending: false });
    setOptions((data || []) as LiveOption[]);
  }

  // Admin: toggle online/offline directly from card
  async function toggleOnlineStatus(opt: LiveOption, e: React.MouseEvent) {
    e.stopPropagation();
    if (!isAdmin && !isOwnLivePost(opt)) return;
    setTogglingOnline(opt.id);
    const newStatus = !(opt as any).is_online;
    await supabase.from('live_options').update({ is_online: newStatus }).eq('id', opt.id);
    setOptions(prev => prev.map(o => o.id === opt.id ? { ...o, is_online: newStatus } as any : o));
    toast.success(newStatus ? '🟢 Umeweka Online!' : '⚫ Umeweka Offline');
    setTogglingOnline(null);
  }

  async function handleSave() {
    if (!editData.name) { toast.error('Weka jina'); return; }
    setUploading(true); setUploadPct(0);
    try {
      let coverUrl = '';
      if (file) {
        const path = `live/${Date.now()}_cover.${file.name.split('.').pop()}`;
        coverUrl = await uploadFile('content', path, file, p => setUploadPct(Math.round(p)));
      }
      await supabase.from('live_options').insert({
        name: editData.name, type: editData.type,
        price: parseFloat(editData.price) || 0,
        link: editData.link, whatsapp: editData.whatsapp,
        cover_url: coverUrl || undefined, is_active: true,
        is_online: true,
        display_order: options.length + 1,
        uploader_id: user?.id || null,
      });

      // If show_in_tiksexy is enabled, also create a content_post for TikSexy feed
      if (editData.show_in_tiksexy) {
        await supabase.from('content_posts').insert({
          type: 'live',
          title: editData.name,
          media_url: coverUrl || '',
          thumbnail_url: coverUrl || '',
          price: parseFloat(editData.price) || 0,
          is_free: parseFloat(editData.price) <= 0,
          uploader_id: user?.id || null,
          show_in_tiksexy: true,
          source: 'home',
          whatsapp: editData.whatsapp,
          phone: editData.link, // store link in phone field
        });
      }
      toast.success('Imeongezwa!');
      setShowUpload(false); setFile(null);
      setEditData({ name: '', type: 'video_call', price: '0', link: '', whatsapp: '', show_in_tiksexy: false });
      fetchData();
    } catch (err) { console.error(err); toast.error('Hitilafu ya upload.'); }
    finally { setUploading(false); }
  }

  async function handleUpdate() {
    if (!editOpt) return;
    await supabase.from('live_options').update({
      name: editOpt.name, price: editOpt.price,
      link: editOpt.link, whatsapp: editOpt.whatsapp,
      is_active: editOpt.is_active,
      is_online: (editOpt as any).is_online,
      cover_url: (editOpt as any).cover_url || null,
    }).eq('id', editOpt.id);
    toast.success('Imebadilishwa!'); setEditOpt(null); fetchData();
  }

  async function deleteOption(id: string) {
    if (!window.confirm('Futa option hii?')) return;
    await supabase.from('live_options').update({ is_active: false }).eq('id', id);
    toast.success('Imefutwa!'); fetchData();
  }

  async function shareOption(opt: LiveOption, e?: React.MouseEvent) {
    e?.stopPropagation();
    const url = `${window.location.origin}/live`;
    try {
      if (navigator.share) await navigator.share({ title: `${opt.name} - SEXY LIVE ROOM`, url });
      else { await navigator.clipboard.writeText(url); toast.success('Link imenakiliwa!'); }
    } catch {}
  }

  async function confirmLiveBalancePay(opt: LiveOption, amount: number) {
    if (!user || !profile) return;
    if ((profile.balance || 0) < amount) {
      toast.error('Salio halitooshi. Ongeza pesa kwenye Wallet.');
      navigate('/wallet'); return;
    }
    const { error } = await supabase.from('user_profiles').update({ balance: (profile.balance || 0) - amount }).eq('id', user.id);
    if (error) { toast.error('Hitilafu ya malipo'); return; }

    const optUploaderId = (opt as any).uploader_id;
    if (optUploaderId && optUploaderId !== user.id) {
      const { data: uploaderProf } = await supabase.from('user_profiles').select('balance,is_business').eq('id', optUploaderId).single();
      if (uploaderProf?.is_business) {
        await supabase.from('user_profiles').update({ balance: (uploaderProf.balance || 0) + amount }).eq('id', optUploaderId);
        await supabase.from('transactions').insert({
          user_id: optUploaderId, amount, type: 'live_sale', status: 'approved',
          description: `Mapato ya Live: ${opt.name} - kutoka ${profile.username}`,
        });
        await supabase.from('notifications').insert({
          user_id: optUploaderId, title: '💰 Pesa Imeingia!',
          message: `TZS ${amount.toLocaleString()} kutoka mtu aliyeingia Live Room/Video Call yako (${opt.name})`,
          type: 'sale',
        });
      }
    }

    await supabase.from('transactions').insert({
      user_id: user.id, amount, type: 'live_room', status: 'approved',
      description: `Live Room: ${opt.name}`,
    });
    await supabase.from('user_unlocked_content').upsert({
      user_id: user.id, content_id: opt.id, content_type: 'live', amount_paid: amount,
    }, { onConflict: 'user_id,content_id' });
    setUnlockedLive(prev => new Set([...prev, opt.id]));
    setBalanceModal(null);
    if ((window as any).__authRefreshProfile) (window as any).__authRefreshProfile();
    toast.success(`✅ Umeingia! TZS ${amount.toLocaleString()} imekatwa. Utaingia bure wakati ujao.`);
    if (opt.link) {
      let link = opt.link.trim();
      if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
      window.open(link, '_blank', 'noopener,noreferrer');
    } else toast.info('Link haipatikani');
  }

  const openLiveLink = (opt: LiveOption) => {
    if (opt.link) {
      let link = opt.link.trim();
      if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
      window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      toast.info('Link haipatikani kwa sasa');
    }
  };

  const handleJoin = (opt: LiveOption) => {
    requireAuth(() => {
      const price = parseFloat(String(opt.price) || '0') || parseFloat(settings.live_room_price || '2000');

      const openContact = () => {
        if (opt.type === 'video_call') {
          if (opt.whatsapp) window.open(`https://wa.me/${opt.whatsapp.replace(/\D/g, '')}?text=Nataka video call`, '_blank');
          else if (opt.link) openLiveLink(opt);
          else toast.info('Mawasiliano hayapatikani sasa hivi');
        } else {
          openLiveLink(opt);
        }
      };

      if (unlockedLive.has(opt.id) || isVip) { openContact(); return; }
      if (price <= 0) { openContact(); return; }

      // Check gift live credits
      const giftLiveCredits = user ? parseInt(localStorage.getItem(`gift_live_credits_${user.id}`) || '0') : 0;
      if (giftLiveCredits > 0) {
        // Offer choice: use gift credits or pay with balance
        setGiftChoiceModal({ opt, amount: price });
        return;
      }
      setBalanceModal({ opt, amount: price });
    });
  };

  const filteredOptions = options.filter(o => o.type === tab);

  return (
    <div className="min-h-screen bg-background">
      <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => navigate(-1)} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-white font-bold text-xl flex-1">🔴 LIVE</h1>
        {/* Online count indicator */}
        {options.filter(o => (o as any).is_online && o.type === tab).length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/15 border border-green-500/30">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-xs font-bold">{options.filter(o => (o as any).is_online && o.type === tab).length} Online</span>
          </div>
        )}
        {(isAdmin || canPostVideoCall) && (
          <button onClick={() => setShowUpload(true)} className="w-8 h-8 gradient-pink rounded-full flex items-center justify-center">
            <Plus className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Hidden upload indicator */}
      {uploading && hiddenUpload && (
        <button onClick={() => { setHiddenUpload(false); setShowUpload(true); }} className="mx-4 mt-2 mb-1 w-[calc(100%-2rem)] py-2 text-xs text-primary font-semibold bg-primary/10 rounded-xl border border-primary/20 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Upload inaendelea... (Gonga kuona)
        </button>
      )}
      <div className="max-w-md mx-auto px-4">
        <div className="flex gap-2 mt-4 mb-4">
          <button onClick={() => setTab('live_room')}
            className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 ${tab === 'live_room' ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
            <Radio className="w-4 h-4" /> LIVE ROOM
          </button>
          <button onClick={() => setTab('video_call')}
            className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 ${tab === 'video_call' ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
            <Phone className="w-4 h-4" /> VIDEO CALL
          </button>
        </div>

        <div className="space-y-0 -mx-4">
          {/* LIVE ROOM: full card layout */}
          {tab === 'live_room' && filteredOptions.map(opt => {
            const isOnline = !!(opt as any).is_online;
            return (
              <div key={opt.id} ref={el => { optRefs.current[opt.id] = el; }}
                className={`border-b border-[#1a0a1a] transition-all duration-300 ${highlightOptId === opt.id ? 'bg-primary/10' : ''}`}>
                <div className="flex items-center gap-2 px-4 py-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isOnline ? 'gradient-pink' : 'bg-[#1a0a1a]'}`}>
                    <Radio className={`w-4 h-4 ${isOnline ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold truncate">{opt.name}</p>
                  </div>
                  <OnlineBadge isOnline={isOnline} />
                  {/* Gift credit badge for live options that require payment */}
                  {(() => {
                    const price = parseFloat(String(opt.price) || '0') || 0;
                    const giftCreds = user ? parseInt(localStorage.getItem(`gift_live_credits_${user.id}`) || '0') : 0;
                    return (price > 0 && !isVip && !unlockedLive.has(opt.id) && giftCreds > 0) ? (
                      <span className="bg-orange-500/90 text-white text-[9px] font-black px-2 py-0.5 rounded-full">🎁 {giftCreds}</span>
                    ) : null;
                  })()}
                  {parseFloat(String(opt.price) || '0') > 0 && <span className="ml-1 text-primary text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/20">TZS {parseFloat(String(opt.price) || '0').toLocaleString()}</span>}
                  <button onClick={e => shareOption(opt, e)} className="text-gray-400 hover:text-primary ml-1"><Share2 className="w-4 h-4" /></button>
                  <button onClick={async e => { e.stopPropagation(); if (!user) { navigate('/login'); return; } await supabase.from('saved_items').insert({ user_id: user.id, content_id: opt.id, content_type: 'live', content_url: opt.link || '', content_name: opt.name, thumbnail_url: opt.cover_url }); toast.success('✅ Imehifadhiwa kwenye Saved!'); }} className="text-gray-400 hover:text-yellow-400"><Bookmark className="w-4 h-4" /></button>
                  {/* Gift button for live posts - anyone can send */}
                  {(opt as any).uploader_id && (opt as any).uploader_id !== user?.id && (
                    <button onClick={e => { e.stopPropagation(); if (!user) { navigate('/login'); return; } setGiftLive(opt); }} className="ml-1 text-orange-400 hover:text-orange-300" title="Tuma Zawadi"><Gift className="w-4 h-4" /></button>
                  )}
                  {(isAdmin || isOwnLivePost(opt)) && (
                    <>
                      {/* Quick online toggle */}
                      <button
                        onClick={e => toggleOnlineStatus(opt, e)}
                        disabled={togglingOnline === opt.id}
                        className={`p-1.5 rounded-lg transition-all ${isOnline ? 'bg-green-500/20 text-green-400' : 'bg-gray-600/20 text-gray-500'}`}
                        title={isOnline ? 'Weka Offline' : 'Weka Online'}>
                        {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => setEditOpt({ ...opt })} className="text-gray-400 hover:text-primary ml-1"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => deleteOption(opt.id)} className="text-gray-400 hover:text-red-400 ml-1"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
                {opt.cover_url && (
                  <div className="relative w-full bg-[#0d0d0d]" style={{ minHeight: '200px' }}>
                    <img src={opt.cover_url} alt={opt.name} className="w-full object-cover" style={{ minHeight: '200px', maxHeight: '70vw' }} />
                    {/* LIVE / OFFLINE overlay badge */}
                    {isOnline ? (
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-black px-3 py-1.5 rounded-full shadow-lg" style={{ boxShadow: '0 0 12px rgba(220,38,38,0.6)' }}>
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />LIVE
                      </div>
                    ) : (
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-gray-700/90 text-gray-300 text-xs font-black px-3 py-1.5 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-gray-400" />OFFLINE
                      </div>
                    )}
                  </div>
                )}
                <div className="px-4 pt-3 pb-4">
                  <button onClick={() => handleJoin(opt)}
                    className={`w-full font-bold py-3 rounded-xl flex items-center justify-center gap-2 ${isOnline ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400 border border-gray-700'}`}>
                    <Radio className="w-4 h-4" />
                    {isOnline ? 'Ingia Live Room' : 'Nje ya Mtandao'}
                    {isVip && isOnline && <span className="text-white/70 text-xs ml-1">🆓 Bure (VIP)</span>}
                    {!isVip && unlockedLive.has(opt.id) && isOnline && <span className="text-green-300/70 text-xs ml-1">✓ Imefunguliwa</span>}
                  </button>
                </div>
              </div>
            );
          })}

          {/* VIDEO CALL: profile card layout */}
          {tab === 'video_call' && (
            <div className="grid grid-cols-2 gap-3 px-4 pt-4">
              {filteredOptions.map(opt => {
                const isOnline = !!(opt as any).is_online;
                return (
                  <div key={opt.id} ref={el => { optRefs.current[opt.id] = el; }}
                    className={`bg-[#0d0d0d] border rounded-2xl overflow-hidden ${highlightOptId === opt.id ? 'border-primary' : isOnline ? 'border-green-500/30' : 'border-[#3d0b3d]'}`}>
                    <div className="relative w-full" style={{ aspectRatio: '0.75', background: '#1a0a1a' }}>
                      {opt.cover_url ? (
                        <img src={opt.cover_url} alt={opt.name} className="w-full h-full object-cover object-top" />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center ${isOnline ? 'gradient-pink' : 'bg-[#1a0a1a]'}`}>
                          <span className="text-white font-black text-3xl">{opt.name[0]?.toUpperCase()}</span>
                        </div>
                      )}

                      {/* Top-left: Online/Offline badge */}
                      <div className="absolute top-2 left-2 z-10">
                        <OnlineBadge isOnline={isOnline} />
                      </div>
                      {/* Top-right: Gift icon */}
                      {(opt as any).uploader_id && (opt as any).uploader_id !== user?.id && (
                        <button onClick={e => { e.stopPropagation(); if (!user) { navigate('/login'); return; } setGiftLive(opt); }}
                          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                          style={{ background: 'rgba(255,140,0,0.85)', backdropFilter: 'blur(6px)' }}
                          title="Tuma Zawadi">
                          <Gift className="w-4 h-4 text-white" />
                        </button>
                      )}

                      {/* Admin/Business controls */}
                      {(isAdmin || isOwnLivePost(opt)) && (
                        <div className="absolute top-2 right-2 flex gap-1">
                          {/* Quick online toggle */}
                          <button
                            onClick={e => toggleOnlineStatus(opt, e)}
                            disabled={togglingOnline === opt.id}
                            className={`w-7 h-7 rounded-full flex items-center justify-center border ${isOnline ? 'bg-green-500/80 border-green-400' : 'bg-gray-700/80 border-gray-500'}`}
                            title={isOnline ? 'Weka Offline' : 'Weka Online'}>
                            {isOnline ? <Wifi className="w-3 h-3 text-white" /> : <WifiOff className="w-3 h-3 text-gray-300" />}
                          </button>
                          <button onClick={() => setEditOpt({ ...opt })} className="w-7 h-7 bg-black/60 rounded-full flex items-center justify-center"><Edit3 className="w-3 h-3 text-white" /></button>
                          <button onClick={() => deleteOption(opt.id)} className="w-7 h-7 bg-black/60 rounded-full flex items-center justify-center"><Trash2 className="w-3 h-3 text-red-400" /></button>
                        </div>
                      )}

                      {parseFloat(String(opt.price) || '0') > 0 && (
                        <div className="absolute bottom-2 left-2 bg-primary text-white text-xs font-black px-2 py-0.5 rounded-full">
                          TZS {parseFloat(String(opt.price) || '0').toLocaleString()}
                        </div>
                      )}
                      {isVip && (
                        <div className="absolute bottom-2 right-2 bg-green-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">🆓 VIP</div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-white font-bold text-sm truncate mb-1.5">{opt.name}</p>
                      <button onClick={() => handleJoin(opt)}
                        className={`w-full font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1 ${
                          isOnline ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-500 border border-gray-700 cursor-not-allowed'
                        }`}>
                        <Phone className="w-3 h-3" />
                        {isOnline ? 'Video Call' : 'Offline'}
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Auto-show business card if no post yet */}
              {profile?.is_business && user && !filteredOptions.find(o => (o as any).uploader_id === user.id) && (
                <div className="bg-[#0d0d0d] border border-blue-500/30 rounded-2xl overflow-hidden">
                  <div className="relative w-full" style={{ aspectRatio: '0.75', background: '#1a0a1a' }}>
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} className="w-full h-full object-cover object-top" alt="" />
                    ) : (
                      <div className="w-full h-full gradient-pink flex items-center justify-center">
                        <span className="text-white font-black text-3xl">{profile.username?.[0]?.toUpperCase()}</span>
                      </div>
                    )}
                    <div className="absolute top-2 left-2 bg-blue-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">💼 Business</div>
                  </div>
                  <div className="p-2">
                    <p className="text-white font-bold text-sm truncate mb-1.5">{profile.username}</p>
                    <button onClick={() => setShowUpload(true)}
                      className="w-full bg-blue-600 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1">
                      <Plus className="w-3 h-3" /> Ongeza
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {filteredOptions.length === 0 && (
            <div className="text-center py-16 text-gray-500 px-4">
              <p className="text-5xl mb-3">🔴</p>
              <p>Hakuna {tab === 'video_call' ? 'Video Call' : 'Live Room'} options bado</p>
              {isAdmin && <button onClick={() => setShowUpload(true)} className="btn-primary mt-4">+ Ongeza</button>}
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end justify-center">
          <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto slide-up">
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Ongeza Live Option</h3>
              <div className="flex gap-2">
                <button onClick={() => { setHiddenUpload(true); setShowUpload(false); }} title="Ficha - upload inaendelea" className="w-8 h-8 rounded-xl bg-[#1a0a1a] flex items-center justify-center">
                  <EyeOff className="w-4 h-4 text-gray-400" />
                </button>
                <button onClick={() => setShowUpload(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>
            <div className="space-y-3">
              <input value={editData.name} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} placeholder="Jina la mtu/session" className="input-field" />
              {isAdmin ? (
                <select value={editData.type} onChange={e => setEditData(p => ({ ...p, type: e.target.value }))} className="input-field">
                  <option value="video_call">Video Call</option>
                  <option value="live_room">Live Room</option>
                </select>
              ) : (
                <div className="input-field bg-[#0d0d0d] text-gray-400 text-sm">Aina: Video Call (Business Account)</div>
              )}
              <input value={editData.price} onChange={e => setEditData(p => ({ ...p, price: e.target.value }))} placeholder="Bei (TZS, 0 = Bure)" className="input-field" type="number" />
              <input value={editData.whatsapp} onChange={e => setEditData(p => ({ ...p, whatsapp: e.target.value }))} placeholder="WhatsApp ya video call" className="input-field" />
              <input value={editData.link} onChange={e => setEditData(p => ({ ...p, link: e.target.value }))} placeholder="Link ya Live Room" className="input-field" />
              {/* TikSexy switch */}
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl border border-primary/20">
                <div className="flex flex-col">
                  <span className="text-white text-sm font-semibold">🎬 Onyesha kwenye TIK-SEXY?</span>
                  <span className="text-gray-500 text-xs">{editData.show_in_tiksexy ? 'Itaonekana kwenye TikSexy feed' : 'Haitaonekana TikSexy'}</span>
                </div>
                <button onClick={() => setEditData(p => ({ ...p, show_in_tiksexy: !p.show_in_tiksexy }))} className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${editData.show_in_tiksexy ? 'bg-primary' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editData.show_in_tiksexy ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              <label className="block btn-outline text-center cursor-pointer py-3">
                <Upload className="w-4 h-4 inline mr-2" />{file ? `✓ ${file.name}` : 'Pakia Picha ya Cover (Hiari)'}
                <input type="file" accept="image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
              {uploading && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,20,147,0.08)', border: '1px solid rgba(255,20,147,0.2)' }}>
                  <p className="text-gray-300 text-xs font-semibold truncate">📁 {file?.name || 'Inapakia...'}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-primary font-bold animate-pulse">{Math.round(uploadPct)}%</span>
                    {file && <span className="text-gray-400">{(file.size * uploadPct / 100 / 1024 / 1024).toFixed(1)} / {(file.size / 1024 / 1024).toFixed(1)} MB</span>}
                  </div>
                  <div className="h-1.5 bg-[#1a0a1a] rounded-full overflow-hidden">
                    <div className="h-full gradient-pink rounded-full transition-all duration-300" style={{ width: `${Math.max(2, uploadPct)}%` }} />
                  </div>
                </div>
              )}
              <button onClick={handleSave} disabled={uploading} className="btn-primary w-full">
                {uploading ? `Inapakia ${uploadPct}%...` : 'Hifadhi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editOpt && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end justify-center">
          <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto slide-up">
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Hariri: {editOpt.name}</h3>
              <button onClick={() => setEditOpt(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <input value={editOpt.name} onChange={e => setEditOpt(p => p ? { ...p, name: e.target.value } : null)} placeholder="Jina" className="input-field" />
              <input type="number" value={editOpt.price} onChange={e => setEditOpt(p => p ? { ...p, price: parseFloat(e.target.value) } : null)} placeholder="Bei" className="input-field" />
              <input value={editOpt.whatsapp || ''} onChange={e => setEditOpt(p => p ? { ...p, whatsapp: e.target.value } : null)} placeholder="WhatsApp" className="input-field" />
              <input value={editOpt.link || ''} onChange={e => setEditOpt(p => p ? { ...p, link: e.target.value } : null)} placeholder="Link ya Live Room (itafunguliwa otomatiki)" className="input-field" />
              {/* Replace cover image */}
              <div className="border border-primary/20 rounded-xl p-3 space-y-2">
                <p className="text-gray-400 text-xs font-semibold">🔄 Badilisha Picha ya Cover</p>
                <label className="block btn-outline text-center cursor-pointer py-2 text-xs">
                  Chagua Picha Mpya
                  <input type="file" accept="image/*" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f || !editOpt) return;
                    try {
                      const ext = f.name.split('.').pop() || 'jpg';
                      const url = await uploadFile('content', `live/${Date.now()}_cover.${ext}`, f, p => setUploadPct(Math.round(p)));
                      setEditOpt(p => p ? { ...p, cover_url: url } as any : null);
                      toast.success('✅ Picha imebadilishwa!');
                    } catch { toast.error('Hitilafu ya upload'); }
                  }} />
                </label>
                {(editOpt as any).cover_url && <img src={(editOpt as any).cover_url} alt="" className="w-full h-16 object-cover rounded-xl border border-primary/30" />}
              </div>
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl">
                <span className="text-gray-300 text-sm">🟢 Yupo Online sasa?</span>
                <button onClick={() => setEditOpt(p => p ? { ...p, is_online: !(p as any).is_online } as any : null)}
                  className={`w-12 h-6 rounded-full transition-colors ${(editOpt as any).is_online ? 'bg-green-500' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${(editOpt as any).is_online ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl">
                <span className="text-gray-300 text-sm">Inaonyeshwa?</span>
                <button onClick={() => setEditOpt(p => p ? { ...p, is_active: !p.is_active } : null)}
                  className={`w-12 h-6 rounded-full ${editOpt.is_active ? 'bg-green-500' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editOpt.is_active ? 'translate-x-6' : ''}`} />
                </button>
              </div>
              <button onClick={handleUpdate} className="btn-primary w-full">💾 Hifadhi</button>
            </div>
          </div>
        </div>
      )}

      {balanceModal && (
        <LiveBalanceModal
          amount={balanceModal.amount}
          name={balanceModal.opt.name}
          balance={profile?.balance || 0}
          onConfirm={() => confirmLiveBalancePay(balanceModal.opt, balanceModal.amount)}
          onCancel={() => setBalanceModal(null)}
        />
      )}

      {showPlanPicker && (
        <PlanPickerModal onClose={() => setShowPlanPicker(false)} settings={settings}
          onSuccess={() => setShowPlanPicker(false)} />
      )}

      {/* Gift Choice Modal for Live */}
      {giftChoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setGiftChoiceModal(null)}>
          <div className="w-full max-w-sm bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-5 slide-up" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🎁</div>
              <h3 className="text-white font-black text-lg">{giftChoiceModal.opt.name}</h3>
              <p className="text-gray-400 text-sm">Chagua jinsi ya kulipa</p>
            </div>
            {(() => {
              const creds = user ? parseInt(localStorage.getItem(`gift_live_credits_${user.id}`) || '0') : 0;
              return (
                <>
                  <button onClick={() => {
                    // Use gift credit
                    const newCreds = Math.max(0, creds - 1);
                    try { localStorage.setItem(`gift_live_credits_${user!.id}`, String(newCreds)); } catch {}
                    supabase.from('user_unlocked_content').upsert({ user_id: user!.id, content_id: giftChoiceModal.opt.id, content_type: 'live', amount_paid: 0 }, { onConflict: 'user_id,content_id' }).then(() => {});
                    setUnlockedLive(prev => new Set([...prev, giftChoiceModal.opt.id]));
                    setGiftChoiceModal(null);
                    toast.success(`✅ Umeingia! (Gift credits zilizobaki: ${newCreds})`);
                    const opt = giftChoiceModal.opt;
                    if (opt.type === 'video_call') {
                      if (opt.whatsapp) window.open(`https://wa.me/${opt.whatsapp.replace(/\D/g, '')}?text=Nataka video call`, '_blank');
                      else if (opt.link) openLiveLink(opt);
                    } else { openLiveLink(opt); }
                  }} className="w-full py-3.5 rounded-xl text-white font-black text-sm mb-3 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                    🎁 Tumia Gift Credits ({creds} zilizobaki)
                  </button>
                  <button onClick={() => { setGiftChoiceModal(null); setBalanceModal({ opt: giftChoiceModal.opt, amount: giftChoiceModal.amount }); }}
                    className="w-full py-3.5 rounded-xl gradient-pink text-white font-black text-sm flex items-center justify-center gap-2">
                    💰 Lipia kwa Salio (TZS {giftChoiceModal.amount.toLocaleString()})
                  </button>
                  <button onClick={() => setGiftChoiceModal(null)} className="w-full mt-2 py-2 text-gray-400 text-sm">Ghairi</button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Gift Modal for Live posts */}
      {giftLive && profile && (
        <LiveGiftModal
          uploaderId={(giftLive as any).uploader_id}
          uploaderName={giftLive.name}
          myProfile={profile}
          onClose={() => setGiftLive(null)}
        />
      )}
    </div>
  );
}

function LiveGiftModal({ uploaderId, uploaderName, myProfile, onClose }: { uploaderId: string; uploaderName: string; myProfile: any; onClose: () => void }) {
  const GIFTS = [
    { emoji: '\u{1F339}', name: 'Waridi', amount: 100 }, { emoji: '\u{1F490}', name: 'Maua', amount: 200 },
    { emoji: '\u{1F36B}', name: 'Chokoleti', amount: 500 }, { emoji: '\u{1F48D}', name: 'Pete', amount: 1000 },
    { emoji: '\u{1F9F8}', name: 'Teddy', amount: 2000 }, { emoji: '\u{1F48E}', name: 'Almasi', amount: 5000 },
    { emoji: '\u{1F3C6}', name: 'Trophy', amount: 10000 }, { emoji: '\u{1F697}', name: 'Gari', amount: 50000 },
  ];
  const [selected, setSelected] = useState<typeof GIFTS[0] | null>(null);
  const [walletPass, setWalletPass] = useState('');
  const [sending, setSending] = useState(false);
  const { user, refreshProfile } = useAuth() as any;
  const giftBal = myProfile?.gift_balance || 0;
  const mainBal = myProfile?.balance || 0;

  async function handleSend() {
    if (!selected || !user) return;
    const amt = selected.amount;
    const canUseGift = giftBal >= amt;
    if (!canUseGift && mainBal < amt) return toast.error(`Salio halitooshi. Unahitaji TZS ${amt.toLocaleString()}`);
    if (myProfile?.wallet_password && walletPass !== myProfile.wallet_password) return toast.error('Password si sahihi!');
    setSending(true);
    try {
      if (canUseGift) await supabase.from('user_profiles').update({ gift_balance: giftBal - amt }).eq('id', user.id);
      else await supabase.from('user_profiles').update({ balance: mainBal - amt }).eq('id', user.id);
      const { data: r } = await supabase.from('user_profiles').select('gift_balance').eq('id', uploaderId).single();
      await supabase.from('user_profiles').update({ gift_balance: ((r as any)?.gift_balance || 0) + amt }).eq('id', uploaderId);
      await supabase.from('notifications').insert({ user_id: uploaderId, title: `🎁 Umepata Zawadi!`, message: `${myProfile?.username} amekutumia ${selected.emoji} ${selected.name} - TZS ${amt.toLocaleString()}!`, type: 'gift' });
      await supabase.from('transactions').insert({ user_id: uploaderId, amount: amt, type: 'gift_received', status: 'approved', description: `Zawadi Live: ${selected.emoji} ${selected.name} kutoka ${myProfile?.username}` });
      if (refreshProfile) await refreshProfile();
      toast.success(`🎁 Zawadi ya TZS ${amt.toLocaleString()} imetumwa!`);
      onClose();
    } catch { toast.error('Hitilafu ya kutuma zawadi'); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-5 slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-3">
          <h3 className="text-white font-bold flex items-center gap-2"><Gift className="w-5 h-5 text-orange-400" /> Tuma Zawadi kwa {uploaderName}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {GIFTS.map(g => (
            <button key={g.name} onClick={() => setSelected(g)} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${selected?.name === g.name ? 'bg-primary/20 border-2 border-primary' : 'bg-[#1a0a1a] border border-transparent'}`}>
              <span className="text-2xl">{g.emoji}</span>
              <span className="text-white text-[9px] font-semibold">{g.name}</span>
              <span className="text-primary text-[9px] font-bold">{g.amount >= 1000 ? `${g.amount/1000}K` : g.amount}</span>
            </button>
          ))}
        </div>
        {selected && (
          <div className="space-y-3">
            {myProfile?.wallet_password && <input value={walletPass} onChange={e => setWalletPass(e.target.value)} placeholder="Password ya wallet" type="password" className="input-field text-sm" />}
            <button onClick={handleSend} disabled={sending} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
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
