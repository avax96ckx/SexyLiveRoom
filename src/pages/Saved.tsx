import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { SavedItem } from '@/types';
import { ArrowLeft, Play, Trash2, BookMarked } from 'lucide-react';
import { toast } from 'sonner';

function getTypeIcon(type?: string) {
  if (!type) return '📌';
  if (type === 'video') return '🎬';
  if (type === 'live') return '🔴';
  if (type === 'malaya') return '💋';
  if (type.includes('room')) return '💋';
  if (type.includes('chat')) return '💬';
  if (type.includes('image')) return '🖼️';
  if (type === 'audio') return '🎵';
  return '📌';
}

function getTypeLabel(type?: string) {
  const map: Record<string, string> = {
    video: '🎬 Video',
    live: '🔴 Live',
    malaya: '💋 Malaya',
    room_video: '💋 SexyRoom Video',
    room_image: '💋 SexyRoom Picha',
    chat_video: '💬 Chat Video',
    chat_image: '💬 Chat Picha',
    audio: '🎵 Sauti',
    text: '💬 Ujumbe',
  };
  return map[type || ''] || type || 'Saved';
}

export default function Saved() {
  const navigate = useNavigate();
  const { user } = useAuth() as any;
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchSaved();
  }, [user]);

  async function fetchSaved() {
    if (!user) return;
    const { data } = await supabase
      .from('saved_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setItems((data || []) as SavedItem[]);
    setLoading(false);
  }

  async function deleteSaved(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from('saved_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
    toast.success('Imeondolewa!');
  }

  function handleOpen(item: SavedItem) {
    const type = item.content_type || '';
    const id = item.content_id;
    const url = item.content_url;

    // TikSexy post types (video/malaya/services/live saved from TikSexy feed)
    // Navigate to TikSexy with the specific post highlighted
    if (type === 'video' || type === 'malaya' || type === 'services' || type === 'live') {
      // Navigate to tiksexy with post id so it can scroll to that post
      if (id) {
        navigate(`/tiksexy?post=${id}`);
      } else {
        navigate('/tiksexy');
      }
      return;
    }

    // SexyRoom messages → scroll & highlight specific message
    if (type === 'room_video' || type === 'room_image' || type === 'audio') {
      navigate(`/sexyroom${id ? `?msg=${id}` : ''}`);
      return;
    }

    // SexyRoom text messages
    if (type === 'text' && id) {
      // Try to determine if it's a room or chat message - go to sexyroom with msg ID
      navigate(`/sexyroom?msg=${id}`);
      return;
    }

    // Chat messages (from messenger/ChatDetail) → navigate directly to specific message
    if (type === 'chat_video' || type === 'chat_image' || type === 'chat_message') {
      if (item.content_id) {
        // sender_id stored in content_url when type is chat_message (format: sender:{senderId})
        // OR look up the message from DB to find the other participant
        const senderMatch = item.content_url?.match(/^sender:([^|]+)/);
        const partnerId = senderMatch ? senderMatch[1] : null;
        if (partnerId) {
          navigate(`/chat/${partnerId}?msg=${item.content_id}`);
        } else {
          // Fallback: look up the message to find sender/receiver
          supabase.from('messages').select('sender_id,receiver_id').eq('id', item.content_id).single().then(({ data: msg }) => {
            if (msg) {
              // Go to the other person's conversation
              const otherId = msg.sender_id === item.user_id ? msg.receiver_id : msg.sender_id;
              navigate(`/chat/${otherId}?msg=${item.content_id}`);
            } else {
              navigate('/chat');
            }
          });
        }
      } else {
        navigate('/chat');
      }
      return;
    }

    // Video content → always navigate to VideoSection post page (not play directly)
    if (type === 'video') {
      if (id) {
        // Navigate to the specific post in VideoSection
        navigate(`/video?post=${id}`);
      } else {
        navigate('/video');
      }
      return;
    }

    // Malaya → navigate directly to the specific post
    if (type === 'malaya') {
      if (id) {
        navigate(`/malaya?post=${id}`);
      } else {
        navigate('/malaya');
      }
      return;
    }

    // Live → navigate directly to the specific live option
    if (type === 'live') {
      if (id) {
        navigate(`/live?opt=${id}`);
      } else {
        navigate('/live');
      }
      return;
    }

    // Also handle 'text' type messages saved from older versions with sender prefix
    if (type === 'text') {
      if (item.content_url?.startsWith('sender:') && item.content_id) {
        const senderMatch = item.content_url.match(/^sender:([^|]+)/);
        const partnerId = senderMatch ? senderMatch[1] : null;
        if (partnerId) { navigate(`/chat/${partnerId}?msg=${item.content_id}`); return; }
      }
      // SexyRoom text
      if (item.content_id) { navigate(`/sexyroom?msg=${item.content_id}`); return; }
    }

    // Any video URL → open in VLC player
    if (url && /\.(mp4|webm|mov|avi|mkv)/i.test(url)) {
      navigate('/play', { state: { url, title: item.content_name || 'Video', urls: [url] } });
      return;
    }

    // Any media URL → open in player
    if (url) {
      navigate('/play', { state: { url, title: item.content_name || 'Media', urls: [url] } });
    }
  }

  return (
    <div className="page-container">
      <div className="top-bar px-4 py-3 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => navigate(-1)} className="text-gray-400"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-white font-bold text-xl flex-1">🔖 Zilizohifadhiwa</h1>
        <span className="text-gray-500 text-sm">{items.length}</span>
      </div>

      <div className="max-w-md mx-auto px-4 pt-2">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <BookMarked className="w-16 h-16 mx-auto mb-4 opacity-20 text-primary" />
            <p className="text-gray-400 text-lg">Bado hujahifadhi chochote</p>
            <p className="text-gray-600 text-sm mt-2">Bonyeza 🔖 kwenye ujumbe wowote kuhifadhi</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id}
                className="content-box flex items-center gap-3 p-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => handleOpen(item)}>
                {/* Thumbnail */}
                <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#1a0a1a] flex items-center justify-center">
                  {item.thumbnail_url ? (
                    <>
                      <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      {(item.content_type === 'video' || item.content_type?.includes('video')) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="w-5 h-5 text-white fill-white" />
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-2xl">{getTypeIcon(item.content_type)}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {item.content_name || 'Kitu kilichohifadhiwa'}
                  </p>
                  <p className="text-gray-400 text-xs mt-0.5">{getTypeLabel(item.content_type)}</p>
                  <p className="text-primary text-xs font-semibold mt-0.5">
                    Bonyeza kufungua →
                  </p>
                </div>

                {/* Date + delete */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <p className="text-gray-600 text-[10px]">
                    {new Date(item.created_at).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' })}
                  </p>
                  <button onClick={e => deleteSaved(item.id, e)}
                    className="text-gray-600 hover:text-red-400 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="h-8" />
      </div>
    </div>
  );
}
