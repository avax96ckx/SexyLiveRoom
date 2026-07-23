import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { globalUploadTracker } from '@/lib/supabase';
import { AppSettings } from '@/types';
import BlueTick from '@/components/features/BlueTick';
import { ArrowLeft, User, Crown, Briefcase, CheckCircle, Download, Globe, Bell, Moon, Sun, HelpCircle, LogOut, BookMarked, ChevronRight, Images, UploadCloud, Video, Image, PauseCircle, PlayCircle, RefreshCw, Phone, Gift, QrCode, Upload, X, Package } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const navigate = useNavigate();
  const { user, profile, logout, isAdmin } = useAuth();
  const { darkMode, toggleDarkMode, language, setLanguage } = useApp();
  const [settings, setSettings] = useState<AppSettings>({});
  const [showUploadView, setShowUploadView] = useState(false);
  const [myUploads, setMyUploads] = useState<any[]>([]);
  const [myCompletedUploads, setMyCompletedUploads] = useState<any[]>([]);
  const [uploadViewTab, setUploadViewTab] = useState<'active' | 'done'>('active');
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [callHistory, setCallHistory] = useState<any[]>([]);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const qrFileRef = useRef<HTMLInputElement>(null);
  const isBusiness = profile?.is_business || profile?.is_admin;

  useEffect(() => { fetchSettings(); }, []);

  useEffect(() => {
    if (!isBusiness || !showUploadView || !user) return;
    supabase.from('upload_sessions').select('*').eq('user_id', user.id).in('status', ['completed', 'failed']).order('completed_at', { ascending: false }).limit(30).then(({ data }) => {
      setMyCompletedUploads(data || []);
      setCompletedUploadsStore(data || []);
    });
  }, [showUploadView, user, isBusiness]);

  useEffect(() => {
    if (!isBusiness || !showUploadView || !user) return;
    const getMyLocalUploads = () => Array.from(globalUploadTracker.sessions.values()).filter(s => s.userId === user.id).map(s => ({ id: s.sessionId, file_name: s.fileName, file_size: s.fileSize, progress: s.progress, section: s.section, content_type: s.contentType, status: 'uploading', speed: globalUploadTracker.getSpeed(s.sessionId), isLocal: true }));
    const dbActiveRef = { current: [] as any[] };
    const rebuildList = () => { const local = getMyLocalUploads(); const localIds = new Set(local.map((u: any) => u.id)); const dbOnly = dbActiveRef.current.filter((u: any) => !localIds.has(u.id)).map((u: any) => ({ id: u.id, file_name: u.file_name, file_size: u.file_size || 0, progress: u.progress || 0, section: u.section, content_type: u.content_type, status: 'uploading', isLocal: false })); return [...local, ...dbOnly]; };
    const listener = () => setMyUploads(rebuildList());
    globalUploadTracker.listeners.add(listener);
    listener();
    const animInterval = setInterval(() => setMyUploads(rebuildList()), 200);
    const poll = setInterval(async () => {
      const { data: activeData } = await supabase.from('upload_sessions').select('*').eq('user_id', user.id).eq('status', 'uploading').order('started_at', { ascending: false }).limit(20);
      dbActiveRef.current = activeData || [];
      setMyUploads(rebuildList());
      const { data: done } = await supabase.from('upload_sessions').select('*').eq('user_id', user.id).in('status', ['completed', 'failed']).order('completed_at', { ascending: false }).limit(30);
      setMyCompletedUploads(done || []);
    }, 3000);
    return () => { globalUploadTracker.listeners.delete(listener); clearInterval(animInterval); clearInterval(poll); };
  }, [isBusiness, showUploadView, user]);

  async function fetchCallHistory() {
    if (!user) return;
    const { data, error } = await supabase
      .from('call_history')
      .select('*, caller:caller_id(id,username,avatar_url), receiver:receiver_id(id,username,avatar_url)')
      .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) console.error('Call history error:', error);
    setCallHistory(data || []);
  }

  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*');
    const m: AppSettings = {}; data?.forEach((r: any) => { m[r.key] = r.value; }); setSettings(m);
  }

  async function handleLogout() {
    await logout();
    navigate('/');
    toast.success('Umetoka kwenye akaunti');
  }

  // QR Scanner functions
  async function startQRCamera() {
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      toast.info('Camera imefunguliwa. Weka code hapa chini ukiisha kuscan.');
      // Auto-close camera after 15s
      setTimeout(() => stopQRCamera(), 15000);
    } catch {
      toast.error('Camera haipatikani. Tumia upload picha badala yake.');
      setCameraActive(false);
    }
  }

  function stopQRCamera() {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraActive(false);
  }

  function handleQRResult(code: string) {
    if (!code.trim()) return toast.error('Weka code au link');
    const origin = window.location.origin;
    const trimmed = code.trim();
    // Check if it's a URL from our website
    if (trimmed.includes(origin)) {
      const path = trimmed.replace(origin, '');
      setShowQRScanner(false); stopQRCamera(); setQrInput('');
      navigate(path || '/');
      toast.success('Inafungua ukurasa...');
    } else if (trimmed.startsWith('http')) {
      // External URL
      window.open(trimmed, '_blank');
      toast.success('Inafungua link...');
    } else if (/^[A-Z0-9]{6,20}$/.test(trimmed.toUpperCase())) {
      // Looks like a gift code
      setShowQRScanner(false); stopQRCamera(); setQrInput('');
      navigate('/gift');
      toast.info('Inaonekana kama Gift Code! Tumia kwenye Gift page.');
    } else if (trimmed.startsWith('/')) {
      // Relative path
      setShowQRScanner(false); stopQRCamera(); setQrInput('');
      navigate(trimmed);
    } else {
      toast.error('Code hii haijatambuliwa. Jaribu tena au andika link kamili.');
    }
  }

  const menuItems = [
    { icon: Crown, label: 'VIP Member', color: 'text-yellow-400', action: () => navigate('/services') },
    { icon: CheckCircle, label: 'Blue Tick', color: 'text-blue-400', action: () => navigate('/services') },
    { icon: Briefcase, label: 'Business Account', color: 'text-purple-400', action: () => navigate('/services') },
    { icon: BookMarked, label: language === 'sw' ? 'Zilizohifadhiwa' : 'Saved Items', color: 'text-green-400', action: () => navigate('/saved') },
    { icon: Images, label: '🖼️ Gallery & Downloads', color: 'text-purple-400', action: () => navigate('/downloads') },
    { icon: Phone, label: '📞 Historia ya Simu', color: 'text-green-400', action: () => { setShowCallHistory(true); fetchCallHistory(); } },
    { icon: Gift, label: '🎁 Gift Card / Zawadi', color: 'text-orange-400', action: () => navigate('/gift') },
    { icon: QrCode, label: '📷 Scan QR Code', color: 'text-blue-400', action: () => setShowQRScanner(true) },
    ...(isBusiness ? [{ icon: UploadCloud, label: '📤 Uploads Zangu', color: 'text-primary', action: () => setShowUploadView(true) }] : []),
    { icon: Download, label: 'Download APK', color: 'text-primary', action: () => { const url = settings.app_apk_url; if (url) window.open(url, '_blank'); else toast.info('App itapatikana hivi karibuni!'); } },
    { icon: Globe, label: language === 'sw' ? '🌐 Switch to English' : '🌐 Badilisha Kiswahili', color: 'text-cyan-400', action: () => { const newLang = language === 'sw' ? 'en' : 'sw'; setLanguage(newLang); toast.success(newLang === 'en' ? 'Language changed to English' : 'Lugha imebadilishwa: Kiswahili'); } },
    { icon: Bell, label: language === 'sw' ? 'Arifa' : 'Notifications', color: 'text-orange-400', action: () => navigate('/notifications') },
    { icon: darkMode ? Sun : Moon, label: darkMode ? '☀️ Mwanga (Light Mode)' : '🌙 Giza (Dark Mode)', color: 'text-gray-400', action: () => { toggleDarkMode(); toast.success(darkMode ? 'Light mode imewashwa!' : 'Dark mode imewashwa!'); } },
    { icon: HelpCircle, label: language === 'sw' ? 'Msaada wa WhatsApp' : 'WhatsApp Support', color: 'text-green-500', action: () => { const num = (settings.whatsapp_support || '+255773225088').replace(/\D/g, ''); window.open(`https://wa.me/${num}`, '_blank'); } },
  ];

  return (
    <div className="page-container">
      <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => navigate(-1)} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-white font-bold text-xl">{language === 'sw' ? 'Mipangilio' : 'Settings'}</h1>
      </div>

      <div className="max-w-md mx-auto">
        <div className="mx-4 mb-3">
          {user && profile ? (
            <button onClick={() => navigate('/profile/edit')} className="w-full flex items-center gap-4 p-4 content-box">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary">
                {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-bold text-2xl">{profile.username?.[0]?.toUpperCase()}</span></div>}
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2"><span className="text-white font-bold text-lg">{profile.username}</span>{profile.blue_tick && <BlueTick tickId={profile.blue_tick} size={16} />}</div>
                <p className="text-gray-400 text-sm">{profile.phone || profile.email}</p>
                <div className="flex gap-2 mt-1">
                  {profile.is_vip && <span className="vip-badge text-[9px]">VIP</span>}
                  {profile.is_business && <span className="text-[10px] bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded-full font-semibold">Business</span>}
                  {profile.is_admin && <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold">Admin</span>}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
          ) : (
            <button onClick={() => navigate('/login')} className="w-full flex items-center gap-4 p-4 content-box">
              <div className="w-16 h-16 rounded-full bg-[#1a0a1a] flex items-center justify-center"><User className="w-8 h-8 text-gray-500" /></div>
              <div className="text-left"><p className="text-white font-bold">{language === 'sw' ? 'Ingia au Jisajili' : 'Login or Sign Up'}</p><p className="text-gray-400 text-sm">{language === 'sw' ? 'Bonyeza hapa kuanza' : 'Tap here to start'}</p></div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {user && profile && (
          <button onClick={() => navigate('/wallet')} className="mx-4 mb-3 w-[calc(100%-2rem)] flex items-center justify-between p-4 content-box">
            <span className="text-gray-400">{language === 'sw' ? 'Salio la Akaunti' : 'Account Balance'}</span>
            <span className="text-primary font-bold text-lg">TZS {(profile.balance || 0).toLocaleString()}</span>
          </button>
        )}

        {/* ── Huduma Card ── */}
        <button onClick={() => navigate('/services')} className="mx-4 mb-3 w-[calc(100%-2rem)] overflow-hidden rounded-2xl" style={{ border: '1px solid rgba(255,20,147,0.25)' }}>
          <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a0030, #3d0b3d)' }}>
            {/* Top row: VIP + Business + BlueTick pills */}
            <div className="flex items-center gap-2 px-4 pt-3 pb-1">
              <div className="flex items-center gap-1.5 bg-yellow-400/15 border border-yellow-400/30 px-2.5 py-1 rounded-full">
                <span className="text-sm">👑</span>
                <span className="text-yellow-400 text-xs font-black">VIP Member</span>
              </div>
              <div className="flex items-center gap-1.5 bg-blue-400/15 border border-blue-400/30 px-2.5 py-1 rounded-full">
                <span className="text-sm">💼</span>
                <span className="text-blue-400 text-xs font-black">Business</span>
              </div>
              <div className="flex items-center gap-1.5 bg-green-400/15 border border-green-400/30 px-2.5 py-1 rounded-full">
                <span className="text-sm">✓</span>
                <span className="text-green-400 text-xs font-black">Blue Tick</span>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 pb-3 pt-1">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #FF1493, #7C3AED)' }}>
                <span className="text-lg">💋</span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-black text-sm">Huduma Zetu</p>
                <p className="text-gray-400 text-xs">VIP, Business, Blue Tick &amp; zaidi</p>
              </div>
              <div className="gradient-pink text-white text-xs font-black px-3 py-1.5 rounded-full flex-shrink-0">Angalia Zote</div>
            </div>
          </div>
        </button>

        {isAdmin && (
          <button onClick={() => navigate('/admin')} className="mx-4 mb-3 w-[calc(100%-2rem)] p-4 rounded-2xl flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#FF1493,#7C3AED)' }}>
            <span className="text-2xl">⚙️</span>
            <span className="text-white font-bold flex-1 text-left">{language === 'sw' ? 'Panel ya Admin' : 'Admin Panel'}</span>
            <ChevronRight className="w-5 h-5 text-white/60" />
          </button>
        )}

        <div className="mx-4 content-box divide-y divide-[#1a0a1a]">
          {menuItems.map((item, i) => (
            <button key={i} onClick={item.action} className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors">
              <item.icon className={`w-5 h-5 ${item.color}`} />
              <span className="text-white flex-1 text-left">{item.label}</span>
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          ))}
        </div>

        <div className="mx-4 mt-3 space-y-2">
          <button onClick={() => navigate('/support')} className="w-full p-4 rounded-2xl flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#FF1493,#C2185B)' }}>
            <HelpCircle className="w-5 h-5 text-white" />
            <span className="text-white font-bold">{language === 'sw' ? 'Msaada wa Moja kwa Moja' : 'Live Support'}</span>
          </button>
          {user && (
            <button onClick={handleLogout} className="w-full p-4 rounded-2xl border border-red-500/30 flex items-center gap-3 hover:bg-red-500/10 transition-colors">
              <LogOut className="w-5 h-5 text-red-400" />
              <span className="text-red-400 font-semibold">{language === 'sw' ? 'Toka' : 'Logout'}</span>
            </button>
          )}
        </div>
        <div className="h-8" />
      </div>

      {/* ── QR Scanner Modal ── */}
      {showQRScanner && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
            <button onClick={() => { setShowQRScanner(false); stopQRCamera(); setQrInput(''); }} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-white font-bold text-xl flex-1">📷 Scan QR Code</h1>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <div className="content-box p-5 space-y-4">
              <h3 className="text-white font-bold text-center">Scan QR Code ya SEXY LIVE ROOM</h3>
              <p className="text-gray-500 text-xs text-center">Inajulikana: Profile QR, Gift Card QR, na Links</p>

              {/* Camera */}
              {cameraActive ? (
                <div className="space-y-3">
                  <div className="relative">
                    <video ref={videoRef} className="w-full rounded-xl" style={{ maxHeight: '260px', background: '#000', objectFit: 'cover' }} playsInline muted />
                    {/* QR guide overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-40 h-40 border-2 border-primary rounded-2xl" style={{ boxShadow: '0 0 0 4000px rgba(0,0,0,0.4)' }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 text-sm font-semibold">Camera inafanya kazi...</span>
                  </div>
                  <button onClick={stopQRCamera} className="w-full btn-outline flex items-center justify-center gap-2 text-sm">
                    <X className="w-4 h-4" /> Funga Camera
                  </button>
                </div>
              ) : (
                <button onClick={startQRCamera} className="w-full py-8 rounded-xl border-2 border-dashed border-primary/30 flex flex-col items-center gap-3 text-primary hover:border-primary transition-colors active:scale-95">
                  <QrCode className="w-12 h-12" />
                  <span className="font-bold text-sm">Scan kwa Camera</span>
                  <span className="text-gray-500 text-xs">Bonyeza kufungua kamera ya scan</span>
                </button>
              )}

              <div className="flex items-center gap-3"><div className="flex-1 h-px bg-gray-700" /><span className="text-gray-500 text-xs">au</span><div className="flex-1 h-px bg-gray-700" /></div>

              {/* Upload QR image */}
              <button onClick={() => qrFileRef.current?.click()} className="btn-outline w-full flex items-center justify-center gap-2 py-3">
                <Upload className="w-4 h-4" /> Pakia Picha ya QR Code
              </button>
              <input ref={qrFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) toast.info('Picha imepakiwa. Andika code uliyoona kwenye QR hapa chini.'); }} />

              <div className="flex items-center gap-3"><div className="flex-1 h-px bg-gray-700" /><span className="text-gray-500 text-xs">au weka moja kwa moja</span><div className="flex-1 h-px bg-gray-700" /></div>

              {/* Manual code entry */}
              <div className="space-y-2">
                <label className="text-gray-400 text-xs font-semibold">Weka Code au Link:</label>
                <div className="flex gap-2">
                  <input
                    value={qrInput}
                    onChange={e => setQrInput(e.target.value)}
                    placeholder="Code, link, au /path..."
                    className="input-field flex-1 font-mono"
                    onKeyDown={e => e.key === 'Enter' && handleQRResult(qrInput)}
                    autoCapitalize="characters"
                  />
                  <button onClick={() => handleQRResult(qrInput)} className="gradient-pink text-white px-4 py-2 rounded-xl font-bold text-sm flex-shrink-0">
                    Go →
                  </button>
                </div>
              </div>
            </div>

            {/* Examples */}
            <div className="content-box p-4">
              <p className="text-gray-400 text-xs font-semibold mb-3">Mifano ya QR/Code:</p>
              <div className="space-y-2">
                {[
                  { icon: '🎁', label: 'Gift Card Code', example: 'ABC12345', action: () => { setQrInput('ABC12345'); } },
                  { icon: '👤', label: 'Profile Link', example: `${window.location.origin}/profile/...`, action: () => {} },
                  { icon: '🔗', label: 'App Link', example: `${window.location.origin}/live`, action: () => { setQrInput(`${window.location.origin}/live`); } },
                ].map((ex, i) => (
                  <button key={i} onClick={() => { setQrInput(ex.example); }} className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-colors text-left">
                    <span className="text-xl flex-shrink-0">{ex.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-semibold">{ex.label}</p>
                      <p className="text-gray-600 text-[10px] truncate">{ex.example}</p>
                    </div>
                    <span className="text-primary text-xs">Jaza</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload View Modal ── */}
      {showUploadView && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
            <button onClick={() => setShowUploadView(false)} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-white font-bold text-xl flex-1">📤 Uploads Zangu</h1>
          </div>
          <div className="px-4 pt-3 flex gap-2 flex-shrink-0">
            <button onClick={() => setUploadViewTab('active')} className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${uploadViewTab === 'active' ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
              <UploadCloud className="w-4 h-4" /> Zinaupload {myUploads.length > 0 && <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-white/20">{myUploads.length}</span>}
            </button>
            <button onClick={() => setUploadViewTab('done')} className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${uploadViewTab === 'done' ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400'}`}>
              ✓ Zilizokamilika {myCompletedUploads.length > 0 && <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${uploadViewTab === 'done' ? 'bg-white/20' : 'bg-green-500/20 text-green-400'}`}>{myCompletedUploads.length}</span>}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {uploadViewTab === 'active' && (
              <div className="space-y-2 mt-2">
                {myUploads.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-[#0d0d0d] rounded-2xl border border-[#2a0a2a]">
                    <UploadCloud className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="font-semibold">Hakuna uploads zinazoedelea sasa</p>
                  </div>
                ) : myUploads.map((u: any) => (
                  <div key={u.id} className="content-box p-3">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                        {u.content_type === 'video' ? <Video className="w-4 h-4 text-primary" /> : <Image className="w-4 h-4 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0"><p className="text-white font-semibold text-sm truncate">{u.file_name || 'Faili'}</p><p className="text-gray-500 text-xs">📂 {u.section || 'N/A'}</p></div>
                      <div className="flex gap-1">
                        {u.isLocal && (() => {
                          const s = globalUploadTracker.sessions.get(u.id);
                          if (s?.paused) return <button onClick={() => { globalUploadTracker.resume(u.id); toast.success('Upload imeendelea!'); }} className="p-1.5 bg-green-500/20 rounded-lg"><PlayCircle className="w-4 h-4 text-green-400" /></button>;
                          return <button onClick={() => { globalUploadTracker.pause(u.id); toast.info('Imesimamishwa!'); }} className="p-1.5 bg-yellow-500/20 rounded-lg"><PauseCircle className="w-4 h-4 text-yellow-400" /></button>;
                        })()}
                        <button onClick={() => {
                          globalUploadTracker.cancel(u.id);
                          setMyUploads(prev => prev.filter((x: any) => x.id !== u.id));
                          toast.success('Upload imesimamishwa!');
                        }} className="p-1.5 bg-red-500/20 rounded-lg"><X className="w-4 h-4 text-red-400" /></button>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1"><span className="text-primary font-bold">{Math.round(u.progress || 0)}%</span>{u.file_size > 0 && <span className="text-gray-500">{((u.file_size * (u.progress || 0) / 100) / 1024 / 1024).toFixed(1)} / {(u.file_size / 1024 / 1024).toFixed(1)} MB</span>}</div>
                      <div className="h-2 bg-[#1a0a1a] rounded-full overflow-hidden"><div className="h-full gradient-pink rounded-full transition-all" style={{ width: `${Math.max(2, u.progress || 0)}%` }} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {uploadViewTab === 'done' && (
              <div className="space-y-2 mt-2">
                {myCompletedUploads.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-[#0d0d0d] rounded-2xl border border-[#2a0a2a]">
                    <p className="font-semibold mt-2">Hakuna uploads zilizokamilika bado</p>
                  </div>
                ) : myCompletedUploads.map((u: any) => (
                  <div key={u.id} className="content-box p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#1a0a1a] flex-shrink-0 flex items-center justify-center">
                      {u.content_type === 'video' ? <Video className="w-5 h-5 text-gray-500" /> : <Image className="w-5 h-5 text-gray-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{u.file_name || 'Faili'}</p>
                      <span className={u.status === 'failed' ? 'text-red-400 text-xs' : 'text-green-400 text-xs'}>{u.status === 'failed' ? '✗ Imeshindwa' : '✓ Imekamilika'}</span>
                    </div>
                    {u.media_url && <button onClick={() => window.open(u.media_url, '_blank')} className="p-1.5 bg-primary/20 rounded-lg"><span className="text-primary text-sm">▶</span></button>}
                    <button onClick={() => {
                      setMyCompletedUploads(prev => prev.filter((x: any) => x.id !== u.id));
                      supabase.from('upload_sessions').delete().eq('id', u.id);
                      toast.success('Imefutwa!');
                    }} className="p-1.5 bg-red-500/20 rounded-lg"><X className="w-4 h-4 text-red-400" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Call History Modal ── */}
      {showCallHistory && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
            <button onClick={() => setShowCallHistory(false)} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-white font-bold text-xl flex-1">📞 Historia ya Simu</h1>
            <button onClick={fetchCallHistory} className="text-gray-400 p-2 rounded-xl hover:bg-white/5">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {callHistory.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <Phone className="w-16 h-16 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">Hakuna historia ya simu bado</p>
                <p className="text-xs mt-1 text-gray-600">Simu za video na audio zitaonekana hapa baada ya kupiga simu</p>
              </div>
            ) : callHistory.map((call: any) => {
              const isOutgoing = call.caller_id === user?.id;
              const other = isOutgoing ? call.receiver : call.caller;
              const statusColor = call.status === 'completed' ? 'text-green-400' : call.status === 'missed' ? 'text-red-400' : 'text-yellow-400';
              const statusLabel = call.status === 'completed' ? '✓ Ilishika' : call.status === 'missed' ? '✗ Haikushika' : '✗ Ilikataliwa';
              const otherId = isOutgoing ? call.receiver_id : call.caller_id;
              return (
                <div key={call.id} className="content-box p-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-primary/30 flex-shrink-0 relative">
                    {other?.avatar_url ? <img src={other.avatar_url} className="w-full h-full object-cover" alt="" /> :
                      <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-bold">{other?.username?.[0]?.toUpperCase() || '?'}</span></div>}
                    {/* Call type badge */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#0d0d0d] flex items-center justify-center">
                      <span className="text-[10px]">{call.call_type === 'video' ? '🎥' : '📞'}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{other?.username || 'Mtumiaji'}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-400 text-xs">{isOutgoing ? '↗ Ulipiga' : '↙ Alikupigia'}</span>
                      <span className={`text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
                    </div>
                    {call.duration_seconds > 0 && (
                      <p className="text-gray-500 text-xs">⏱ {Math.floor(call.duration_seconds / 60)}:{(call.duration_seconds % 60).toString().padStart(2, '0')}</p>
                    )}
                    <p className="text-gray-600 text-xs">{new Date(call.created_at).toLocaleString('sw-TZ')}</p>
                  </div>
                  <button onClick={() => { setShowCallHistory(false); navigate(`/profile/${otherId}`); }}
                    className="w-10 h-10 rounded-full gradient-pink flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform">
                    <Phone className="w-4 h-4 text-white" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
