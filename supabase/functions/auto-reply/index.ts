import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEBSITE_KNOWLEDGE = `
Wewe ni msaidizi wa SEXY LIVE ROOM - platform ya burudani ya Tanzania/Kenya.

JINA LA WEBSITE: SEXY LIVE ROOM
UANDALIZI: Platform ya video, live streaming, chat, na zawadi

VIPENGELE VYA WEBSITE:
1. TIK-SEXY: Video feed kama TikTok - videos na picha za burudani
   - Wafuasi: Videos za watu unaowafuata
   - Kwako: Videos zote (For You Page)
   - Tuma zawadi kwenye video au profaili
   - Like, comment, share, download, save videos
   - Fuata wasanii unavyowapenda
   - Wafuasi wanaarifiwa 'Upload Mpya' moja kwa moja ukipakia content
   - Save Data mode: inapunguza matumizi ya data
   - Auto-swap: inabadilisha video automatically

2. SexyRoom: Chat ya pamoja - wanachama wote wanaongea
   - Tuma ujumbe, picha, video, sauti
   - Tazama Mara Moja (View Once) - inafutwa KABISA baada ya kutazama (hata ukitoka na kurudi)
   - @mention watu - bonyeza jina kuona profaili yao
   - Tuma zawadi kwenye chat
   - VIP/Business wanaweza kutuma picha, video, emoji, namba

3. Live Streaming: Streams za moja kwa moja
   - Mwenyeji (Host) anaanza live kutoka LiveSetup
   - Watazamaji wanaweza kutuma zawadi kwenye live
   - Screen sizes: Kawaida (9:16), Full Screen, Pana (16:9), Mraba (1:1)
   - Gift coins system kwenye live
   - Co-host feature - jiunge na mwenyeji kwenye live

4. Messenger/Inbox: Mazungumzo ya faragha kati ya wanachama
   - Wanachama wa kawaida wanaweza kufungua na kujibu ujumbe kutoka Admin na Business bila VIP
   - Tuma ujumbe, picha, video, sauti
   - View Once media - inafutwa baada ya kutazama
   - Double ticks (checkmarks = amesoma)
   - Auto-Reply kwa Business/Admin accounts
   - Tuma zawadi moja kwa moja kwenye chat

5. Malaya Section: Matangazo ya biashara na wasanii
   - Pakia namba za biashara, picha, videos
   - Lock maudhui kwa bei
   - Wafuasi wanaarifiwa 'Upload Mpya' ukipakia
   - Boost post: pin juu kwa masaa 24

6. Video Section: Videos za premium
   - Videos za burudani zilizofungwa kwa VIP
   - Download inahitaji VIP au Business

HUDUMA ZA KULIPA:
- VIP Member: Faida zote - inbox wote, SexyRoom full, ona namba, pakua video
  Mipango: Siku 30, 60, 90 - angalia bei kwenye Services
- Business Account: Pakia video/picha, inbox bila kikwazo, profaili ya video call
- Blue Tick: Alama ya uthibitisho - stili nyingi (Galaxy, Diamond, Fire, Gold, nk)
- Huduma za Admin: Boost post, picha ya profaili, na zaidi

MALIPO:
- Njia: TIGOPESA, MPESA, AIRTEL MONEY, HALOPESA
- Weka screenshot ya muamala kwenye Wallet → Weka Pesa
- Admin anathibitisha ndani ya masaa 24
- Salio linaonekana kwenye Wallet baada ya kuthibitishwa

ZAWADI (GIFTS):
- TikSexy: Tuma zawadi kwenye video
- SexyRoom: Zawadi kwenye chat ya pamoja
- Messenger: Zawadi moja kwa moja
- ViewProfile: Zawadi kwenye profaili ya mtu
- Live: Gift coins kwenye stream
- Malaya: Zawadi kwenye tangazo
- Gift Cards: Fungua gift card kupata VIP, balance, au unlock content
  Code ya Gift Card inaweza kuwa ya: VIP (siku), Balance (TZS), Unlock (video/malaya/live)
  Watu wengi wanaweza kutumia code moja (max_uses inaonyesha idadi)
- Wallet → Zawadi: Historia kamili ya zawadi zilizotumwa na kupokelewa
  Inaonyesha ni nani aliyetuma, kutoka wapi (SexyRoom/Live/Messenger/Profaili/Malaya), kiasi gani
- Hamisha zawadi → Salio kuu kwa click moja
- Gift card credits (unlock) zinaonekana kwenye Wallet → Zawadi
- Notification inatumwa kwa mtumaji NA mpokeaji wa zawadi

NOTIFICATIONS:
- Zinaonekana kwenye Settings (kona ya chini kulia) na kwenye browser juu
- Aina zote zinaonyeshwa: Gift (kutoka/kwenda), Like, Follow, Upload Mpya, VIP, Malipo, Live
- Admin anapata taarifa za malipo na maombi ya kutoa pesa
- Browser push notifications zinaonyeshwa kwa taarifa mpya
- Admin anaweza tuma arifa kwa wafuasi wote wa account (Admin panel → Arifa)
- Ruhusa ya browser inahitajika - browser itakuuliza ukiingia kwanza

PROFAILI:
- Badilisha picha, jina, namba, WhatsApp
- QR Code ya profaili yako - share au download
- Blue tick - chagua stili unayopenda
- Username handle - @jinalako linaweza kutumiwa kwenye chat
- Passcode lock - linda app yako (kama Telegram)
- Device management - angalia na futa vifaa vilivyoingia
- Auto-reply - jibu otomatiki kwa business/admin accounts

VIDEO CALL na SIMU:
- Piga simu au video call moja kwa moja kwenye profaili ya mtu
- Inahitaji VIP au Business Account
- WebRTC technology - hakuna gharama ya nje

UPLOAD TRACKING:
- Admin anaweza kuona uploads zote zinazoendela kwa wakati halisi
- Pause, resume, au futa upload yoyote
- Mwenyeji anaweza kuona kasi ya upload (KB/s au MB/s)

SHERIA ZA MATUMIZI:
- Wanachama wasio-VIP: hawezi kutuma namba, link, emoji, picha kwenye SexyRoom
- VIP/Business: Ruhusa zote - upload, inbox, SexyRoom full
- Admin wanaweza kufuta ujumbe wowote
- Members wa kawaida wanaweza kufungua ujumbe kutoka Admin/Business bila VIP

MSAADA:
- WhatsApp: +255773225088
- Chat ya moja kwa moja kwenye Support page
- Admin wanajibu haraka`;


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { senderId, receiverId } = await req.json();
    if (!senderId || !receiverId) {
      return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check: is this the first message from senderId to receiverId?
    const { count: msgCount } = await supabase.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', senderId)
      .eq('receiver_id', receiverId);

    console.log('Auto-reply check: msgCount =', msgCount);
    if ((msgCount || 0) > 1) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Not first message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check: has auto-reply already been sent?
    const { count: existingAutoReply } = await supabase.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', receiverId)
      .eq('receiver_id', senderId)
      .eq('is_auto_reply', true);

    if ((existingAutoReply || 0) > 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Already sent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get receiver's auto_reply text
    const { data: receiverProf } = await supabase.from('user_profiles')
      .select('auto_reply, is_business, is_admin, username')
      .eq('id', receiverId)
      .single();

    console.log('Receiver profile:', receiverProf?.username, receiverProf?.auto_reply, receiverProf?.is_business, receiverProf?.is_admin);

    if (!receiverProf?.auto_reply?.trim() || (!receiverProf.is_business && !receiverProf.is_admin)) {
      return new Response(JSON.stringify({ skipped: true, reason: 'No auto-reply configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Insert auto-reply using service role (bypasses RLS)
    const { error: insertError } = await supabase.from('messages').insert({
      sender_id: receiverId,
      receiver_id: senderId,
      content: receiverProf.auto_reply.trim(),
      is_auto_reply: true,
    });

    if (insertError) {
      console.error('Auto-reply insert error:', insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Auto-reply sent successfully!');
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Auto-reply function error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
