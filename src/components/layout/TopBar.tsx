import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, Download, Wallet, Gift } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useEffect, useState, useRef } from 'react';

export default function TopBar() {
  const navigate = useNavigate();
  const { user, profile, requireAuth } = useAuth();
  const [notifCount, setNotifCount] = useState(0);
  const [downloadCount, setDownloadCount] = useState(0);
  const lastNotifIdRef = useRef<string | null>(null);
  const shownNotifIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const fetchCounts = async () => {
      // Get deleted notification IDs from localStorage
      const deletedIds = (() => {
        try { return JSON.parse(localStorage.getItem('deleted_notif_ids') || '[]'); } catch { return []; }
      })();

      const { data } = await supabase
        .from('notifications')
        .select('id, title, message, read, created_at')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(10);

      const unread = (data || []).filter((n: any) => !deletedIds.includes(n.id));
      setNotifCount(unread.length);

      if (unread.length > 0) {
        const newest = unread[0] as any;
        lastNotifIdRef.current = newest.id;
        shownNotifIds.current.add(newest.id);
      }

      // Download count
      const { count: d } = await supabase
        .from('user_downloads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'downloading');
      setDownloadCount(d || 0);
    };

    fetchCounts();
    // Poll every 2s for fast badge updates
    const interval = setInterval(fetchCounts, 2000);
    // Also refresh immediately when a notification event fires (admin sends broadcast)
    const notifListener = () => fetchCounts();
    window.addEventListener('app-settings-updated', notifListener);
    window.addEventListener('slr-notif-refresh', notifListener);
    return () => {
      clearInterval(interval);
      window.removeEventListener('app-settings-updated', notifListener);
      window.removeEventListener('slr-notif-refresh', notifListener);
    };
  }, [user]);

  return (
    <div className="sticky top-0 z-40">


      <div className="top-bar px-4 py-2">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Left: Gift + Wallet icons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => requireAuth(() => navigate('/gift'))}
              className="relative w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.25)' }}
              title="Gift Cards">
              <Gift className="w-5 h-5 text-orange-400" />
            </button>
            <button
              onClick={() => requireAuth(() => navigate('/wallet'))}
              className="relative w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.22)' }}
              title="Wallet">
              <Wallet className="w-5 h-5 text-yellow-400" />
            </button>
          </div>

          {/* Center: Logo */}
          <div className="flex flex-col items-center">
            <span className="text-white font-black text-xl tracking-wider" style={{ textShadow: '0 0 20px #FF1493, 0 0 40px #FF1493', letterSpacing: '3px' }}>
              <span style={{ color: '#FF1493' }}>SEXY</span>
            </span>
            <span className="text-xs text-gray-400 tracking-[4px] -mt-1">LIVE ROOM</span>
          </div>

          {/* Right: Download + Bell */}
          <div className="flex items-center gap-3">
            <button onClick={() => requireAuth(() => navigate('/downloads'))} className="relative text-gray-300 hover:text-primary transition-colors">
              <Download className="w-6 h-6" />
              {downloadCount > 0 && (
                <span className="badge text-[9px]">{downloadCount > 99 ? '99+' : downloadCount}</span>
              )}
            </button>
            <button onClick={() => requireAuth(() => navigate('/notifications'))} className="relative text-gray-300 hover:text-primary transition-colors">
              <Bell className="w-6 h-6" />
              {notifCount > 0 && (
                <span className="badge text-[9px]">{notifCount > 99 ? '99+' : notifCount}</span>
              )}
            </button>
          </div>
        </div>
      </div>


    </div>
  );
}
