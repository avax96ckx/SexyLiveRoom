
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { SupportMessage, AppSettings } from '@/types';
import { ArrowLeft, Send, Bot, Download, ExternalLink } from 'lucide-react';

// ─── Action button definition in AI replies ──────────────────────────────────
interface ActionButton {
  label: string;
  icon: 'whatsapp' | 'download' | 'link' | 'navigate';
  url?: string;
  path?: string;
}

interface BotReply {
  text: string;
  buttons?: ActionButton[];
}

const AUTO_REPLIES_FACTORY = (settings: Record<string, string>): { key: string; reply: BotReply }[] => [
  {
    key: 'weka pesa', reply: {
      text: `💰 Tuma pesa kwenye ${settings.payment_network || 'TIGOPESA'} namba ${settings.payment_number || '+255655299602'} jina ${settings.payment_name || 'MONICA MGAJI'}, kisha piga screenshot na tuma ombi kwenye menyu ya Wallet.`,
      buttons: [
        { label: '💳 Nenda Wallet', icon: 'navigate', path: '/wallet' },
        { label: `📞 ${settings.whatsapp_support || 'WhatsApp'}`, icon: 'whatsapp', url: settings.whatsapp_support || '+255773225088' },
      ]
    }
  },
  {
    key: 'deposit', reply: {
      text: `💰 Ili kuweka pesa: Nenda Wallet > Weka Pesa > Jaza kiasi > Piga screenshot ya malipo > Tuma. Admin atakuidhinisha haraka. Tuma kwa ${settings.payment_network || 'TIGOPESA'}: ${settings.payment_number || '+255655299602'}`,
      buttons: [
        { label: '💳 Fungua Wallet', icon: 'navigate', path: '/wallet' },
      ]
    }
  },
  {
    key: 'namba ya malipo', reply: {
      text: `💳 Namba ya malipo: ${settings.payment_number || '+255655299602'} (${settings.payment_network || 'TIGOPESA'}) - Jina: ${settings.payment_name || 'MONICA MGAJI'}`,
    }
  },
  {
    key: 'malipo ya namba', reply: {
      text: `💳 Tuma kwa: ${settings.payment_network || 'TIGOPESA'} ${settings.payment_number || '+255655299602'} - ${settings.payment_name || 'MONICA MGAJI'}`,
    }
  },
  {
    key: 'tigopesa', reply: {
      text: `💳 TIGOPESA: ${settings.payment_number || '+255655299602'} - ${settings.payment_name || 'MONICA MGAJI'}`,
    }
  },
  {
    key: 'mpesa', reply: {
      text: `💳 Namba: ${settings.payment_number || '+255655299602'} - ${settings.payment_name || 'MONICA MGAJI'}`,
    }
  },
  {
    key: 'airtel', reply: {
      text: `💳 Airtel: ${settings.payment_number || '+255655299602'} - ${settings.payment_name || 'MONICA MGAJI'}`,
    }
  },
  {
    key: 'vip', reply: {
      text: `👑 VIP Member inakupa: kutuma picha/video SexyRoom, kuona namba za members, inbox bila vikwazo! Bei: TZS ${settings.vip_price_monthly || '5000'}/mwezi. Ingia Huduma kujiunga.`,
      buttons: [
        { label: '👑 Angalia Huduma', icon: 'navigate', path: '/services' },
      ]
    }
  },
  {
    key: 'business', reply: {
      text: '💼 Business Account inakupa: upload video/picha kwenye VIDEO na MALAYA, kutuma media yoyote SexyRoom, kuona namba. Ingia Huduma.',
      buttons: [
        { label: '💼 Fungua Huduma', icon: 'navigate', path: '/services' },
      ]
    }
  },
  {
    key: 'blue tick', reply: {
      text: '✅ Blue Tick ni alama ya uthibitisho. Ingia Huduma > Blue Tick. Unaweza kuchagua rangi tofauti.',
      buttons: [
        { label: '✅ Pata Blue Tick', icon: 'navigate', path: '/services' },
      ]
    }
  },
  {
    key: 'password', reply: {
      text: '🔐 Kubadilisha password: Settings > Hariri Profaili > Password Mpya.',
      buttons: [
        { label: '⚙️ Nenda Settings', icon: 'navigate', path: '/settings' },
      ]
    }
  },
  {
    key: 'download', reply: {
      text: '⬇️ Bonyeza icon ya download kwenye video/picha yoyote kuanza kudownload. Itaonekana kwenye Downloads ukurasa.',
      buttons: [
        { label: '⬇️ Downloads', icon: 'navigate', path: '/downloads' },
        ...(settings.app_apk_url ? [{ label: '📱 Download App', icon: 'download' as const, url: settings.app_apk_url }] : []),
      ]
    }
  },
  {
    key: 'app', reply: {
      text: `📱 Pakua app yetu rasmi kwenye simu yako kwa uzoefu bora zaidi!`,
      buttons: [
        ...(settings.app_apk_url ? [{ label: '📱 Download APK', icon: 'download' as const, url: settings.app_apk_url }] : []),
      ]
    }
  },
  {
    key: 'apk', reply: {
      text: `📱 Pakua app yetu rasmi kwenye simu yako kwa uzoefu bora zaidi!`,
      buttons: [
        ...(settings.app_apk_url ? [{ label: '📱 Download APK', icon: 'download' as const, url: settings.app_apk_url }] : []),
      ]
    }
  },
  {
    key: 'malipo', reply: {
      text: '✅ Malipo yanakaguliwa na admin ndani ya dakika 5-30. Utapata arifa ukithibitishwa.',
      buttons: [
        { label: '💰 Angalia Wallet', icon: 'navigate', path: '/wallet' },
      ]
    }
  },
  {
    key: 'help', reply: {
      text: '🤝 Ninaweza kukusaidia na: weka pesa, VIP, business account, blue tick, password, downloads, na zaidi! Andika swali lako.',
    }
  },
  {
    key: 'msaada', reply: {
      text: '🤝 Karibu! Andika swali lako hapa chini nitakusaidia haraka.',
    }
  },
  {
    key: 'salio', reply: {
      text: '💳 Salio lako linaonekana kwenye kadi ya nyumba (Home) au bonyeza icon ya $ juu. Pia kwenye Wallet.',
      buttons: [
        { label: '💰 Fungua Wallet', icon: 'navigate', path: '/wallet' },
      ]
    }
  },
  {
    key: 'malaya', reply: {
      text: '💋 Malaya - angalia matangazo ya wasichana. Bonyeza picha kuona namba. VIP wanaona bure, wengine wanalipa kidogo.',
      buttons: [
        { label: '💋 Angalia Malaya', icon: 'navigate', path: '/malaya' },
      ]
    }
  },
  {
    key: 'live', reply: {
      text: '🔴 LIVE - Unaweza kuomba Video Call au kuingia Live Room kupitia link ya admin.',
      buttons: [
        { label: '🔴 Angalia Live', icon: 'navigate', path: '/live' },
      ]
    }
  },
  {
    key: 'video', reply: {
      text: '🎬 Video Section ina maudhui mengi ya kuvutia. VIP members wanaangalia bure!',
      buttons: [
        { label: '🎬 Angalia Video', icon: 'navigate', path: '/video' },
      ]
    }
  },
  {
    key: 'sexyroom', reply: {
      text: '💋 SexyRoom ni group chat. VIP na Business Account wanaweza kutuma picha/video. Members wa kawaida wanaweza kutuma maandishi tu.',
      buttons: [
        { label: '💋 Ingia SexyRoom', icon: 'navigate', path: '/sexyroom' },
      ]
    }
  },
  {
    key: 'referral', reply: {
      text: `🎁 Shiriki link yako na marafiki ${settings.referral_target || '10'} upate bonus ya TZS ${settings.referral_bonus || '20,000'} bure! Kiungo chako kipo kwenye Home.`,
      buttons: [
        { label: '🏠 Nenda Home', icon: 'navigate', path: '/' },
      ]
    }
  },
  {
    key: 'whatsapp', reply: {
      text: `💬 Msaada wa WhatsApp: ${settings.whatsapp_support || '+255773225088'}`,
      buttons: [
        { label: '💬 Fungua WhatsApp', icon: 'whatsapp', url: settings.whatsapp_support || '+255773225088' },
      ]
    }
  },
  {
    key: 'inbox', reply: {
      text: '💬 Inbox ni mahali pa mazungumzo ya faragha. Unaweza kuwasiliana na members wengine.',
      buttons: [
        { label: '💬 Fungua Inbox', icon: 'navigate', path: '/chat' },
      ]
    }
  },
  {
    key: 'profaili', reply: {
      text: '👤 Hariri profaili yako: jina, picha, namba ya simu na maelezo mengine.',
      buttons: [
        { label: '👤 Hariri Profaili', icon: 'navigate', path: '/edit-profile' },
      ]
    }
  },
  {
    key: 'tiksexy', reply: {
      text: '🎬 TIK-SEXY ni ukurasa wa video na picha kama TikTok! Swipe juu chini kuona video mpya. Unaweza kupenda, kutoa maoni, kutuma zawadi, na kushiriki video. Video ambazo hujawahi kuona zinakuja kwanza.',
      buttons: [
        { label: '🎬 Angalia TikSexy', icon: 'navigate', path: '/tiksexy' },
      ]
    }
  },
  {
    key: 'tik sexy', reply: {
      text: '🎬 TIK-SEXY ni ukurasa wa video za kuvutia. Swipe juu/chini kubadilisha video. Unaweza kufuata wasichana wanaopendeza!',
      buttons: [
        { label: '🎬 Angalia TikSexy', icon: 'navigate', path: '/tiksexy' },
      ]
    }
  },
  {
    key: 'gift card', reply: {
      text: '🎁 Gift Card - Ikiwa una code ya zawadi, ingia Gift Card page ubonyeze "Tumia Code". Utapata zawadi yako (pesa, VIP, au unlock credits) moja kwa moja.',
      buttons: [
        { label: '🎁 Tumia Gift Card', icon: 'navigate', path: '/gift' },
      ]
    }
  },
  {
    key: 'giftcard', reply: {
      text: '🎁 Gift Card - Nenda kwenye Gift Card page na weka code yako. Inafanya kazi mara moja!',
      buttons: [
        { label: '🎁 Tumia Gift Card', icon: 'navigate', path: '/gift' },
      ]
    }
  },
  {
    key: 'zawadi', reply: {
      text: '🎁 Zawadi - Unaweza kutuma zawadi kwa watu wengine kupitia: TikSexy > video > icon ya zawadi, au SexyRoom > hold message, au ViewProfile > Zawadi. Pia kwenye Wallet unaweza kutuma zawadi moja kwa moja.',
      buttons: [
        { label: '💰 Angalia Wallet', icon: 'navigate', path: '/wallet?tab=gifts' },
      ]
    }
  },
  {
    key: 'historia', reply: {
      text: '📊 Historia ya zawadi na miamala yako yote inaonekana kwenye Wallet > tab ya Zawadi. Kila zawadi uliyo tuma au kupokea inaonyeshwa na jina la mtumaji.',
      buttons: [
        { label: '💰 Angalia Historia', icon: 'navigate', path: '/wallet?tab=gifts' },
      ]
    }
  },
  {
    key: 'wallet', reply: {
      text: '💰 Wallet ina: Salio la Akaunti, Salio la Zawadi, Historia ya Malipo, na Historia ya Zawadi. Unaweza pia kuhamisha pesa kutoka zawadi kwenda akaunti kuu.',
      buttons: [
        { label: '💰 Fungua Wallet', icon: 'navigate', path: '/wallet' },
      ]
    }
  },
  { // Added the missing key and reply for the last set of buttons
    key: 'arifa', reply: {
      text: '🔔 Arifa zako zote zinaonyeshwa hapa.',
      buttons: [
        { label: '🔔 Angalia Arifa', icon: 'navigate', path: '/notifications' },
      ]
    }
  },
];

function getAutoReply(text: string, settings: Record<string, string>): BotReply {
  const lower = text.toLowerCase();
  const replies = AUTO_REPLIES_FACTORY(settings);
  for (const { key, reply } of replies) {
    if (lower.includes(key)) return reply;
  }
  return {
    text: `🤝 Asante kwa maswali yako! Unaweza kuandika tena au wasiliana nasi kwa WhatsApp kwa msaada wa haraka zaidi.`,
    buttons: [
      { label: '💬 WhatsApp Msaada', icon: 'whatsapp', url: settings.whatsapp_support || '+255773225088' },
    ]
  };
}

function playSound(url?: string) {
  if (!url) return;
  try { const a = new Audio(url); a.volume = 0.7; a.play().catch(() => {}); } catch {}
}

// ─── Action Buttons Renderer ─────────────────────────────────────────────────
function ActionButtons({ buttons, navigate }: { buttons: ActionButton[]; navigate: (path: string) => void }) {
  if (!buttons || buttons.length === 0) return null;

  const handleClick = (btn: ActionButton) => {
    if (btn.icon === 'whatsapp' && btn.url) {
      const num = btn.url.replace(/\D/g, '');
      window.open(`https://wa.me/${num}`, '_blank');
    } else if (btn.icon === 'download' && btn.url) {
      window.open(btn.url, '_blank');
    } else if (btn.icon === 'link' && btn.url) {
      window.open(btn.url, '_blank');
    } else if (btn.icon === 'navigate' && btn.path) {
      navigate(btn.path);
    }
  };


  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {buttons.map((btn, i) => (
        <button
          key={i}
          onClick={() => handleClick(btn)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
          style={{
            background: btn.icon === 'whatsapp'
              ? 'rgba(37,211,102,0.25)'
              : btn.icon === 'download'
              ? 'rgba(59,130,246,0.25)'
              : 'rgba(255,20,147,0.20)',
            border: `1px solid ${btn.icon === 'whatsapp' ? 'rgba(37,211,102,0.4)' : btn.icon === 'download' ? 'rgba(59,130,246,0.4)' : 'rgba(255,20,147,0.35)'}`,
            color: btn.icon === 'whatsapp' ? '#25D366' : btn.icon === 'download' ? '#60A5FA' : '#FF69B4',
          }}
        >
          {btn.icon === 'download' && <Download className="w-3 h-3" />}
          {btn.icon === 'link' && <ExternalLink className="w-3 h-3" />}
          {btn.label}
        </button>
      ))}
    </div>
  );
}

// ─── Suggestion questions config ─────────────────────────────────────────────
const QUICK_QUESTIONS = [
  { label: '💰 Weka Pesa', text: 'Weka pesa' },
  { label: '👑 VIP Member', text: 'VIP member' },
  { label: '💼 Business Account', text: 'Business account' },
  { label: '✅ Blue Tick', text: 'Blue tick' },
  { label: '📱 Download App', text: 'Download app' },
  { label: '🎁 Referral Bonus', text: 'Referral' },
];

// Extended message type with bot buttons
interface ExtendedMessage extends SupportMessage {
  buttons?: ActionButton[];
}

export default function Support() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ExtendedMessage[]>([]);
  const [text, setText] = useState('');
  const [settings, setSettings] = useState<AppSettings>({});
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(2));
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => { fetchSettings(); fetchMessages(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*');
    const m: AppSettings = {}; data?.forEach((r: any) => { m[r.key] = r.value; }); setSettings(m);
  }

  async function fetchMessages() {
    if (user) {
      const { data } = await supabase.from('support_messages').select('*').eq('user_id', user.id).order('created_at');
      setMessages((data || []) as ExtendedMessage[]);
    } else {
      const { data } = await supabase.from('support_messages').select('*').eq('session_id', sessionId).order('created_at');
      setMessages((data || []) as ExtendedMessage[]);
    }
  }

  async function sendMessage(overrideText?: string) {
    const msgText = (overrideText ?? text).trim();
    if (!msgText || sendingRef.current) return;
    sendingRef.current = true;

    // Optimistically add user message
    const tempMsg: ExtendedMessage = {
      id: Date.now().toString(),
      user_id: user?.id,
      content: msgText,
      is_from_user: true,
      session_id: sessionId,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    setText('');

    // Persist to DB
    await supabase.from('support_messages').insert({
      user_id: user?.id,
      content: msgText,
      is_from_user: true,
      session_id: sessionId,
    });

    // Forward to admin inbox
    if (user) {
      const { data: adminProf } = await supabase.from('user_profiles').select('id').eq('is_admin', true).limit(1).single();
      if (adminProf) {
        await supabase.from('messages').insert({
          sender_id: user.id,
          receiver_id: adminProf.id,
          content: `[Support] ${msgText}`,
        });
      }
    }

    // AI is typing indicator
    setIsTyping(true);
    setTimeout(async () => {
      setIsTyping(false);
      sendingRef.current = false;

      // Get reply WITH buttons
      const { text: replyText, buttons } = getAutoReply(msgText, settings);
      playSound(settings.sound_ai);

      // Add bot message with buttons in memory
      const botMsg: ExtendedMessage = {
        id: (Date.now() + 1).toString(),
        content: replyText,
        buttons,
        is_from_user: false,
        session_id: sessionId,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, botMsg]);

      // Persist only text to DB (buttons are generated dynamically)
      await supabase.from('support_messages').insert({
        user_id: user?.id,
        content: replyText,
        is_from_user: false,
        session_id: sessionId,
      });
    }, 800 + Math.random() * 700);
  }

  // Quick question tap - auto send immediately
  const handleQuickQuestion = (questionText: string) => {
    sendMessage(questionText);
  };

  const agentName = settings.support_agent_name || 'AI Support';
  const agentPhoto = settings.support_agent_photo;
  const aiBg = settings.ai_bg_image
    ? `url(${settings.ai_bg_image}) center/cover no-repeat`
    : settings.ai_color_from
    ? `linear-gradient(135deg, ${settings.ai_color_from}, ${settings.ai_color_to || '#1a0a2a'})`
    : '#0a030f';

  const msgFontSize = settings.ai_font_size ? `${settings.ai_font_size}px` : '14px';
  const msgFontFamily = (() => {
    const f = settings.ai_font || settings.app_font;
    if (f === 'dancing') return 'Dancing Script, cursive';
    if (f === 'pacifico') return 'Pacifico, cursive';
    if (f === 'lobster') return 'Lobster, cursive';
    if (f === 'great-vibes') return 'Great Vibes, cursive';
    if (f === 'satisfy') return 'Satisfy, cursive';
    return 'inherit';
  })();

  const msgBubbleRadius_unused = settings.ai_bubble_radius || '18'; // unused var kept for compat

  return (
    <div className="full-screen-page" style={{ background: aiBg }}>
      {/* Floating header */}
      <div className="absolute top-0 left-0 right-0 z-30 px-3 pt-3 pb-2 flex items-center gap-2">
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg"
          style={{ background: 'rgba(10,4,14,0.92)', backdropFilter: 'blur(14px)' }}>
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-2.5 flex-1 px-3 py-2 rounded-full min-w-0"
          style={{ background: 'rgba(10,4,14,0.92)', backdropFilter: 'blur(14px)' }}>
          <div className="w-8 h-8 rounded-full overflow-hidden border border-primary/50 flex-shrink-0">
            {agentPhoto
              ? <img src={agentPhoto} className="w-full h-full object-cover" alt="" />
              : <div className="w-full h-full gradient-pink flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate leading-tight">{agentName}</p>
            <p className="text-green-400 text-[11px]">● Online - Jibu haraka</p>
          </div>
        </div>
        {/* WhatsApp button */}
        <button
          onClick={() => {
            const num = (settings.whatsapp_support || '+255773225088').replace(/\D/g, '');
            window.open(`https://wa.me/${num}`, '_blank');
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg"
          style={{ background: 'rgba(37,211,102,0.90)', backdropFilter: 'blur(10px)' }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 space-y-2" style={{ paddingTop: '72px', paddingBottom: '8px' }}>

        {/* Welcome screen with quick questions */}
        {messages.length === 0 && (
          <div className="text-center py-6">
            <div className="w-16 h-16 gradient-pink rounded-full flex items-center justify-center mx-auto mb-4">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-white font-bold text-lg mb-1">Karibu kwenye Msaada!</h3>
            <p className="text-gray-400 text-sm mb-5">Bonyeza swali au andika lako hapa chini.</p>
            <div className="grid grid-cols-2 gap-2 text-left">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q.text}
                  onClick={() => handleQuickQuestion(q.text)}
                  className="p-3 rounded-xl text-gray-200 text-sm text-left font-semibold transition-all active:scale-95 hover:border-primary/40"
                  style={{ background: 'rgba(30,10,30,0.92)', border: '1px solid rgba(255,20,147,0.25)' }}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.is_from_user ? 'justify-end' : 'justify-start'} gap-2 items-end`}>
            {!msg.is_from_user && (
              <div className="w-8 h-8 rounded-full overflow-hidden border border-primary/30 flex-shrink-0 mb-1" style={{ minWidth: '32px' }}>
                {agentPhoto
                  ? <img src={agentPhoto} className="w-full h-full object-cover" alt="" />
                  : <div className="w-full h-full gradient-pink flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>}
              </div>
            )}
            <div className={msg.is_from_user ? '' : 'flex flex-col items-start max-w-[82%]'} style={{ maxWidth: msg.is_from_user ? '82%' : undefined }}>
              <div style={{
                background: msg.is_from_user
                  ? `linear-gradient(135deg,${settings.ai_bubble_my_from || '#7B2FBE'},${settings.ai_bubble_my_to || '#5B1F9E'})`
                  : (settings.ai_bubble_other || 'rgba(40,40,55,0.95)'),
                border: msg.is_from_user ? 'none' : '1px solid rgba(255,255,255,0.07)',
                borderRadius: msg.is_from_user ? `${settings.ai_bubble_radius || '18'}px ${settings.ai_bubble_radius || '18'}px 4px ${settings.ai_bubble_radius || '18'}px` : `${settings.ai_bubble_radius || '18'}px ${settings.ai_bubble_radius || '18'}px ${settings.ai_bubble_radius || '18'}px 4px`,
                padding: '6px 12px 4px 12px',
                fontSize: settings.ai_bubble_font_size ? `${settings.ai_bubble_font_size}px` : '14px',
                fontFamily: (() => { const f = settings.ai_bubble_font_family; return f === 'dancing' ? 'Dancing Script, cursive' : f === 'pacifico' ? 'Pacifico, cursive' : f === 'lobster' ? 'Lobster, cursive' : f === 'mono' ? 'monospace' : f === 'serif' ? 'serif' : 'inherit'; })(),
              }}>
                <p className="text-white leading-snug" style={{ fontSize: 'inherit' }}>{msg.content}</p>
                <div className="flex justify-end">
                  <span className="text-white/50 text-[9px] pb-0.5">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              {/* Action buttons - only on bot messages */}
              {!msg.is_from_user && msg.buttons && msg.buttons.length > 0 && (
                <ActionButtons buttons={msg.buttons} navigate={navigate} />
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-primary/30 flex-shrink-0" style={{ minWidth: '32px' }}>
              {agentPhoto
                ? <img src={agentPhoto} className="w-full h-full object-cover" alt="" />
                : <div className="w-full h-full gradient-pink flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>}
            </div>
            <div className="flex gap-1 px-4 py-3 rounded-2xl" style={{ background: 'rgba(30,10,30,0.92)', border: '1px solid rgba(255,20,147,0.15)' }}>
              {[0, 150, 300].map(d => (
                <div key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* Quick questions shown after messages too (when there are messages) */}
        {messages.length > 0 && !isTyping && (
          <div className="pt-2">
            <p className="text-gray-600 text-xs text-center mb-2">Maswali ya haraka:</p>
            <div className="flex gap-2 flex-wrap">
              {QUICK_QUESTIONS.slice(0, 4).map(q => (
                <button
                  key={q.text}
                  onClick={() => handleQuickQuestion(q.text)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                  style={{ background: 'rgba(255,20,147,0.12)', border: '1px solid rgba(255,20,147,0.25)', color: '#FF69B4' }}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Floating input bar */}
      <div className="px-3 py-3 flex gap-2 items-end" style={{ background: 'transparent' }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Andika swali lako..."
          className="flex-1 text-white rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
          style={{
            background: 'rgba(10,4,14,0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.10)',
            height: '44px',
          }}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
        />
        <button
          onClick={() => sendMessage()}
          className="w-10 h-10 gradient-pink rounded-full flex items-center justify-center flex-shrink-0 shadow-lg active:scale-90 transition-transform">
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
