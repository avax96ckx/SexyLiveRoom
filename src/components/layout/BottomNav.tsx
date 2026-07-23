import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Home, MessageCircle, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useEffect, useState, useRef } from 'react';
import { downloadManager } from '@/pages/Downloads';
import { useApp } from '@/contexts/AppContext';
import { showBrowserNotif } from '@/pages/Notifications';

// Global badge state so other components can trigger refresh
let _badgeRefreshFn: (() => void) | null = null;
export function refreshNavBadges() { if (_badgeRefreshFn) _badgeRefreshFn(); }

const LipsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/>
  </svg>
);

const TikSexyIcon = () => (
  <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
    <path d="M17 8 C17 8 17 22 17 26 C17 29.3 14.3 32 11 32 C7.7 32 5 29.3 5 26 C5 22.7 7.7 20 11 20 C12.1 20 13.1 20.3 14 20.8 L14 14.5 C13.1 14.2 12.1 14 11 14 C4.4 14 -1 19.4 -1 26 C-1 32.6 4.4 38 11 38 C17.6 38 23 32.6 23 26 L23 14 C25.3 15.8 28.1 17 31 17 L31 11 C27.7 11 25 8.3 25 5 L19 5 C19 6.7 18.2 8.2 17 9.2 Z"
      fill="rgba(0,255,255,0.5)" transform="translate(2.5, 2.5) scale(0.85)" />
    <path d="M17 8 C17 8 17 22 17 26 C17 29.3 14.3 32 11 32 C7.7 32 5 29.3 5 26 C5 22.7 7.7 20 11 20 C12.1 20 13.1 20.3 14 20.8 L14 14.5 C13.1 14.2 12.1 14 11 14 C4.4 14 -1 19.4 -1 26 C-1 32.6 4.4 38 11 38 C17.6 38 23 32.6 23 26 L23 14 C25.3 15.8 28.1 17 31 17 L31 11 C27.7 11 25 8.3 25 5 L19 5 C19 6.7 18.2 8.2 17 9.2 Z"
      fill="rgba(255,20,147,0.5)" transform="translate(-0.5, -0.5) scale(0.85)" />
    <path d="M17 8 C17 8 17 22 17 26 C17 29.3 14.3 32 11 32 C7.7 32 5 29.3 5 26 C5 22.7 7.7 20 11 20 C12.1 20 13.1 20.3 14 20.8 L14 14.5 C13.1 14.2 12.1 14 11 14 C4.4 14 -1 19.4 -1 26 C-1 32.6 4.4 38 11 38 C17.6 38 23 32.6 23 26 L23 14 C25.3 15.8 28.1 17 31 17 L31 11 C27.7 11 25 8.3 25 5 L19 5 C19 6.7 18.2 8.2 17 9.2 Z"
      fill="white" transform="translate(1, 1) scale(0.85)" />
  </svg>
);

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, requireAuth } = useAuth();
  const { t } = useApp();
  const [chatBadge, setChatBadge] = useState(0);
  const [notifBadge, setNotifBadge] = useState(0);
  const [downloadBadge, setDownloadBadge] = useState(0);
  const [homeBadge, setHomeBadge] = useState(0);
  const [tiksexyBadge, setTiksexyBadge] = useState(0);
  const [roomBadge, setRoomBadge] = useState(0);
  const [profileBadge, setProfileBadge] = useState(0);
  // Global push notification tracker
  const globalSeenNotifIds = useRef(new Set<string>());
  const globalNotifInit = useRef(false);

  const path = location.pathname;

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('read', false);
      setChatBadge(count || 0);
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 5000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchHomeBadge = async () => {
      try {
        const lastRoomVisit = parseInt(localStorage.getItem('slr_last_room_visit') || '0');
        const roomSince = lastRoomVisit > 0 ? new Date(lastRoomVisit).toISOString() : new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { count: roomCount } = await supabase.from('room_messages').select('*', { count: 'exact', head: true }).neq('user_id', user.id).eq('is_deleted', false).gt('created_at', roomSince);
        setRoomBadge(Math.min(roomCount || 0, 99));

        const lastTikVisit = parseInt(localStorage.getItem('slr_last_tiksexy_visit') || '0');
        const tikSince = lastTikVisit > 0 ? new Date(lastTikVisit).toISOString() : new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count: tikCount } = await supabase.from('content_posts').select('*', { count: 'exact', head: true }).in('type', ['video', 'malaya', 'live', 'services']).neq('uploader_id', user.id).gt('created_at', tikSince);
        const { count: svcCount } = await supabase.from('services').select('*', { count: 'exact', head: true }).eq('is_active', true).gt('created_at', tikSince);
        setTiksexyBadge(Math.min((tikCount || 0) + (svcCount || 0), 99));

        const { count: homeCount } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false).in('type', ['new_upload', 'malaya', 'video']);
        setHomeBadge(homeCount || 0);

        const lastFollowerCheck = parseInt(localStorage.getItem('slr_last_follower_check') || '0');
        const followerSince = lastFollowerCheck > 0 ? new Date(lastFollowerCheck).toISOString() : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: followerCount } = await supabase.from('tik_follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id).gt('created_at', followerSince);
        setProfileBadge(Math.min(followerCount || 0, 99));
      } catch {}
    };
    fetchHomeBadge();
    const interval = setInterval(fetchHomeBadge, 4000);
    _badgeRefreshFn = fetchHomeBadge;
    return () => { clearInterval(interval); _badgeRefreshFn = null; };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const fetchNotifs = async () => {
      if (window.location.pathname === '/notifications') { setNotifBadge(0); return; }
      const lastRead = parseInt(localStorage.getItem('slr_notif_last_read') || '0');
      if (lastRead > Date.now() - 10000) { setNotifBadge(0); return; }
      const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).or(`user_id.eq.${user.id},user_id.is.null`).eq('read', false);
      setNotifBadge(count || 0);
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 5000);
    return () => clearInterval(interval);
  }, [user]);

  // Global browser push notifications - fires for ALL new notifications across the entire app
  useEffect(() => {
    if (!user) return;
    const ROUTES_MAP: Record<string, string> = {
      payment_approved: '/wallet', payment_rejected: '/wallet', bonus: '/wallet',
      message: '/chat', vip: '/services', vip_expiry: '/wallet', withdrawal_approved: '/wallet',
      withdrawal_rejected: '/wallet', sale: '/wallet', gift: '/wallet?tab=gifts',
      gift_card: '/gift', live: '/sexyroom', follow: '/settings', like: '/tiksexy',
      tiksexy: '/tiksexy', upload: '/tiksexy', new_upload: '/tiksexy',
      malaya: '/malaya', video: '/video',
    };
    const checkNewNotifs = async () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const { data } = await supabase.from('notifications')
        .select('id,title,message,type,link,read,created_at')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!data) return;
      if (!globalNotifInit.current) {
        data.forEach(n => globalSeenNotifIds.current.add(n.id));
        globalNotifInit.current = true;
        return;
      }
      for (const n of data) {
        if (!globalSeenNotifIds.current.has(n.id)) {
          globalSeenNotifIds.current.add(n.id);
          const link = n.link || ROUTES_MAP[n.type] || '/notifications';
          await showBrowserNotif(n.id, n.title, n.message, link);
        }
      }
    };
    checkNewNotifs();
    const iv = setInterval(checkNewNotifs, 6000);
    return () => clearInterval(iv);
  }, [user?.id]);

  useEffect(() => {
    const updateBadge = () => setDownloadBadge(downloadManager.activeDownloads.size);
    downloadManager.listeners.add(updateBadge);
    return () => { downloadManager.listeners.delete(updateBadge); };
  }, []);

  const navItems = [
    { path: '/', label: t('nav_home'), icon: Home, badge: homeBadge },
    { path: '/tiksexy', label: 'tik-sexy', icon: TikSexyIcon, isTikSexy: true, badge: tiksexyBadge },
    { path: '/sexyroom', label: 'room', icon: LipsIcon, isSpecial: true, badge: roomBadge },
    { path: '/chat', label: t('nav_chat'), icon: MessageCircle, badge: chatBadge },
    { path: '/settings', label: t('nav_settings'), icon: Settings, badge: notifBadge + profileBadge },
  ];

  // Clear badges when visiting pages
  useEffect(() => {
    if (path === '/' || path.startsWith('/malaya') || path.startsWith('/video')) setHomeBadge(0);
    if (path.startsWith('/tiksexy')) {
      setTiksexyBadge(0);
      try { localStorage.setItem('slr_last_tiksexy_visit', Date.now().toString()); } catch {}
    }
    if (path.startsWith('/sexyroom')) {
      setRoomBadge(0);
      try { localStorage.setItem('slr_last_room_visit', Date.now().toString()); } catch {}
    }
    if (path.startsWith('/settings') || path.startsWith('/notifications') || path.startsWith('/profile')) {
      setProfileBadge(0);
      setNotifBadge(0);
      try { localStorage.setItem('slr_last_follower_check', Date.now().toString()); } catch {}
      try { localStorage.setItem('slr_notif_last_read', Date.now().toString()); } catch {}
      if (user) {
        supabase.from('notifications').update({ read: true }).or(`user_id.eq.${user.id},user_id.is.null`).eq('read', false).then(() => {});
      }
    }
  }, [path, user]);

  const handleNav = (item: typeof navItems[0]) => {
    if (item.path === '/chat' || item.path === '/sexyroom') {
      requireAuth(() => navigate(item.path));
    } else {
      navigate(item.path);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 nav-bar">
      <div className="flex items-center justify-around h-16 px-2 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = path === item.path || (item.path !== '/' && path.startsWith(item.path));
          const Icon = item.icon;
          return (
            <button key={item.path} onClick={() => handleNav(item)} className="flex flex-col items-center gap-1 flex-1 py-2 relative transition-all">
              {item.isTikSexy ? (
                <div className="flex flex-col items-center gap-0.5">
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', minWidth: 28, minHeight: 28 }}>
                    <TikSexyIcon />
                    {(item.badge || 0) > 0 && (
                      <span style={{ position: 'absolute', top: -8, right: -10, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 900, minWidth: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', zIndex: 9999, border: '2px solid #000', lineHeight: 1, pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>
                        {(item.badge || 0) > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-black tracking-wider ${isActive ? 'text-white' : 'text-gray-500'}`} style={{ letterSpacing: 1 }}>TIK-SEXY</span>
                </div>
              ) : item.isSpecial ? (
                <div className="flex flex-col items-center gap-0.5">
                  <div style={{ position: 'relative', marginTop: -16, overflow: 'visible', zIndex: 1 }}>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isActive ? 'bg-primary pink-glow scale-110' : 'gradient-pink'}`}>
                      <Icon />
                    </div>
                    {(item.badge || 0) > 0 && (
                      <span style={{ position: 'absolute', top: -8, right: -8, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 900, minWidth: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', zIndex: 9999, border: '2px solid #000', lineHeight: 1, pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>
                        {(item.badge || 0) > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold mt-0.5 ${isActive ? 'text-primary' : 'text-gray-400'}`}>Room</span>
                </div>
              ) : (
                <div className={`relative ${isActive ? 'text-primary' : 'text-gray-500'}`}>
                  <Icon className="w-6 h-6" />
                  {(item.badge || 0) > 0 && (
                    <span style={{ position: 'absolute', top: -7, right: -9, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 900, minWidth: 17, height: 17, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', zIndex: 9999, border: '1.5px solid #000', lineHeight: 1, pointerEvents: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.8)' }}>
                      {(item.badge || 0) > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
              )}
              {!item.isSpecial && !item.isTikSexy && (
                <span className={`text-[10px] font-semibold ${isActive ? 'text-primary' : 'text-gray-500'}`}>{item.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
