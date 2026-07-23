// @ts-nocheck
// Proxy browser edge function — SexyLiveRoom
// Strategy:
//   StripChat model page  → HLS stream player (via API)
//   StripChat category    → External widget API → custom model grid
//   Other SPA sites       → wrapper iframe
//   Regular sites         → server-side fetch + HTML injection

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cookie',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// SSRF protection
function isPrivateIP(hostname: string): boolean {
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)) return true
  const privateRanges = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^fc00:/i, /^fe80:/i]
  return privateRanges.some(r => r.test(hostname))
}

const SPA_DOMAINS = [
  'chaturbate.com', 'www.chaturbate.com',
  'cam4.com', 'www.cam4.com',
  'bongacams.com', 'www.bongacams.com',
  'myfreecams.com', 'www.myfreecams.com',
  'jasmin.com', 'www.jasmin.com',
  'livejasmin.com', 'www.livejasmin.com',
  'camsoda.com', 'www.camsoda.com',
  'streamate.com', 'www.streamate.com',
  'xhamsterlive.com', 'www.xhamsterlive.com',
  'pornhub.com', 'www.pornhub.com',
  'xvideos.com', 'www.xvideos.com',
  'xnxx.com', 'www.xnxx.com',
  'redtube.com', 'www.redtube.com',
  'xhamster.com', 'www.xhamster.com',
  'youporn.com', 'www.youporn.com',
  'tube8.com', 'www.tube8.com',
  'spankbang.com', 'www.spankbang.com',
  'eporner.com', 'www.eporner.com',
]

function isSPADomain(hostname: string): boolean {
  return SPA_DOMAINS.includes(hostname.toLowerCase())
}

// StripChat path detection
const STRIPCHAT_CATEGORY_PATHS = [
  '/girls', '/guys', '/transsexual', '/transgender', '/couples',
  '/search', '/top-models', '/new-models', '/recommended', '/popular',
  '/tags', '/contests', '/streams', '/live', '/api',
  '/privacy', '/terms', '/support', '/about', '/blog',
]

function getStripchatUsername(pathname: string): string | null {
  const path = pathname.replace(/\/$/, '')
  if (!path || path === '/') return null
  for (const cat of STRIPCHAT_CATEGORY_PATHS) {
    if (path === cat || path.startsWith(cat + '/') || path.startsWith(cat + '?')) return null
  }
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 1) {
    const name = parts[0]
    if (/^[a-zA-Z0-9_]{3,30}$/.test(name)) return name
  }
  return null
}

// Extract category tag from path e.g. /girls/african → "african"
function getStripchatCategoryTag(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  // /girls/african → parts = ['girls', 'african'] → tag = 'african'
  if (parts.length >= 2) return parts[parts.length - 1]
  return null
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.155 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.60 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.53 Mobile Safari/537.36',
]
function randomUA(): string { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] }

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY A: StripChat HLS stream player for specific model pages
// ─────────────────────────────────────────────────────────────────────────────
async function buildStripchatStreamPage(username: string, fallbackUrl: string): Promise<string> {
  let hlsUrl = ''
  let modelStatus = 'unknown'
  let modelName = username
  let thumbnail = ''
  let errorMsg = ''

  try {
    const apiUrl = `https://stripchat.com/api/front/v2/models/username/${encodeURIComponent(username)}/cam?uniq=${Math.random().toString(36).slice(2)}`
    console.log(`StripChat API: ${apiUrl}`)

    const apiResp = await fetch(apiUrl, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Referer': `https://stripchat.com/${username}`,
        'Origin': 'https://stripchat.com',
        'X-Requested-With': 'XMLHttpRequest',
      },
      redirect: 'follow',
    })

    console.log(`StripChat API response: ${apiResp.status}`)

    if (apiResp.status === 404) {
      errorMsg = `Model "${username}" haipatikani`
    } else if (apiResp.ok) {
      const data = await apiResp.json()

      if (data?.user?.user) {
        const u = data.user.user
        modelName = u.username || username
        modelStatus = u.status || 'unknown'
        thumbnail = u.snapshotUrl || u.previewUrl || ''
      }

      if (data?.cam && typeof data.cam === 'object') {
        const cam = data.cam
        const streamName = cam.streamName || cam.stream_name || ''
        const viewServers = cam.viewServers || cam.view_servers || {}
        const hlsServer = viewServers['flashphoner-hls'] || viewServers['hls'] || ''

        console.log(`streamName: ${streamName}, hlsServer: ${hlsServer}`)

        if (streamName && hlsServer) {
          // Primary: master playlist
          hlsUrl = `https://b-${hlsServer}.doppiocdn.com/hls/${streamName}/master_${streamName}.m3u8`
        } else if (streamName) {
          // Fallback: edge-hls
          const domains = ['doppiocdn.org', 'doppiocdn.com', 'doppiocdn.net']
          const domain = domains[Math.floor(Math.random() * domains.length)]
          hlsUrl = `https://edge-hls.${domain}/hls/${streamName}/master/${streamName}_auto.m3u8`
        }

        const isCamAvailable = cam.isCamAvailable ?? cam.is_cam_available ?? true
        const isCamActive = cam.isCamActive ?? cam.is_cam_active ?? true
        if (!isCamAvailable || !isCamActive) {
          errorMsg = `${modelName} sio live sasa hivi`
        }
      } else {
        errorMsg = `${modelName} sio live sasa hivi`
      }
    } else {
      errorMsg = `API error: ${apiResp.status}`
    }
  } catch (e) {
    console.error('StripChat API error:', e)
    errorMsg = `Hitilafu: ${String(e).substring(0, 100)}`
  }

  if (hlsUrl && !errorMsg) {
    return buildHLSPlayerPage(hlsUrl, modelName, thumbnail, fallbackUrl, username)
  }
  return buildStripchatFallbackPage(username, modelName, modelStatus, errorMsg, fallbackUrl, thumbnail)
}

function buildHLSPlayerPage(hlsUrl: string, name: string, thumbnail: string, originalUrl: string, username: string): string {
  // Build alternative URLs to try on failure
  // Simple .m3u8 format (without master_ prefix) as fallback
  const streamNameMatch = hlsUrl.match(/\/hls\/([^/]+)\//)
  const streamName = streamNameMatch ? streamNameMatch[1] : ''

  const altUrls: string[] = []
  if (streamName) {
    altUrls.push(`https://b-hls-05.strpst.com/hls/${streamName}/${streamName}.m3u8`)
    altUrls.push(`https://b-hls-09.strpst.com/hls/${streamName}/${streamName}.m3u8`)
    altUrls.push(`https://b-hls-07.strpst.com/hls/${streamName}/${streamName}.m3u8`)
    altUrls.push(`https://edge-hls.doppiocdn.com/hls/${streamName}/master/${streamName}_auto.m3u8`)
  }

  return `<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} LIVE</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: -apple-system, sans-serif; }
#vc { position: fixed; inset: 0; background: #000; display: flex; align-items: center; justify-content: center; }
#v { width: 100%; height: 100%; object-fit: contain; background: #000; cursor: pointer; }
#load {
  position: absolute; inset: 0; z-index: 10;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, #1a0028 0%, #080010 60%, #000 100%);
  transition: opacity 0.5s;
}
#load.hide { opacity: 0; pointer-events: none; }
.sp { width: 60px; height: 60px; border: 3px solid rgba(255,20,147,0.15); border-top-color: #FF1493; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.ln { color: #FF1493; font-weight: 900; font-size: 14px; margin-top: 14px; letter-spacing: 3px; }
.ls { color: #555; font-size: 11px; margin-top: 4px; }
#err {
  position: absolute; inset: 0; z-index: 10;
  display: none; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, #1a0028 0%, #080010 60%, #000 100%);
  padding: 24px; text-align: center;
}
#err.show { display: flex; }
.et { color: #FF1493; font-size: 17px; font-weight: 900; margin-bottom: 8px; }
.em { color: #777; font-size: 13px; margin-bottom: 20px; line-height: 1.5; }
.br { background: linear-gradient(135deg,#FF1493,#C2185B); color: #fff; border: none; padding: 13px 28px; border-radius: 14px; font-size: 14px; font-weight: 900; cursor: pointer; width: 100%; max-width: 260px; margin-bottom: 10px; }
.bs { background: transparent; color: #666; border: 1px solid #333; padding: 10px 20px; border-radius: 12px; font-size: 12px; cursor: pointer; width: 100%; max-width: 260px; }
#mut { position: absolute; bottom: 60px; right: 16px; z-index: 20; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 50%; width: 44px; height: 44px; font-size: 18px; cursor: pointer; display: none; align-items: center; justify-content: center; }
#mut.show { display: flex; }
${thumbnail ? `#tb { position: absolute; inset: 0; background: url('${thumbnail}') center/cover no-repeat; opacity: 0.12; pointer-events: none; }` : ''}
</style>
</head>
<body>
<div id="vc">
  ${thumbnail ? '<div id="tb"></div>' : ''}
  <video id="v" playsinline autoplay muted></video>
  <div id="load">
    <div class="sp"></div>
    <div class="ln">🔴 ${name.toUpperCase()}</div>
    <div class="ls">Inapakia stream...</div>
  </div>
  <div id="err">
    <div class="et">⚠️ Stream Haipatikani</div>
    <div class="em" id="em">Mtu huyu labda sio live sasa hivi au stream imeshindwa kupakia.</div>
    <button class="br" onclick="retry()">🔄 Jaribu Tena</button>
    <button class="bs" onclick="openExt()">🌐 Fungua kwenye Browser</button>
  </div>
  <button id="mut" onclick="toggleMute()" title="Mute/Unmute">🔇</button>
</div>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
<script>
var video = document.getElementById('v');
var loadEl = document.getElementById('load');
var errEl = document.getElementById('err');
var mutBtn = document.getElementById('mut');
var hls, tryIdx = 0;
var URLS = ${JSON.stringify([hlsUrl, ...altUrls])};
var originalUrl = ${JSON.stringify(originalUrl)};

function showErr(msg) {
  if (msg) document.getElementById('em').textContent = msg;
  loadEl.classList.add('hide');
  errEl.classList.add('show');
  mutBtn.classList.remove('show');
}

function hideLoad() {
  loadEl.classList.add('hide');
  errEl.classList.remove('show');
  mutBtn.classList.add('show');
}

function toggleMute() {
  video.muted = !video.muted;
  mutBtn.textContent = video.muted ? '🔇' : '🔊';
}

function openExt() {
  window.parent.postMessage({ type: 'slr_open_external', url: originalUrl }, '*');
}

function initHLS(url) {
  console.log('Trying HLS URL:', url);
  if (hls) { hls.destroy(); hls = null; }
  video.src = '';

  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 60,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 8,
      xhrSetup: function(xhr, url) {
        xhr.setRequestHeader('Origin', 'https://stripchat.com');
        xhr.setRequestHeader('Referer', 'https://stripchat.com/');
      }
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, function() {
      video.play()
        .then(hideLoad)
        .catch(function() {
          // Autoplay blocked — retry muted
          video.muted = true;
          video.play().then(hideLoad).catch(function() { showErr('Ruhusa ya autoplay imezuiwa.'); });
        });
    });

    hls.on(Hls.Events.ERROR, function(ev, data) {
      console.error('HLS error:', data.type, data.details, data.fatal);
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // Try next URL
          tryIdx++;
          if (tryIdx < URLS.length) {
            console.log('Switching to URL #' + tryIdx);
            setTimeout(function() { initHLS(URLS[tryIdx]); }, 1000);
          } else {
            showErr('Imeshindwa kupakia stream. Mtu huyu labda sio live.');
          }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          tryIdx++;
          if (tryIdx < URLS.length) {
            setTimeout(function() { initHLS(URLS[tryIdx]); }, 1000);
          } else {
            showErr('Stream haipatikani sasa.');
          }
        }
      }
    });

  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    video.src = url;
    video.addEventListener('loadedmetadata', function() {
      video.play().then(hideLoad).catch(function() {
        video.muted = true;
        video.play().then(hideLoad).catch(function() { showErr('Imeshindwa kucheza stream.'); });
      });
    }, { once: true });
    video.addEventListener('error', function() {
      tryIdx++;
      if (tryIdx < URLS.length) { initHLS(URLS[tryIdx]); }
      else { showErr('Stream haipatikani.'); }
    }, { once: true });
  } else {
    showErr('Browser haisaidii HLS.');
  }
}

function retry() {
  errEl.classList.remove('show');
  loadEl.classList.remove('hide');
  tryIdx = 0;
  setTimeout(function() { initHLS(URLS[0]); }, 400);
}

// 15s timeout
var loadTO = setTimeout(function() {
  if (video.paused || !video.readyState) {
    tryIdx++;
    if (tryIdx < URLS.length) { initHLS(URLS[tryIdx]); }
    else { showErr('Stream inachukua muda mrefu. Mtu huyu labda sio live.'); }
  }
}, 15000);

video.addEventListener('playing', function() { clearTimeout(loadTO); hideLoad(); }, { once: true });

// Tap video → toggle mute
video.addEventListener('click', toggleMute);

initHLS(URLS[0]);
</script>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY B: StripChat category page → External widget API model grid
// ─────────────────────────────────────────────────────────────────────────────
async function buildStripchatCategoryPage(pathname: string, proxyBase: string): Promise<string> {
  const tag = getStripchatCategoryTag(pathname)
  console.log(`StripChat category page, tag: ${tag}`)

  let models: any[] = []
  let fetchError = ''

  // Try external widget API — it's publicly accessible without auth
  try {
    // The widget API supports tags/ethnicity filtering
    const widgetUrl = `https://stripchat.com/api/external/v4/widget?limit=40&offset=0${tag ? `&tags=${encodeURIComponent(tag)}` : ''}`
    console.log('Widget API URL:', widgetUrl)

    const resp = await fetch(widgetUrl, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'application/json',
        'Accept-Encoding': 'identity',
        'Referer': 'https://stripchat.com/',
        'Origin': 'https://stripchat.com',
      },
      redirect: 'follow',
    })

    console.log('Widget API status:', resp.status)
    if (resp.ok) {
      const data = await resp.json()
      models = data?.models || data?.users || []
      console.log(`Got ${models.length} models from widget API`)
    } else {
      // Try without tag filter as fallback
      if (tag) {
        const fallbackResp = await fetch(`https://stripchat.com/api/external/v4/widget?limit=40&offset=0`, {
          headers: { 'User-Agent': randomUA(), 'Accept': 'application/json', 'Accept-Encoding': 'identity', 'Referer': 'https://stripchat.com/' },
        })
        if (fallbackResp.ok) {
          const d = await fallbackResp.json()
          models = d?.models || d?.users || []
        }
      }
    }
  } catch (e) {
    console.error('Widget API error:', e)
    fetchError = String(e).substring(0, 100)
  }

  return buildModelGridPage(models, tag, proxyBase, fetchError)
}

function buildModelGridPage(models: any[], tag: string | null, proxyBase: string, fetchError: string): string {
  const title = tag ? tag.charAt(0).toUpperCase() + tag.slice(1) + ' Girls Live' : 'Girls Live'

  const modelCards = models.length > 0 ? models.map((m: any) => {
    const username = m.username || m.name || m.login || ''
    const snapshot = m.snapshotUrl || m.previewUrl || m.thumbnail || m.avatar || ''
    const isLive = m.isLive !== false
    const viewerCount = m.viewerCount || m.viewers || m.viewersCount || 0
    const modelUrl = `${proxyBase}${encodeURIComponent('https://stripchat.com/' + username)}`

    return `
    <a href="${modelUrl}" class="card" style="cursor:pointer;display:block;text-decoration:none;">
      <div class="thumb">
        ${snapshot ? `<img src="${snapshot}" alt="${username}" loading="lazy" onerror="this.style.display='none'">` : ''}
        <div class="overlay">
          ${isLive ? '<span class="live-badge">🔴 LIVE</span>' : ''}
          ${viewerCount > 0 ? `<span class="viewers">👁 ${viewerCount}</span>` : ''}
        </div>
        <div class="play-btn">▶</div>
      </div>
      <div class="info">
        <div class="uname">${username}</div>
      </div>
    </a>`
  }).join('') : `
  <div class="empty">
    <div style="font-size:48px;margin-bottom:16px">🔴</div>
    <div style="color:#FF1493;font-size:16px;font-weight:900;margin-bottom:8px">Hakuna models live sasa</div>
    <div style="color:#555;font-size:12px">${fetchError ? 'API error: ' + fetchError : 'Jaribu tena baadaye'}</div>
    <a href="${proxyBase}${encodeURIComponent('https://stripchat.com/')}" class="btn-retry" style="display:inline-block;margin-top:16px;text-decoration:none;">Tazama wote →</a>
  </div>`

  return `<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - SEXY LIVE ROOM</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html { background: #0a0010; }
body { background: #0a0010; color: #fff; font-family: -apple-system, sans-serif; min-height: 100vh; padding-bottom: 20px; }
.hdr {
  position: sticky; top: 0; z-index: 100;
  background: rgba(10,0,16,0.97); border-bottom: 1px solid rgba(255,20,147,0.2);
  padding: 12px 16px; display: flex; align-items: center; gap: 12px;
}
.hdr-title { flex: 1; }
.hdr-title h1 { color: #FF1493; font-size: 15px; font-weight: 900; letter-spacing: 1px; }
.hdr-title p { color: #555; font-size: 11px; margin-top: 2px; }
.live-dot { width: 8px; height: 8px; background: #FF1493; border-radius: 50%; animation: pulse 1.2s ease-in-out infinite; flex-shrink: 0; }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
.count-badge { background: rgba(255,20,147,0.15); border: 1px solid rgba(255,20,147,0.3); color: #FF1493; font-size: 11px; font-weight: 900; padding: 3px 8px; border-radius: 20px; flex-shrink: 0; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 12px; }
.card { background: #120018; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05); transition: transform 0.15s, border-color 0.15s; }
.card:active { transform: scale(0.97); border-color: rgba(255,20,147,0.4); }
.thumb { position: relative; aspect-ratio: 0.75; background: linear-gradient(135deg, #1a0028, #0a0010); overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.8) 100%); display: flex; justify-content: space-between; align-items: flex-end; padding: 8px; }
.live-badge { background: #e60026; color: #fff; font-size: 9px; font-weight: 900; padding: 2px 6px; border-radius: 4px; letter-spacing: 1px; }
.viewers { color: rgba(255,255,255,0.8); font-size: 10px; font-weight: 600; }
.play-btn { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; font-size: 28px; text-shadow: 0 0 20px rgba(255,20,147,0.8); }
.card:hover .play-btn { opacity: 1; }
.info { padding: 8px; }
.uname { font-size: 12px; font-weight: 700; color: #fff; truncate: true; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty { text-align: center; padding: 60px 24px; }
.btn-retry { background: linear-gradient(135deg,#FF1493,#C2185B); color: #fff; border: none; padding: 12px 24px; border-radius: 12px; font-size: 13px; font-weight: 900; cursor: pointer; }
.loading-msg { text-align: center; padding: 40px; color: #555; font-size: 13px; }
</style>
</head>
<body>
<div class="hdr">
  <div class="live-dot"></div>
  <div class="hdr-title">
    <h1>🔴 ${title.toUpperCase()}</h1>
    <p>${models.length > 0 ? models.length + ' wanaofanya live sasa' : 'Inafetching...'}</p>
  </div>
  ${models.length > 0 ? `<div class="count-badge">${models.length} LIVE</div>` : ''}
</div>
<div class="grid">
  ${modelCards}
</div>
<script>
// Intercept link clicks and route through proxy
document.querySelectorAll('a.card').forEach(function(a) {
  a.addEventListener('click', function(e) {
    // Let href work normally — proxy URL is already set
  });
});
</script>
</body>
</html>`
}

// Fallback page for offline/error
function buildStripchatFallbackPage(username: string, modelName: string, status: string, errorMsg: string, originalUrl: string, thumbnail: string): string {
  return `<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${modelName}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: radial-gradient(ellipse at center,#1a0028 0%,#080010 60%,#000 100%); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: sans-serif; padding: 24px; text-align: center; }
.card { max-width: 300px; width: 100%; }
.av { width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 16px; overflow: hidden; background: linear-gradient(135deg,#FF1493,#C2185B); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 900; ${thumbnail ? `background-image: url('${thumbnail}'); background-size: cover; background-position: top;` : ''} }
.nm { font-size: 20px; font-weight: 900; color: #FF1493; margin-bottom: 8px; }
.st { font-size: 13px; color: #666; margin-bottom: 24px; line-height: 1.5; }
.bp { background: linear-gradient(135deg,#FF1493,#C2185B); color: white; border: none; padding: 14px; border-radius: 14px; font-size: 14px; font-weight: 900; cursor: pointer; width: 100%; margin-bottom: 10px; box-shadow: 0 4px 20px rgba(255,20,147,0.4); }
.bs { background: transparent; color: #666; border: 1px solid #333; padding: 10px; border-radius: 12px; font-size: 12px; cursor: pointer; width: 100%; }
.icon { font-size: 52px; margin-bottom: 16px; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">😴</div>
  ${!thumbnail ? `<div class="av">${(modelName[0] || '?').toUpperCase()}</div>` : `<div class="av"></div>`}
  <div class="nm">${modelName}</div>
  <div class="st">${errorMsg || 'Mtu huyu sio live sasa hivi'}</div>
  <button class="bp" onclick="window.parent.postMessage({type:'slr_reload_url',url:'https://stripchat.com/girls/african'},'*')">🔴 Tazama wengine wanaofanya live</button>
  <button class="bs" onclick="window.parent.postMessage({type:'slr_open_external',url:${JSON.stringify(originalUrl)}},'*')">🌐 Fungua Browser</button>
</div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY C: Wrapper iframe for other SPA sites
// ─────────────────────────────────────────────────────────────────────────────
function buildWrapperPage(targetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEXY LIVE ROOM</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
#fw { position: fixed; top: -80px; left: 0; right: 0; bottom: 0; background: #000; }
#mf { width: 100%; height: calc(100% + 80px); border: none; display: block; background: #000; }
</style>
</head>
<body>
<div id="fw">
  <iframe id="mf" src="${targetUrl}"
    allow="camera; microphone; autoplay; fullscreen; payment; geolocation; accelerometer; gyroscope; picture-in-picture; clipboard-write; encrypted-media; web-share"
    allowfullscreen referrerpolicy="no-referrer-when-downgrade"
    sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-pointer-lock allow-top-navigation-by-user-activation allow-downloads allow-modals allow-presentation allow-popups-to-escape-sandbox allow-orientation-lock"
  ></iframe>
</div>
<script>
(function(){
  var f = document.getElementById('mf');
  f.addEventListener('load', function() {
    try {
      var doc = f.contentDocument || f.contentWindow.document;
      if (doc) {
        var s = doc.createElement('style');
        s.textContent = 'header,nav,[class*="header"],[class*="cookie"],[class*="gdpr"],[class*="age-gate"]{ display:none!important; } body,html{ margin-top:0!important; padding-top:0!important; }';
        (doc.head || doc.documentElement).appendChild(s);
      }
    } catch(e) {}
  });
  window.addEventListener('message', function(e) {
    if (window.parent && window.parent !== window) window.parent.postMessage(e.data, '*');
  });
})();
</script>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY D: Server-side fetch for regular sites
// ─────────────────────────────────────────────────────────────────────────────
const HIDE_INJECT = `
<style id="__slr_hide">
header,nav,[role="banner"],[class*="header"]:not([class*="content"]):not([class*="video"]):not([class*="player"]),
[class*="navbar"],[class*="cookie"],[class*="gdpr"],[class*="age-gate"],
#header,#nav,#topbar,#navbar,.site-nav {
  display:none!important; height:0!important; visibility:hidden!important;
}
body,html{ margin-top:0!important; padding-top:0!important; }
</style>
<script id="__slr_js">
(function(){
  try{Object.defineProperty(window,'top',{get:function(){return window;},configurable:true});}catch(e){}
  try{Object.defineProperty(window,'parent',{get:function(){return window;},configurable:true});}catch(e){}
  function h(){
    ['header','nav','#header','#navbar','[class*="cookie"]','[class*="age-gate"]'].forEach(function(s){
      try{document.querySelectorAll(s).forEach(function(el){
        var c=(el.className||'').toString().toLowerCase();
        if(c.includes('content')||c.includes('video')||c.includes('player'))return;
        el.style.cssText='display:none!important;';
      });}catch(e){}
    });
  }
  document.addEventListener('DOMContentLoaded',function(){h();setTimeout(h,500);setTimeout(h,2000);});
  window.addEventListener('load',function(){h();setTimeout(h,1000);});
  try{var o=new MutationObserver(h);o.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){o.disconnect();},20000);}catch(e){}
})();
<\/script>`

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const htmlHeaders = { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store' }

  try {
    const reqUrl = new URL(req.url)
    const target = reqUrl.searchParams.get('url')
    const apiKey = reqUrl.searchParams.get('apikey') || ''
    const proxyBase = `${reqUrl.protocol}//${reqUrl.host}/functions/v1/proxy-browser?apikey=${encodeURIComponent(apiKey)}&url=`

    if (!target) return new Response('URL required', { status: 400, headers: corsHeaders })

    let normalizedTarget = target.trim()
    if (!/^https?:\/\//i.test(normalizedTarget)) normalizedTarget = 'https://' + normalizedTarget

    let targetUrl: URL
    try { targetUrl = new URL(normalizedTarget) }
    catch { return new Response('Invalid URL', { status: 400, headers: corsHeaders }) }

    if (!['http:', 'https:'].includes(targetUrl.protocol))
      return new Response('Only HTTP/HTTPS allowed', { status: 400, headers: corsHeaders })

    if (isPrivateIP(targetUrl.hostname))
      return new Response('Private IPs not allowed', { status: 403, headers: corsHeaders })

    const hostname = targetUrl.hostname.toLowerCase()

    // ── StripChat ──────────────────────────────────────────────────────────────
    if (hostname === 'stripchat.com' || hostname === 'www.stripchat.com') {
      const username = getStripchatUsername(targetUrl.pathname)

      if (username) {
        // Specific model page → HLS player
        console.log(`StripChat model: ${username}`)
        const html = await buildStripchatStreamPage(username, normalizedTarget)
        return new Response(html, { status: 200, headers: htmlHeaders })
      } else {
        // Category/browse page → external widget API model grid
        console.log(`StripChat category: ${targetUrl.pathname}`)
        const html = await buildStripchatCategoryPage(targetUrl.pathname, proxyBase)
        return new Response(html, { status: 200, headers: htmlHeaders })
      }
    }

    // ── Other SPA / adult sites → wrapper iframe ───────────────────────────────
    if (isSPADomain(hostname)) {
      console.log(`SPA domain: ${hostname} → wrapper iframe`)
      return new Response(buildWrapperPage(normalizedTarget), { status: 200, headers: htmlHeaders })
    }

    // ── Regular sites → server-side fetch ─────────────────────────────────────
    console.log(`Regular domain: ${hostname} → server-side fetch`)

    const fetchHdrs: Record<string, string> = {
      'User-Agent': randomUA(),
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Cache-Control': 'no-cache',
      'Upgrade-Insecure-Requests': '1',
    }

    const clientCookie = req.headers.get('cookie')
    if (clientCookie) fetchHdrs['Cookie'] = clientCookie

    let resp: Response
    try {
      resp = await fetch(normalizedTarget, { method: 'GET', headers: fetchHdrs, redirect: 'follow' })
    } catch (err) {
      return new Response(
        `<html><body style="background:#0a030f;color:white;text-align:center;padding:40px;font-family:sans-serif"><h2 style="color:#FF1493">⚠️ Imeshindwa Kuunganika</h2><p style="color:#888">${String(err).substring(0, 200)}</p></body></html>`,
        { status: 200, headers: htmlHeaders }
      )
    }

    const setCookieHdr = resp.headers.get('set-cookie')

    // 4xx → try homepage
    if (resp.status >= 400 && resp.status < 500) {
      const hp = `${targetUrl.protocol}//${targetUrl.host}/`
      try {
        const hr = await fetch(hp, { method: 'GET', headers: fetchHdrs, redirect: 'follow' })
        if (hr.status < 400) resp = hr
      } catch {}
    }

    const ct = resp.headers.get('content-type') || 'text/html'
    if (!ct.toLowerCase().includes('text/html')) {
      const body = await resp.arrayBuffer()
      return new Response(body, { status: 200, headers: { ...corsHeaders, 'Content-Type': ct } })
    }

    let html = ''
    try { html = await resp.text() } catch (e) { html = `<p style="color:white">Read error: ${e}</p>` }

    let finalOrigin = targetUrl.origin
    try { finalOrigin = new URL(resp.url || normalizedTarget).origin } catch {}

    const baseTag = `<base href="${finalOrigin}/" />`
    const injection = baseTag + HIDE_INJECT

    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/(<head[^>]*>)/i, `$1\n${injection}`)
    } else {
      html = `<head>${injection}</head>\n` + html
    }

    // Rewrite same-domain links through proxy
    html = html.replace(
      /(<a\s[^>]*href=["'])(?!#|javascript:|mailto:|tel:|data:)(https?:\/\/[^"'>\s]+)(["'])/gi,
      (match, pre, linkUrl, post) => {
        if (/\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mp3|css|js|woff2?|ico|ttf)(\?|#|$)/i.test(linkUrl)) return match
        try {
          if (new URL(linkUrl).hostname === targetUrl.hostname)
            return `${pre}${proxyBase}${encodeURIComponent(linkUrl)}${post}`
        } catch {}
        return match
      }
    )

    const resHdrs: Record<string, string> = { ...htmlHeaders }
    if (setCookieHdr) resHdrs['Set-Cookie'] = setCookieHdr

    return new Response(html, { status: 200, headers: resHdrs })

  } catch (error) {
    console.error('Proxy top-level error:', error)
    return new Response(
      `<html><body style="background:#0a030f;color:white;text-align:center;padding:40px;font-family:sans-serif"><h2 style="color:#FF1493">⚠️ Hitilafu</h2><p style="color:#888">${String(error).substring(0, 300)}</p></body></html>`,
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }
})
