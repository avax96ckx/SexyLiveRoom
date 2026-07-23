import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Gift, Check, Clock, Package, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

// ── My Gifts Panel ─────────────────────────────────────────────────────────────
function MyGiftsPanel() {
  const { user, profile } = useAuth();
  const [myGifts, setMyGifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadMyGifts();
  }, [user?.id]);

  async function loadMyGifts() {
    if (!user) return;
    setLoading(true);
    // Fetch all gift_card_uses for this user with the gift card details
    const { data } = await supabase
      .from('gift_card_uses')
      .select('*, card:card_id(*)')
      .eq('user_id', user.id)
      .order('used_at', { ascending: false });

    // Filter out deleted/inactive cards and expired ones
    const active = (data || []).filter((u: any) => {
      const card = u.card;
      if (!card || !card.is_active) return false;
      if (card.expires_at && new Date(card.expires_at) < new Date()) return false;
      return true;
    });
    setMyGifts(active);
    setLoading(false);
  }

  function getGiftIcon(type: string) {
    const icons: Record<string, string> = {
      balance: '💰', vip: '👑', unlock_video: '🎬', unlock_malaya: '💋',
      unlock_live: '🔴', blue_tick: '✓', download: '⬇️', unlock_profile: '🔓',
      withdraw: '💸', save_items: '💾',
    };
    return icons[type] || '🎁';
  }

  function getGiftLabel(card: any) {
    switch (card.type) {
      case 'balance': return `TZS ${card.amount?.toLocaleString()} - Salio la Zawadi`;
      case 'vip': return `VIP Member - Siku ${card.duration_days}`;
      case 'unlock_video': return `Fungua Video ${card.unlock_video_count || card.unlock_count} - Bila Malipo`;
      case 'unlock_malaya': return `Ona Namba ${card.unlock_malaya_count || card.unlock_count} - Bila Malipo`;
      case 'unlock_live': return `Ingia Live ${card.unlock_live_count || card.unlock_count} - Bila Malipo`;
      case 'blue_tick': return `Blue Tick - ${card.blue_tick_type || 'Standard'}`;
      case 'download': return `Download ${card.download_count} Vitu`;
      case 'unlock_profile': return `Fungua Profile ${card.unlock_profile_count} - Video Call/Msg/WhatsApp`;
      case 'withdraw': return `Toa Pesa - ${card.withdraw_count > 0 ? `Mara ${card.withdraw_count}` : 'Mara Moja'}`;
      case 'save_items': return `Hifadhi ${card.save_item_count} Picha/Video kwenye Simu`;
      default: return card.type;
    }
  }

  function getRemainingCredits(use: any, card: any) {
    // Read remaining from localStorage for types that use credits
    if (!user) return null;
    const type = card.type;
    if (type === 'unlock_video') {
      const rem = parseInt(localStorage.getItem(`gift_video_credits_${user.id}`) || '0');
      return `${rem} video zilizobaki`;
    }
    if (type === 'unlock_malaya') {
      const rem = parseInt(localStorage.getItem(`gift_malaya_credits_${user.id}`) || '0');
      return `${rem} namba zilizobaki`;
    }
    if (type === 'unlock_live') {
      const rem = parseInt(localStorage.getItem(`gift_live_credits_${user.id}`) || '0');
      return `${rem} live zilizobaki`;
    }
    if (type === 'download') {
      const rem = parseInt(localStorage.getItem(`gift_download_credits_${user.id}`) || '0');
      return `${rem} downloads zilizobaki`;
    }
    if (type === 'save_items') {
      const rem = parseInt(localStorage.getItem(`gift_save_credits_${user.id}`) || '0');
      return `${rem} vitu vya kubaki kuhifadhi`;
    }
    if (type === 'unlock_profile') {
      const rem = parseInt(localStorage.getItem(`gift_profile_credits_${user.id}`) || '0');
      return `${rem} profiles zilizobaki`;
    }
    if (type === 'withdraw') {
      const rem = parseInt(localStorage.getItem(`gift_withdraw_credits_${user.id}`) || '0');
      const total = card.withdraw_count || 1;
      if (total > 1) return `${rem} matumizi yaliyobaki`;
      return 'Imetumiwa ikiwa 0';
    }
    if (type === 'balance') {
      return `TZS ${((profile as any)?.gift_balance || 0).toLocaleString()} salio lako`;
    }
    if (type === 'vip') {
      if (profile?.vip_expires_at) {
        const now = new Date();
        const exp = new Date(profile.vip_expires_at);
        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 0) return '⚠️ VIP imeisha muda';
        return `Inaisha siku ${daysLeft} - ${exp.toLocaleDateString('sw-TZ')}`;
      }
      return 'VIP aktive';
    }
    if (type === 'blue_tick') {
      if (!profile?.blue_tick) return 'Haijatumiwa';
      // Check if this card has expiry
      if (card.expires_at) {
        const now = new Date();
        const exp = new Date(card.expires_at);
        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 0) return '⚠️ Blue tick imeisha muda';
        return `⏰ Siku ${daysLeft} zilizobaki`;
      }
      return '♾️ Milele';
    }
    return null;
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <Gift className="w-16 h-16 opacity-20 mb-4" />
        <p className="font-semibold">Ingia kwanza kuona zawadi zako</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {myGifts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Gift className="w-16 h-16 opacity-20 mb-4" />
          <p className="font-semibold text-center">Huna zawadi zinazoendela sasa hivi</p>
          <p className="text-xs text-gray-600 text-center mt-2">Zawadi utakazopata kutoka kwa Admin zitaonekana hapa</p>
        </div>
      ) : (
        myGifts.map((use: any) => {
          const card = use.card;
          const remaining = getRemainingCredits(use, card);
          const isExpired = card.expires_at && new Date(card.expires_at) < new Date();
          return (
            <div key={use.id} className={`content-box p-4 ${isExpired ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl"
                  style={{ background: 'rgba(255,20,147,0.12)', border: '1px solid rgba(255,20,147,0.25)' }}>
                  {getGiftIcon(card.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm">{getGiftLabel(card)}</p>
                  {remaining && (
                    <p className="text-primary text-xs font-semibold mt-0.5">{remaining}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span className="text-gray-500 text-xs">
                      Imetumika {formatDistanceToNow(new Date(use.used_at), { addSuffix: true })}
                    </span>
                  </div>
                  {card.expires_at && (
                    <p className={`text-xs mt-0.5 ${isExpired ? 'text-red-400' : 'text-yellow-400'}`}>
                      {isExpired ? '⚠️ Imeisha muda' : `⏰ Inaisha: ${new Date(card.expires_at).toLocaleDateString('sw-TZ')}`}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {isExpired ? (
                    <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold">Imeisha</span>
                  ) : (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-semibold">✓ Aktive</span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
      <button onClick={loadMyGifts} className="w-full py-2 text-gray-500 text-sm">↺ Onyesha upya</button>
    </div>
  );
}

export default function GiftPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<'code' | 'mygifts'>('code');
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  async function redeemCode(giftCode: string) {
    if (!giftCode.trim() || !user || !profile) return;
    setRedeeming(true);
    try {
      const { data: gc, error } = await supabase
        .from('gift_cards')
        .select('*')
        .eq('code', giftCode.trim().toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (error || !gc) { toast.error('Kodi si sahihi!'); setRedeeming(false); return; }
      if (gc.expires_at && new Date(gc.expires_at) < new Date()) { toast.error('Zawadi hii imeisha muda wake!'); setRedeeming(false); return; }
      const { data: existingUse } = await supabase.from('gift_card_uses').select('id').eq('card_id', gc.id).eq('user_id', user.id).maybeSingle();
      if (existingUse) { toast.error('Umeshachukua zawadi hii tayari!'); setRedeeming(false); return; }
      if ((gc.use_count || 0) >= (gc.max_uses || 1)) { toast.error('Zawadi hii imeshafikiwa kikomo chake!'); setRedeeming(false); return; }

      // Apply gift based on type
      if (gc.type === 'balance') {
        await supabase.from('user_profiles').update({ gift_balance: ((profile as any).gift_balance || 0) + gc.amount }).eq('id', user.id);
        await supabase.from('transactions').insert({ user_id: user.id, amount: gc.amount, type: 'gift_received', status: 'approved', description: `Gift Card: TZS ${gc.amount?.toLocaleString()}` });
        toast.success(`🎁 Hongera! TZS ${gc.amount?.toLocaleString()} imeongezwa kwenye Gift Wallet!`);
      } else if (gc.type === 'vip') {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + (gc.duration_days || 30));
        await supabase.from('user_profiles').update({ is_vip: true, vip_plan: `Gift VIP (${gc.duration_days || 30} days)`, vip_expires_at: expDate.toISOString() }).eq('id', user.id);
        toast.success(`🎁 Hongera! VIP Member kwa siku ${gc.duration_days || 30}!`);
      } else if (gc.type === 'unlock_video') {
        toast.success(`🎁 Hongera! Unaweza kufungua video ${gc.unlock_video_count || gc.unlock_count || 1} bila malipo!`);
        try { localStorage.setItem(`gift_video_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_video_credits_${user.id}`) || '0') || 0) + (gc.unlock_video_count || gc.unlock_count || 1))); } catch {}
      } else if (gc.type === 'unlock_malaya') {
        toast.success(`🎁 Hongera! Unaweza kuona namba ${gc.unlock_malaya_count || gc.unlock_count || 1} za malaya bila malipo!`);
        try { localStorage.setItem(`gift_malaya_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_malaya_credits_${user.id}`) || '0') || 0) + (gc.unlock_malaya_count || gc.unlock_count || 1))); } catch {}
      } else if (gc.type === 'unlock_live') {
        toast.success(`🎁 Hongera! Unaweza kuingia Live Room ${gc.unlock_live_count || gc.unlock_count || 1} mara bila malipo!`);
        try { localStorage.setItem(`gift_live_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_live_credits_${user.id}`) || '0') || 0) + (gc.unlock_live_count || gc.unlock_count || 1))); } catch {}
      } else if (gc.type === 'blue_tick') {
        const tickType = gc.blue_tick_type || 'blue';
        await supabase.from('user_profiles').update({ blue_tick: tickType }).eq('id', user.id);
        toast.success(`🎁 Hongera! Blue Tick (${tickType}) imewekwa!`);
      } else if (gc.type === 'download') {
        const count = gc.download_count || gc.unlock_count || 1;
        try { localStorage.setItem(`gift_download_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_download_credits_${user.id}`) || '0') || 0) + count)); } catch {}
        toast.success(`🎁 Hongera! Unaweza kudownload vitu ${count} bila malipo!`);
      } else if (gc.type === 'unlock_profile') {
        const count = gc.unlock_profile_count || gc.unlock_count || 1;
        try { localStorage.setItem(`gift_profile_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_profile_credits_${user.id}`) || '0') || 0) + count)); } catch {}
        toast.success(`🎁 Hongera! Unaweza kufungua profile ${count} bila malipo!`);
      } else if (gc.type === 'withdraw') {
        const count = gc.withdraw_count || 1;
        try { localStorage.setItem(`gift_withdraw_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_withdraw_credits_${user.id}`) || '0') || 0) + count)); } catch {}
        toast.success(`🎁 Hongera! Unaweza kutoa pesa mara ${count}!`);
      } else if (gc.type === 'save_items') {
        const count = gc.save_item_count || gc.unlock_count || 1;
        try { localStorage.setItem(`gift_save_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_save_credits_${user.id}`) || '0') || 0) + count)); } catch {}
        toast.success(`🎁 Hongera! Unaweza kuhifadhi vitu ${count} kwenye simu yako!`);
      } else {
        toast.success(`🎁 Zawadi ya ${gc.type} imefanikiwa!`);
      }

      await supabase.from('gift_card_uses').insert({ card_id: gc.id, user_id: user.id });
      const newCount = (gc.use_count || 0) + 1;
      const isNowFull = newCount >= (gc.max_uses || 1);
      await supabase.from('gift_cards').update({ use_count: newCount, is_used: isNowFull, used_by: user.id, used_at: new Date().toISOString() }).eq('id', gc.id);
      await supabase.from('notifications').insert({
        user_id: user.id, title: '🎁 Zawadi Imefanikiwa!',
        message: gc.type === 'balance' ? `TZS ${gc.amount?.toLocaleString()} imeongezwa kwenye Gift Wallet yako!` : `Zawadi ya ${gc.type} imewashwa!`,
        type: 'gift',
      });

      setCode('');
      if ((window as any).__authRefreshProfile) (window as any).__authRefreshProfile();
      // Switch to my gifts tab to show the new gift
      setTimeout(() => setTab('mygifts'), 1000);
    } catch (err) { toast.error('Hitilafu ya kuokoa zawadi'); console.error(err); }
    finally { setRedeeming(false); }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => navigate(-1)} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-white font-bold text-xl flex-1">🎁 Zawadi (Gift)</h1>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* Gift balance display */}
        <div className="gradient-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,165,0,0.15)', border: '1px solid rgba(255,165,0,0.3)' }}>
            <Gift className="w-7 h-7 text-orange-400" />
          </div>
          <div className="flex-1">
            <p className="text-gray-400 text-sm">Salio la Zawadi</p>
            <p className="text-orange-400 font-black text-3xl">TZS {((profile as any)?.gift_balance || 0).toLocaleString()}</p>
          </div>
          <button onClick={() => navigate('/wallet')}
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(255,165,0,0.15)', color: '#FB923C', border: '1px solid rgba(255,165,0,0.3)' }}>
            Wallet →
          </button>
        </div>

        {/* Tab selector */}
        <div className="flex gap-2">
          <button onClick={() => setTab('code')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${tab === 'code' ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
            🔑 Weka Code
          </button>
          <button onClick={() => setTab('mygifts')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${tab === 'mygifts' ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
            🎁 Zawadi Zangu
          </button>
        </div>

        {/* Code input */}
        {tab === 'code' && (
          <div className="space-y-4">
            <div className="content-box p-5 space-y-4">
              <h3 className="text-white font-bold text-center">Weka Gift Code</h3>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="Mfano: ABC12345"
                className="input-field text-center text-lg font-mono tracking-widest"
                autoCapitalize="characters"
              />
              <button
                onClick={() => redeemCode(code)}
                disabled={!code.trim() || redeeming || !user}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                {redeeming ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-5 h-5" />}
                {redeeming ? 'Inakagua...' : 'Thibitisha Zawadi'}
              </button>
              {!user && <p className="text-red-400 text-sm text-center">Ingia kwenye akaunti yako kwanza</p>}
            </div>
            <div className="content-box p-4">
              <p className="text-gray-400 text-xs text-center">
                💡 Codes zinapatikana kutoka kwa Admin. Tumia code yako kupata zawadi mbalimbali kama pesa, VIP, blue tick, download au hifadhi vitu kwenye simu yako.
              </p>
            </div>
          </div>
        )}

        {/* My gifts */}
        {tab === 'mygifts' && <MyGiftsPanel />}
      </div>
    </div>
  );
}
