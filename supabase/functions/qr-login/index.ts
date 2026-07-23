import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { token, userId } = await req.json();
    if (!token || !userId) {
      return new Response(JSON.stringify({ error: 'Missing token or userId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Allow 5min buffer for clock skew
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from('device_auth_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('token', token)
      .eq('used', false)
      .gte('expires_at', fiveMinutesAgo)
      .single();

    if (tokenErr || !tokenRow) {
      console.error('Token lookup error:', tokenErr?.message, 'userId:', userId);
      return new Response(JSON.stringify({ error: 'QR Code imekwisha muda au si sahihi. Tengeneza mpya kwenye Vifaa Vyangu.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Mark token as used immediately to prevent replay attacks
    await supabaseAdmin.from('device_auth_tokens').update({ used: true }).eq('id', tokenRow.id);

    // Get user profile to find their email
    const { data: prof, error: profErr } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, username')
      .eq('id', userId)
      .single();

    if (profErr || !prof?.email) {
      console.error('Profile lookup error:', profErr);
      return new Response(JSON.stringify({ error: 'Akaunti haijapatikana. Jaribu kuingia kawaida.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userEmail = prof.email;
    console.log('QR login for userId:', userId, 'email:', userEmail);

    // Generate magic link - this returns email_otp which client can use with verifyOtp
    // NO redirect needed - verifyOtp creates session directly!
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    });

    if (linkErr || !linkData) {
      console.error('generateLink error:', linkErr);
      return new Response(JSON.stringify({ error: 'Imeshindwa kuunda token: ' + (linkErr?.message || 'Unknown') }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // email_otp is the OTP token that can be used with verifyOtp({type:'email'})
    // hashed_token is for action_link redirect approach
    const emailOtp = linkData.properties?.email_otp || '';
    const hashedToken = linkData.properties?.hashed_token || '';
    const actionLink = linkData.properties?.action_link || '';

    console.log('Generated OTP for', userId, '- has email_otp:', !!emailOtp, 'has hashed_token:', !!hashedToken);

    return new Response(JSON.stringify({
      success: true,
      email: userEmail,
      username: prof.username || userEmail.split('@')[0],
      email_otp: emailOtp,
      hashed_token: hashedToken,
      action_link: actionLink,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('QR login unhandled error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
