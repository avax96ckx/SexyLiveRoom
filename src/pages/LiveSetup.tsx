import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Camera, CameraOff, Mic, MicOff, RotateCcw,
  Upload, X, Globe, Lock, Users, Hash, Radio,
  Wifi, AlertCircle, CheckCircle, Zap, Signal, Eye, EyeOff,
  Maximize2, FlipHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';

const QUALITY_PRESETS = [
  { id: '360p', label: '360p', sub: 'Chini', bandwidth: '~0.5 Mbps', color: 'text-gray-400', width: 640, height: 360 },
  { id: '480p', label: '480p', sub: 'Wastani', bandwidth: '~1 Mbps', color: 'text-blue-400', width: 854, height: 480 },
  { id: '720p', label: '720p HD', sub: 'Inayopendelewa', bandwidth: '~2.5 Mbps', color: 'text-green-400', width: 1280, height: 720 },
  { id: '1080p', label: '1080p FHD', sub: 'Bora kabisa', bandwidth: '~5 Mbps', color: 'text-yellow-400', width: 1920, height: 1080 },
] as const;
type QualityId = typeof QUALITY_PRESETS[number]['id'];

const RATIO_PRESETS = [
  { id: '9:16', label: '9:16', sub: 'TikTok / Vertical', icon: '📱' },
  { id: '16:9', label: '16:9', sub: 'Landscape', icon: '🖥️' },
  { id: '1:1', label: '1:1', sub: 'Square', icon: '⬜' },
  { id: '4:5', label: '4:5', sub: 'Portrait', icon: '🖼️' },
  { id: '3:4', label: '3:4', sub: 'Classic', icon: '📷' },
  { id: 'auto', label: 'Auto', sub: 'Device default', icon: '🔄' },
] as const;
type RatioId = typeof RATIO_PRESETS[number]['id'];

const FRAME_RATES = [
  { id: 24, label: '24 FPS', sub: 'Cinematic' },
  { id: 30, label: '30 FPS', sub: 'Standard' },
  { id: 60, label: '60 FPS', sub: 'Smooth' },
] as const;

const CATEGORIES = [
  { id: 'general', label: '🌟 General' }, { id: 'music', label: '🎵 Muziki' },
  { id: 'gaming', label: '🎮 Gaming' }, { id: 'lifestyle', label: '✨ Lifestyle' },
  { id: 'comedy', label: '😂 Vichekesho' }, { id: 'beauty', label: '💄 Uzuri' },
  { id: 'cooking', label: '🍳 Kupika' }, { id: 'sports', label: '⚽ Michezo' },
  { id: 'education', label: '📚 Elimu' }, { id: 'news', label: '📰 Habari' },
];

const LANGUAGES = [
  { code: 'sw', label: 'Kiswahili' }, { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' }, { code: 'fr', label: 'Français' },
];

type BeautyPreset = { id: string; label: string; filter: string; emoji: string };
const BEAUTY_PRESETS: BeautyPreset[] = [
  { id: 'none', label: 'Kawaida', emoji: '👁️', filter: 'none' },
  { id: 'soft', label: 'Laini', emoji: '✨', filter: 'brightness(1.05) contrast(0.92) saturate(1.05) blur(0.3px)' },
  { id: 'warm', label: 'Joto', emoji: '🌅', filter: 'brightness(1.08) sepia(0.15) saturate(1.2)' },
  { id: 'cool', label: 'Baridi', emoji: '❄️', filter: 'brightness(1.03) hue-rotate(10deg) saturate(0.9)' },
  { id: 'vivid', label: 'Angavu', emoji: '🎨', filter: 'brightness(1.1) contrast(1.1) saturate(1.4)' },
  { id: 'mono', label: 'B&W', emoji: '🎞️', filter: 'grayscale(0.8) contrast(1.1)' },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 ${value ? 'bg-primary' : 'bg-gray-700'}`}>
      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value ? 'left-6' : 'left-0.5'}`} />
    </button>
  );
}

function Slider({ label, emoji, value, min, max, step, onChange }: {
  label: string; emoji: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-lg flex-shrink-0">{emoji}</span>
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="text-gray-400 text-xs">{label}</span>
          <span className="text-primary text-xs font-bold">{value}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{ background: `linear-gradient(to right, #FF1493 0%, #FF1493 ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.15) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.15) 100%)` }} />
      </div>
    </div>
  );
}

export default function LiveSetup() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState('');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [flipping, setFlipping] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<QualityId>('720p');
  const [selectedRatio, setSelectedRatio] = useState<RatioId>('9:16');
  const [selectedFps, setSelectedFps] = useState(30);
  const [selectedBeauty, setSelectedBeauty] = useState<string>('none');
  const [mirrorMode, setMirrorMode] = useState(true);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [backgroundBlur, setBackgroundBlur] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'camera' | 'quality' | 'beauty' | 'options'>('camera');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [language, setLanguage] = useState('sw');
  const [audience, setAudience] = useState<'public' | 'followers' | 'private'>('public');
  const [tags, setTags] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);

  const [enableComments, setEnableComments] = useState(true);
  const [enableGifts, setEnableGifts] = useState(true);
  const [enableCoHost, setEnableCoHost] = useState(true);
  const [ageRestricted, setAgeRestricted] = useState(false);
  const [slowMode, setSlowMode] = useState(false);
  const [allowReplay, setAllowReplay] = useState(true);
  const [allowSharing, setAllowSharing] = useState(true);
  const [isPaidLive, setIsPaidLive] = useState(false);
  const [entryPrice, setEntryPrice] = useState('1000');

  const [starting, setStarting] = useState(false);
  const [netQuality, setNetQuality] = useState<'good' | 'fair' | 'poor' | 'checking'>('checking');
  const [showPreview, setShowPreview] = useState(true);

  const beautyFilter = BEAUTY_PRESETS.find(b => b.id === selectedBeauty)?.filter || 'none';
  const adjustFilter = `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100})`;
  const fullFilter = selectedBeauty === 'none'
    ? `${adjustFilter}${backgroundBlur ? ' blur(3px)' : ''}`
    : `${beautyFilter} ${adjustFilter}`;

  const previewAspect = { '9:16': '9/16', '16:9': '16/9', '1:1': '1/1', '4:5': '4/5', '3:4': '3/4', 'auto': '9/16' }[selectedRatio] || '9/16';

  const startCamera = useCallback(async (facingMode: 'user' | 'environment' = 'user', qId: QualityId = '720p', fps: number = 30) => {
    setCamError('');
    const preset = QUALITY_PRESETS.find(p => p.id === qId) || QUALITY_PRESETS[2];
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: preset.width }, height: { ideal: preset.height }, aspectRatio: { ideal: 9 / 16 }, frameRate: { ideal: fps }, zoom: false as any },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 },
      });
      streamRef.current = stream;
      stream.getAudioTracks().forEach(t => { t.enabled = micOn; });
      stream.getVideoTracks().forEach(t => { t.enabled = camOn; });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      }
      setCamReady(true);
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError' ? 'Ruhusa ya camera imekatazwa. Washa ruhusa kwenye browser.'
        : err?.name === 'NotFoundError' ? 'Camera haipatikani kwenye kifaa hiki.'
        : 'Camera haikuweza kufunguliwa. Jaribu tena.';
      setCamError(msg); setCamReady(false);
    }
  }, [micOn, camOn]);

  const checkNetwork = useCallback(async () => {
    setNetQuality('checking');
    const conn = (navigator as any).connection;
    if (conn) { const dl = conn.downlink || 0; setNetQuality(dl >= 2 ? 'good' : dl >= 0.5 ? 'fair' : 'poor'); return; }
    const start = Date.now();
    try {
      await fetch('https://www.google.com/favicon.ico', { cache: 'no-store', mode: 'no-cors' });
      const rtt = Date.now() - start;
      setNetQuality(rtt < 200 ? 'good' : rtt < 600 ? 'fair' : 'poor');
    } catch { setNetQuality('poor'); }
  }, []);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    startCamera(facing, selectedQuality, selectedFps);
    checkNetwork();
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  useEffect(() => { streamRef.current?.getVideoTracks().forEach(t => { t.enabled = camOn; }); }, [camOn]);
  useEffect(() => { streamRef.current?.getAudioTracks().forEach(t => { t.enabled = micOn; }); }, [micOn]);

  async function handleQualityChange(qId: QualityId) { setSelectedQuality(qId); setCamReady(false); await startCamera(facing, qId, selectedFps); }
  async function handleFpsChange(fps: number) { setSelectedFps(fps); setCamReady(false); await startCamera(facing, selectedQuality, fps); }
  const flipCamera = async () => {
    setFlipping(true);
    const newFacing = facing === 'user' ? 'environment' : 'user';
    setFacing(newFacing);
    await startCamera(newFacing, selectedQuality, selectedFps);
    setFlipping(false);
  };

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingCover(true);
    try {
      const path = `covers/${user.id}/${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('content').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('content').getPublicUrl(path);
      setCoverUrl(urlData.publicUrl);
      setCoverPreview(URL.createObjectURL(file));
      toast.success('✅ Picha imepakiwa!');
    } catch { toast.error('Imeshindwa kupakia picha'); }
    finally { setUploadingCover(false); }
  }

  async function handleStartLive() {
    if (!user || !profile) { navigate('/login'); return; }
    // Check if user is banned from going live
    const { data: prof } = await supabase.from('user_profiles').select('is_blocked,account_status').eq('id', user.id).single();
    if (prof?.is_blocked || prof?.account_status === 'blocked' || prof?.account_status === 'live_banned') {
      const adminWa = (await supabase.from('app_settings').select('value').eq('key', 'whatsapp_support').single()).data?.value || '';
      const blocked = confirm(
        '🚫 Live Imefungwa\n\nLive yako imefungwa na Admin.\nTafadhali wasiliana na Admin.\n\nBonyeza OK kwenda WhatsApp ya Admin.');
      if (blocked && adminWa) {
        const waNum = adminWa.replace(/\D/g, '');
        window.open(`https://wa.me/${waNum}?text=Habari%20Admin%2C%20Ombi%20la%20kufungua%20live%20yangu`, '_blank');
      }
      setStarting(false);
      return;
    }
    if (!camReady) { toast.error('Washa camera kwanza'); return; }
    setStarting(true);
    try {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      const liveTitle = title.trim() || `${profile.username} Live`;

      const { data, error } = await supabase.from('live_sessions').insert({
        host_id: user.id, title: liveTitle, category, cover_url: coverUrl || null,
        audience, language, tags: tagList, age_restricted: ageRestricted,
        enable_comments: enableComments, enable_gifts: enableGifts,
        enable_co_host: enableCoHost, beauty_filter: selectedBeauty !== 'none',
        background_blur: backgroundBlur, slow_mode: slowMode, slow_mode_seconds: 5,
        status: 'live', viewer_count: 0, peak_viewers: 0, like_count: 0,
        comment_count: 0, gift_coin_earned: 0, started_at: new Date().toISOString(),
        replay_available: allowReplay,
        is_paid: isPaidLive, entry_price: isPaidLive ? (parseFloat(entryPrice) || 0) : 0,
      }).select().single();

      if (error) throw error;

      await supabase.from('live_options').upsert({
        name: liveTitle, type: 'live_room', uploader_id: user.id,
        is_active: true, is_online: true, cover_url: coverUrl || null, display_order: 0,
      }, { onConflict: 'uploader_id' });

      supabase.from('tik_follows').select('follower_id').eq('following_id', user.id).limit(200)
        .then(({ data: follows }) => {
          if (!follows?.length) return;
          const notifs = follows.map((f: any) => ({
            user_id: f.follower_id, title: `🔴 ${profile.username} yuko LIVE!`,
            message: liveTitle, type: 'live', link: `/live/${data.id}`,
          }));
          for (let i = 0; i < notifs.length; i += 50)
            supabase.from('notifications').insert(notifs.slice(i, i + 50)).then(() => {});
        });

      streamRef.current?.getTracks().forEach(t => t.stop());
      navigate(`/live/${data.id}?host=1&quality=${selectedQuality}&aspect=${selectedRatio}`);
    } catch (e: any) {
      toast.error(e?.message || 'Imeshindwa kuanza live');
      setStarting(false);
    }
  }

  const netColor = netQuality === 'good' ? 'text-green-400' : netQuality === 'fair' ? 'text-yellow-400' : netQuality === 'poor' ? 'text-red-400' : 'text-gray-400';
  const netLabel = netQuality === 'good' ? 'Nzuri' : netQuality === 'fair' ? 'Wastani' : netQuality === 'poor' ? 'Dhaifu' : '...';
  const currentPreset = QUALITY_PRESETS.find(p => p.id === selectedQuality)!;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden" style={{ fontFamily: 'system-ui' }}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-2 flex-shrink-0 z-10 relative">
        <button onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); navigate(-1); }}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-white font-black text-xl flex-1">Mpangilio wa Live</h1>
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${netColor}`}>
          <Wifi className="w-3.5 h-3.5" /><span>{netLabel}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Camera Preview */}
        <div className="mx-4 mb-3 rounded-3xl overflow-hidden bg-[#0a0a0a] border border-white/10 relative"
          style={{ aspectRatio: previewAspect, maxHeight: showPreview ? '45vh' : '0px', transition: 'max-height 0.3s ease', minHeight: showPreview ? '180px' : '0px' }}>
          <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'contain', transform: mirrorMode && facing === 'user' ? 'scaleX(-1)' : 'none', filter: fullFilter }} />

          {camError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] p-4 text-center">
              <AlertCircle className="w-10 h-10 text-red-400 mb-2" />
              <p className="text-white text-sm font-semibold mb-1">Camera Haifanyi Kazi</p>
              <p className="text-gray-400 text-xs mb-3">{camError}</p>
              <button onClick={() => startCamera(facing, selectedQuality, selectedFps)} className="gradient-pink text-white text-xs font-bold px-4 py-2 rounded-full">Jaribu Tena</button>
            </div>
          )}
          {!camReady && !camError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a]">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-gray-400 text-xs">Inafungua camera...</p>
            </div>
          )}

          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600/90 px-3 py-1 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-white text-xs font-black">PREVIEW</span>
          </div>
          {camReady && (
            <div className="absolute top-3 right-3 flex items-center gap-1 bg-green-500/20 border border-green-500/40 px-2 py-1 rounded-full">
              <CheckCircle className="w-3 h-3 text-green-400" />
              <span className="text-green-400 text-[10px] font-bold">Tayari</span>
            </div>
          )}
          <div className="absolute bottom-14 left-3 flex gap-1.5">
            <span className="bg-black/70 border border-white/20 px-2 py-0.5 rounded-full text-[10px] font-black text-white">{selectedRatio}</span>
            <span className={`bg-black/70 border border-white/20 px-2 py-0.5 rounded-full text-[10px] font-black ${currentPreset.color}`}>{currentPreset.label}</span>
            <span className="bg-black/70 border border-white/20 px-2 py-0.5 rounded-full text-[10px] font-black text-gray-300">{selectedFps}fps</span>
          </div>
          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-3">
            <button onClick={() => setMicOn(v => !v)} className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${micOn ? 'bg-white/20 border-white/20' : 'bg-red-500/80 border-red-400'}`}>
              {micOn ? <Mic className="w-4 h-4 text-white" /> : <MicOff className="w-4 h-4 text-white" />}
            </button>
            <button onClick={() => setCamOn(v => !v)} className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${camOn ? 'bg-white/20 border-white/20' : 'bg-red-500/80 border-red-400'}`}>
              {camOn ? <Camera className="w-4 h-4 text-white" /> : <CameraOff className="w-4 h-4 text-white" />}
            </button>
            <button onClick={flipCamera} disabled={flipping} className="w-10 h-10 rounded-full bg-white/20 border border-white/20 flex items-center justify-center backdrop-blur-md">
              <RotateCcw className={`w-4 h-4 text-white ${flipping ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setMirrorMode(v => !v)} className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border ${mirrorMode ? 'bg-primary/60 border-primary/40' : 'bg-white/20 border-white/20'}`}>
              <FlipHorizontal className="w-4 h-4 text-white" />
            </button>
            <button onClick={() => setShowPreview(v => !v)} className="w-10 h-10 rounded-full bg-white/20 border border-white/20 flex items-center justify-center backdrop-blur-md">
              {showPreview ? <EyeOff className="w-4 h-4 text-white" /> : <Eye className="w-4 h-4 text-white" />}
            </button>
          </div>
        </div>

        {/* Settings Tabs */}
        <div className="px-4 mb-3">
          <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/8">
            {[{ id: 'camera', label: '📷 Camera' }, { id: 'quality', label: '📡 Ubora' }, { id: 'beauty', label: '✨ Uzuri' }, { id: 'options', label: '⚙️ Mipangilio' }].map(tab => (
              <button key={tab.id} onClick={() => setSettingsTab(tab.id as any)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${settingsTab === tab.id ? 'gradient-pink text-white shadow-lg' : 'text-gray-400'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-8 space-y-4">

          {/* ── CAMERA TAB ── */}
          {settingsTab === 'camera' && (
            <>
              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2 block flex items-center gap-1.5">
                  <Maximize2 className="w-3 h-3" /> Ratio ya Screen
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {RATIO_PRESETS.map(r => (
                    <button key={r.id} onClick={() => setSelectedRatio(r.id)}
                      className={`p-2.5 rounded-2xl border-2 transition-all text-center ${selectedRatio === r.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                      <span className="text-lg">{r.icon}</span>
                      <p className={`text-sm font-black mt-0.5 ${selectedRatio === r.id ? 'text-white' : 'text-gray-300'}`}>{r.label}</p>
                      <p className="text-gray-500 text-[9px]">{r.sub}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2 block">Frame Rate</label>
                <div className="grid grid-cols-3 gap-2">
                  {FRAME_RATES.map(fps => (
                    <button key={fps.id} onClick={() => handleFpsChange(fps.id)}
                      className={`p-3 rounded-2xl border-2 transition-all text-center ${selectedFps === fps.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                      <p className={`font-black text-sm ${selectedFps === fps.id ? 'text-white' : 'text-gray-300'}`}>{fps.label}</p>
                      <p className="text-gray-500 text-[10px]">{fps.sub}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-white/5 border border-white/8 rounded-2xl p-4 space-y-4">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Urekebishaji wa Camera</p>
                <Slider label="Mwangaza" emoji="☀️" value={brightness} min={50} max={150} step={5} onChange={setBrightness} />
                <Slider label="Contrast" emoji="◐" value={contrast} min={50} max={150} step={5} onChange={setContrast} />
                <Slider label="Rangi (Saturation)" emoji="🎨" value={saturation} min={0} max={200} step={10} onChange={setSaturation} />
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2"><span className="text-lg">🫧</span><div><p className="text-white text-sm font-semibold">Ukungu wa Nyuma</p><p className="text-gray-500 text-xs">Background blur</p></div></div>
                  <Toggle value={backgroundBlur} onChange={setBackgroundBlur} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="text-lg">🪞</span><div><p className="text-white text-sm font-semibold">Mirror Mode</p><p className="text-gray-500 text-xs">Kioo cha selfie</p></div></div>
                  <Toggle value={mirrorMode} onChange={setMirrorMode} />
                </div>
              </div>
            </>
          )}

          {/* ── QUALITY TAB ── */}
          {settingsTab === 'quality' && (
            <>
              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2 block flex items-center gap-1.5">
                  <Signal className="w-3 h-3" /> Ubora wa Video
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {QUALITY_PRESETS.map(preset => (
                    <button key={preset.id} onClick={() => handleQualityChange(preset.id)}
                      className={`p-3 rounded-2xl border-2 transition-all text-left ${selectedQuality === preset.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-black ${selectedQuality === preset.id ? 'text-white' : 'text-gray-300'}`}>{preset.label}</span>
                        {selectedQuality === preset.id && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <p className={`text-[10px] font-semibold ${preset.color}`}>{preset.sub}</p>
                      <p className="text-gray-600 text-[10px] mt-0.5">{preset.bandwidth}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className={`flex items-center gap-2 p-3 rounded-xl border ${netQuality === 'poor' && (selectedQuality === '1080p' || selectedQuality === '720p') ? 'bg-red-500/10 border-red-500/30' : netQuality === 'good' ? 'bg-green-500/10 border-green-500/20' : 'bg-white/5 border-white/8'}`}>
                <Zap className={`w-4 h-4 flex-shrink-0 ${currentPreset.color}`} />
                <div>
                  <p className="text-white text-xs font-semibold">{currentPreset.label} — {currentPreset.bandwidth}</p>
                  {netQuality === 'poor' && (selectedQuality === '1080p' || selectedQuality === '720p') && <p className="text-red-400 text-[10px] mt-0.5">⚠️ Mtandao dhaifu - punguza ubora</p>}
                  {netQuality === 'good' && <p className="text-green-400 text-[10px] mt-0.5">✓ Mtandao mzuri kwa ubora huu</p>}
                </div>
              </div>
              <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
                <p className="text-gray-400 text-xs font-semibold uppercase mb-3">Sauti</p>
                <div className="space-y-2">
                  {['Echo Cancellation', 'Noise Suppression', 'Auto Gain Control', 'Sample Rate: 48kHz'].map(item => (
                    <div key={item} className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /><span className="text-gray-300 text-xs">{item}</span></div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── BEAUTY TAB ── */}
          {settingsTab === 'beauty' && (
            <>
              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2 block">Filter za Uzuri</label>
                <div className="grid grid-cols-3 gap-2">
                  {BEAUTY_PRESETS.map(b => (
                    <button key={b.id} onClick={() => setSelectedBeauty(b.id)}
                      className={`p-3 rounded-2xl border-2 transition-all text-center ${selectedBeauty === b.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                      <span className="text-2xl">{b.emoji}</span>
                      <p className={`text-xs font-bold mt-1 ${selectedBeauty === b.id ? 'text-white' : 'text-gray-400'}`}>{b.label}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-white/5 border border-white/8 rounded-2xl p-4 space-y-4">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Maboresho ya Ziada</p>
                <Slider label="Mwangaza" emoji="🌟" value={brightness} min={50} max={150} step={5} onChange={setBrightness} />
                <Slider label="Contrast" emoji="◐" value={contrast} min={50} max={150} step={5} onChange={setContrast} />
                <Slider label="Rangi" emoji="🌈" value={saturation} min={0} max={200} step={10} onChange={setSaturation} />
              </div>
              <div className="rounded-2xl overflow-hidden border border-white/10" style={{ height: 80 }}>
                <div className="w-full h-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #FF1493, #7B2FBE, #FF6B35)', filter: fullFilter }}>
                  <span className="text-white font-black text-xl">Preview Filter</span>
                </div>
              </div>
            </>
          )}

          {/* ── OPTIONS TAB ── */}
          {settingsTab === 'options' && (
            <>
              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Kichwa cha Live</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder={`${profile?.username || 'Wewe'} Live`}
                  className="w-full bg-white/8 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-base outline-none focus:border-primary/60 placeholder:text-gray-600" />
              </div>

              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Kategoria</label>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map(cat => (
                    <button key={cat.id} onClick={() => setCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${category === cat.id ? 'gradient-pink text-white' : 'bg-white/8 text-gray-400 border border-white/10'}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Picha ya Jalada (Hiari)</label>
                <button onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center gap-3 bg-white/8 border border-white/10 rounded-2xl px-4 py-3">
                  {coverPreview ? (
                    <>
                      <img src={coverPreview} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                      <span className="text-white text-sm flex-1 text-left">Picha imechaguliwa</span>
                      <button onClick={e => { e.stopPropagation(); setCoverPreview(''); setCoverUrl(''); }} className="text-gray-400"><X className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                        {uploadingCover ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Upload className="w-5 h-5 text-gray-400" />}
                      </div>
                      <span className="text-gray-400 text-sm">Gonga kupakia picha ya jalada</span>
                    </>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
              </div>

              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Watazamaji</label>
                <div className="grid grid-cols-3 gap-2">
                  {[{ id: 'public' as const, icon: Globe, label: 'Wote' }, { id: 'followers' as const, icon: Users, label: 'Wafuasi' }, { id: 'private' as const, icon: Lock, label: 'Siri' }].map(opt => {
                    const Icon = opt.icon;
                    return (
                      <button key={opt.id} onClick={() => setAudience(opt.id)}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all ${audience === opt.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                        <Icon className={`w-5 h-5 ${audience === opt.id ? 'text-primary' : 'text-gray-400'}`} />
                        <span className={`text-xs font-semibold ${audience === opt.id ? 'text-white' : 'text-gray-400'}`}>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 block">Lugha</label>
                <div className="flex gap-2 flex-wrap">
                  {LANGUAGES.map(lang => (
                    <button key={lang.code} onClick={() => setLanguage(lang.code)}
                      className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${language === lang.code ? 'gradient-pink text-white' : 'bg-white/8 text-gray-400 border border-white/10'}`}>
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 block">
                  <Hash className="w-3 h-3 inline mr-1" />Tags
                </label>
                <input value={tags} onChange={e => setTags(e.target.value)}
                  placeholder="live, music, fun (gawanya kwa koma)"
                  className="w-full bg-white/8 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-primary/60 placeholder:text-gray-600" />
              </div>

              {/* Settings toggles */}
              <div className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
                {[
                  { label: 'Ruhusu Maoni', sub: 'Watazamaji watoe maoni', val: enableComments, set: setEnableComments, icon: '💬' },
                  { label: 'Ruhusu Zawadi', sub: 'Watazamaji watume zawadi', val: enableGifts, set: setEnableGifts, icon: '🎁' },
                  { label: 'Ruhusu Co-Host', sub: 'Mtu aweze kujiunga screen', val: enableCoHost, set: setEnableCoHost, icon: '👥' },
                  { label: 'Replay Ipatikane', sub: 'Viewers waone replay baadaye', val: allowReplay, set: setAllowReplay, icon: '▶️' },
                  { label: 'Ruhusu Kushiriki', sub: 'Viewers waweze kushiriki live', val: allowSharing, set: setAllowSharing, icon: '🔗' },
                  { label: 'Hali ya Polepole', sub: 'Maoni kila sekunde 5', val: slowMode, set: setSlowMode, icon: '🐢' },
                  { label: 'Kizuizi cha Umri 18+', sub: 'Vijana wasione live hii', val: ageRestricted, set: setAgeRestricted, icon: '🔞' },
                  { label: 'Live ya Kulipwa', sub: 'Watazamaji walipia kuingia', val: isPaidLive, set: setIsPaidLive, icon: '💰' },
                ].map((item, i) => (
                  <div key={item.label} className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                    <span className="text-xl flex-shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold">{item.label}</p>
                      <p className="text-gray-500 text-xs">{item.sub}</p>
                    </div>
                    <Toggle value={item.val} onChange={item.set} />
                  </div>
                ))}
              </div>

              {/* Paid live price input — shows when isPaidLive is ON */}
              {isPaidLive && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 space-y-2">
                  <p className="text-yellow-400 font-bold text-sm flex items-center gap-2">💰 Bei ya Kuingia</p>
                  <input
                    type="number"
                    value={entryPrice}
                    onChange={e => setEntryPrice(e.target.value)}
                    placeholder="Weka bei (mfano: 1000)"
                    className="w-full bg-white/8 border border-white/10 rounded-2xl px-4 py-3 text-white text-lg font-black outline-none focus:border-yellow-400/60 placeholder:text-gray-600"
                    inputMode="numeric"
                  />
                  <p className="text-gray-500 text-xs">Watazamaji watalazimika kulipa <span className="text-yellow-400 font-bold">TZS {parseInt(entryPrice || '0').toLocaleString()}</span> ili kuona live yako vizuri</p>
                </div>
              )}
            </>
          )}

          {!camReady && camError && (
            <div className="flex items-start gap-3 bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4">
              <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-orange-400 font-semibold text-sm">Camera haijaandaliwa</p>
                <p className="text-gray-400 text-xs mt-0.5">Washa camera ili uweze kuanza live vizuri</p>
              </div>
            </div>
          )}
          {netQuality === 'poor' && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-semibold text-sm">Mtandao Dhaifu</p>
                <p className="text-gray-400 text-xs mt-0.5">Punguza ubora hadi 360p au 480p kwa utendaji bora</p>
              </div>
            </div>
          )}

          <button onClick={handleStartLive} disabled={starting || !camReady}
            className="w-full py-5 rounded-3xl font-black text-xl text-white flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: camReady ? 'linear-gradient(135deg, #e60026, #FF1493)' : 'rgba(255,255,255,0.1)',
              boxShadow: camReady ? '0 8px 40px rgba(230,0,38,0.45)' : 'none',
            }}>
            {starting ? (
              <><div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />Inaanza...</>
            ) : !camReady ? (
              <><CameraOff className="w-6 h-6" />Washa Camera Kwanza</>
            ) : (
              <>
                <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                <Radio className="w-6 h-6" />
                GO LIVE — {currentPreset.label} · {selectedRatio} · {selectedFps}fps
                <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
              </>
            )}
          </button>
          <p className="text-gray-600 text-xs text-center pb-2">
            {currentPreset.label} · {selectedRatio} · {selectedFps}fps · {currentPreset.bandwidth}
            {isPaidLive && ` · 💰 TZS ${parseInt(entryPrice || '0').toLocaleString()}`}
          </p>
        </div>
      </div>

      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: #FF1493; cursor: pointer;
          box-shadow: 0 0 4px rgba(255,20,147,0.6);
        }
      `}</style>
    </div>
  );
}
