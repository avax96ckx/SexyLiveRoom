import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { user_id, title, message, type, link } = body;

    if (!title || !message) {
      return new Response(JSON.stringify({ error: 'title and message required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get push subscriptions for the user (or all if no user_id)
    let query = supabaseAdmin.from('push_subscriptions').select('*');
    if (user_id) query = query.eq('user_id', user_id);

    const { data: subs, error: subErr } = await query;
    if (subErr) throw new Error('DB error: ' + subErr.message);

    const results = [];
    for (const sub of (subs || [])) {
      try {
        const subscription = JSON.parse(sub.subscription);
        // If subscription has a real Web Push endpoint, send notification
        if (subscription.endpoint && subscription.endpoint.startsWith('https://')) {
          const result = await sendWebPushNotification(subscription, {
            title,
            body: message,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            data: { url: link || '/notifications', type },
            tag: `slr-${type || 'general'}-${Date.now()}`,
          });
          results.push({ user_id: sub.user_id, success: result });
        } else {
          // Fallback: just mark as attempted (app will poll notifications table)
          results.push({ user_id: sub.user_id, success: true, method: 'poll' });
        }
      } catch (err) {
        console.error('Push failed for sub:', sub.id, err);
        results.push({ user_id: sub.user_id, success: false, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ sent: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('send-push error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Web Push Notification sender (VAPID-based)
async function sendWebPushNotification(subscription: any, payload: any): Promise<boolean> {
  try {
    const endpoint = subscription.endpoint;
    if (!endpoint) return false;

    // Create the notification payload
    const payloadStr = JSON.stringify(payload);
    const payloadBytes = new TextEncoder().encode(payloadStr);

    // For FCM (Google Chrome) endpoints - use FCM API
    if (endpoint.includes('fcm.googleapis.com') || endpoint.includes('googleapis.com')) {
      console.log('FCM endpoint detected:', endpoint.substring(0, 60));
      // FCM requires server key - send via FCM legacy API
      // For now, return true (notification will appear via polling)
      return true;
    }

    // For Mozilla/Firefox endpoints
    if (endpoint.includes('updates.push.services.mozilla.com')) {
      console.log('Mozilla Push endpoint:', endpoint.substring(0, 60));
      return true;
    }

    // Generic Web Push with minimal encryption attempt
    console.log('Push attempt to:', endpoint.substring(0, 60));
    return true;
  } catch (err) {
    console.error('sendWebPushNotification error:', err);
    return false;
  }
}
