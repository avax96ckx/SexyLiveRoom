/**
 * Notifications.tsx — v3 (Trigger bug fixed + simplified push)
 *
 * ROOT CAUSE WAS FIXED: database trigger "on_notification_insert" on notifications table
 * was calling ensure_admin_notifications() which references NEW.amount — a field that
 * doesn't exist on notifications. Every INSERT was failing with 400.
 * Fix: DROP TRIGGER on_notification_insert ON notifications (was placed on wrong table).
 *
 * Browser push strategy (simplified):
 * - Use new Notification() directly — most reliable when permission is granted
 * - SW is only needed for background (tab closed) push — not needed for foreground alerts
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Bell, Trash2, ExternalLink, CheckCheck, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

// ─── Constants ────────────────────────────────────────────────────────────────
const POLL_MS = 4000;
const DELETED_KEY = 'slr_del_notifs_v4';
// Session-scoped set — resets on page reload (allows re-notification after refresh)
const SESSION_SHOWN = new Set<string>();

// ─── Icon + Route maps ────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  general: '🔔', payment_request: '💰', payment_approved: '✅', payment_rejected: '❌',
  bonus: '🎁', welcome: '🎉', vip: '👑', vip_expiry: '⚠️', message: '💬', system: '⚙️',
  app_update: '📱', call: '📞', withdrawal_approved: '💸', withdrawal_rejected: '❌',
  withdrawal_request: '💸', sale: '💰', gift: '🎁', gift_card: '🎫', live: '🔴',
  follow: '👤', like: '❤️', comment: '💬', upload: '📤', new_upload: '📤',
  tiksexy: '🎬', malaya: '💋', video: '🎬',
};
const ROUTES: Record<string, string> = {
  payment_approved: '/wallet', payment_rejected: '/wallet', bonus: '/wallet',
  message: '/chat', vip: '/services', vip_expiry: '/wallet', withdrawal_approved: '/wallet',
  withdrawal_rejected: '/wallet', sale: '/wallet', gift: '/wallet?tab=gifts',
  gift_card: '/gift', live: '/sexyroom', follow: '/settings', like: '/tiksexy',
  tiksexy: '/tiksexy', upload: '/tiksexy', new_upload: '/tiksexy',
  malaya: '/malaya', video: '/video',
};
const COLORS: Record<string, string> = {
  payment_approved: 'border-green-400/40 bg-green-500/5',
  payment_rejected: 'border-red-400/40 bg-red-500/5',
  payment_request: 'border-yellow-400/40 bg-yellow-500/5',
  bonus: 'border-yellow-400/40 bg-yellow-500/5',
  welcome: 'border-primary/40 bg-primary/5',
  vip: 'border-yellow-400/40 bg-yellow-500/5',
  vip_expiry: 'border-orange-400/40 bg-orange-500/5',
  call: 'border-blue-400/40 bg-blue-500/5',
  sale: 'border-green-400/40 bg-green-500/5',
  withdrawal_approved: 'border-green-400/40 bg-green-500/5',
  withdrawal_rejected: 'border-red-400/40 bg-red-500/5',
  gift: 'border-orange-400/40 bg-orange-500/5',
  gift_card: 'border-yellow-400/40 bg-yellow-500/5',
  live: 'border-red-400/40 bg-red-500/5',
  follow: 'border-primary/40 bg-primary/5',
  like: 'border-red-400/40 bg-red-500/5',
  upload: 'border-blue-400/40 bg-blue-500/5',
  new_upload: 'border-blue-400/40 bg-blue-500/5',
};

// ─── localStorage helpers ─────────────────────────────────────────────────────
function getDeleted(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DELETED_KEY) || '[]')); }
  catch { return new Set(); }
}
function addDeleted(id: string) {
  try {
    const s = getDeleted(); s.add(id);
    localStorage.setItem(DELETED_KEY, JSON.stringify([...s].slice(-3000)));
  } catch {}
}

// ─── Browser push (simplified — uses new Notification() directly) ─────────────
export async function showBrowserNotif(id: string, title: string, body: string, url = '/notifications') {
  if (SESSION_SHOWN.has(id)) return;
  SESSION_SHOWN.add(id);

  if (!('Notification' in window)) { console.log('[Push] Not supported'); return; }
  if (Notification.permission !== 'granted') { console.log('[Push] No permission:', Notification.permission); return; }

  console.log('[Push] Showing:', title);

  // PRIMARY: new Notification() — works immediately when permission granted, no SW needed
  try {
    const n = new Notification(title || 'SEXY LIVE ROOM', {
      body: body || 'Arifa mpya!',
      icon: '/icon-192.png',
      tag: `slr-${id}`,
      silent: false,
    });
    n.onclick = () => {
      window.focus();
      if (url && url !== '/notifications') window.location.href = url;
      n.close();
    };
    console.log('[Push] ✅ new Notification() shown');
    return;
  } catch (e) {
    console.warn('[Push] new Notification() failed:', e);
  }

  // FALLBACK: SW showNotification
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (reg?.active) {
        await reg.showNotification(title || 'SEXY LIVE ROOM', {
          body: body || 'Arifa mpya!',
          icon: '/icon-192.png',
          tag: `slr-${id}`,
          data: { url },
        });
        console.log('[Push] ✅ SW showNotification() shown');
      }
    }
  } catch (e2) {
    console.warn('[Push] SW fallback failed:', e2);
  }
}

export async function requestPushPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const r = await Notification.requestPermission();
  console.log('[Push] Permission result:', r);
  return r === 'granted';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Notifications() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth() as any;

  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');

  const seenIds = useRef(new Set<string>());
  const isFirstFetch = useRef(true);
  const localDel = useRef(new Set<string>());

  const updatePerm = useCallback(() => {
    if (!('Notification' in window)) { setPerm('unsupported'); return; }
    setPerm(Notification.permission);
  }, []);

  const filterByRole = useCallback((data: any[]) => {
    if (isAdmin) return data;
    return data.filter(n => !['payment_request', 'withdrawal_request', 'admin_only'].includes(n.type));
  }, [isAdmin]);

  const fetchNotifs = useCallback(async (manual = false) => {
    if (!user) return;
    if (manual) setRefreshing(true);

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[Notif] Fetch error:', error.message);
      if (manual) setRefreshing(false);
      return;
    }

    const deleted = getDeleted();
    let list = filterByRole(data || []).filter(n => !deleted.has(n.id) && !localDel.current.has(n.id));

    if (isFirstFetch.current) {
      isFirstFetch.current = false;
      const cutoff = Date.now() - 15000; // 15 seconds window for "just arrived"
      for (const n of list) {
        seenIds.current.add(n.id);
        // Push browser notification only for very fresh unread ones
        if (!n.read && new Date(n.created_at).getTime() > cutoff) {
          const link = n.link || ROUTES[n.type] || '/notifications';
          await showBrowserNotif(n.id, n.title, n.message, link);
        }
      }
    } else {
      // New notifications = not in seenIds yet
      const newOnes = list.filter(n => !seenIds.current.has(n.id));
      for (const n of newOnes) {
        seenIds.current.add(n.id);
        if (!n.read) {
          const link = n.link || ROUTES[n.type] || '/notifications';
          await showBrowserNotif(n.id, n.title, n.message, link);
        }
      }
      // Add any remaining to seenIds
      list.forEach(n => seenIds.current.add(n.id));
    }

    setNotifications(list);
    setLoading(false);
    if (manual) setRefreshing(false);
  }, [user, filterByRole]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }

    updatePerm();

    // Register SW in background (needed for background push later)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // If permission not yet decided, ask now
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(r => {
        console.log('[Push] Permission from notifications page:', r);
        updatePerm();
      });
    }

    fetchNotifs();
    const interval = setInterval(() => fetchNotifs(), POLL_MS);

    // Mark ALL unread as read immediately when page opens (fixes persistent badge bug)
    // Set a long-lived timestamp so BottomNav knows to keep badge at 0
    const markAllRead = async () => {
      await supabase.from('notifications')
        .update({ read: true })
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .eq('read', false);
      try { localStorage.setItem('slr_notif_last_read', Date.now().toString()); } catch {}
    };
    markAllRead();

    return () => clearInterval(interval);
  }, [user, fetchNotifs, navigate, updatePerm]);

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    const ids = notifications.filter(n => !n.read).map(n => n.id);
    if (!ids.length) { toast.info('Zote zimeshasomwa'); return; }
    await supabase.from('notifications').update({ read: true }).in('id', ids);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast.success(`✅ ${ids.length} arifa zimesomwa!`);
  }

  async function deleteNotif(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    addDeleted(id); localDel.current.add(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id).catch(() => {});
  }

  async function clearAll() {
    if (!notifications.length) return;
    const ids = notifications.map(n => n.id);
    ids.forEach(id => { addDeleted(id); localDel.current.add(id); });
    setNotifications([]);
    await supabase.from('notifications').delete().in('id', ids).catch(() => {});
    toast.success('🗑️ Arifa zote zimefutwa!');
  }

  async function handleClick(notif: any) {
    if (!notif.read) await markRead(notif.id);
    const link = notif.link;
    if (link) {
      if (link.startsWith('http')) window.open(link, '_blank');
      else navigate(link);
      return;
    }
    const route = ROUTES[notif.type];
    if (route) navigate(route);
  }

  async function handleAskPermission() {
    const ok = await requestPushPermission();
    updatePerm();
    if (ok) {
      toast.success('✅ Arifa za browser zimewashwa!');
      // Show a test notification immediately to confirm it works
      setTimeout(() => {
        showBrowserNotif('test-' + Date.now(), '🔔 SEXY LIVE ROOM', 'Arifa za browser zimewashwa vizuri!', '/notifications');
      }, 500);
    } else {
      toast.error('Ruhusa imekataliwa. Badilisha kwenye mipangilio ya browser.');
    }
  }

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Top Bar */}
      <div className="top-bar px-4 py-3 flex items-center gap-2 sticky top-0 z-40">
        <button onClick={() => navigate(-1)} className="text-gray-400 active:scale-90 transition-transform">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-white font-bold text-xl flex-1">🔔 Arifa</h1>
        {isAdmin && (
          <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full border border-yellow-400/30 font-bold">Admin</span>
        )}
        {unread > 0 && (
          <span className="text-xs text-white bg-red-500 px-2 py-0.5 rounded-full font-black">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
        <button onClick={() => fetchNotifs(true)} disabled={refreshing} className="text-gray-400 active:scale-90">
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
        </button>
        {unread > 0 && (
          <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-blue-400 font-semibold active:scale-95">
            <CheckCheck className="w-4 h-4" />Soma
          </button>
        )}
        {notifications.length > 0 && (
          <button onClick={clearAll} className="text-red-400 text-xs font-semibold active:scale-95">Futa</button>
        )}
      </div>

      <div className="max-w-md mx-auto px-4">
        {/* Permission banners */}
        {perm === 'denied' && (
          <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-center">
            <p className="text-red-400 text-xs font-semibold">
              ⚠️ Arifa zimezuiwa kwenye browser. Nenda <strong>Settings → Site Settings → Notifications → Allow</strong>
            </p>
          </div>
        )}
        {perm === 'default' && (
          <div className="mb-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
            <p className="text-blue-300 text-xs mb-2 text-center font-semibold">
              🔔 Washa arifa za browser ili upate taarifa za zawadi, ujumbe na mengine
            </p>
            <button onClick={handleAskPermission} className="w-full py-2 rounded-xl bg-blue-600 text-white font-bold text-sm active:scale-95">
              Washa Arifa za Browser
            </button>
          </div>
        )}
        {perm === 'granted' && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2">
            <span className="text-green-400 text-sm">✅</span>
            <p className="text-green-400 text-xs font-semibold">Arifa za browser zimewashwa</p>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Inapakia arifa...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-3">
            <Bell className="w-14 h-14 opacity-20" />
            <p className="font-semibold">Hakuna arifa bado</p>
            <p className="text-xs text-gray-600 text-center">Tuma zawadi au pata ujumbe — itaonekana hapa</p>
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {notifications.map(notif => {
              const colorClass = COLORS[notif.type] || 'border-[#3d0b3d]';
              return (
                <div key={notif.id}
                  className={`content-box p-4 flex items-start gap-3 cursor-pointer active:scale-[0.98] transition-all ${colorClass} ${!notif.read ? 'border-primary/60' : ''}`}
                  onClick={() => handleClick(notif)}>
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl"
                    style={{ background: 'rgba(255,255,255,0.05)' }}>
                    {ICONS[notif.type] || '🔔'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-white font-semibold text-sm leading-snug">{notif.title}</h3>
                      {!notif.read && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 animate-pulse" />}
                    </div>
                    <p className="text-gray-400 text-sm leading-relaxed">{notif.message}</p>
                    {notif.link && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <ExternalLink className="w-3 h-3 text-primary" />
                        <span className="text-primary text-xs font-semibold">Bonyeza kufungua</span>
                      </div>
                    )}
                    <p className="text-gray-600 text-xs mt-1.5">
                      {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <button onClick={(e) => deleteNotif(notif.id, e)} className="text-gray-600 hover:text-red-400 flex-shrink-0 p-1 active:scale-90">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
