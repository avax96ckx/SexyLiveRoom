import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { AppSettings, VipPlan, Service } from '@/types';
import { BLUE_TICK_STYLES } from '@/types';
import BlueTick from '@/components/features/BlueTick';
import PaymentModal from '@/components/features/PaymentModal';
import { ArrowLeft, Crown, Briefcase, Check, ChevronRight, X, Wallet, Gift } from 'lucide-react';
import { useEffect } from 'react';

// Balance Payment Confirmation Modal
function BalancePayModal({ service, userBalance, onClose, onSuccess }: {
  service: Service; userBalance: number; onClose: () => void; onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [paying, setPaying] = useState(false);
  const canAfford = userBalance >= service.price;

  async function payWithBalance() {
    if (!user || !canAfford) return;
    setPaying(true);
    try {
      const { error: balErr } = await supabase.from('user_profiles').update({ balance: userBalance - service.price }).eq('id', user.id);
      if (balErr) throw balErr;
      await supabase.from('transactions').insert({ user_id: user.id, amount: service.price, type: 'admin_service', status: 'approved', plan_name: service.name, description: `Huduma: ${service.name}` });
      await supabase.from('notifications').insert({ user_id: user.id, title: '✅ Huduma Imelipwa!', message: `Umefanikiwa kulipa TZS ${service.price.toLocaleString()} kwa ${service.name}.`, type: 'payment_approved' });
      toast.success(`✅ Umelipa TZS ${service.price.toLocaleString()} kwa ${service.name}!`);
      onSuccess(); onClose();
    } catch (err: any) { toast.error('Hitilafu ya malipo: ' + err.message); }
    finally { setPaying(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-bold text-lg">💳 Thibitisha Malipo</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="bg-[#1a0a1a] rounded-xl p-4 mb-4">
          <p className="text-white font-bold text-base">{service.name}</p>
          {service.description && <p className="text-gray-400 text-sm mt-1">{service.description}</p>}
          <p className="text-primary font-black text-2xl mt-2">TZS {service.price.toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{ background: 'rgba(255,20,147,0.08)', border: '1px solid rgba(255,20,147,0.2)' }}>
          <Wallet className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="flex-1">
            <p className="text-gray-400 text-xs">Salio lako la akaunti</p>
            <p className={`font-bold text-lg ${canAfford ? 'text-green-400' : 'text-red-400'}`}>TZS {userBalance.toLocaleString()}</p>
          </div>
          {canAfford ? <span className="text-green-400 text-xs font-semibold bg-green-400/10 px-2 py-1 rounded-full">✓ Inatosha</span> : <span className="text-red-400 text-xs font-semibold bg-red-400/10 px-2 py-1 rounded-full">✗ Haitoshi</span>}
        </div>
        {canAfford ? (
          <>
            <div className="flex justify-between text-sm mb-4 text-gray-400">
              <span>Salio baada ya malipo:</span>
              <span className="text-white font-semibold">TZS {(userBalance - service.price).toLocaleString()}</span>
            </div>
            <button onClick={payWithBalance} disabled={paying} className="btn-primary w-full flex items-center justify-center gap-2">
              {paying ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Wallet className="w-4 h-4" />}
              {paying ? 'Inalipa...' : `Lipa TZS ${service.price.toLocaleString()} kwa Salio`}
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-red-400 text-sm text-center mb-3">Salio lako halitoshi. Ongeza pesa kwenye Wallet kwanza.</p>
            <button onClick={onClose} className="btn-outline w-full">Funga</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Bottom sheet modal for restricted content - shows VIP plan picker
export function PlanPickerModal({ onClose, onSuccess, settings, message }: {
  onClose: () => void; onSuccess?: () => void; settings: AppSettings; message?: string;
}) {
  const navigate = useNavigate();
  const [vipPlans, setVipPlans] = useState<VipPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<{ amount: number; name: string; type: string } | null>(null);

  useEffect(() => {
    supabase.from('vip_plans').select('*').eq('is_active', true).order('display_order').then(({ data }) => {
      setVipPlans((data || []) as VipPlan[]);
    });
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-bold text-xl">🔒 {message || 'Inahitaji VIP au Business'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <p className="text-gray-400 text-sm mb-4">Chagua mpango unaofaa ili uweze kufikia huduma hizi:</p>
        <div className="space-y-3">
          <div className="gradient-card rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2"><Briefcase className="w-5 h-5 text-blue-400" /><span className="text-white font-bold">Business Account</span></div>
              <span className="text-primary font-black">TZS {parseInt(settings.business_price_monthly || '10000').toLocaleString()}/mwezi</span>
            </div>
            {['Upload video/picha', 'Inbox wote', 'SexyRoom full', 'Namba za members'].map((b, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5"><Check className="w-3 h-3 text-green-400 flex-shrink-0" /><span className="text-gray-300 text-xs">{b}</span></div>
            ))}
            <button onClick={() => setSelectedPlan({ amount: parseInt(settings.business_price_monthly || '10000'), name: 'Business Account (Mwezi 1)', type: 'business' })} className="btn-primary w-full mt-3 text-sm py-2">Chagua Business</button>
          </div>
          <h3 className="text-white font-semibold flex items-center gap-2"><Crown className="w-4 h-4 text-yellow-400" /> Mipango ya VIP</h3>
          {vipPlans.map(plan => (
            <div key={plan.id} className="content-box p-4 flex items-center justify-between">
              <div><p className="text-white font-bold text-sm">{plan.name}</p><p className="text-gray-400 text-xs">Siku {plan.duration_days}</p></div>
              <div className="flex items-center gap-2">
                <p className="text-primary font-black">TZS {plan.price.toLocaleString()}</p>
                <button onClick={() => setSelectedPlan({ amount: plan.price, name: plan.name, type: 'vip' })} className="gradient-pink text-white text-xs font-bold px-3 py-1.5 rounded-xl">Chagua</button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => { onClose(); navigate('/services'); }} className="btn-outline w-full mt-3 text-sm">Angalia Huduma Zote</button>
        {selectedPlan && (
          <PaymentModal onClose={() => setSelectedPlan(null)} amount={selectedPlan.amount} planName={selectedPlan.name} type={selectedPlan.type} settings={settings}
            onSuccess={() => { setSelectedPlan(null); onSuccess?.(); onClose(); }} />
        )}
      </div>
    </div>
  );
}

// Helper: Service media display - videos open in VLC player
function ServiceMedia({ svc }: { svc: Service }) {
  const navigate = useNavigate();
  const videoUrl = (svc as any).video_url;
  const imageUrl = (svc as any).image_url;
  const thumbnailUrl = (svc as any).thumbnail_url || imageUrl;

  if (videoUrl) {
    return (
      <div className="relative w-full bg-[#0d0d0d] overflow-hidden cursor-pointer" style={{ minHeight: '320px' }}
        onClick={() => navigate('/play', { state: { url: videoUrl, title: svc.name, urls: [videoUrl] } })}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={svc.name} className="w-full" style={{ objectFit: 'cover', objectPosition: 'top', minHeight: '320px', maxHeight: '80vh', display: 'block' }} loading="eager" />
        ) : (
          <div className="w-full flex flex-col items-center justify-center gap-3" style={{ height: '320px' }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#FF1493,#C2185B)' }}>
              <div className="w-0 h-0 border-l-[24px] border-l-white border-t-[15px] border-t-transparent border-b-[15px] border-b-transparent ml-2" />
            </div>
            <p className="text-gray-400 text-sm">{svc.name}</p>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.20)' }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-2xl" style={{ background: 'linear-gradient(135deg,#FF1493,#C2185B)' }}>
            <div className="w-0 h-0 border-l-[24px] border-l-white border-t-[15px] border-t-transparent border-b-[15px] border-b-transparent ml-2" />
          </div>
        </div>
        <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-2 py-1 rounded-full font-semibold">▶ VIDEO</div>
      </div>
    );
  }
  if (imageUrl) {
    return (
      <div className="w-full overflow-hidden">
        <img src={imageUrl} alt={svc.name} className="w-full" style={{ objectFit: 'cover', objectPosition: 'top', minHeight: '280px', maxHeight: '80vh', display: 'block' }} loading="eager" />
      </div>
    );
  }
  return null;
}

export default function Services() {
  const navigate = useNavigate();
  const { user, profile, requireAuth } = useAuth();
  const [settings, setSettings] = useState<AppSettings>({});
  const [vipPlans, setVipPlans] = useState<VipPlan[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [tab, setTab] = useState<'main' | 'vip' | 'business' | 'bluetick' | 'admin_service'>('main');
  const [selectedPlan, setSelectedPlan] = useState<{ amount: number; name: string; type: string } | null>(null);
  const [balancePayService, setBalancePayService] = useState<Service | null>(null);
  const [giftService, setGiftService] = useState<Service | null>(null);
  const [editServiceTiksexy, setEditServiceTiksexy] = useState<boolean>(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    const { data: s } = await supabase.from('app_settings').select('*');
    const m: AppSettings = {}; s?.forEach((r: any) => { m[r.key] = r.value; }); setSettings(m);
    const { data: v } = await supabase.from('vip_plans').select('*').eq('is_active', true).order('display_order');
    setVipPlans((v || []) as VipPlan[]);
    const { data: sv } = await supabase.from('services').select('*').eq('is_active', true).order('created_at', { ascending: false });
    setServices((sv || []) as Service[]);
  }

  const mainMenu = [
    { id: 'business', icon: '💼', title: 'FUNGUA ACCOUNT YA BIASHARA', desc: 'Upload video, picha & tuma ujumbe bila vikwazo', color: 'from-blue-600 to-blue-900' },
    { id: 'vip', icon: '👑', title: 'V.I.P MEMBER', desc: 'Pata faida zote za VIP member kwa bei nafuu', color: 'from-yellow-600 to-orange-800' },
    { id: 'bluetick', icon: 'tick', title: 'BLUE TICK', desc: 'Weka alama ya uthibitisho kwenye profaili yako', color: 'from-[#0d3b5e] to-[#0a6e6e]' },
    { id: 'admin_service', icon: '💋', title: 'HUDUMA ZA ADMIN', desc: 'Angalia huduma maalum zinazotolewa leo', color: 'from-pink-600 to-purple-900' }
  ];

  const vipBenefits = [
    'Tuma picha, video na link kwenye SexyRoom',
    'Ona namba za simu za members',
    'Inbox member yoyote bila kikwazo',
    'Angalia video za VIP bila malipo ya ziada',
    'Pata blue tick bure',
    'Msaada wa kipaumbele',
  ];

  function handleServicePay(svc: Service) {
    if (!user) { navigate('/login'); return; }
    setBalancePayService(svc);
  }

  const adminServices = services.filter(s => s.type === 'admin_service' && s.is_active);

  return (
    <div className="page-container">
      <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => tab === 'main' ? navigate(-1) : setTab('main')} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-white font-bold text-xl">
          {tab === 'main' ? 'Huduma' : tab === 'vip' ? '👑 VIP Member' : tab === 'business' ? '💼 Business Account' : tab === 'bluetick' ? '✓ Blue Tick' : '💋 Huduma za Admin'}
        </h1>
      </div>

      <div className="max-w-md mx-auto px-4">
        {tab === 'main' && (
          <div className="space-y-2 pt-4">
            {profile && (
              <div className="flex gap-2 flex-wrap mb-2">
                {profile.is_vip && <span className="vip-badge px-3 py-1">✓ VIP Aktive</span>}
                {profile.is_business && <span className="text-xs bg-blue-600/30 text-blue-300 px-3 py-1 rounded-full font-semibold">✓ Business Aktive</span>}
              </div>
            )}
            {mainMenu.filter(m => m.id !== 'admin_service').map(item => (
              <button key={item.id} onClick={() => requireAuth(() => setTab(item.id as any))}
                className={`w-full px-4 py-3 rounded-xl bg-gradient-to-r ${item.color} text-left flex items-center gap-3 active:scale-[0.98] transition-all`}>
                {item.id === 'bluetick' ? (
                  <span className="flex-shrink-0" style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.7))' }}><BlueTick tickId="galaxy" size={36} /></span>
                ) : (
                  <span className="text-2xl">{item.icon}</span>
                )}
                <div className="flex-1">
                  <p className="text-white font-bold text-sm">{item.title}</p>
                  <p className="text-white/70 text-xs">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/60" />
              </button>
            ))}

            {adminServices.length > 0 && (
              <div className="mt-3">
                <p className="text-gray-400 text-xs font-semibold mb-3 px-1">💋 HUDUMA ZA SASA HIVI</p>
                <div className="space-y-4">
                  {adminServices.map(svc => (
                    <div key={svc.id} className="overflow-hidden rounded-2xl" style={{ border: '1px solid rgba(255,20,147,0.2)', background: '#0d0d0d' }}>
                      <ServiceMedia svc={svc} />
                      <div className="px-4 py-4">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-white font-black text-lg flex-1">{svc.name}</p>
                          <p className="text-primary font-black text-xl flex-shrink-0">TZS {svc.price.toLocaleString()}</p>
                        </div>
                        {svc.description && <p className="text-gray-400 text-sm mb-3 leading-relaxed">{svc.description}</p>}
                        <div className="flex gap-2">
                          <button onClick={() => requireAuth(() => handleServicePay(svc))} className="flex-1 gradient-pink text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                            <Wallet className="w-4 h-4" /> Lipa Sasa
                          </button>
                          <button onClick={e => { e.stopPropagation(); if (!user) { navigate('/login'); return; } setGiftService(svc); }} className="px-4 py-3 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center" title="Tuma Zawadi">
                            <Gift className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'vip' && (
          <div className="pt-4 space-y-4">
            <div className="gradient-card rounded-2xl p-4">
              <h3 className="text-yellow-400 font-bold mb-3 flex items-center gap-2"><Crown className="w-5 h-5" />Unachopata ukiwa VIP:</h3>
              {vipBenefits.map((b, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5"><Check className="w-4 h-4 text-green-400 flex-shrink-0" /><span className="text-gray-300 text-sm">{b}</span></div>
              ))}
            </div>
            {vipPlans.map(plan => (
              <div key={plan.id} className="content-box p-5">
                <div className="flex justify-between items-center mb-3">
                  <div><p className="text-white font-black text-xl">{plan.name}</p><p className="text-gray-400 text-sm">Siku {plan.duration_days} za VIP</p></div>
                  <p className="text-primary font-black text-2xl">TZS {plan.price.toLocaleString()}</p>
                </div>
                <button onClick={() => setSelectedPlan({ amount: plan.price, name: plan.name, type: 'vip' })} className="btn-primary w-full text-base">Jiunge Sasa</button>
              </div>
            ))}
            {vipPlans.length === 0 && <div className="text-center py-8 text-gray-500">Mipango itaongezwa hivi karibuni</div>}
          </div>
        )}

        {tab === 'business' && (
          <div className="pt-4 space-y-4">
            <div className="gradient-card rounded-2xl p-4">
              <h3 className="text-blue-400 font-bold mb-3 flex items-center gap-2"><Briefcase className="w-5 h-5" />Business Account unakupa:</h3>
              {['Upload video kwenye VIDEO section bila kikwazo', 'Upload picha/video kwenye MALAYA', 'Profaili yako inaonekana kwenye VIDEO CALL', 'Tuma picha, video, link na namba kwenye SexyRoom', 'Inbox, piga simu na ona namba za wanachama wote', 'Pata blue tick bure'].map((b, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5"><Check className="w-4 h-4 text-green-400 flex-shrink-0" /><span className="text-gray-300 text-sm">{b}</span></div>
              ))}
            </div>
            <div className="content-box p-5">
              <div className="flex justify-between items-center mb-3">
                <div><p className="text-white font-black text-xl">Business Account</p><p className="text-gray-400 text-sm">Kwa mwezi mmoja</p></div>
                <p className="text-primary font-black text-2xl">TZS {parseInt(settings.business_price_monthly || '10000').toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedPlan({ amount: parseInt(settings.business_price_monthly || '10000'), name: 'Business Account (Mwezi 1)', type: 'business' })} className="btn-primary w-full text-base">Fungua Business Account</button>
            </div>
          </div>
        )}

        {tab === 'bluetick' && (
          <div className="pt-4 space-y-4">
            <div className="gradient-card rounded-2xl p-4">
              <h3 className="text-white font-bold mb-3 text-center text-base">✨ Chagua Stili Yako ya Blue Tick</h3>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {BLUE_TICK_STYLES.map(s => (
                  <div key={s.id} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-black/30 border border-white/5 active:scale-90 transition-transform cursor-pointer" onClick={() => setSelectedPlan({ amount: parseInt(settings.blue_tick_price || '1000'), name: `Blue Tick (${s.label})`, type: 'blue_tick' })}>
                    <BlueTick tickId={s.id} size={36} />
                    <span className="text-[9px] text-gray-300 text-center leading-tight font-medium">{s.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-gray-400 text-xs text-center">Bonyeza stili yoyote kupata 🔒 verified</p>
            </div>
            <div className="content-box p-5">
              <div className="flex justify-between items-center mb-3">
                <div><p className="text-white font-black text-xl">Blue Tick</p><p className="text-gray-400 text-sm">Kwa mwezi mmoja</p></div>
                <p className="text-primary font-black text-2xl">TZS {parseInt(settings.blue_tick_price || '1000').toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedPlan({ amount: parseInt(settings.blue_tick_price || '1000'), name: 'Blue Tick (Mwezi 1)', type: 'blue_tick' })} className="btn-primary w-full text-base">Lipia Blue Tick</button>
            </div>
          </div>
        )}

        {tab === 'admin_service' && (
          <div className="pt-4 space-y-0 -mx-4">
            {adminServices.length === 0 ? (
              <div className="text-center py-16 text-gray-500"><p className="text-4xl mb-3">💋</p><p>Hakuna huduma za sasa hivi</p></div>
            ) : adminServices.map(svc => (
              <div key={svc.id} className="border-b border-[#1a0a1a]">
                <ServiceMedia svc={svc} />
                <div className="px-4 py-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1"><p className="text-white font-bold text-lg">{svc.name}</p>{svc.description && <p className="text-gray-400 text-sm mt-1 leading-relaxed">{svc.description}</p>}</div>
                    <p className="text-primary font-black text-xl ml-3 flex-shrink-0">TZS {svc.price.toLocaleString()}</p>
                  </div>
                  {user && profile && (
                    <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,20,147,0.06)', border: '1px solid rgba(255,20,147,0.15)' }}>
                      <Wallet className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-gray-400 text-xs">Salio lako:</span>
                      <span className={`font-bold text-sm ${(profile.balance || 0) >= svc.price ? 'text-green-400' : 'text-red-400'}`}>TZS {(profile.balance || 0).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                {/* TikSexy switch when adding/editing admin service */}
              {tab === 'admin_service' && (
                <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl border border-primary/20 mb-2">
                  <div className="flex flex-col">
                    <span className="text-white text-sm font-semibold">🎬 Onyesha kwenye TIK-SEXY?</span>
                    <span className="text-gray-500 text-xs">{editServiceTiksexy ? 'Itaonekana kwenye TikSexy feed' : 'Haitaonekana TikSexy'}</span>
                  </div>
                  <button onClick={() => setEditServiceTiksexy(v => !v)} className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${editServiceTiksexy ? 'bg-primary' : 'bg-gray-600'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${editServiceTiksexy ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
              )}
              {user ? <button onClick={() => handleServicePay(svc)} className="flex-1 btn-primary flex items-center justify-center gap-2"><Wallet className="w-4 h-4" /> Lipa kwa Salio</button>
                      : <button onClick={() => navigate('/login')} className="flex-1 btn-primary">Ingia kulipa</button>}
                    <button onClick={() => setSelectedPlan({ amount: svc.price, name: svc.name, type: 'admin_service' })} className="px-4 btn-outline text-sm">Njia Nyingine</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="h-8" />
      </div>

      {selectedPlan && (
        <PaymentModal onClose={() => setSelectedPlan(null)} amount={selectedPlan.amount} planName={selectedPlan.name} type={selectedPlan.type} settings={settings}
          onSuccess={() => { setSelectedPlan(null); fetchData(); }} />
      )}

      {balancePayService && profile && (
        <BalancePayModal service={balancePayService} userBalance={profile.balance || 0}
          onClose={() => setBalancePayService(null)} onSuccess={fetchData} />
      )}

      {giftService && profile && (
        <ServiceGiftModal service={giftService} myProfile={profile} onClose={() => setGiftService(null)} />
      )}
    </div>
  );
}

function ServiceGiftModal({ service, myProfile, onClose }: { service: any; myProfile: any; onClose: () => void }) {
  const GIFTS = [
    { emoji: '🌹', name: 'Waridi', amount: 100 }, { emoji: '💐', name: 'Maua', amount: 200 },
    { emoji: '🍫', name: 'Chokoleti', amount: 500 }, { emoji: '💍', name: 'Pete', amount: 1000 },
    { emoji: '🧸', name: 'Teddy', amount: 2000 }, { emoji: '💎', name: 'Almasi', amount: 5000 },
    { emoji: '🏆', name: 'Trophy', amount: 10000 }, { emoji: '🚗', name: 'Gari', amount: 50000 },
  ];
  const [selected, setSelected] = useState<typeof GIFTS[0] | null>(null);
  const [walletPass, setWalletPass] = useState('');
  const [sending, setSending] = useState(false);
  const { user, refreshProfile } = useAuth();
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
      const { data: adminProf } = await supabase.from('user_profiles').select('id,gift_balance').eq('is_admin', true).limit(1).single();
      if (adminProf) {
        await supabase.from('user_profiles').update({ gift_balance: ((adminProf as any).gift_balance || 0) + amt }).eq('id', (adminProf as any).id);
        await supabase.from('notifications').insert({ user_id: (adminProf as any).id, title: '🎁 Umepata Zawadi!', message: `${myProfile?.username} amekutumia ${selected.emoji} ${selected.name} - TZS ${amt.toLocaleString()} kwenye ${service.name}!`, type: 'gift' });
        await supabase.from('transactions').insert({ user_id: (adminProf as any).id, amount: amt, type: 'gift_received', status: 'approved', description: `Zawadi Huduma: ${selected.emoji} ${selected.name} kutoka ${myProfile?.username}` });
      }
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
          <h3 className="text-white font-bold flex items-center gap-2"><Gift className="w-5 h-5 text-orange-400" /> Zawadi kwa {service.name}</h3>
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
            {myProfile?.wallet_password && <input value={walletPass} onChange={e => setWalletPass(e.target.value)} placeholder="Password ya wallet" type="password" className="input-field text-sm" />}
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
