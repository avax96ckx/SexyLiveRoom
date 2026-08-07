// Vercel Serverless Function - Bot detection + SPA routing
// ALL requests go through here (per vercel.json rewrite)
// Bots (WhatsApp, Facebook, Google, etc.) → og-meta edge function (dynamic OG tags)
// Regular users → serve React SPA (dist/index.html)

import fs from 'fs';
import path from 'path';

const BOT_PATTERN = /facebookexternalhit|facebookcatalog|twitterbot|telegrambot|whatsapp|discordbot|linkedinbot|slackbot|googlebot|bingbot|applebot|ia_archiver|mj12bot|yandexbot|baidu|sogou|exabot|scrapy|python-requests|curl\/|wget\/|WhatsApp|Facebook|Twitter|Telegram|Instagram|Pinterest|Snapchat|TikTok/i;

const OG_META_URL = 'https://akbbwymyporonqewakbb.backend.onspace.ai/functions/v1/og-meta';

function serveReactSPA(res) {
  try {
    // Try to serve from dist/index.html (built SPA)
    const indexPath = path.join(process.cwd(), 'dist', 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).send(html);
  } catch (e) {
    // Fallback: read the source index.html (dev/preview mode)
    try {
      const srcPath = path.join(process.cwd(), 'index.html');
      const html = fs.readFileSync(srcPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      return res.status(200).send(html);
    } catch (e2) {
      // Last fallback: redirect to root
      res.setHeader('Location', 'https://sexy-live-room.vercel.app/');
      return res.status(302).end();
    }
  }
}

export default async function handler(req, res) {
  const ua = req.headers['user-agent'] || '';
  const isBot = BOT_PATTERN.test(ua);

  // Get the original request URL/path
  const reqUrl = req.url || '/';

  if (isBot) {
    try {
      // Call og-meta edge function with the full path (including query params)
      const encodedPath = encodeURIComponent(reqUrl);
      const ogUrl = `${OG_META_URL}?path=${encodedPath}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const r = await fetch(ogUrl, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html',
          'x-forwarded-host': req.headers['x-forwarded-host'] || req.headers['host'] || 'sexy-live-room.vercel.app',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (r.ok) {
        const html = await r.text();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Served-By', 'slr-bot-handler');
        return res.status(200).send(html);
      }
    } catch (e) {
      console.error('[og] Bot handler error:', e?.message || e);
      // Fall through to serve SPA for bots if og-meta fails
    }
  }

  // Regular user or bot fallback → serve React SPA
  return serveReactSPA(res);
}
