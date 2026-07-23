import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, normalizePhone, phoneToEmail, getAllPhoneEmails, isAdminPhone } from '@/lib/supabase';
import { toast } from 'sonner';
import { Eye, EyeOff, Phone, Lock, User, Loader2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login: authLogin, user } = useAuth() as any;

  const [mode, setMode] = useState<'login' | 'signup'>(
    params.get('mode') === 'signup' || params.get('bonus') === '1' ? 'signup' : 'login'
  );
  const showBonus = params.get('bonus') === '1';
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  // ─── LOGIN ───────────────────────────────────────────────────────────────
  async function handleLogin() {
    const trimPhone = phone.trim();
    const trimPass = password.trim();
    if (!trimPhone) return toast.error('Weka namba ya simu');
    if (!trimPass) return toast.error('Weka password yako');
    if (trimPass.length < 6) return toast.error('Password lazima iwe herufi 6 au zaidi');
    setLoading(true);
    const emailVariants = getAllPhoneEmails(trimPhone);
    let successUser: any = null;
    for (const email of emailVariants) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: trimPass });
      if (!error && data?.user) { successUser = data.user; break; }
    }
    if (!successUser) {
      toast.error('Namba au password si sahihi. Kama hujasajili bonyeza JISAJILI.');
      setLoading(false); return;
    }
    const prof = await getOrCreateProfile(successUser, trimPhone);
    if (prof?.is_blocked) {
      await supabase.auth.signOut();
      toast.error('Akaunti yako imezuiwa. Wasiliana na admin.');
      setLoading(false); return;
    }
    authLogin(successUser, prof);
    toast.success('Karibu! Umeingia kwa mafanikio.');
    navigate('/');
  }

  // ─── SIGNUP ──────────────────────────────────────────────────────────────
  async function handleSignup() {
    const trimName = username.trim();
    const trimPhone = phone.trim();
    const trimPass = password.trim();
    if (!trimName) return toast.error('Weka jina lako');
    if (!trimPhone) return toast.error('Weka namba ya simu');
    if (!trimPass) return toast.error('Weka password');
    if (trimPass.length < 6) return toast.error('Password lazima iwe herufi 6 au zaidi');
    setLoading(true);
    const normalPhone = normalizePhone(trimPhone);
    const email = `${normalPhone}@slr.app`;
    const adminUser = isAdminPhone(trimPhone);
    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email, password: trimPass,
      options: { data: { username: trimName, phone: normalPhone }, emailRedirectTo: undefined }
    });
    if (signupError) {
      if (signupError.message.toLowerCase().includes('already registered') || signupError.message.toLowerCase().includes('user already')) {
        toast.info('Namba hii imeshasajiliwa. Inajaribu kuingia...');
        setMode('login'); setTimeout(() => handleLogin(), 100); return;
      }
      toast.error('Hitilafu ya usajili: ' + signupError.message);
      setLoading(false); return;
    }
    if (!signupData?.user) { toast.error('Hitilafu: Akaunti haijafunguliwa. Jaribu tena.'); setLoading(false); return; }
    const newUser = signupData.user;
    const refCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    let referrerId: string | null = null;
    const refParam = params.get('ref') || refCode;
    if (refParam) {
      const { data: referrer } = await supabase.from('user_profiles').select('id, referral_count').eq('referral_code', refParam).single();
      if (referrer) {
        referrerId = referrer.id;
        await supabase.from('user_profiles').update({ referral_count: (referrer.referral_count || 0) + 1 }).eq('id', referrer.id);
        await supabase.from('referrals').insert({ referrer_id: referrer.id, referred_id: newUser.id });
      }
    }
    const { data: prof, error: profError } = await supabase.from('user_profiles').upsert({
      id: newUser.id, username: trimName, email, phone: normalPhone,
      referral_code: refCode, referred_by: referrerId, is_admin: adminUser,
      balance: 0, referral_count: 0, phone_visible: false, is_vip: false, is_business: false, is_blocked: false, account_status: 'active',
    }).select().single();
    if (!profError && newUser) {
      const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({ email, password: trimPass });
      if (!loginErr && loginData?.user) {
        authLogin(loginData.user, prof as any);
        toast.success(`🎉 Karibu ${trimName}! Akaunti imefunguliwa!`);
        navigate('/'); return;
      }
    }
    if (signupData.session) {
      authLogin(newUser, prof as any);
      toast.success(`🎉 Karibu ${trimName}! Akaunti imefunguliwa!`);
      navigate('/');
    } else {
      toast.success('Akaunti imefunguliwa! Sasa ingia na namba na password yako.');
      setMode('login');
    }
    setLoading(false);
  }

  // ─── GOOGLE LOGIN ─────────────────────────────────────────────────────────
  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { access_type: 'offline', prompt: 'consent' }, skipBrowserRedirect: false }
    });
    if (error) toast.error('Google login imeshindwa: ' + error.message);
  }

  async function getOrCreateProfile(authUser: any, rawPhone: string) {
    const { data: existing } = await supabase.from('user_profiles').select('*').eq('id', authUser.id).single();
    if (existing) {
      if (isAdminPhone(rawPhone) && !existing.is_admin) {
        await supabase.from('user_profiles').update({ is_admin: true }).eq('id', authUser.id);
        existing.is_admin = true;
      }
      return existing;
    }
    const normalPhone = normalizePhone(rawPhone);
    const adminUser = isAdminPhone(rawPhone);
    const { data: newProf } = await supabase.from('user_profiles').upsert({
      id: authUser.id, username: `user_${normalPhone.slice(-4)}`,
      email: authUser.email || `${normalPhone}@slr.app`, phone: normalPhone,
      is_admin: adminUser, balance: 0, referral_code: Math.random().toString(36).substring(2, 10).toUpperCase(),
      referral_count: 0, phone_visible: false, is_vip: false, is_business: false, is_blocked: false, account_status: 'active',
    }).select().single();
    return newProf;
  }

  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a030f' }}>
      <div className="flex-1 flex flex-col justify-center px-6 py-8 max-w-md mx-auto w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">💋</div>
          <h2 className="text-white font-black text-2xl" style={{ textShadow: '0 0 30px #FF1493, 0 0 60px #FF1493' }}>
            SEXY LIVE ROOM
          </h2>
          {showBonus ? (
            <div className="mt-2 px-4 py-2 rounded-xl" style={{ background: 'rgba(255,20,147,0.1)', border: '1px solid rgba(255,20,147,0.3)' }}>
              <p className="text-primary font-black text-lg">🎁 Jisajili Upate Bonus!</p>
              <p className="text-gray-400 text-xs">Rafiki yako amekualika - Jisajili sasa upate zawadi</p>
            </div>
          ) : (
            <p className="text-gray-500 text-sm mt-1">
              {isLogin ? 'Ingia kwenye akaunti yako' : 'Fungua akaunti mpya bure'}
            </p>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-2xl p-1 mb-6" style={{ background: 'rgba(30,10,30,0.9)', border: '1px solid rgba(255,20,147,0.2)' }}>
          <button onClick={() => setMode('login')}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
            style={isLogin ? { background: 'linear-gradient(135deg,#FF1493,#C2185B)', color: 'white', boxShadow: '0 4px 15px rgba(255,20,147,0.4)' } : { color: '#9ca3af' }}>
            INGIA
          </button>
          <button onClick={() => setMode('signup')}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
            style={isSignup ? { background: 'linear-gradient(135deg,#FF1493,#C2185B)', color: 'white', boxShadow: '0 4px 15px rgba(255,20,147,0.4)' } : { color: '#9ca3af' }}>
            JISAJILI
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {isSignup && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input type="text" placeholder="Jina lako kamili" value={username} onChange={e => setUsername(e.target.value)}
                className="w-full rounded-2xl pl-12 pr-4 py-3.5 text-white text-sm focus:outline-none"
                style={{ background: 'rgba(26,8,26,0.9)', border: '1px solid rgba(255,20,147,0.25)' }} autoComplete="name" />
            </div>
          )}

          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input type="tel" placeholder="Namba ya simu (mfano: 0655299602)" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full rounded-2xl pl-12 pr-4 py-3.5 text-white text-sm focus:outline-none"
              style={{ background: 'rgba(26,8,26,0.9)', border: '1px solid rgba(255,20,147,0.25)' }} inputMode="tel" autoComplete="tel" />
          </div>
          {phone.trim().length >= 9 && (
            <p className="text-gray-600 text-xs px-2 -mt-2">Akaunti: {phoneToEmail(phone.trim())}</p>
          )}

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input type={showPw ? 'text' : 'password'} placeholder="Password (herufi 6+)" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { isLogin ? handleLogin() : handleSignup(); } }}
              className="w-full rounded-2xl pl-12 pr-12 py-3.5 text-white text-sm focus:outline-none"
              style={{ background: 'rgba(26,8,26,0.9)', border: '1px solid rgba(255,20,147,0.25)' }}
              autoComplete={isLogin ? 'current-password' : 'new-password'} />
            <button onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <button onClick={isLogin ? handleLogin : handleSignup} disabled={loading}
            className="w-full py-4 rounded-2xl font-black text-white text-lg transition-all active:scale-95 disabled:opacity-60"
            style={{ background: loading ? 'rgba(255,20,147,0.5)' : 'linear-gradient(135deg,#FF1493,#C2185B)', boxShadow: loading ? 'none' : '0 8px 25px rgba(255,20,147,0.4)' }}>
            {loading ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />Tafadhali subiri...</span>
            ) : isLogin ? '🔐 INGIA' : '🎉 JISAJILI SASA'}
          </button>

          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,20,147,0.2)' }} />
            <span className="text-gray-600 text-sm">au</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,20,147,0.2)' }} />
          </div>

          <button onClick={handleGoogleLogin} disabled={loading}
            className="w-full py-3.5 rounded-2xl font-semibold text-white flex items-center justify-center gap-3 transition-all active:scale-95"
            style={{ background: 'rgba(26,8,26,0.9)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Endelea na Google
          </button>
        </div>

        <p className="text-center text-gray-500 text-sm mt-6">
          {isLogin ? 'Bado huna akaunti? ' : 'Una akaunti tayari? '}
          <button onClick={() => setMode(isLogin ? 'signup' : 'login')} className="text-primary font-bold hover:underline">
            {isLogin ? 'Jisajili bure' : 'Ingia'}
          </button>
        </p>

        <div className="mt-4 p-3 rounded-xl text-center" style={{ background: 'rgba(255,20,147,0.05)', border: '1px solid rgba(255,20,147,0.1)' }}>
          <p className="text-gray-500 text-xs">
            💡 Tatizo la kuingia? Wasiliana na msaada kupitia{' '}
            <button onClick={async () => {
              const { data } = await supabase.from('app_settings').select('value').eq('key', 'whatsapp_support').single();
              const num = ((data?.value) || '+255655299602').replace(/\D/g, '');
              window.open(`https://wa.me/${num}`, '_blank');
            }} className="text-green-400 underline">WhatsApp</button>
          </p>
        </div>
      </div>
    </div>
  );
}
