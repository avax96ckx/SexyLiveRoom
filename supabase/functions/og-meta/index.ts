import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = url.searchParams.get('path') || '/'
    let type = url.searchParams.get('type') || 'home'
    let id = url.searchParams.get('id') || ''

    // Auto-detect type from path pattern: /malaya?post=ID or /video?post=ID
    if (!id && path.includes('?post=')) {
      const postMatch = path.match(/\?post=([^&]+)/)
      if (postMatch) id = postMatch[1]
      if (path.startsWith('/malaya')) type = 'malaya'
      else if (path.startsWith('/video')) type = 'video'
    }
    // Handle direct query params: ?post=ID with auto type from path
    const postParam = url.searchParams.get('post') || ''
    if (!id && postParam) {
      id = postParam
      if (!type || type === 'home') {
        if (path.startsWith('/malaya')) type = 'malaya'
        else if (path.startsWith('/video')) type = 'video'
        else if (path.startsWith('/tiksexy')) type = 'post'
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    
    const dbHeaders = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }

    const SITE_URL = 'https://sexy-live-room.vercel.app'
    const origin = req.headers.get('x-forwarded-host') 
      ? `https://${req.headers.get('x-forwarded-host')}` 
      : (req.headers.get('origin') || SITE_URL)
    const siteOrigin = (origin.includes('localhost') || origin.includes('onspace.build') || origin.includes('onspace.ai')) ? SITE_URL : origin

    let title = 'SEXY LIVE ROOM 💋'
    let description = 'Platform ya burudani - Malaya, Video, Live na zaidi! Jiunge sasa hivi.'
    let image = `${siteOrigin}/og-image.jpg`
    let ogType = 'website'
    let shareUrl = `${siteOrigin}${path}`
    let datePublished = new Date().toISOString()

    // MALAYA post
    if (type === 'post' || type === 'malaya') {
      try {
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/content_posts?id=eq.${id}&select=title,media_url,thumbnail_url,description,location,type,region,media_urls,created_at`, 
          { headers: dbHeaders }
        )
        const postData = await resp.json()
        const post = postData && postData[0]
        if (post) {
          title = post.title ? `${post.title} 💋 - SEXY LIVE ROOM` : '💋 Malaya - SEXY LIVE ROOM'
          description = post.description || `Angalia msichana huyu kwenye SEXY LIVE ROOM!${post.location ? ` 📍 ${post.location}` : ''}${post.region ? ` • ${post.region}` : ''}`
          const mediaUrls = post.media_urls?.length ? post.media_urls : (post.media_url ? [post.media_url] : [])
          image = post.thumbnail_url || mediaUrls[0] || image
          ogType = 'article'
          shareUrl = `${siteOrigin}/malaya?post=${id}`
          if (post.created_at) datePublished = post.created_at
        }
      } catch (e) { console.error('malaya fetch error:', e) }
    }

    // VIDEO post
    if (type === 'video') {
      try {
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/content_posts?id=eq.${id}&select=title,thumbnail_url,media_url,section,description,created_at`, 
          { headers: dbHeaders }
        )
        const postData = await resp.json()
        const post = postData && postData[0]
        if (post) {
          title = post.title ? `🎬 ${post.title} - SEXY LIVE ROOM` : '🎬 Video - SEXY LIVE ROOM'
          description = post.description || `Tazama video hii sasa kwenye SEXY LIVE ROOM!${post.section ? ` 📂 ${post.section}` : ''}`
          image = post.thumbnail_url || post.media_url || image
          ogType = 'video.other'
          shareUrl = `${siteOrigin}/video?post=${id}`
          if (post.created_at) datePublished = post.created_at
        }
      } catch (e) { console.error('video fetch error:', e) }
    }

    // USER PROFILE
    if (type === 'profile') {
      try {
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/user_profiles?id=eq.${id}&select=username,avatar_url,is_vip,is_business,blue_tick,phone_visible`, 
          { headers: dbHeaders }
        )
        const profData = await resp.json()
        const prof = profData && profData[0]
        if (prof) {
          title = `${prof.username} - SEXY LIVE ROOM`
          const badges = [prof.is_vip ? '👑 VIP' : '', prof.is_business ? '💼 Business' : '', prof.blue_tick ? '✓ Verified' : ''].filter(Boolean).join(' ')
          description = `Angalia profaili ya ${prof.username}${badges ? ` ${badges}` : ''} kwenye SEXY LIVE ROOM`
          image = prof.avatar_url || image
          ogType = 'profile'
          shareUrl = `${siteOrigin}/profile/${id}`
        }
      } catch (e) { console.error('profile fetch error:', e) }
    }

    // LIVE option
    if (type === 'live') {
      try {
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/live_options?id=eq.${id}&select=name,cover_url,type,price,whatsapp`, 
          { headers: dbHeaders }
        )
        const optData = await resp.json()
        const opt = optData && optData[0]
        if (opt) {
          const isRoom = opt.type === 'live_room'
          title = isRoom ? `🔴 LIVE: ${opt.name} - SEXY LIVE ROOM` : `📹 Video Call: ${opt.name} - SEXY LIVE ROOM`
          description = isRoom 
            ? `Ingia Live Room ya ${opt.name} sasa kwenye SEXY LIVE ROOM! Usipigie kicwa.`
            : `Piga Video Call na ${opt.name} kwenye SEXY LIVE ROOM!${opt.price > 0 ? ` Bei: TZS ${parseFloat(opt.price).toLocaleString()}` : ' 🆓 Bure'}`
          image = opt.cover_url || image
          shareUrl = `${siteOrigin}/live`
        }
      } catch (e) { console.error('live fetch error:', e) }
    }

    // SEXYROOM
    if (type === 'sexyroom') {
      title = '💋 SexyRoom - SEXY LIVE ROOM'
      description = 'Jiunge katika chumba cha burudani! Sema na watu wazima kutoka Tanzania na zaidi.'
      shareUrl = `${siteOrigin}/sexyroom`
    }

    // Hakikisha picha ina link kamili (Absolute URL)
    if (image && image.startsWith("/")) {
      image = `${siteOrigin}${image}`;
    }
    if (image && !image.startsWith("http")) {
      image = `${supabaseUrl}/storage/v1/object/public/${image}`;
    }

    // Build JSON-LD structured data for Google Rich Results
    let jsonLdObj: Record<string, unknown>
    if ((type === 'malaya' || type === 'post') && id) {
      jsonLdObj = {
        '@context': 'https://schema.org',
        '@type': 'ItemPage',
        'url': shareUrl,
        'name': title,
        'description': description,
        'image': { '@type': 'ImageObject', 'url': image, 'width': 1200, 'height': 630 },
        'datePublished': datePublished,
        'dateModified': datePublished,
        'publisher': {
          '@type': 'Organization',
          'name': 'SEXY LIVE ROOM',
          'url': siteOrigin,
          'logo': { '@type': 'ImageObject', 'url': `${siteOrigin}/icon-192.png`, 'width': 192, 'height': 192 }
        }
      }
    } else if (type === 'video' && id) {
      jsonLdObj = {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        'url': shareUrl,
        'name': title,
        'description': description,
        'thumbnailUrl': image,
        'uploadDate': datePublished,
        'embedUrl': shareUrl,
        'contentUrl': shareUrl,
        'publisher': {
          '@type': 'Organization',
          'name': 'SEXY LIVE ROOM',
          'url': siteOrigin,
          'logo': { '@type': 'ImageObject', 'url': `${siteOrigin}/icon-192.png` }
        }
      }
    } else {
      jsonLdObj = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        'url': siteOrigin,
        'name': 'SEXY LIVE ROOM',
        'description': description,
        'image': image,
        'potentialAction': {
          '@type': 'SearchAction',
          'target': { '@type': 'EntryPoint', 'urlTemplate': `${siteOrigin}/tiksexy?post={search_term_string}` },
          'query-input': 'required name=search_term_string'
        }
      }
    }
    const jsonLd = JSON.stringify(jsonLdObj)

    const html = `<!DOCTYPE html>
<html lang="sw">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  
  <!-- Open Graph - Facebook, WhatsApp, Telegram, Instagram -->
  <meta property="og:type" content="${ogType}" />
  <meta property="og:url" content="${escapeHtml(shareUrl)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:alt" content="${escapeHtml(title)}" />
  <meta property="og:site_name" content="SEXY LIVE ROOM" />
  <meta property="og:locale" content="sw_TZ" />
  
  <!-- Twitter / X Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@sexyliveroom" />
  <meta name="twitter:url" content="${escapeHtml(shareUrl)}" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  
  <link rel="canonical" href="${escapeHtml(shareUrl)}" />

  <!-- JSON-LD Structured Data for Google Rich Results -->
  <script type="application/ld+json">${jsonLd}</script>
  
  <!-- Kama ni mtu wa kawaida anafungua, mpeleke kwenye App -->
  <script>
    (function() {
      var ua = navigator.userAgent;
      var isCrawler = /facebookexternalhit|facebookcatalog|twitterbot|telegrambot|whatsapp|discordbot|linkedinbot|slackbot|googlebot|bingbot|applebot|ia_archiver|mj12bot|Twitterbot/i.test(ua);
      if (!isCrawler) {
        window.location.replace("${escapeHtml(shareUrl)}");
      }
    })();
  </script>
</head>
<body style="background:#0a030f;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;flex-direction:column;gap:16px;padding:20px;box-sizing:border-box">
  <div style="max-width:500px;width:100%;text-align:center">
    <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" 
      style="max-width:100%;width:500px;height:260px;object-fit:cover;border-radius:16px;margin-bottom:16px" 
      onerror="this.style.display='none'" />
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:900">${escapeHtml(title)}</h1>
    <p style="margin:0;color:#b3b3b3;font-size:16px">${escapeHtml(description)}</p>
    <br/>
    <a href="${escapeHtml(shareUrl)}" style="background:#FF1493;color:white;padding:12px 24px;border-radius:30px;text-decoration:none;font-weight:bold;display:inline-block">FUNGUA APP</a>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
