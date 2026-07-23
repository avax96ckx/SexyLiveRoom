import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, uploadFile } from '@/lib/supabase';
import { BLUE_TICK_STYLES, AppSettings, VipPlan } from '@/types';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Eye, EyeOff, Share2, X, Crown, Lock, QrCode, Download, MessageSquare, Smartphone, Plus, Trash2, RefreshCw, ZoomIn } from 'lucide-react';

// ── Image Crop Modal ──────────────────────────────────────────────────────────
function ImageCropModal({ src, type, onConfirm, onCancel }: {
  src: string; type: 'avatar' | 'cover';
  onConfirm: (blob: Blob) => void; onCancel: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [lastPinchDist, setLastPinchDist] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const CROP_W = type === 'avatar' ? 260 : Math.min(window.innerWidth * 0.88, 320);
  const CROP_H = type === 'avatar' ? 260 : 160;

  function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

  function handleMouseDown(e: React.MouseEvent) { e.preventDefault(); setDragging(true); setLastPos({ x: e.clientX, y: e.clientY }); }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setOffset(p => ({ x: p.x + e.clientX - lastPos.x, y: p.y + e.clientY - lastPos.y }));
    setLastPos({ x: e.clientX, y: e.clientY });
  }
  function handleMouseUp() { setDragging(false); }
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) setLastPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    else if (e.touches.length === 2) setLastPinchDist(Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY));
  }
  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1) {
      setOffset(p => ({ x: p.x + e.touches[0].clientX - lastPos.x, y: p.y + e.touches[0].clientY - lastPos.y }));
      setLastPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    } else if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (lastPinchDist > 0) setScale(s => clamp(s * (d / lastPinchDist), 0.5, 5));
      setLastPinchDist(d);
    }
  }
  function handleWheel(e: React.WheelEvent) { e.preventDefault(); setScale(s => clamp(s - e.deltaY * 0.002, 0.5, 5)); }

  async function handleConfirm() {
    const img = imgRef.current; const containerEl = containerRef.current;
    if (!img || !containerEl) return;
    const containerRect = containerEl.getBoundingClientRect();
    const cW = containerRect.width; const cH = containerRect.height;
    const outW = type === 'avatar' ? 480 : 1200; const outH = type === 'avatar' ? 480 : 480;
    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d')!;
    const natW = img.naturalWidth; const natH = img.naturalHeight;
    const fitScale = Math.min(cW / natW, cH / natH);
    const dispW = natW * fitScale * scale; const dispH = natH * fitScale * scale;
    const imgLeft = cW/2 - dispW/2 + offset.x; const imgTop = cH/2 - dispH/2 + offset.y;
    const cropLeft = (cW - CROP_W) / 2; const cropTop = (cH - CROP_H) / 2;
    const srcX = (cropLeft - imgLeft) / dispW * natW; const srcY = (cropTop - imgTop) / dispH * natH;
    const srcW = CROP_W / dispW * natW; const srcH = CROP_H / dispH * natH;
    if (type === 'avatar') { ctx.beginPath(); ctx.arc(outW/2, outH/2, outW/2, 0, Math.PI*2); ctx.clip(); }
    ctx.drawImage(img, Math.max(0,srcX), Math.max(0,srcY), Math.min(srcW, natW - Math.max(0,srcX)), Math.min(srcH, natH - Math.max(0,srcY)), 0, 0, outW, outH);
    canvas.toBlob(blob => { if (blob) onConfirm(blob); }, 'image/jpeg', 0.92);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" style={{ touchAction: 'none' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <button onClick={onCancel} className="text-gray-400 font-semibold px-3 py-1.5">Ghairi</button>
        <h3 className="text-white font-bold text-sm">{type === 'avatar' ? '✂️ Kata Picha ya Profaili' : '✂️ Kata Cover'}</h3>
        <button onClick={handleConfirm} className="text-primary font-bold px-3 py-1.5">Thibitisha ✓</button>
      </div>
      <div ref={containerRef}
        className="flex-1 relative overflow-hidden bg-[#0a0a0a] flex items-center justify-center"
        style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onWheel={handleWheel}>
        <img ref={imgRef} src={src} alt="crop"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center', maxWidth: '100%', maxHeight: '100%', userSelect: 'none', pointerEvents: 'none', display: 'block' }} />
        {/* Crop overlay via box-shadow trick */}
        <div style={{
          position: 'absolute',
          left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: CROP_W, height: CROP_H,
          borderRadius: type === 'avatar' ? '50%' : 8,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.78)',
          border: '2px solid #FF1493',
          pointerEvents: 'none',
        }} />
      </div>
      <div className="px-6 py-3 flex items-center gap-3 flex-shrink-0 border-t border-white/10">
        <ZoomIn className="w-4 h-4 text-gray-400" />
        <input type="range" min="0.5" max="5" step="0.01" value={scale}
          onChange={e => setScale(parseFloat(e.target.value))}
          className="flex-1" style={{ accentColor: '#FF1493' }} />
        <span className="text-gray-400 text-xs w-10">{Math.round(scale*100)}%</span>
      </div>
      <p className="text-gray-600 text-xs text-center pb-3 flex-shrink-0">Buruta kupanisha · Pinch au Slider kupanua</p>
    </div>
  );
}
import BlueTick from '@/components/features/BlueTick';
import UploadProgress from '@/components/features/UploadProgress';
import PaymentModal from '@/components/features/PaymentModal';

export default function EditProfile() {
  const navigate = useNavigate();
  const { profile, user, refreshProfile } = useAuth();
  const [username, setUsername] = useState(profile?.username || '');
  const [usernameHandle, setUsernameHandle] = useState((profile as any)?.username_handle || '');
  const [handleError, setHandleError] = useState('');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp || '');
  const [phoneVisible, setPhoneVisible] = useState(profile?.phone_visible || false);
  const [password, setPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [walletPassword, setWalletPassword] = useState('');
  const [autoReply, setAutoReply] = useState((profile as any)?.auto_reply || '');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [showBlueTick, setShowBlueTick] = useState(false);
  const [showBlueTickShop, setShowBlueTickShop] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({});
  const [vipPlans, setVipPlans] = useState<VipPlan[]>([]);
  const [planToPay, setPlanToPay] = useState<{amount:number;name:string;type:string}|null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [coverUrl, setCoverUrl] = useState(profile?.cover_url || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [avatarPct, setAvatarPct] = useState(0);
  const [coverPct, setCoverPct] = useState(0);
  const [avatarSize, setAvatarSize] = useState(0);
  const [coverSize, setCoverSize] = useState(0);
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cropModal, setCropModal] = useState<{ src: string; type: 'avatar' | 'cover'; originalBlob: Blob } | null>(null);

  const isBusinessOrAdmin = profile?.is_business || profile?.is_admin;
  const profileUrl = `${window.location.origin}/profile/${user?.id}`;
  const [devices, setDevices] = useState<any[]>([]);
  const [showDevices, setShowDevices] = useState(false);
  const [deviceQR, setDeviceQR] = useState('');
  const [deviceQRExpiry, setDeviceQRExpiry] = useState(0);
  const deviceQRInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) navigate('/login');
    fetchSettings();
    if (user) fetchDevices();
  }, [user]);

  async function fetchDevices() {
    if (!user) return;
    const { data } = await supabase.from('user_sessions').select('*').eq('user_id', user.id).eq('is_active', true).order('last_active', { ascending: false });
    setDevices(data || []);
  }

  async function removeDevice(sessionId: string) {
    await supabase.from('user_sessions').update({ is_active: false }).eq('id', sessionId);
    fetchDevices();
    toast.success('Device imeondolewa!');
  }

  function generateDeviceQR() {
    if (!user) return;
    // Create a one-time auth token and store in DB
    const authToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiry = Date.now() + 60000;
    // Store in DB
    supabase.from('device_auth_tokens').insert({
      user_id: user.id,
      token: authToken,
      expires_at: new Date(expiry).toISOString(),
    }).then(({ error }) => {
      if (error) console.error('Token insert error:', error);
    });
    const token = btoa(JSON.stringify({ userId: user.id, authToken, exp: expiry }));
    const qrData = `${window.location.origin}/login?deviceQR=${encodeURIComponent(token)}`;
    setDeviceQR(`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrData)}&bgcolor=0a030f&color=FF1493`);
    setDeviceQRExpiry(60);
    if (deviceQRInterval.current) clearInterval(deviceQRInterval.current);
    deviceQRInterval.current = setInterval(() => {
      setDeviceQRExpiry(prev => {
        if (prev <= 1) { generateDeviceQR(); return 60; }
        return prev - 1;
      });
    }, 1000);
  }

  // Generate QR code using free QR API
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(profileUrl)}&bgcolor=0a030f&color=FF1493`;
  const handleQrUrl = usernameHandle ? `${window.location.origin}/u/${usernameHandle}` : profileUrl;
  const handleQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(handleQrUrl)}&bgcolor=0a030f&color=FF1493`;

  async function fetchSettings() {
    const { data: s } = await supabase.from('app_settings').select('*');
    const m: AppSettings = {}; s?.forEach((r:any) => { m[r.key]=r.value; }); setSettings(m);
    const { data: v } = await supabase.from('vip_plans').select('*').eq('is_active', true).order('display_order');
    setVipPlans((v||[]) as VipPlan[]);
  }

  async function uploadImage(file: File | Blob, type: 'avatar' | 'cover') {
    try {
      const ext = file instanceof File ? (file.name.split('.').pop() || 'jpg') : 'jpg';
      const path = `${type}s/${user!.id}/${type}_${Date.now()}.${ext}`;
      const bucket = 'avatars';
      const fileObj = file instanceof File ? file : new File([file], `${type}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      if (type === 'avatar') { setUploadingAvatar(true); setAvatarSize(fileObj.size); setAvatarPct(0); }
      else { setUploadingCover(true); setCoverSize(fileObj.size); setCoverPct(0); }
      const url = await uploadFile(bucket, path, fileObj, (pct) => {
        if (type === 'avatar') setAvatarPct(pct); else setCoverPct(pct);
      });
      if (type === 'avatar') { setAvatarUrl(url); await supabase.from('user_profiles').update({ avatar_url: url }).eq('id', user!.id); setUploadingAvatar(false); }
      else { setCoverUrl(url); await supabase.from('user_profiles').update({ cover_url: url }).eq('id', user!.id); setUploadingCover(false); }
      await refreshProfile();
      toast.success('Picha imebadilishwa!');
    } catch (err) {
      setUploadingAvatar(false); setUploadingCover(false);
      toast.error('Hitilafu ya upload. Jaribu tena.');
    }
  }

  async function handleSave() {
    if (!user || !username) return;
    setSaving(true);
    try {
      const updates: any = { username, phone, whatsapp, phone_visible: phoneVisible };
      if (walletPassword) updates.wallet_password = walletPassword;
      if (passcode) updates.app_passcode = passcode;
      if (isBusinessOrAdmin) updates.auto_reply = autoReply;
      // Validate and save username handle
      if (usernameHandle.trim()) {
        const clean = usernameHandle.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
        if (clean !== usernameHandle.trim()) { setHandleError('Tumia herufi ndogo, namba, _ au . tu'); setSaving(false); return; }
        if (clean.length < 3) { setHandleError('Username lazima iwe herufi 3 au zaidi'); setSaving(false); return; }
        // Check uniqueness
        const { data: existing } = await supabase.from('user_profiles').select('id').eq('username_handle', clean).neq('id', user.id).maybeSingle();
        if (existing) { setHandleError('Username hii imeshachukuliwa! Chagua nyingine.'); setSaving(false); return; }
        updates.username_handle = clean;
      } else {
        updates.username_handle = null;
      }
      await supabase.from('user_profiles').update(updates).eq('id', user.id);
      if (password) {
        if (!oldPassword) { toast.error('Weka password ya zamani kwanza'); setSaving(false); return; }
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email || '', password: oldPassword });
        if (signInErr) { toast.error('Password ya zamani si sahihi!'); setSaving(false); return; }
        await supabase.auth.updateUser({ password });
        toast.success('Password ya login imebadilishwa!');
      }
      // Save passcode to localStorage and DB for app lock
      if (passcode) {
        try { localStorage.setItem('slr_app_passcode', passcode); } catch {}
        // '0' = lock on every screen off/refresh (Telegram-style default)
        const mode = (() => { try { return localStorage.getItem('slr_passcode_timeout') || '0'; } catch { return '0'; } })();
        if (mode === '5' || mode === '1' || mode === '15' || mode === '60') {
          // keep existing mode
        } else {
          try { localStorage.setItem('slr_passcode_timeout', '0'); } catch {}
        }
      }
      // Clear passcode if emptied by user explicitly (passcode field cleared, not just left empty)
      // We don't clear automatically - use the toggle instead
      await refreshProfile();
      toast.success('Taarifa zimehifadhiwa!');
    } catch { toast.error('Hitilafu! Jaribu tena.'); }
    finally { setSaving(false); }
  }

  async function selectBlueTick(tickId: string) {
    if (!user) return;
    const hasTick = profile?.is_vip || profile?.is_admin || profile?.blue_tick;
    if (!hasTick) { setShowBlueTick(false); setShowBlueTickShop(true); return; }
    await supabase.from('user_profiles').update({ blue_tick: tickId }).eq('id', user.id);
    await refreshProfile();
    setShowBlueTick(false);
    toast.success('Blue tick imebadilishwa!');
  }

  async function shareProfile() {
    try {
      if (navigator.share) await navigator.share({ title: username, url: profileUrl });
      else { await navigator.clipboard.writeText(profileUrl); toast.success('Link imenakiliwa!'); }
    } catch { await navigator.clipboard.writeText(profileUrl).catch(() => {}); toast.info(`Link: ${profileUrl}`); }
  }

  async function downloadQR() {
    try {
      // Use canvas to create composite image: QR + avatar + username + link
      const canvas = document.createElement('canvas');
      const size = 600;
      canvas.width = size;
      canvas.height = size + 140;
      const ctx = canvas.getContext('2d')!;

      // Background
      ctx.fillStyle = '#0a030f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Pink border/glow
      ctx.strokeStyle = '#FF1493';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(16, 16, canvas.width - 32, canvas.height - 32, 24);
      ctx.stroke();

      // Load and draw QR code
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => resolve();
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=${encodeURIComponent(handleQrUrl)}&bgcolor=ffffff&color=0a030f&margin=10`;
        qrImg.src = qrUrl;
      });
      // White background for QR
      const qrX = (canvas.width - 480) / 2;
      const qrY = 50;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(qrX - 8, qrY - 8, 496, 496, 16);
      ctx.fill();
      if (qrImg.complete && qrImg.naturalWidth > 0) {
        ctx.drawImage(qrImg, qrX, qrY, 480, 480);
      }

      // Avatar in center of QR
      if (avatarUrl) {
        const avatarImg = new Image();
        avatarImg.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          avatarImg.onload = () => resolve();
          avatarImg.onerror = () => resolve();
          avatarImg.src = avatarUrl;
        });
        const av = 80;
        const avX = (canvas.width - av) / 2;
        const avY = qrY + (480 - av) / 2;
        // White circle background
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(avX + av/2, avY + av/2, av/2 + 6, 0, Math.PI * 2);
        ctx.fill();
        // Pink border
        ctx.strokeStyle = '#FF1493';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(avX + av/2, avY + av/2, av/2 + 3, 0, Math.PI * 2);
        ctx.stroke();
        // Clip and draw avatar
        ctx.beginPath();
        ctx.arc(avX + av/2, avY + av/2, av/2, 0, Math.PI * 2);
        ctx.clip();
        if (avatarImg.complete && avatarImg.naturalWidth > 0) {
          ctx.drawImage(avatarImg, avX, avY, av, av);
        } else {
          ctx.fillStyle = '#FF1493';
          ctx.fill();
        }
        ctx.restore();
      }

      // Username
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(username || 'Profile', canvas.width / 2, qrY + 480 + 50);

      // Handle
      if (usernameHandle) {
        ctx.fillStyle = '#FF1493';
        ctx.font = '24px system-ui, sans-serif';
        ctx.fillText('@' + usernameHandle, canvas.width / 2, qrY + 480 + 85);
      }

      // Link at bottom
      ctx.fillStyle = '#9ca3af';
      ctx.font = '18px monospace';
      const linkText = handleQrUrl.replace('https://', '');
      ctx.fillText(linkText.slice(0, 42) + (linkText.length > 42 ? '...' : ''), canvas.width / 2, qrY + 480 + 118);

      // Download
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${username || 'profile'}_qr.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('QR Code imedownload!');
    } catch (e) {
      console.error('QR download error:', e);
      // Fallback to API fetch
      try {
        const response = await fetch(handleQrCode);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `${username || 'profile'}_qr.png`;
        document.body.appendChild(link); link.click();
        document.body.removeChild(link); URL.revokeObjectURL(url);
        toast.success('QR Code imedownload!');
      } catch { window.open(handleQrCode, '_blank'); }
    }
  }

  async function shareQR() {
    try {
      // Build canvas image for sharing
      const canvas = document.createElement('canvas');
      const size = 600;
      canvas.width = size; canvas.height = size + 140;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0a030f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#FF1493'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(16, 16, canvas.width - 32, canvas.height - 32, 24); ctx.stroke();
      const qrImg = new Image(); qrImg.crossOrigin = 'anonymous';
      await new Promise<void>((res) => { qrImg.onload = () => res(); qrImg.onerror = () => res(); qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=${encodeURIComponent(handleQrUrl)}&bgcolor=ffffff&color=0a030f&margin=10`; });
      const qrX = (canvas.width - 480) / 2; const qrY = 50;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(qrX - 8, qrY - 8, 496, 496, 16); ctx.fill();
      if (qrImg.complete && qrImg.naturalWidth > 0) ctx.drawImage(qrImg, qrX, qrY, 480, 480);
      if (avatarUrl) {
        const avImg = new Image(); avImg.crossOrigin = 'anonymous';
        await new Promise<void>((res) => { avImg.onload = () => res(); avImg.onerror = () => res(); avImg.src = avatarUrl; });
        const av = 80; const avX = (canvas.width - av) / 2; const avY = qrY + (480 - av) / 2;
        ctx.save(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(avX + av/2, avY + av/2, av/2 + 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#FF1493'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(avX + av/2, avY + av/2, av/2 + 3, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(avX + av/2, avY + av/2, av/2, 0, Math.PI * 2); ctx.clip();
        if (avImg.complete && avImg.naturalWidth > 0) ctx.drawImage(avImg, avX, avY, av, av);
        ctx.restore();
      }
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(username || 'Profile', canvas.width / 2, qrY + 480 + 50);
      if (usernameHandle) { ctx.fillStyle = '#FF1493'; ctx.font = '24px system-ui, sans-serif'; ctx.fillText('@' + usernameHandle, canvas.width / 2, qrY + 480 + 85); }
      ctx.fillStyle = '#9ca3af'; ctx.font = '18px monospace';
      ctx.fillText(handleQrUrl.replace('https://', '').slice(0, 42), canvas.width / 2, qrY + 480 + 118);
      // Convert to blob and share
      const dataUrl = canvas.toDataURL('image/png');
      const res = await fetch(dataUrl); const blob = await res.blob();
      const file = new File([blob], `${username || 'profile'}_qr.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `QR ya ${username}`, text: handleQrUrl, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: `Profaili ya ${username}`, url: handleQrUrl });
      } else {
        await navigator.clipboard.writeText(handleQrUrl);
        toast.success('Link imenakiliwa: ' + handleQrUrl);
      }
    } catch { toast.info('Link: ' + handleQrUrl); }
  }

  async function copyHandle() {
    const handle = usernameHandle ? `@${usernameHandle}` : profileUrl;
    try { await navigator.clipboard.writeText(handle); toast.success('Imenakiliwa: ' + handle); }
    catch { toast.info(handle); }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="top-bar px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
          <h1 className="text-white font-bold text-lg">Hariri Profaili</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowQR(true)} className="text-gray-400 hover:text-primary" title="QR Code" aria-label="QR Code"><QrCode className="w-5 h-5" /></button>
          <button onClick={shareProfile} className="text-gray-400 hover:text-primary"><Share2 className="w-5 h-5" /></button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-4 py-2">
            {saving ? 'Inahifadhi...' : 'Hifadhi'}
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto">
        {/* Cover Photo */}
        <div className="relative h-40 bg-[#1a0a1a] cursor-pointer group" onClick={() => coverRef.current?.click()}>
          {coverUrl ? <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" /> :
            <div className="w-full h-full flex items-center justify-center gradient-card"><Camera className="w-10 h-10 text-gray-500" /></div>}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="w-8 h-8 text-white" />
          </div>
          <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={e => {
            const f = e.target.files?.[0]; if (!f) return;
            const src = URL.createObjectURL(f);
            setCropModal({ src, type: 'cover', originalBlob: f });
            e.target.value = '';
          }} />
        </div>
        {uploadingCover && <div className="mx-4 mt-2"><UploadProgress progress={coverPct} fileSize={coverSize} fileName="Cover Photo" /></div>}

        {/* Avatar */}
        <div className="px-4 -mt-12 mb-4 flex items-end gap-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-3 border-background overflow-hidden cursor-pointer" style={{ border: '3px solid #FF1493' }} onClick={() => avatarRef.current?.click()}>
              {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> :
                <div className="w-full h-full gradient-pink flex items-center justify-center">
                  <span className="text-white font-bold text-3xl">{username?.[0]?.toUpperCase() || '?'}</span>
                </div>}
            </div>
            <button onClick={() => avatarRef.current?.click()} className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </button>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={e => {
              const f = e.target.files?.[0]; if (!f) return;
              const src = URL.createObjectURL(f);
              setCropModal({ src, type: 'avatar', originalBlob: f });
              e.target.value = '';
            }} />
          </div>
          <div className="flex-1 flex items-center gap-2 mt-4">
            <span className="text-white font-bold text-lg">{username || 'Jina'}</span>
            {profile?.blue_tick && <BlueTick tickId={profile.blue_tick} size={18} />}
            {profile?.blue_tick && (() => {
              const storageKey = `bt_expiry_${user?.id}`;
              const stored = localStorage.getItem(storageKey);
              if (stored) {
                const exp = new Date(stored);
                const now = new Date();
                const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (daysLeft <= 0) return <span className="text-red-400 text-[10px] font-semibold">⚠️ Imeisha</span>;
                return <span className="text-yellow-400 text-[10px] font-semibold">⏰ {daysLeft} siku</span>;
              }
              return <span className="text-green-400 text-[10px] font-semibold">♾️ Milele</span>;
            })()}
          </div>
        </div>
        {uploadingAvatar && <div className="mx-4 mb-2"><UploadProgress progress={avatarPct} fileSize={avatarSize} fileName="Profile Photo" /></div>}

        <div className="px-4 space-y-4">
          {/* 1. Jina */}
          <div>
            <label className="text-gray-400 text-sm font-semibold mb-2 block">Jina</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Jina lako" className="input-field" />
          </div>

          {/* 2. Username Handle */}
          <div>
            <label className="text-gray-400 text-sm font-semibold mb-2 block">Username (Handle)</label>
            <div className="relative">
              <input type="text" value={usernameHandle} onChange={e => { setUsernameHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '')); setHandleError(''); }} placeholder="username_wako" className="input-field" autoCapitalize="none" />
            </div>
            {handleError && <p className="text-red-400 text-xs mt-1">{handleError}</p>}
            {usernameHandle && !handleError && (
              <div className="mt-1 flex items-center gap-2">
                <p className="text-gray-500 text-xs flex-1">Link: <span className="text-primary">{window.location.origin}/u/{usernameHandle}</span></p>
                <button onClick={copyHandle} className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/30 font-semibold flex-shrink-0">📋 Nakili</button>
              </div>
            )}
            <p className="text-gray-600 text-xs mt-1">Watu wanaandika @{usernameHandle || 'jinalako'} kwenye app watapelekwa kwenye profaili yako</p>
          </div>

          {/* 3. Namba ya Simu */}
          <div>
            <label className="text-gray-400 text-sm font-semibold mb-2 block">Namba ya Simu</label>
            <div className="relative">
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Namba yako" className="input-field pr-12" />
              <button onClick={() => setPhoneVisible(!phoneVisible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary">
                {phoneVisible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-1">{phoneVisible ? 'Namba inaonekana kwa wote' : 'Namba imefichwa (VIP tu wanaona)'}</p>
          </div>

          {/* 4. WhatsApp */}
          <div>
            <label className="text-gray-400 text-sm font-semibold mb-2 block">WhatsApp</label>
            <input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="Namba ya WhatsApp" className="input-field" />
          </div>

          {/* 5. Auto-Reply - business/admin only */}
          {isBusinessOrAdmin && (
            <div>
              <label className="text-gray-400 text-sm font-semibold mb-2 block flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Ujumbe wa Otomatiki (Auto-Reply)
              </label>
              <textarea
                value={autoReply}
                onChange={e => setAutoReply(e.target.value)}
                placeholder="Mfano: Habari! Niko busy sasa, nitarudi hivi karibuni. Unaweza kuwasiliana nami kwa WhatsApp..."
                className="input-field min-h-[80px] resize-none text-sm"
              />
              <p className="text-gray-500 text-xs mt-1">
                💬 Mtu akituma ujumbe wa kwanza kwako, atajibiwa otomatiki na ujumbe huu. (Business/Admin tu)
              </p>
            </div>
          )}

          {/* 6. Blue Tick */}
          <div>
            <label className="text-gray-400 text-sm font-semibold mb-2 block">Blue Tick</label>
            <div className="p-3 bg-[#1a0a1a] rounded-xl border border-[#3d0b3d] mb-2">
              <p className="text-gray-400 text-xs mb-2 text-center">Chagua stili yako ya Blue Tick:</p>
              <div className="grid grid-cols-4 gap-2">
                {BLUE_TICK_STYLES.map(style => (
                  <button key={style.id} onClick={() => selectBlueTick(style.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${profile?.blue_tick === style.id ? 'bg-primary/20 border border-primary' : 'hover:bg-white/5 border border-transparent'}`}>
                    <BlueTick tickId={style.id} size={26} />
                    <span className="text-[10px] text-gray-400 text-center leading-tight">{style.label}</span>
                  </button>
                ))}
              </div>
              {!(profile?.is_vip || profile?.is_admin || profile?.blue_tick) && (
                <div className="mt-3 text-center">
                  <p className="text-gray-500 text-xs mb-2">🔒 Inahitaji VIP au Blue Tick</p>
                  <button onClick={() => setShowBlueTickShop(true)} className="gradient-pink text-white text-xs font-bold px-4 py-2 rounded-xl">Lipia Blue Tick</button>
                </div>
              )}
            </div>
            {profile?.blue_tick && (
              <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-xl">
                <BlueTick tickId={profile.blue_tick} size={20} />
                <span className="text-primary text-sm font-semibold">{BLUE_TICK_STYLES.find(s=>s.id===profile.blue_tick)?.label||'Imechaguliwa'}</span>
              </div>
            )}
          </div>

          {/* 7. Passcode Lock */}
          <div className="content-box p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-5 h-5 text-primary" />
              <span className="text-white font-bold">Kufuli ya App (Passcode)</span>
            </div>
            <p className="text-gray-400 text-xs">Weka namba ya siri ya kufungua app kila ukiingia au ukitoka</p>

            {/* On/Off toggle */}
            {(() => {
              const currentPasscode = (() => { try { return localStorage.getItem('slr_app_passcode') || (profile as any)?.app_passcode || ''; } catch { return ''; } })();
              const isEnabled = !!currentPasscode;
              return (
                <div className="flex items-center justify-between p-3 bg-[#1a0a1a] rounded-xl">
                  <div>
                    <p className="text-gray-300 text-sm font-semibold">{isEnabled ? '🔒 Passcode Imewashwa' : '🔓 Passcode Imezimwa'}</p>
                    <p className="text-gray-500 text-xs">{isEnabled ? `PIN: ${'*'.repeat(currentPasscode.length)}` : 'Bonyeza kuwasha'}</p>
                  </div>
                  <button onClick={async () => {
                    if (isEnabled) {
                      if (!window.confirm('Zima passcode? Hatutahitaji PIN kuingia.')) return;
                      try { localStorage.removeItem('slr_app_passcode'); } catch {}
                      await supabase.from('user_profiles').update({ app_passcode: null }).eq('id', user!.id);
                      await refreshProfile();
                      setPasscode('');
                      toast.success('Passcode imezimwa!');
                      window.location.reload();
                    } else {
                      toast.info('Weka PIN chini halafu bonyeza Hifadhi');
                    }
                  }} className={`w-12 h-6 rounded-full transition-colors flex items-center ${isEnabled ? 'bg-primary' : 'bg-gray-600'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isEnabled ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
              );
            })()}

            <div className="relative">
              <input
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={e => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="PIN mpya ya namba 4-6 (acha wazi kubaki sawa)"
                className="input-field pr-12"
                inputMode="numeric"
                maxLength={6}
              />
              <button onClick={() => setShowPasscode(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Timeout settings */}
            <div>
              <label className="text-gray-400 text-xs font-semibold mb-2 block">⏰ Funga Lini? ({(() => {
                const t = (() => { try { return localStorage.getItem('slr_passcode_timeout') || '0'; } catch { return '0'; } })();
                return t === '0' ? 'Kila wakati (Default)' : t === '9999' ? 'Kamwe' : `Baada ya dakika ${t}`;
              })()})</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Kila Wakati', val: '0' },
                  { label: 'Dakika 1', val: '1' },
                  { label: 'Dakika 5', val: '5' },
                  { label: 'Dakika 15', val: '15' },
                  { label: 'Saa 1', val: '60' },
                  { label: 'Kamwe', val: '9999' },
                ].map(opt => {
                  const current = (() => { try { return localStorage.getItem('slr_passcode_timeout') || '0'; } catch { return '0'; } })();
                  return (
                    <button key={opt.val} onClick={() => {
                      try { localStorage.setItem('slr_passcode_timeout', opt.val); } catch {}
                      toast.success(`Muda: ${opt.label}`);
                      // Force re-render
                      setPasscode(p => p);
                    }} className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                      current === opt.val ? 'gradient-pink text-white' : 'bg-[#1a0a1a] text-gray-400 border border-gray-700'
                    }`}>{opt.label}</button>
                  );
                })}
              </div>
              <p className="text-gray-600 text-xs mt-1">💡 "Kila Wakati" = inafunga kila ukizima screen au kurefresh page (kama Telegram)</p>
            </div>
          </div>

          {/* 8. QR Code */}
          <div className="content-box p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <QrCode className="w-5 h-5 text-primary" />
              <span className="text-white font-bold">QR Code ya Profaili</span>
            </div>
            <p className="text-gray-400 text-xs">Mtu akiscan QR code hii atapelekwa moja kwa moja kwenye profaili yako</p>
            <div className="flex gap-2">
              <button onClick={() => setShowQR(true)} className="flex-1 py-2.5 rounded-xl bg-primary/20 text-primary font-bold text-sm border border-primary/30 flex items-center justify-center gap-2">
                <QrCode className="w-4 h-4" /> Angalia
              </button>
              <button onClick={downloadQR} className="flex-1 py-2.5 rounded-xl bg-[#1a0a1a] text-gray-300 font-bold text-sm border border-gray-700 flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> Download
              </button>
              <button onClick={shareQR} className="flex-1 py-2.5 rounded-xl bg-green-600/20 text-green-400 font-bold text-sm border border-green-600/30 flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4" /> Share
              </button>
            </div>
          </div>

          {/* 9. Password ya Zamani */}
          <div>
            <label className="text-gray-400 text-sm font-semibold mb-2 block">Password ya Zamani (inahitajika kubadilisha)</label>
            <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="Weka password yako ya sasa" className="input-field" />
          </div>

          {/* 10. Password Mpya */}
          <div>
            <label className="text-gray-400 text-sm font-semibold mb-2 block">Password Mpya ya Login (acha wazi kama hutabadilisha)</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password mpya ya kuingia" className="input-field" />
          </div>

          {/* 11. Wallet Password */}
          <div>
            <label className="text-gray-400 text-sm font-semibold mb-2 block">Password ya Wallet (kutoa pesa)</label>
            <input type="password" value={walletPassword} onChange={e => setWalletPassword(e.target.value)} placeholder="Weka au badilisha password ya wallet" className="input-field" />
            <p className="text-gray-500 text-xs mt-1">Inatumika unapotoa pesa kama Business Account</p>
          </div>

          {/* 12. Device Management */}
          <div className="content-box p-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-400" />
                <span className="text-white font-bold">Vifaa vyangu (Devices)</span>
              </div>
              <button onClick={() => { setShowDevices(true); fetchDevices(); }} className="text-xs text-blue-400 font-semibold">Angalia Zote</button>
            </div>
            <p className="text-gray-400 text-xs">Ongeza kifaa kipya au angalia vifaa vyote vilivyoingia kwenye akaunti yako</p>
            <button onClick={() => { setShowDevices(true); fetchDevices(); generateDeviceQR(); }}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-sm"
              style={{ background: 'linear-gradient(135deg,#1565C0,#1976D2)' }}>
              <Plus className="w-4 h-4 text-white" />
              <span className="text-white">Ongeza Device Mpya (QR)</span>
            </button>
          </div>

          <div className="p-4 rounded-xl bg-[#1a0a1a] border border-[#3d0b3d] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">VIP Member</span>
              <span className={`text-sm font-bold ${profile?.is_vip ? 'text-yellow-400' : 'text-gray-500'}`}>{profile?.is_vip ? '✓ Ndiyo' : 'Hapana'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Business Account</span>
              <span className={`text-sm font-bold ${profile?.is_business ? 'text-blue-400' : 'text-gray-500'}`}>{profile?.is_business ? '✓ Ndiyo' : 'Hapana'}</span>
            </div>
            {profile?.is_admin && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Admin</span>
                <span className="text-primary text-sm font-bold">✓ Ndiyo</span>
              </div>
            )}
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
            {saving ? 'Inahifadhi...' : 'HIFADHI MABADILIKO'}
          </button>
        </div>
        <div className="h-8" />
      </div>

      {/* QR Code Modal - Telegram style */}
      {showQR && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setShowQR(false)}>
          <div className="bg-[#0d0d0d] border border-[#3d0b3d] rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">QR Code ya Profaili</h3>
              <button onClick={() => setShowQR(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {/* Telegram-style QR with avatar in center */}
            <div className="relative mx-auto w-fit mb-4">
              <div className="bg-white p-4 rounded-2xl shadow-2xl">
                <img src={handleQrCode} alt="QR Code" className="w-56 h-56" />
              </div>
              {/* Profile picture overlay in center of QR */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border-3 border-white overflow-hidden" style={{ border: '3px solid white', boxShadow: '0 0 0 2px #FF1493' }}>
                {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" alt="" /> :
                  <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-black text-xl">{username?.[0]?.toUpperCase() || '?'}</span></div>}
              </div>
            </div>
            {/* Username display */}
            <div className="mb-4">
              <p className="text-white font-black text-xl">{username}</p>
              {usernameHandle && <p className="text-primary text-sm font-semibold">@{usernameHandle}</p>}
              <p className="text-gray-500 text-xs mt-1">Scan QR code hii kwenye SEXY LIVE ROOM</p>
            </div>
            <div className="flex gap-2">
              <button onClick={downloadQR} className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm">
                <Download className="w-4 h-4" /> Download
              </button>
              <button onClick={copyHandle} className="flex-1 btn-outline flex items-center justify-center gap-2 text-sm">
                <span>📋</span> Nakili
              </button>
              <button onClick={shareQR} className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-green-600/20 text-green-400 border border-green-600/30 text-sm font-semibold">
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blue Tick Purchase Modal */}
      {showBlueTickShop && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={() => setShowBlueTickShop(false)}>
          <div className="w-full max-w-md bg-[#0d0d0d] border border-[#3d0b3d] rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white font-black text-xl">✓ Nunua Blue Tick</h2>
              <button onClick={() => setShowBlueTickShop(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-4 p-3 bg-[#1a0a1a] rounded-xl">
              {BLUE_TICK_STYLES.map(s => (
                <div key={s.id} className="flex flex-col items-center gap-1 p-2">
                  <BlueTick tickId={s.id} size={28} />
                  <span className="text-[9px] text-gray-400 text-center leading-tight">{s.label}</span>
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-sm mb-4 text-center">Lipia Blue Tick mara moja - chagua stili yoyote</p>
            <div className="space-y-3">
              <div className="content-box p-4">
                <div className="flex justify-between items-center mb-3">
                  <div><p className="text-white font-black text-lg">Blue Tick</p><p className="text-gray-400 text-sm">Mwezi mmoja</p></div>
                  <p className="text-primary font-black text-xl">TZS {parseInt(settings.blue_tick_price||'1000').toLocaleString()}</p>
                </div>
                <button onClick={() => { setPlanToPay({amount: parseInt(settings.blue_tick_price||'1000'), name:'Blue Tick (Mwezi 1)', type:'blue_tick'}); setShowBlueTickShop(false); }} className="btn-primary w-full">Lipia Blue Tick</button>
              </div>
              <div className="content-box p-4" style={{border:'1px solid rgba(255,215,0,0.3)'}}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2"><Crown className="w-5 h-5 text-yellow-400" /><p className="text-yellow-400 font-black">VIP Member</p></div>
                  <p className="text-primary font-black text-sm">Pamoja na Blue Tick!</p>
                </div>
                {vipPlans.map(plan => (
                  <button key={plan.id} onClick={() => { setPlanToPay({amount:plan.price,name:plan.name,type:'vip'}); setShowBlueTickShop(false); }} className="w-full flex justify-between items-center py-2 border-b border-[#1a0a1a] last:border-0">
                    <span className="text-white text-sm">{plan.name}</span>
                    <span className="text-primary font-bold text-sm">TZS {plan.price.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Device Management Modal */}
      {showDevices && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
            <button onClick={() => { setShowDevices(false); if (deviceQRInterval.current) clearInterval(deviceQRInterval.current); }} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-white font-bold text-xl flex-1">📱 Vifaa Vyangu</h1>
            <button onClick={() => { generateDeviceQR(); fetchDevices(); }} className="text-gray-400 p-2"><RefreshCw className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* QR Code for adding new device */}
            <div className="content-box p-5 text-center">
              <h3 className="text-white font-bold mb-2">Ongeza Device Mpya</h3>
              <p className="text-gray-400 text-xs mb-3">Scan QR code hii kwa simu nyingine ili login otomatiki</p>
              {deviceQR ? (
                <div className="relative inline-block">
                  <div className="bg-white p-3 rounded-2xl inline-block">
                    <img src={deviceQR} alt="Device QR" className="w-48 h-48" />
                  </div>
                  {/* Profile photo overlay */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-white overflow-hidden">
                    {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" alt="" /> :
                      <div className="w-full h-full gradient-pink flex items-center justify-center"><span className="text-white font-black text-lg">{username?.[0]?.toUpperCase()}</span></div>}
                  </div>
                </div>
              ) : (
                <button onClick={generateDeviceQR} className="btn-primary w-full">Tengeneza QR Code</button>
              )}
              {deviceQRExpiry > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${deviceQRExpiry > 10 ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
                    <span className={`text-sm font-mono font-bold ${deviceQRExpiry > 10 ? 'text-green-400' : 'text-red-400'}`}>
                      {deviceQRExpiry}s
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs mt-1">QR inabadilika kila sekunde 60 kwa usalama</p>
                </div>
              )}
            </div>

            {/* Device list */}
            <div className="space-y-2">
              <h3 className="text-white font-bold">Vifaa Vilivyoingia ({devices.length})</h3>
              {devices.length === 0 ? (
                <div className="text-center py-8 text-gray-500"><Smartphone className="w-12 h-12 mx-auto mb-2 opacity-20" /><p>Hakuna vifaa vingine vilivyoingia</p></div>
              ) : devices.map((d: any) => {
                const isCurrentSession = (() => { try { return localStorage.getItem(`slr_session_${user?.id}`) === d.id; } catch { return false; } })();
                const lastActive = new Date(d.last_active).toLocaleString('sw-TZ');
                return (
                  <div key={d.id} className={`content-box p-4 flex items-center gap-3 ${isCurrentSession ? 'border-green-500/30' : ''}`}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                      <Smartphone className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-semibold text-sm">{d.device_name || 'Browser'}</p>
                        {isCurrentSession && <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">Sasa Hivi</span>}
                      </div>
                      <p className="text-gray-500 text-xs">{d.device_type} • {lastActive}</p>
                    </div>
                    {!isCurrentSession && (
                      <button onClick={() => removeDevice(d.id)} className="p-2 bg-red-500/20 rounded-lg flex-shrink-0">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {cropModal && (
        <ImageCropModal
          src={cropModal.src}
          type={cropModal.type}
          onConfirm={async (blob) => {
            URL.revokeObjectURL(cropModal.src);
            setCropModal(null);
            await uploadImage(blob, cropModal.type);
          }}
          onCancel={() => { URL.revokeObjectURL(cropModal.src); setCropModal(null); }}
        />
      )}

      {planToPay && (
        <PaymentModal onClose={() => setPlanToPay(null)} amount={planToPay.amount} planName={planToPay.name} type={planToPay.type} settings={settings}
          onSuccess={async () => { setPlanToPay(null); await refreshProfile(); toast.success('Malipo yamekamilika!'); setShowBlueTick(true); }} />
      )}
    </div>
  );
}
