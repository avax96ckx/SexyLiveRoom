
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { AppSettings, Transaction } from '@/types';
import { ArrowLeft, Upload, Play, BookOpen, Send, CheckCircle, ArrowDownCircle, X, Gift, ArrowRightLeft, Users } from 'lucide-react';
import { toast } from 'sonner';
import UploadProgress from '@/components/features/UploadProgress';

// ── Live Balance Modals ────────────────────────────────────────────────────────

function LiveWithdrawModal({ profile, liveBalance, settings, onClose, onSuccess }: { profile: any; liveBalance: number; settings: any; onClose: () => void; onSuccess: () => void }) {
  const [phone, setPhone] = useState('');
  const [accountName, setAccountName] = useState('');
  const [network, setNetwork] = useState('TIGOPESA');
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refreshProfile } = useAuth();
  const requested = parseFloat(amount) || 0;

  async function handleSubmit() {
    if (!phone.trim()) return toast.error('Weka namba ya simu');
    if (!accountName.trim()) return toast.error('Weka jina la akaunti');
    if (requested <= 0) return toast.error('Weka kiasi cha kutoa');
    if (requested > liveBalance) return toast.error('Salio la Live halitooshi');
    if (profile?.wallet_password && password !== profile.wallet_password) return toast.error('Password ya wallet si sahihi!');
    setLoading(true);
    try {
      await supabase.from('user_profiles').update({ live_balance: liveBalance - requested }).eq('id', user!.id);
      await supabase.from('withdrawal_requests').insert({ user_id: user!.id, amount: requested, phone_number: phone, account_name: accountName, network, wallet_password: password, status: 'pending' });
      await supabase.from('transactions').insert({ user_id: user!.id, amount: requested, type: 'withdrawal', status: 'pending', description: `Toa Pesa ya Live → ${network} ${phone}` });
      if (refreshProfile) await refreshProfile();
      toast.success('✅ Ombi la kutoa pesa ya Live limetumwa!');
      onSuccess();
    } catch { toast.error('Hitilafu. Jaribu tena.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-red-900 rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-4"><h3 className="text-white font-bold text-lg flex items-center gap-2"><span className="text-xl">🔴</span> Toa Pesa ya Live</h3><button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button></div>
        <div className="bg-red-900/30 border border-red-700/40 rounded-xl p-3 mb-4 text-center"><p className="text-gray-400 text-xs">Salio la Live</p><p className="text-red-300 font-black text-2xl">TZS {liveBalance.toLocaleString()}</p></div>
        <div className="space-y-3">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Namba ya simu ya kupokea" className="input-field" type="tel" />
          <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Jina la usajili wa ile namba" className="input-field" />
          <select value={network} onChange={e => setNetwork(e.target.value)} className="input-field">
            <option>TIGOPESA</option><option>MPESA</option><option>AIRTEL</option><option>HALOPESA</option>
          </select>
          <div className="relative"><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Kiasi (TZS)" className="input-field text-xl font-bold pr-16" type="number" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">TZS</span></div>
          {requested > liveBalance && requested > 0 && <p className="text-red-400 text-xs">⚠️ Kiasi kinazidi salio la Live</p>}
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password ya wallet" className="input-field" type="password" />
          <button onClick={handleSubmit} disabled={loading || requested <= 0 || requested > liveBalance || !phone || !accountName} className="btn-primary w-full disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#dc2626,#7f1d1d)' }}>
            {loading ? 'Inatuma...' : '✅ Toa Pesa ya Live'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveTransferModal({ profile, liveBalance, onClose, onSuccess }: { profile: any; liveBalance: number; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState<'main' | 'gift'>('main');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refreshProfile } = useAuth();
  const requested = parseFloat(amount) || 0;

  async function handleTransfer() {
    if (requested <= 0) return toast.error('Weka kiasi');
    if (requested > liveBalance) return toast.error('Salio la Live halitooshi');
    if (profile?.wallet_password && password !== profile.wallet_password) return toast.error('Password si sahihi!');
    setLoading(true);
    try {
      const update: any = { live_balance: liveBalance - requested };
      if (dest === 'main') update.balance = (profile?.balance || 0) + requested;
      else update.gift_balance = (profile?.gift_balance || 0) + requested;
      await supabase.from('user_profiles').update(update).eq('id', user!.id);
      await supabase.from('transactions').insert({ user_id: user!.id, amount: requested, type: 'gift_transfer', status: 'approved', description: `Uhamisho: Live → ${dest === 'main' ? 'Akaunti Kuu' : 'Zawadi'}` });
      if (refreshProfile) await refreshProfile();
      toast.success(`✅ TZS ${requested.toLocaleString()} imehamishiwa kwenye ${dest === 'main' ? 'Akaunti Kuu' : 'Zawadi'}!`);
      onSuccess();
    } catch { toast.error('Hitilafu ya uhamisho'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-red-900 rounded-t-3xl p-6 slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-4"><h3 className="text-white font-bold text-lg flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-red-400" /> Hamisha Pesa ya Live</h3><button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button></div>
        <div className="bg-red-900/30 border border-red-700/40 rounded-xl p-3 mb-4 text-center"><p className="text-gray-400 text-xs">Salio la Live</p><p className="text-red-300 font-black text-2xl">TZS {liveBalance.toLocaleString()}</p></div>
        <div className="space-y-3">
          <div>
            <p className="text-gray-400 text-xs mb-2">Hamisha kwenda:</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDest('main')} className={`py-2 rounded-xl text-sm font-bold transition-all ${dest === 'main' ? 'bg-green-600/80 text-white' : 'bg-white/10 text-gray-400'}`}>💰 Salio Kuu</button>
              <button onClick={() => setDest('gift')} className={`py-2 rounded-xl text-sm font-bold transition-all ${dest === 'gift' ? 'bg-orange-600/80 text-white' : 'bg-white/10 text-gray-400'}`}>🎁 Zawadi</button>
            </div>
          </div>
          <div className="relative"><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Kiasi (TZS)" className="input-field text-xl font-bold pr-16" type="number" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">TZS</span></div>
          {profile?.wallet_password && <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password ya wallet" className="input-field" type="password" />}
          <button onClick={handleTransfer} disabled={loading || requested <= 0 || requested > liveBalance} className="btn-primary w-full disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#dc2626,#7f1d1d)' }}>
            {loading ? 'Inahamisha...' : '✅ Hamisha Sasa'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveSendModal({ profile, liveBalance, onClose, onSuccess }: { profile: any; liveBalance: number; onClose: () => void; onSuccess: () => void }) {
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refreshProfile } = useAuth();
  const requested = parseFloat(amount) || 0;

  useEffect(() => {
    if (search.length >= 2) {
      supabase.from('user_profiles').select('id,username,avatar_url').ilike('username', `%${search}%`).neq('id', user?.id).limit(10).then(({ data }) => setMembers(data || []));
    }
  }, [search]);

  async function handleSend() {
    if (!selectedUser) return toast.error('Chagua mtu wa kutuma');
    if (requested <= 0) return toast.error('Weka kiasi');
    if (requested > liveBalance) return toast.error('Salio la Live halitooshi');
    if (profile?.wallet_password && password !== profile.wallet_password) return toast.error('Password si sahihi!');
    setLoading(true);
    try {
      await supabase.from('user_profiles').update({ live_balance: liveBalance - requested }).eq('id', user!.id);
      const { data: recv } = await supabase.from('user_profiles').select('gift_balance').eq('id', selectedUser.id).single();
      await supabase.from('user_profiles').update({ gift_balance: ((recv as any)?.gift_balance || 0) + requested }).eq('id', selectedUser.id);
      await supabase.from('transactions').insert([
        { user_id: user!.id, amount: requested, type: 'gift_sent', status: 'approved', description: `Zawadi 🔴 | Kwa: ${selectedUser.username} | Chanzo: Live Balance` },
        { user_id: selectedUser.id, amount: requested, type: 'gift_received', status: 'approved', description: `Zawadi 🔴 | Kutoka: ${profile?.username} | Chanzo: Live Balance` },
      ]);
      await supabase.from('notifications').insert({ user_id: selectedUser.id, title: '🔴 Umepata Pesa ya Live!', message: `${profile?.username} amekutumia TZS ${requested.toLocaleString()} kutoka Live!`, type: 'gift', link: '/wallet?tab=gifts' });
      if (refreshProfile) await refreshProfile();
      toast.success(`✅ TZS ${requested.toLocaleString()} imetumwa kwa ${selectedUser.username}!`);
      onSuccess();
    } catch { toast.error('Hitilafu ya kutuma'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-red-900 rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-4"><h3 className="text-white font-bold text-lg flex items-center gap-2"><Send className="w-5 h-5 text-red-400" /> Tuma Pesa ya Live</h3><button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button></div>
        <div className="bg-red-900/30 border border-red-700/40 rounded-xl p-3 mb-4 text-center"><p className="text-gray-400 text-xs">Salio la Live</p><p className="text-red-300 font-black text-2xl">TZS {liveBalance.toLocaleString()}</p></div>
        {!selectedUser ? (
          <div className="space-y-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tafuta jina la member..." className="input-field" />
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {members.map(m => (
                <button key={m.id} onClick={() => setSelectedUser(m)} className="w-full flex items-center gap-3 p-3 bg-[#1a0a1a] rounded-xl hover:bg-primary/10 transition-colors">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">{m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full gradient-pink flex items-center justify-center text-white font-bold">{m.username?.[0]?.toUpperCase()}</div>}</div>
                  <span className="text-white font-semibold">{m.username}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-red-500/10 rounded-xl border border-red-500/30">
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">{selectedUser.avatar_url ? <img src={selectedUser.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full gradient-pink flex items-center justify-center text-white font-bold">{selectedUser.username?.[0]?.toUpperCase()}</div>}</div>
              <span className="text-white font-bold flex-1">{selectedUser.username}</span>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="relative"><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Kiasi (TZS)" className="input-field text-xl font-bold pr-16" type="number" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">TZS</span></div>
            {profile?.wallet_password && <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password ya wallet" className="input-field" type="password" />}
            <button onClick={handleSend} disabled={loading || requested <= 0 || requested > liveBalance} className="btn-primary w-full disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#dc2626,#7f1d1d)' }}>
              {loading ? 'Inatuma...' : `🔴 Tuma TZS ${requested > 0 ? requested.toLocaleString() : 0}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Gift Balance Withdrawal Form
function GiftWithdrawForm({ giftBalance, profile, onClose, onSuccess }: { giftBalance: number; profile: any; onClose: () => void; onSuccess: () => void }) {
  const [phone, setPhone] = useState('');
  const [accountName, setAccountName] = useState('');
  const [network, setNetwork] = useState('TIGOPESA');
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refreshProfile } = useAuth();
  const requested = parseFloat(amount) || 0;

  async function handleSubmit() {
    if (!phone.trim()) return toast.error('Weka namba ya simu');
    if (!accountName.trim()) return toast.error('Weka jina la akaunti');
    if (requested <= 0) return toast.error('Weka kiasi cha kutoa');
    if (requested > giftBalance) return toast.error('Salio la zawadi halitooshi');
    if (profile?.wallet_password && password !== profile.wallet_password) return toast.error('Password ya wallet si sahihi!');
    setLoading(true);
    try {
      await supabase.from('user_profiles').update({ gift_balance: giftBalance - requested }).eq('id', user!.id);
      await supabase.from('withdrawal_requests').insert({ user_id: user!.id, amount: requested, phone_number: phone, account_name: accountName, network, wallet_password: password, status: 'pending' });
      await supabase.from('transactions').insert({ user_id: user!.id, amount: requested, type: 'withdrawal', status: 'pending', description: `Toa Pesa za Zawadi → ${network} ${phone}` });
      await supabase.from('notifications').insert({ title: '💸 Ombi Jipya la Kutoa Pesa (Zawadi)', message: `${profile?.username} ametaka kutoa TZS ${requested.toLocaleString()} kutoka Zawadi kwa ${network} ${phone}`, type: 'withdrawal_request', user_id: null });
      if (refreshProfile) await refreshProfile();
      toast.success('✅ Ombi la kutoa pesa za zawadi limetumwa!');
      onSuccess();
    } catch { toast.error('Hitilafu. Jaribu tena.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-3">
      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Namba ya simu ya kupokea" className="input-field" type="tel" />
      <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Jina la usajili wa ile namba" className="input-field" />
      <select value={network} onChange={e => setNetwork(e.target.value)} className="input-field">
        <option>TIGOPESA</option><option>MPESA</option><option>AIRTEL</option><option>HALOPESA</option>
      </select>
      <div className="relative"><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Kiasi (TZS)" className="input-field text-xl font-bold pr-16" type="number" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">TZS</span></div>
      {requested > giftBalance && requested > 0 && <p className="text-red-400 text-xs">⚠️ Kiasi kinazidi salio la zawadi</p>}
      {profile?.wallet_password && <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password ya wallet" className="input-field" type="password" />}
      <button onClick={handleSubmit} disabled={loading || requested <= 0 || requested > giftBalance || !phone || !accountName}
        className="btn-primary w-full disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#d97706,#92400e)' }}>
        {loading ? 'Inatuma...' : '✅ Toa Pesa za Zawadi'}
      </button>
    </div>
  );
}

// Withdrawal Modal
function WithdrawalModal({ profile, settings, onClose, onSuccess }: { profile: any; settings: AppSettings; onClose: () => void; onSuccess: () => void }) {
  const [phone, setPhone] = useState('');
  const [accountName, setAccountName] = useState('');
  const [network, setNetwork] = useState('TIGOPESA');
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refreshProfile } = useAuth();
  const balance = profile?.balance || 0;
  const requested = parseFloat(amount) || 0;
  const canAfford = requested > 0 && requested <= balance;

  async function handleSubmit() {
    if (!phone.trim()) return toast.error('Weka namba ya simu');
    if (!accountName.trim()) return toast.error('Weka jina la akaunti');
    if (requested <= 0) return toast.error('Weka kiasi cha kutoa');
    if (requested > balance) return toast.error('Salio halitooshi');
    if (!password.trim()) return toast.error('Weka password ya wallet');
    if (profile?.wallet_password && password !== profile.wallet_password) return toast.error('Password ya wallet si sahihi!');
    setLoading(true);
    try {
      await supabase.from('user_profiles').update({ balance: balance - requested }).eq('id', user!.id);
      await supabase.from('withdrawal_requests').insert({ user_id: user!.id, amount: requested, phone_number: phone, account_name: accountName, network, wallet_password: password, status: 'pending' });
      await supabase.from('notifications').insert({ title: '💸 Ombi Jipya la Kutoa Pesa', message: `${profile?.username} ametaka kutoa TZS ${requested.toLocaleString()} kwa ${network} ${phone}`, type: 'withdrawal_request', user_id: null });
      if (refreshProfile) await refreshProfile();
      toast.success('✅ Ombi limetumwa! Admin atakutumia pesa hivi karibuni.');
      onSuccess();
    } catch { toast.error('Hitilafu. Jaribu tena.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-4"><h3 className="text-white font-bold text-lg flex items-center gap-2"><ArrowDownCircle className="w-5 h-5 text-primary" /> Toa Pesa</h3><button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button></div>
        <div className="bg-[#1a0a1a] rounded-xl p-3 mb-4 text-center"><p className="text-gray-400 text-xs">Salio Lako</p><p className="text-white font-black text-2xl">TZS {balance.toLocaleString()}</p></div>
        <div className="space-y-3">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Namba ya simu ya kupokea" className="input-field" type="tel" />
          <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Jina la usajili wa ile namba" className="input-field" />
          <select value={network} onChange={e => setNetwork(e.target.value)} className="input-field">
            <option value="TIGOPESA">TIGOPESA</option><option value="MPESA">MPESA</option><option value="AIRTEL">AIRTEL MONEY</option><option value="HALOPESA">HALOPESA</option>
          </select>
          <div className="relative"><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Kiasi (TZS)" className="input-field text-xl font-bold pr-16" type="number" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">TZS</span></div>
          {requested > balance && requested > 0 && <p className="text-red-400 text-xs">⚠️ Kiasi kinazidi salio</p>}
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password ya wallet" className="input-field" type="password" />
          <button onClick={handleSubmit} disabled={loading || !canAfford || !phone || !accountName || !password} className="btn-primary w-full disabled:opacity-40">
            {loading ? 'Inatuma...' : '✅ Thibitisha na Tuma Ombi'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Transfer gift → main balance
function TransferModal({ profile, onClose, onSuccess }: { profile: any; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refreshProfile } = useAuth();
  const giftBal = profile?.gift_balance || 0;
  const requested = parseFloat(amount) || 0;

  async function handleTransfer() {
    if (requested <= 0) return toast.error('Weka kiasi');
    if (requested > giftBal) return toast.error('Salio la zawadi halitooshi');
    if (profile?.wallet_password && password !== profile.wallet_password) return toast.error('Password si sahihi!');
    setLoading(true);
    try {
      await supabase.from('user_profiles').update({ gift_balance: giftBal - requested, balance: (profile?.balance || 0) + requested }).eq('id', user!.id);
      await supabase.from('transactions').insert({ user_id: user!.id, amount: requested, type: 'gift_transfer', status: 'approved', description: `Uhamisho: Zawadi → Akaunti Kuu` });
      if (refreshProfile) await refreshProfile();
      toast.success(`✅ TZS ${requested.toLocaleString()} imehamishiwa kwenye akaunti kuu!`);
      onSuccess();
    } catch { toast.error('Hitilafu ya uhamisho'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-6 slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-4"><h3 className="text-white font-bold text-lg flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-orange-400" /> Hamisha Pesa</h3><button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button></div>
        <div className="bg-[#1a0a1a] rounded-xl p-3 mb-4 text-center"><p className="text-gray-400 text-xs">Salio la Zawadi</p><p className="text-orange-400 font-black text-2xl">TZS {giftBal.toLocaleString()}</p></div>
        <p className="text-gray-400 text-sm mb-3 text-center">Hamisha pesa kutoka Zawadi → Akaunti Kuu</p>
        <div className="space-y-3">
          <div className="relative"><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Kiasi (TZS)" className="input-field text-xl font-bold pr-16" type="number" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">TZS</span></div>
          {profile?.wallet_password && <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password ya wallet" className="input-field" type="password" />}
          <button onClick={handleTransfer} disabled={loading || requested <= 0 || requested > giftBal} className="btn-primary w-full disabled:opacity-40">
            {loading ? 'Inahamisha...' : '✅ Hamisha Sasa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Send gift to another user
function SendGiftModal({ profile, onClose, onSuccess }: { profile: any; onClose: () => void; onSuccess: () => void }) {
  const [members, setMembers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refreshProfile } = useAuth();
  const giftBal = profile?.gift_balance || 0;
  const mainBal = profile?.balance || 0;
  const requested = parseFloat(amount) || 0;

  useEffect(() => {
    if (search.length >= 2) {
      supabase.from('user_profiles').select('id,username,avatar_url').ilike('username', `%${search}%`).neq('id', user?.id).limit(10).then(({ data }) => setMembers(data || []));
    }
  }, [search]);

  async function handleSend() {
    if (!selectedUser) return toast.error('Chagua mtu wa kupokea zawadi');
    if (requested <= 0) return toast.error('Weka kiasi');
    const useGift = giftBal >= requested;
    if (!useGift && mainBal < requested) return toast.error('Salio halitooshi');
    if (profile?.wallet_password && password !== profile.wallet_password) return toast.error('Password si sahihi!');
    setLoading(true);
    try {
      // Deduct from sender (prefer gift balance, then main)
      if (useGift) {
        await supabase.from('user_profiles').update({ gift_balance: giftBal - requested }).eq('id', user!.id);
      } else {
        await supabase.from('user_profiles').update({ balance: mainBal - requested }).eq('id', user!.id);
      }
      // Add to receiver gift balance
      const { data: recvProf } = await supabase.from('user_profiles').select('gift_balance').eq('id', selectedUser.id).single();
      await supabase.from('user_profiles').update({ gift_balance: (recvProf?.gift_balance || 0) + requested }).eq('id', selectedUser.id);
    // Send gift: record with clear sender info format for history visibility
      await supabase.from('transactions').insert({ user_id: selectedUser.id, amount: requested, type: 'gift_received', status: 'approved', description: `Zawadi 🎁 | Kutoka: ${profile?.username} | Chanzo: Wallet` });
      await supabase.from('transactions').insert({ user_id: user!.id, amount: requested, type: 'gift_sent', status: 'approved', description: `Zawadi 🎁 | Kwa: ${selectedUser.username} | Chanzo: Wallet` });
      await supabase.from('notifications').insert({ user_id: selectedUser.id, title: '🎁 Umepata Zawadi!', message: `${profile?.username} amekutumia zawadi ya TZS ${requested.toLocaleString()} (Wallet)!`, type: 'gift', link: '/wallet?tab=gifts' });
      if (refreshProfile) await refreshProfile();
      toast.success(`🎁 Zawadi ya TZS ${requested.toLocaleString()} imetumwa kwa ${selectedUser.username}!`);
      onSuccess();
    } catch { toast.error('Hitilafu ya kutuma zawadi'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between mb-4"><h3 className="text-white font-bold text-lg flex items-center gap-2"><Gift className="w-5 h-5 text-orange-400" /> Tuma Zawadi</h3><button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button></div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-[#1a0a1a] rounded-xl p-3 text-center"><p className="text-gray-400 text-xs">Zawadi</p><p className="text-orange-400 font-black">TZS {giftBal.toLocaleString()}</p></div>
          <div className="bg-[#1a0a1a] rounded-xl p-3 text-center"><p className="text-gray-400 text-xs">Salio Kuu</p><p className="text-green-400 font-black">TZS {mainBal.toLocaleString()}</p></div>
        </div>
        {!selectedUser ? (
          <div className="space-y-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tafuta jina la mtu..." className="input-field" />
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {members.map(m => (
                <button key={m.id} onClick={() => setSelectedUser(m)} className="w-full flex items-center gap-3 p-3 bg-[#1a0a1a] rounded-xl hover:bg-primary/10 transition-colors">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                    {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-bold">{m.username?.[0]?.toUpperCase()}</span></div>}
                  </div>
                  <span className="text-white font-semibold">{m.username}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl border border-primary/30">
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                {selectedUser.avatar_url ? <img src={selectedUser.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-bold">{selectedUser.username?.[0]?.toUpperCase()}</span></div>}
              </div>
              <span className="text-white font-bold flex-1">{selectedUser.username}</span>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="relative"><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Kiasi cha zawadi (TZS)" className="input-field text-xl font-bold pr-16" type="number" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">TZS</span></div>
            {profile?.wallet_password && <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password ya wallet" className="input-field" type="password" />}
            <p className="text-gray-500 text-xs text-center">Pesa zitatoka kwenye: {(profile?.gift_balance || 0) >= requested ? '🎁 Zawadi' : '💰 Salio Kuu'}</p>
            <button onClick={handleSend} disabled={loading || requested <= 0 || (!selectedUser)} className="btn-primary w-full disabled:opacity-40">
              {loading ? 'Inatuma...' : `🎁 Tuma TZS ${requested > 0 ? requested.toLocaleString() : 0}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Gift History Component - shows full sender details with source location
function GiftHistoryTab({ userId }: { userId: string }) {
  const [gifts, setGifts] = useState<any[]>([]);
  const [liveGifts, setLiveGifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'received' | 'sent' | 'live'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  useEffect(() => { if (userId) { fetchGifts(); fetchLiveGifts(); } }, [userId, filter, dateFilter]);

  async function fetchLiveGifts() {
    // Fetch both received (as host) and sent (as viewer)
    const [{ data: received }, { data: sent }] = await Promise.all([
      supabase.from('live_gift_history')
        .select('*, sender:sender_id(id,username,avatar_url), session:session_id(title)')
        .eq('host_id', userId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('live_gift_history')
        .select('*, host:host_id(id,username,avatar_url), session:session_id(title)')
        .eq('sender_id', userId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    const receivedTagged = (received || []).map((g: any) => ({ ...g, _dir: 'received' }));
    const sentTagged = (sent || []).map((g: any) => ({ ...g, _dir: 'sent' }));
    // Merge and sort by created_at
    const merged = [...receivedTagged, ...sentTagged].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setLiveGifts(merged);
  }

  async function fetchGifts() {
    setLoading(true);
    // Fetch ALL gift-related transactions - both received, sent, and transfers
    let query = supabase.from('transactions')
      .select('*')
      .eq('user_id', userId)
      .in('type', ['gift_received', 'gift_sent', 'gift_transfer', 'malaya_sale', 'video_sale', 'live_sale']);
    if (filter === 'received') query = query.in('type', ['gift_received', 'malaya_sale', 'video_sale', 'live_sale']);
    if (filter === 'sent') query = query.eq('type', 'gift_sent');
    if (filter === 'live') { setGifts([]); setLoading(false); return; }
    const now = new Date();
    if (dateFilter === 'today') {
      const start = new Date(now); start.setHours(0,0,0,0);
      query = query.gte('created_at', start.toISOString());
    } else if (dateFilter === 'week') {
      query = query.gte('created_at', new Date(Date.now() - 7*24*60*60*1000).toISOString());
    } else if (dateFilter === 'month') {
      query = query.gte('created_at', new Date(Date.now() - 30*24*60*60*1000).toISOString());
    }
    const { data } = await query.order('created_at', { ascending: false }).limit(200);
    setGifts(data || []);
    setLoading(false);
  }

  const totalReceived = gifts.filter(g => g.type === 'gift_received').reduce((s, g) => s + g.amount, 0);
  const totalSent = gifts.filter(g => g.type === 'gift_sent').reduce((s, g) => s + g.amount, 0);
  const totalTransfer = gifts.filter(g => g.type === 'gift_transfer').reduce((s, g) => s + g.amount, 0);
  const totalLiveGifts = liveGifts.reduce((s: number, g: any) => s + (g.coin_value || 0), 0);

  const [liveGiftTab, setLiveGiftTab] = useState<'received' | 'sent' | 'all'>('all');
  const LiveGiftsList = () => {
    const filtered = liveGifts.filter((g: any) =>
      liveGiftTab === 'all' ? true : liveGiftTab === 'received' ? g._dir === 'received' : g._dir === 'sent'
    );
    const totalReceived = liveGifts.filter((g: any) => g._dir === 'received').reduce((s: number, g: any) => s + (g.coin_value || 0), 0);
    const totalSent = liveGifts.filter((g: any) => g._dir === 'sent').reduce((s: number, g: any) => s + (g.coin_value || 0), 0);
    return (
      <div>
        {/* Summary */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2.5 text-center">
            <p className="text-green-400 text-[10px] font-semibold">Zilizopokelewa</p>
            <p className="text-green-400 font-black text-base">{totalReceived.toLocaleString()} coins</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2.5 text-center">
            <p className="text-red-400 text-[10px] font-semibold">Zilizotumwa</p>
            <p className="text-red-400 font-black text-base">{totalSent.toLocaleString()} coins</p>
          </div>
        </div>
        {/* Filter tabs */}
        <div className="flex gap-1.5 mb-3">
          {(['all','received','sent'] as const).map(t => (
            <button key={t} onClick={() => setLiveGiftTab(t)} className={`flex-1 py-1.5 rounded-xl text-xs font-bold ${liveGiftTab === t ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
              {t === 'all' ? 'Zote' : t === 'received' ? '🎁 Zilizopokelewa' : '💸 Zilizotumwa'}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p className="text-3xl mb-2">🔴</p><p className="text-sm">Hakuna zawadi za Live</p>
            </div>
          ) : filtered.map((g: any, i: number) => {
            const isSent = g._dir === 'sent';
            const person = isSent ? g.host : g.sender;
            return (
              <div key={`${g.id}_${i}`} className="content-box p-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-primary/20">
                    {person?.avatar_url
                      ? <img src={person.avatar_url} className="w-full h-full object-cover" alt="" />
                      : <div className="w-full h-full gradient-pink flex items-center justify-center text-white font-bold text-sm">{person?.username?.[0]?.toUpperCase() || '?'}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-white font-bold text-sm">{g.gift_emoji || '🎁'} {g.gift_type}</p>
                      <p className={`font-black ${isSent ? 'text-red-400' : 'text-yellow-400'}`}>
                        {isSent ? '-' : '+'}{(g.coin_value || 0).toLocaleString()} coins
                      </p>
                    </div>
                    <p className={`text-xs font-semibold ${isSent ? 'text-red-300' : 'text-primary'}`}>
                      {isSent ? `💸 Kwa: @${person?.username || 'Host'}` : `👤 Kutoka: @${person?.username || 'Mtu'}`}
                    </p>
                    {g.session?.title && <p className="text-blue-400 text-xs">📺 Live: {g.session.title}</p>}
                    <p className="text-gray-600 text-xs mt-0.5">{new Date(g.created_at).toLocaleString('sw-TZ')}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Parse sender name from description field
  // Supports formats:
  // New: "Zawadi 🌹 Waridi | Kutoka: NAME | Chanzo: SOURCE"
  // New sent: "Zawadi 🌹 Waridi | Kwa: NAME | Chanzo: SOURCE"
  // Old: "Zawadi kutoka kwa NAME kwenye SOURCE"
  // Old sent: "Zawadi kwa NAME: ..."
  function parseSender(desc: string, type: string): string {
    if (!desc) return '';
    // New format: pipe-separated
    let m = desc.match(/\|\s*Kutoka:\s*([^|]+)/i);
    if (m) return m[1].trim();
    m = desc.match(/\|\s*Kwa:\s*([^|]+)/i);
    if (m) return m[1].trim();
    // Old format: "kutoka kwa NAME kwenye"
    m = desc.match(/kutoka\s+kwa\s+(.+?)(?:\s+kwenye|$)/i);
    if (m) return m[1].trim();
    // Old format sent: "Zawadi kwa NAME:"
    m = desc.match(/^Zawadi\s+kwa\s+([^:]+):/i);
    if (m) return m[1].trim();
    return '';
  }

  // Parse source/location from description
  function parseSource(desc: string): string {
    if (!desc) return '';
    // New format: | Chanzo: SOURCE
    const m = desc.match(/\|\s*Chanzo:\s*(.+?)(?:\s*$)/i);
    if (m) return m[1].trim();
    // Old format: "kwenye SOURCE"
    const m2 = desc.match(/kwenye\s+(.+)$/i);
    if (m2) return m2[1].trim();
    // Keywords
    if (/SexyRoom/i.test(desc)) return 'SexyRoom';
    if (/Live/i.test(desc)) return 'Live';
    if (/Messenger/i.test(desc)) return 'Messenger';
    if (/Profaili/i.test(desc)) return 'Profaili';
    if (/Malaya/i.test(desc)) return 'Malaya';
    if (/TikSexy/i.test(desc)) return 'TikSexy';
    return '';
  }

  function parseGiftEmoji(desc: string): string {
    if (!desc) return '🎁';
    // Match emoji characters
    const m = desc.match(/([\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F9FF}])/u);
    return m ? m[1] : '🎁';
  }

  function typeToLabel(type: string): string {
    const labels: Record<string, string> = {
      gift_received: '🎁 Zawadi Iliyopokelewa',
      gift_sent: '💸 Zawadi Iliyotumwa',
      gift_transfer: '⇄ Hamisha kwa Akaunti Kuu',
      malaya_sale: '💋 Mapato ya Malaya',
      video_sale: '🎬 Mapato ya Video',
      live_sale: '🔴 Mapato ya Live',
    };
    return labels[type] || type;
  }

  // Build weekly chart data (last 7 days)
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    const dayStart = new Date(date); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(date); dayEnd.setHours(23,59,59,999);
    const dayGifts = gifts.filter(g => {
      const d = new Date(g.created_at);
      return d >= dayStart && d <= dayEnd && g.type === 'gift_received';
    });
    return { label: ['Ju','It','Ju','Al','Ij','Sa','Li'][date.getDay()], amount: dayGifts.reduce((s, g) => s + g.amount, 0) };
  });
  const maxWeekly = Math.max(...weeklyData.map(d => d.amount), 1);


  return (
    <div className="px-4 py-2">
      {/* Weekly chart */}
      <div className="content-box p-4 mb-4">
        <h4 className="text-white font-bold text-sm mb-3 flex items-center gap-2">📈 Zawadi za Wiki Hii (Zilizopokelewa)</h4>
        <div className="flex items-end gap-1.5 h-24">
          {weeklyData.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max(4, (d.amount / maxWeekly) * 80)}px`, background: d.amount > 0 ? 'linear-gradient(to top, #FF1493, #ff69b4)' : 'rgba(255,255,255,0.1)' }} />
              <span className="text-[9px] text-gray-500">{d.label}</span>
              {d.amount > 0 && <span className="text-[8px] text-primary font-bold">{d.amount >= 1000 ? `${(d.amount/1000).toFixed(1)}K` : d.amount}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
          <p className="text-green-400 text-[10px] font-semibold">Zilizopokelewa</p>
          <p className="text-green-400 font-black text-base">TZS {totalReceived.toLocaleString()}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <p className="text-red-400 text-[10px] font-semibold">Zilizotumwa</p>
          <p className="text-red-400 font-black text-base">TZS {totalSent.toLocaleString()}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
          <p className="text-blue-400 text-[10px] font-semibold">Uhamisho</p>
          <p className="text-blue-400 font-black text-base">TZS {totalTransfer.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
        {(['all','received','sent','live'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold ${
            filter === f ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'
          }`}>
            {f === 'all' ? 'Zote' : f === 'received' ? '🎁 Zilizopokelewa' : f === 'sent' ? '💸 Zilizotumwa' : '🔴 Live Gifts'}
          </button>
        ))}
        <div className="w-px bg-gray-700 mx-1" />
        {(['all','today','week','month'] as const).map(f => (
          <button key={f} onClick={() => setDateFilter(f)} className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold ${
            dateFilter === f ? 'bg-blue-600/80 text-white' : 'bg-[#1a0a1a] text-gray-400'
          }`}>
            {f === 'all' ? 'Wakati Wote' : f === 'today' ? 'Leo' : f === 'week' ? 'Wiki' : 'Mwezi'}
          </button>
        ))}
      </div>

      {/* Live gifts summary banner */}
      {liveGifts.length > 0 && filter !== 'sent' && filter !== 'live' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-3 flex items-center gap-3">
          <span className="text-2xl">🔴</span>
          <div className="flex-1">
            <p className="text-red-300 font-bold text-sm">Zawadi za Live Streams</p>
            <p className="text-gray-400 text-xs">{liveGifts.length} zawadi · {totalLiveGifts.toLocaleString()} coins jumla</p>
          </div>
          <button onClick={() => setFilter('live')} className="text-red-400 text-xs font-bold px-2 py-1 rounded-lg bg-red-500/20">Angalia</button>
        </div>
      )}

      {/* Gift list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filter === 'live' ? (
        <LiveGiftsList />
      ) : gifts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">🎁</p>
          <p>Hakuna historia ya zawadi bado</p>
          <p className="text-xs mt-1 text-gray-600">Tuma au pokea zawadi ili ionekane hapa</p>
        </div>
      ) : (
        <div className="space-y-2">
          {gifts.map(tx => {
            const isReceived = ['gift_received', 'malaya_sale', 'video_sale', 'live_sale'].includes(tx.type);
            const isTransfer = tx.type === 'gift_transfer';
            const sender = parseSender(tx.description || '', tx.type);
            const source = parseSource(tx.description || '');
            const emoji = parseGiftEmoji(tx.description || '');
            const amtColor = isReceived ? 'text-green-400' : isTransfer ? 'text-blue-400' : 'text-red-400';
            const bgColor = isReceived ? 'bg-green-500/15' : isTransfer ? 'bg-blue-500/15' : 'bg-red-500/15';
            return (
              <div key={tx.id} className="content-box p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-2xl ${bgColor}`}>
                    {emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-white font-bold text-sm">{typeToLabel(tx.type)}</p>
                      <p className={`font-black text-base ${amtColor}`}>
                        {isReceived ? '+' : '-'}TZS {Number(tx.amount).toLocaleString()}
                      </p>
                    </div>
                    {/* Sender info */}
                    {sender && (
                      <p className="text-primary text-xs font-semibold">
                        {isReceived ? `👤 Kutoka: ${sender}` : `👤 Kwa: ${sender}`}
                      </p>
                    )}
                    {/* Source location */}
                    {source && (
                      <p className="text-blue-400 text-xs font-semibold">
                        📍 Chanzo: {source}
                      </p>
                    )}
                    {/* Full description */}
                    {tx.description && (
                      <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{tx.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-gray-600 text-xs">{new Date(tx.created_at).toLocaleString('sw-TZ')}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        tx.status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {tx.status === 'approved' ? '✓ Imekamilika' : '⏳ Inasubiri'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="h-4" />
    </div>
  );
}

// Gift Card Credits Component - shows remaining unlock credits from gift cards
function GiftCardCreditsDisplay({ userId }: { userId: string }) {
  const [credits, setCredits] = useState<{ video: number; malaya: number; live: number; cards: any[] }>({ video: 0, malaya: 0, live: 0, cards: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    loadCredits();
  }, [userId]);

  async function loadCredits() {
    setLoading(true);
    // Fetch gift cards used by this user that have unlock credits
    const { data } = await supabase
      .from('gift_card_uses')
      .select('card_id, gift_cards(*)')
      .eq('user_id', userId);

    let videoTotal = 0, malayaTotal = 0, liveTotal = 0;
    const activeCards: any[] = [];

    (data || []).forEach((use: any) => {
      const card = use.gift_cards;
      if (!card) return;
      const isExpired = card.expires_at && new Date(card.expires_at) < new Date();
      if (isExpired) return;

      if (card.type === 'unlock_video' && card.unlock_video_count > 0) {
        videoTotal += card.unlock_video_count;
        activeCards.push({ ...card, label: `🎬 Video x${card.unlock_video_count}` });
      }
      if (card.type === 'unlock_malaya' && card.unlock_malaya_count > 0) {
        malayaTotal += card.unlock_malaya_count;
        activeCards.push({ ...card, label: `💋 Malaya x${card.unlock_malaya_count}` });
      }
      if (card.type === 'unlock_live' && card.unlock_live_count > 0) {
        liveTotal += card.unlock_live_count;
        activeCards.push({ ...card, label: `🔴 Live x${card.unlock_live_count}` });
      }
      if (card.type === 'vip') {
        activeCards.push({ ...card, label: `👑 VIP ${card.duration_days} siku` });
      }
    });

    setCredits({ video: videoTotal, malaya: malayaTotal, live: liveTotal, cards: activeCards });
    setLoading(false);
  }

  if (loading) return null;
  if (credits.cards.length === 0 && credits.video === 0 && credits.malaya === 0 && credits.live === 0) return null;

  return (
    <>
      {credits.video > 0 && (
        <div className="flex items-center justify-between py-2 border-b border-[#1a0a1a]">
          <span className="text-gray-400 text-sm">🎬 Video Unlock Credits</span>
          <span className="text-blue-400 font-bold">{credits.video} video</span>
        </div>
      )}
      {credits.malaya > 0 && (
        <div className="flex items-center justify-between py-2 border-b border-[#1a0a1a]">
          <span className="text-gray-400 text-sm">💋 Malaya Unlock Credits</span>
          <span className="text-pink-400 font-bold">{credits.malaya} namba</span>
        </div>
      )}
      {credits.live > 0 && (
        <div className="flex items-center justify-between py-2 border-b border-[#1a0a1a]">
          <span className="text-gray-400 text-sm">🔴 Live Room Credits</span>
          <span className="text-red-400 font-bold">{credits.live} room</span>
        </div>
      )}
      {credits.cards.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="text-gray-500 text-xs font-semibold">Gift Cards Zilizotumika:</p>
          {credits.cards.map((card, i) => (
            <div key={i} className="flex items-center justify-between bg-[#0d0d0d] rounded-lg px-3 py-2">
              <span className="text-gray-300 text-xs">{card.label} - <span className="font-mono text-primary">{card.code}</span></span>
              {card.expires_at && (
                <span className="text-gray-500 text-[10px]">Hadi {new Date(card.expires_at).toLocaleDateString('sw-TZ')}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Mauzo Tab - Sales history from TikSexy, Malaya, Video
function MauzaoTab({ userId }: { userId: string }) {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  useEffect(() => { if (userId) loadSales(); }, [userId, dateFilter]);

  async function loadSales() {
    setLoading(true);
    let q = supabase.from('transactions').select('*').eq('user_id', userId)
      .in('type', ['malaya_sale', 'video_sale', 'live_sale', 'gift_received']);
    const now = new Date();
    if (dateFilter === 'today') { const s = new Date(now); s.setHours(0,0,0,0); q = q.gte('created_at', s.toISOString()); }
    else if (dateFilter === 'week') q = q.gte('created_at', new Date(Date.now()-7*24*3600*1000).toISOString());
    else if (dateFilter === 'month') q = q.gte('created_at', new Date(Date.now()-30*24*3600*1000).toISOString());
    const { data } = await q.order('created_at', { ascending: false }).limit(200);
    setSales(data || []);
    setLoading(false);
  }

  const totalMalaya = sales.filter(s => s.type === 'malaya_sale').reduce((a, s) => a + s.amount, 0);
  const totalVideo = sales.filter(s => s.type === 'video_sale').reduce((a, s) => a + s.amount, 0);
  const totalLive = sales.filter(s => s.type === 'live_sale').reduce((a, s) => a + s.amount, 0);
  const totalGifts = sales.filter(s => s.type === 'gift_received').reduce((a, s) => a + s.amount, 0);
  const grandTotal = totalMalaya + totalVideo + totalLive + totalGifts;

  // Daily totals for chart (last 7 days)
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 24 * 3600 * 1000);
    const start = new Date(date); start.setHours(0,0,0,0);
    const end = new Date(date); end.setHours(23,59,59,999);
    const total = sales.filter(s => { const d = new Date(s.created_at); return d >= start && d <= end; }).reduce((a, s) => a + s.amount, 0);
    return { label: ['Ju','It','Ju','Al','Ij','Sa','Li'][date.getDay()], total };
  });
  const maxDay = Math.max(...dailyData.map(d => d.total), 1);

  const typeLabel = (type: string) => ({ malaya_sale: '💋 Malaya', video_sale: '🎬 Video', live_sale: '🔴 Live', gift_received: '🎁 Zawadi' })[type] || type;

  return (
    <div className="px-4 py-2">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 col-span-2 text-center">
          <p className="text-gray-400 text-xs">Jumla ya Mauzo</p>
          <p className="text-primary font-black text-2xl">TZS {grandTotal.toLocaleString()}</p>
        </div>
        <div className="bg-pink-500/10 border border-pink-500/20 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs">💋 Malaya</p>
          <p className="text-pink-400 font-black">TZS {totalMalaya.toLocaleString()}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs">🎬 Video</p>
          <p className="text-blue-400 font-black">TZS {totalVideo.toLocaleString()}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs">🔴 Live</p>
          <p className="text-red-400 font-black">TZS {totalLive.toLocaleString()}</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs">🎁 Zawadi</p>
          <p className="text-orange-400 font-black">TZS {totalGifts.toLocaleString()}</p>
        </div>
      </div>

      {/* Daily chart */}
      <div className="content-box p-4 mb-4">
        <h4 className="text-white font-bold text-sm mb-3">📈 Mauzo ya Wiki Hii</h4>
        <div className="flex items-end gap-1.5 h-24">
          {dailyData.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-lg" style={{ height: `${Math.max(4, (d.total/maxDay)*80)}px`, background: d.total > 0 ? 'linear-gradient(to top,#FF1493,#ff69b4)' : 'rgba(255,255,255,0.1)' }} />
              <span className="text-[9px] text-gray-500">{d.label}</span>
              {d.total > 0 && <span className="text-[8px] text-primary font-bold">{d.total >= 1000 ? `${(d.total/1000).toFixed(1)}K` : d.total}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Date filter */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {(['all','today','week','month'] as const).map(f => (
          <button key={f} onClick={() => setDateFilter(f)} className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold ${
            dateFilter === f ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'
          }`}>
            {f === 'all' ? 'Wakati Wote' : f === 'today' ? 'Leo' : f === 'week' ? 'Wiki' : 'Mwezi'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : sales.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">💳</p><p>Hakuna mauzo bado</p>
          <p className="text-xs mt-1 text-gray-600">Pakia content kwenye TikSexy, Malaya au Video ili upate mapato</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sales.map(tx => (
            <div key={tx.id} className="content-box p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-white font-semibold text-sm">{typeLabel(tx.type)}</p>
                  {tx.description && <p className="text-gray-500 text-xs truncate mt-0.5">{tx.description}</p>}
                  <p className="text-gray-600 text-xs">{new Date(tx.created_at).toLocaleString('sw-TZ')}</p>
                </div>
                <p className="text-green-400 font-black text-lg">+TZS {tx.amount.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="h-4" />
    </div>
  );
}

export default function Wallet() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState<AppSettings>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [tab, setTab] = useState<'main' | 'deposit' | 'history' | 'gifts' | 'mauzo'>((searchParams.get('tab') as any) || 'main');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [amount, setAmount] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [depositDone, setDepositDone] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(searchParams.get('withdraw') === '1');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showSendGiftModal, setShowSendGiftModal] = useState(false);
  const [showLiveWithdrawModal, setShowLiveWithdrawModal] = useState(false);
  const [showLiveTransferModal, setShowLiveTransferModal] = useState(false);
  const [showLiveSendModal, setShowLiveSendModal] = useState(false);

  const [showGiftWithdrawModal, setShowGiftWithdrawModal] = useState(false);
  const [showGiftCardModal, setShowGiftCardModal] = useState(false);
  const [giftCardCode, setGiftCardCode] = useState('');
  const [redeemingCard, setRedeemingCard] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{success: boolean; message: string} | null>(null);

  const isBusiness = profile?.is_business || profile?.is_admin;
  const giftBalance = (profile as any)?.gift_balance || 0;
  const liveBalance = (profile as any)?.live_balance || 0;
  // Live balance always visible for all users

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchData();
  }, [user]);

  async function fetchData() {
    const { data: s } = await supabase.from('app_settings').select('*');
    const m: AppSettings = {}; s?.forEach((r: any) => { m[r.key] = r.value; }); setSettings(m);
    const { data: t } = await supabase.from('transactions').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(40);
    setTransactions((t || []) as Transaction[]);
    const { data: w } = await supabase.from('withdrawal_requests').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(10);
    setWithdrawals(w || []);
  }

  async function handleDeposit() {
    if (!screenshot) return toast.error('Pakia screenshot ya muamala');
    if (!amount || parseFloat(amount) <= 0) return toast.error('Andika kiasi cha pesa');
    if (!user) return;
    setUploading(true); setUploadPct(0);
    try {
      const { uploadFile } = await import('@/lib/supabase');
      const ext = screenshot.name.split('.').pop() || 'jpg';
      const screenshotUrl = await uploadFile('transactions', `screenshots/${user.id}/${Date.now()}.${ext}`, screenshot, (pct) => setUploadPct(pct));
      await supabase.from('transactions').insert({ user_id: user.id, amount: parseFloat(amount), type: 'deposit', status: 'pending', screenshot_url: screenshotUrl, description: `Weka pesa - TZS ${parseFloat(amount).toLocaleString()}` });
      await supabase.from('notifications').insert({ title: '💰 Ombi Jipya la Malipo', user_id: null, message: `${profile?.username} ameomba kuweka TZS ${parseFloat(amount).toLocaleString()}`, type: 'payment_request' });
      setDepositDone(true);
      toast.success('Ombi limetumwa! Admin atakagua hivi karibuni.');
    } catch { toast.error('Hitilafu ya kupakia. Angalia muunganisho wako.'); }
    finally { setUploading(false); }
  }

  const typeLabel = (type: string) => {
    const labels: Record<string, string> = { deposit: '➕ Weka Pesa', withdrawal: '➖ Toa Pesa', vip: '👑 VIP', business: '💼 Business', boost: '🚀 Boost', phone_view: '📞 Ona Namba', video_purchase: '🎬 Video', malaya_sale: '💋 Malaya', video_sale: '🎬 Malipo', gift_received: '🎁 Zawadi', gift_transfer: '↔️ Hamisha', boost_post: '🚀 Boost Post' };
    return labels[type] || type;
  };
  const isIncome = (type: string) => ['deposit', 'malaya_sale', 'video_sale', 'live_sale', 'gift_received'].includes(type);

  return (
    <div className="min-h-screen bg-background">
      <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => navigate(-1)} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-white font-bold text-xl flex-1">💰 Wallet</h1>
      </div>
      <div className="max-w-md mx-auto">

        {/* ── MAIN WALLET TAB ── */}
        {tab === 'main' && (
          <div className="px-4 space-y-4 py-2">
            {/* Live Balance card - single card below main balance */}
            <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#92400e,#d97706)' }}>
              <div className="flex items-center gap-3 mb-3">
                <Gift className="w-8 h-8 text-white" />
                <div>
                  <p className="text-white/70 text-xs uppercase tracking-wider">Salio la Zawadi</p>
                  <p className="text-white font-black text-3xl">TZS {giftBalance.toLocaleString()}</p>
                </div>
              </div>
              {/* Action buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setShowGiftWithdrawModal(true)} className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl bg-white/20 text-white font-semibold text-xs active:scale-95 transition-transform">
                  <ArrowDownCircle className="w-5 h-5" />Toa Pesa
                </button>
                <button onClick={() => setShowTransferModal(true)} className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl bg-white/20 text-white font-semibold text-xs active:scale-95 transition-transform">
                  <ArrowRightLeft className="w-5 h-5" />Hamisha
                </button>
                <button onClick={() => setShowSendGiftModal(true)} className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl bg-white/20 text-white font-semibold text-xs active:scale-95 transition-transform">
                  <Gift className="w-5 h-5" />Tuma Zawadi
                </button>
              </div>
            </div>

            {/* Main balance */}
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,#7C3AED,#FF1493)' }}>
              <p className="text-white/70 text-sm uppercase tracking-wider">Salio la Akaunti</p>
              <p className="text-white font-black text-3xl mt-1">TZS {(profile?.balance || 0).toLocaleString()}</p>
              {profile?.is_vip && <p className="text-white/60 text-xs mt-1">👑 VIP {profile.vip_expires_at ? `• Muda: ${new Date(profile.vip_expires_at).toLocaleDateString('sw-TZ')}` : ''}</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={() => setTab('deposit')} className="flex-1 py-2.5 rounded-xl bg-white/20 text-white font-bold text-sm flex items-center justify-center gap-1 active:scale-95">
                  <Upload className="w-4 h-4" /> Weka Pesa
                </button>
                {isBusiness && (
                  <button onClick={() => setShowWithdrawModal(true)} className="flex-1 py-2.5 rounded-xl bg-white text-purple-700 font-bold text-sm flex items-center justify-center gap-1 active:scale-95">
                    <ArrowDownCircle className="w-4 h-4" /> Toa Pesa
                  </button>
                )}
              </div>
            </div>

            {/* Live Balance card - always visible, below main balance */}
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,#7f1d1d,#dc2626)' }}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">🔴</span>
                <div>
                  <p className="text-white/70 text-xs uppercase tracking-wider">Salio la Live</p>
                  <p className="text-white font-black text-2xl">TZS {liveBalance.toLocaleString()}</p>
                  <p className="text-white/50 text-xs">Mapato ya ada za kuingia live</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setShowLiveWithdrawModal(true)} className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-white/20 text-white font-semibold text-xs active:scale-95 transition-transform">
                  <ArrowDownCircle className="w-4 h-4" />Toa Pesa
                </button>
                <button onClick={() => setShowLiveTransferModal(true)} className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-white/20 text-white font-semibold text-xs active:scale-95 transition-transform">
                  <ArrowRightLeft className="w-4 h-4" />Hamisha
                </button>
                <button onClick={() => setShowLiveSendModal(true)} className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-white/20 text-white font-semibold text-xs active:scale-95 transition-transform">
                  <Send className="w-4 h-4" />Tuma
                </button>
              </div>
            </div>

            {/* Gifts/rewards breakdown */}
            {giftBalance > 0 && (
              <div className="content-box p-4 space-y-2">
                <h3 className="text-white font-bold flex items-center gap-2"><Gift className="w-4 h-4 text-orange-400" /> Zawadi Zangu</h3>
                <div className="flex items-center justify-between py-2 border-b border-[#1a0a1a]">
                  <span className="text-gray-400 text-sm">💰 Pesa za Zawadi</span>
                  <span className="text-orange-400 font-bold">TZS {giftBalance.toLocaleString()}</span>
                </div>
                {/* VIP credits from gifts */}
                {profile?.is_vip && (
                  <div className="flex items-center justify-between py-2 border-b border-[#1a0a1a]">
                    <span className="text-gray-400 text-sm">👑 VIP Status</span>
                    <span className="text-yellow-400 font-bold text-sm">Hadi {profile.vip_expires_at ? new Date(profile.vip_expires_at).toLocaleDateString('sw-TZ') : 'Daima'}</span>
                  </div>
                )}
                <GiftCardCreditsDisplay userId={user?.id || ''} />
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setShowTransferModal(true)} className="flex-1 py-2 rounded-xl bg-orange-500/20 text-orange-300 font-semibold text-xs border border-orange-500/30">↔️ Hamisha</button>
                  <button onClick={() => setShowSendGiftModal(true)} className="flex-1 py-2 rounded-xl bg-orange-500/20 text-orange-300 font-semibold text-xs border border-orange-500/30">🎁 Tuma</button>
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setShowGiftCardModal(true)} className="content-box p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform">
                <span className="text-3xl">🎁</span>
                <span className="text-white text-sm font-semibold">Tumia Gift Card</span>
                <span className="text-gray-500 text-xs">Weka code ya zawadi</span>
              </button>
              <button onClick={() => setTab('history')} className="content-box p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform">
                <span className="text-3xl">📊</span>
                <span className="text-white text-sm font-semibold">Historia</span>
                <span className="text-gray-500 text-xs">Muamala wote</span>
              </button>
            </div>
          </div>
        )}

        {/* ── DEPOSIT TAB ── */}
        {tab === 'deposit' && (
          <div className="px-4 py-2">
            <button onClick={() => setTab('main')} className="text-primary text-sm mb-4 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Rudi</button>
            {depositDone ? (
              <div className="text-center py-10">
                <CheckCircle className="w-20 h-20 text-green-400 mx-auto mb-4" />
                <h3 className="text-white font-bold text-2xl mb-2">Ombi Limetumwa!</h3>
                <p className="text-gray-400 mb-6">Admin atakagua na kuthibitisha salio lako hivi karibuni.</p>
                <button onClick={() => { setDepositDone(false); setScreenshot(null); setScreenshotPreview(''); setAmount(''); fetchData(); }} className="btn-primary w-full">Tuma Ombi Lingine</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="gradient-card rounded-2xl p-4">
                  <p className="text-primary font-bold mb-3">Tuma pesa kwenye:</p>
                  <div className="space-y-2 text-sm">
                    {[['Mtandao', settings.payment_network || 'TIGOPESA'], ['Namba', settings.payment_number || '+255655299602'], ['Jina', settings.payment_name || 'MONICA MGAJI']].map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center"><span className="text-gray-400">{k}</span><span className="text-white font-bold">{v}</span></div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-gray-400 text-sm font-semibold mb-1 block">Kiasi cha Pesa</label>
                  <div className="relative"><input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Weka kiasi" className="input-field text-xl font-bold pr-16" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">TZS</span></div>
                </div>
                <div>
                  <label className="text-gray-400 text-sm font-semibold mb-1 block">Screenshot ya Muamala</label>
                  {screenshotPreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-primary/40 cursor-pointer" onClick={() => document.getElementById('ss-input')?.click()}>
                      <img src={screenshotPreview} alt="" className="w-full max-h-52 object-cover" />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"><p className="text-white font-bold bg-black/60 px-4 py-2 rounded-xl">Bonyeza kubadilisha</p></div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-primary/30 rounded-xl p-8 cursor-pointer hover:border-primary transition-colors" htmlFor="ss-input">
                      <Upload className="w-10 h-10 text-primary mb-2" /><span className="text-gray-400 font-semibold">Bonyeza Kupakia Screenshot</span>
                    </label>
                  )}
                  <input id="ss-input" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (!f) return; setScreenshot(f); setScreenshotPreview(URL.createObjectURL(f)); }} />
                </div>
                {uploading && <UploadProgress progress={uploadPct} fileSize={screenshot?.size} fileName={screenshot?.name} />}
                <button onClick={handleDeposit} disabled={uploading || !screenshot || !amount || parseFloat(amount) <= 0} className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2">
                  <Upload className="w-5 h-5" />{uploading ? `Inapakia ${Math.round(uploadPct)}%...` : 'Tuma Ombi la Malipo'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div className="px-4 py-2">
            <button onClick={() => setTab('main')} className="text-primary text-sm mb-4 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Rudi</button>
            <div className="space-y-3">
              {transactions.length === 0 ? (
                <div className="text-center py-16 text-gray-500"><p className="text-4xl mb-3">💳</p><p>Hakuna historia ya malipo bado</p></div>
              ) : transactions.map(t => (
                <div key={t.id} className="content-box p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white font-semibold">{typeLabel(t.type)}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{t.description || t.plan_name || ''}</p>
                      <p className="text-gray-500 text-xs">{new Date(t.created_at).toLocaleString('sw-TZ')}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-lg ${isIncome(t.type) ? 'text-green-400' : 'text-red-400'}`}>
                        {isIncome(t.type) ? '+' : '-'}TZS {t.amount.toLocaleString()}
                      </p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.status === 'approved' ? 'bg-green-500/20 text-green-400' : t.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {t.status === 'approved' ? '✓' : t.status === 'rejected' ? '✗' : '⏳'}
                      </span>
                    </div>
                  </div>
                  {t.screenshot_url && <button onClick={() => window.open(t.screenshot_url, '_blank')} className="text-primary text-xs underline mt-2">Angalia Screenshot</button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MAUZO TAB ── */}
        {tab === 'mauzo' && (
          <MauzaoTab userId={user?.id || ''} />
        )}

        {/* ── GIFT HISTORY TAB ── */}
        {tab === 'gifts' && (
          <GiftHistoryTab userId={user?.id || ''} />
        )}
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 py-3 flex gap-2" style={{ background: 'rgba(10,4,14,0.97)', borderTop: '1px solid rgba(255,20,147,0.2)', backdropFilter: 'blur(12px)' }}>
        {(['main', 'deposit', 'history', 'gifts', 'mauzo'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${tab === t ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
              {t === 'main' ? '💰 Wallet' : t === 'deposit' ? '➕ Weka' : t === 'history' ? '📊 Historia' : t === 'gifts' ? '🎁 Zawadi' : '💳 Mauzo'}
            </button>
          ))}
        </div>
        <div className="h-20" />
      </div>

      {showGiftWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={() => setShowGiftWithdrawModal(false)}>
          <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4"><h3 className="text-white font-bold text-lg flex items-center gap-2"><ArrowDownCircle className="w-5 h-5 text-orange-400" /> Toa Pesa za Zawadi</h3><button onClick={() => setShowGiftWithdrawModal(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="bg-orange-900/30 border border-orange-700/40 rounded-xl p-3 mb-4 text-center"><p className="text-gray-400 text-xs">Salio la Zawadi</p><p className="text-orange-300 font-black text-2xl">TZS {giftBalance.toLocaleString()}</p></div>
            {giftBalance <= 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm mb-4">Salio la zawadi ni sifuri. Pokea zawadi kwanza au hamisha pesa za Live/kuu kwenye zawadi.</p>
                <button onClick={() => setShowGiftWithdrawModal(false)} className="btn-primary w-full">Sawa</button>
              </div>
            ) : (
              <GiftWithdrawForm giftBalance={giftBalance} profile={profile} onClose={() => setShowGiftWithdrawModal(false)} onSuccess={() => { setShowGiftWithdrawModal(false); fetchData(); if (refreshProfile) refreshProfile(); }} />
            )}
          </div>
        </div>
      )}
      {showWithdrawModal && <WithdrawalModal profile={profile} settings={settings} onClose={() => setShowWithdrawModal(false)} onSuccess={() => { setShowWithdrawModal(false); fetchData(); if (refreshProfile) refreshProfile(); }} />}
      {showTransferModal && <TransferModal profile={profile} onClose={() => setShowTransferModal(false)} onSuccess={() => { setShowTransferModal(false); fetchData(); if (refreshProfile) refreshProfile(); }} />}
      {showSendGiftModal && <SendGiftModal profile={profile} onClose={() => setShowSendGiftModal(false)} onSuccess={() => { setShowSendGiftModal(false); fetchData(); if (refreshProfile) refreshProfile(); }} />}
      {showLiveWithdrawModal && <LiveWithdrawModal profile={profile} liveBalance={liveBalance} settings={settings} onClose={() => setShowLiveWithdrawModal(false)} onSuccess={() => { setShowLiveWithdrawModal(false); fetchData(); if (refreshProfile) refreshProfile(); }} />}
      {showLiveTransferModal && <LiveTransferModal profile={profile} liveBalance={liveBalance} onClose={() => setShowLiveTransferModal(false)} onSuccess={() => { setShowLiveTransferModal(false); fetchData(); if (refreshProfile) refreshProfile(); }} />}
      {showLiveSendModal && <LiveSendModal profile={profile} liveBalance={liveBalance} onClose={() => setShowLiveSendModal(false)} onSuccess={() => { setShowLiveSendModal(false); fetchData(); if (refreshProfile) refreshProfile(); }} />}

      {/* Gift Card Redemption Modal */}
      {showGiftCardModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => { setShowGiftCardModal(false); setRedeemResult(null); setGiftCardCode(''); }}>
          <div className="w-full max-w-sm bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-black text-xl flex items-center gap-2">🎁 Gift Card</h3>
              <button onClick={() => { setShowGiftCardModal(false); setRedeemResult(null); setGiftCardCode(''); }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            {redeemResult ? (
              <div className={`text-center py-6 ${redeemResult.success ? '' : ''}`}>
                <div className="text-5xl mb-4">{redeemResult.success ? '🎉' : '❌'}</div>
                <p className={`font-black text-lg mb-2 ${redeemResult.success ? 'text-green-400' : 'text-red-400'}`}>{redeemResult.success ? 'Imefanikiwa!' : 'Imeshindwa'}</p>
                <p className="text-gray-400 text-sm mb-5">{redeemResult.message}</p>
                <button onClick={() => { setRedeemResult(null); setGiftCardCode(''); }} className="btn-primary w-full">
                  {redeemResult.success ? 'Weka Code Nyingine' : 'Jaribu Tena'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-400 text-sm text-center">Weka code ya gift card uliyopewa na Admin</p>
                <input
                  value={giftCardCode}
                  onChange={e => setGiftCardCode(e.target.value.toUpperCase())}
                  placeholder="Mfano: ABC12345"
                  className="input-field text-center text-2xl font-mono tracking-[0.3em] py-4"
                  autoCapitalize="characters"
                  autoFocus
                />
                <button
                  onClick={async () => {
                    if (!giftCardCode.trim() || !user || !profile) return;
                    setRedeemingCard(true);
                    try {
                      const { data: gc } = await supabase.from('gift_cards').select('*').eq('code', giftCardCode.trim().toUpperCase()).eq('is_active', true).maybeSingle();
                      if (!gc) { setRedeemResult({ success: false, message: 'Kodi hii si sahihi au imeshatumika!' }); setRedeemingCard(false); return; }
                      if (gc.expires_at && new Date(gc.expires_at) < new Date()) { setRedeemResult({ success: false, message: 'Zawadi hii imeisha muda wake!' }); setRedeemingCard(false); return; }
                      const { data: existingUse } = await supabase.from('gift_card_uses').select('id').eq('card_id', gc.id).eq('user_id', user.id).maybeSingle();
                      if (existingUse) { setRedeemResult({ success: false, message: 'Umeshachukua zawadi hii tayari!' }); setRedeemingCard(false); return; }
                      if ((gc.use_count || 0) >= (gc.max_uses || 1)) { setRedeemResult({ success: false, message: 'Zawadi hii imeshafikiwa kikomo chake!' }); setRedeemingCard(false); return; }
                      let successMsg = '';
                      if (gc.type === 'balance') {
                        await supabase.from('user_profiles').update({ gift_balance: ((profile as any).gift_balance || 0) + gc.amount }).eq('id', user.id);
                        await supabase.from('transactions').insert({ user_id: user.id, amount: gc.amount, type: 'gift_received', status: 'approved', description: `Gift Card: TZS ${gc.amount?.toLocaleString()}` });
                        successMsg = `TZS ${gc.amount?.toLocaleString()} imeongezwa kwenye Gift Wallet yako!`;
                      } else if (gc.type === 'vip') {
                        const expDate = new Date(); expDate.setDate(expDate.getDate() + (gc.duration_days || 30));
                        await supabase.from('user_profiles').update({ is_vip: true, vip_plan: `Gift VIP`, vip_expires_at: expDate.toISOString() }).eq('id', user.id);
                        successMsg = `VIP Member kwa siku ${gc.duration_days || 30} umewashwa!`;
                      } else if (gc.type === 'unlock_video') {
                        const count = gc.unlock_video_count || gc.unlock_count || 1;
                        try { localStorage.setItem(`gift_video_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_video_credits_${user.id}`) || '0')) + count)); } catch {}
                        successMsg = `Unaweza kufungua video ${count} bila malipo!`;
                      } else if (gc.type === 'unlock_malaya') {
                        const count = gc.unlock_malaya_count || gc.unlock_count || 1;
                        try { localStorage.setItem(`gift_malaya_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_malaya_credits_${user.id}`) || '0')) + count)); } catch {}
                        successMsg = `Unaweza kuona namba ${count} za malaya bila malipo!`;
                      } else if (gc.type === 'unlock_live') {
                        const count = gc.unlock_live_count || gc.unlock_count || 1;
                        try { localStorage.setItem(`gift_live_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_live_credits_${user.id}`) || '0')) + count)); } catch {}
                        successMsg = `Unaweza kuingia Live Room ${count} mara bila malipo!`;
                      } else if (gc.type === 'blue_tick') {
                        await supabase.from('user_profiles').update({ blue_tick: gc.blue_tick_type || 'blue' }).eq('id', user.id);
                        successMsg = `Blue Tick (${gc.blue_tick_type || 'blue'}) imewekwa!`;
                      } else if (gc.type === 'download') {
                        const count = gc.download_count || 1;
                        try { localStorage.setItem(`gift_download_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_download_credits_${user.id}`) || '0')) + count)); } catch {}
                        successMsg = `Unaweza kudownload vitu ${count} bila malipo!`;
                      } else if (gc.type === 'withdraw') {
                        const count = gc.withdraw_count || 1;
                        try { localStorage.setItem(`gift_withdraw_credits_${user.id}`, String((parseInt(localStorage.getItem(`gift_withdraw_credits_${user.id}`) || '0')) + count)); } catch {}
                        successMsg = `Unaweza kutoa pesa mara ${count}!`;
                      } else { successMsg = `Zawadi ya ${gc.type} imefanikiwa!`; }
                      await supabase.from('gift_card_uses').insert({ card_id: gc.id, user_id: user.id });
                      await supabase.from('gift_cards').update({ use_count: (gc.use_count || 0) + 1, used_by: user.id, used_at: new Date().toISOString() }).eq('id', gc.id);
                      if (refreshProfile) await refreshProfile();
                      setRedeemResult({ success: true, message: successMsg });
                    } catch { setRedeemResult({ success: false, message: 'Hitilafu ya mfumo. Jaribu tena.' }); }
                    finally { setRedeemingCard(false); }
                  }}
                  disabled={!giftCardCode.trim() || redeemingCard}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                  {redeemingCard ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🎁'}
                  {redeemingCard ? 'Inakagua...' : 'Thibitisha Gift Card'}
                </button>
                <p className="text-gray-600 text-xs text-center">Code inapatikana kutoka kwa Admin tu</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
