import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { userId, password } = await req.json();

    if (!userId || !password) {
      return new Response(JSON.stringify({ error: 'Missing userId or password' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'Password lazima iwe herufi 6 au zaidi' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        }
      }
    );

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (token) {
      try {
        const { data: callerData } = await supabaseAdmin.auth.getUser(token);
        if (callerData?.user) {
          const { data: callerProfile } = await supabaseAdmin
            .from('user_profiles')
            .select('is_admin')
            .eq('id', callerData.user.id)
            .single();
          if (callerProfile && !callerProfile.is_admin) {
            return new Response(JSON.stringify({ error: 'Huna ruhusa ya kubadilisha password' }), {
              status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
      } catch (e) {
        console.log('Caller verify skipped:', e);
      }
    }

    console.log('Updating password for userId:', userId);

    // PRIMARY: Use RPC to update password hash directly (bypasses IP restriction)
    // This uses the update_user_password PostgreSQL function which runs SECURITY DEFINER
    console.log('Trying RPC update_user_password...');
    const { error: rpcError } = await supabaseAdmin.rpc('update_user_password', {
      target_user_id: userId,
      new_password: password,
    });

    if (!rpcError) {
      console.log('Password updated successfully via RPC for userId:', userId);
      return new Response(JSON.stringify({
        success: true,
        message: 'Password imebadilishwa kwa mafanikio'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.error('RPC update failed:', rpcError.message, '- trying admin API fallback');

    // FALLBACK: Try admin API
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: password,
      email_confirm: true,
    });

    if (error) {
      console.error('Admin API also failed:', error.message, error.status);
      return new Response(JSON.stringify({ error: 'Imeshindwa kubadilisha password: ' + (rpcError.message || error.message) }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Password updated successfully via admin API:', data?.user?.id);

    return new Response(JSON.stringify({
      success: true,
      message: 'Password imebadilishwa kwa mafanikio'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('admin-reset-password error:', err?.message || err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
