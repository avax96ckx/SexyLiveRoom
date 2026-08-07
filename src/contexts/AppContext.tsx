import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface AppContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
  language: 'sw' | 'en';
  setLanguage: (lang: 'sw' | 'en') => void;
  t: (key: string) => string;
  settings: Record<string, string>;
}

const AppContext = createContext<AppContextType | null>(null);

// Translations
const translations: Record<string, Record<string, string>> = {
  sw: {
    // Navigation
    home: 'Nyumbani',
    chat: 'Ujumbe',
    notifications: 'Arifa',
    settings: 'Mipangilio',
    profile: 'Profaili',
    wallet: 'Mkoba',
    services: 'Huduma',
    video: 'Video',
    live: 'Live',
    malaya: 'Malaya',
    sexyroom: 'Sexy Room',
    // Auth
    logout: 'Toka',
    login: 'Ingia',
    signup: 'Jisajili',
    // Actions
    save: 'Hifadhi',
    delete: 'Futa',
    cancel: 'Ghairi',
    confirm: 'Thibitisha',
    send: 'Tuma',
    search: 'Tafuta',
    loading: 'Inapakia...',
    error: 'Hitilafu',
    success: 'Imefanikiwa',
    balance: 'Salio',
    download: 'Pakua',
    share: 'Shiriki',
    reply: 'Jibu',
    edit: 'Hariri',
    saved: 'Zilizohifadhiwa',
    no_items: 'Hakuna vitu',
    // Services
    vip: 'VIP Member',
    business: 'Business Account',
    blue_tick: 'Blue Tick',
    payment: 'Malipo',
    support: 'Msaada',
    // Theme
    dark_mode: 'Giza',
    light_mode: 'Mwanga',
    language: 'Lugha',
    // Chat
    online: 'Mtandaoni',
    message: 'Ujumbe',
    write_message: 'Andika ujumbe...',
    send_photo: 'Tuma picha',
    record_voice: 'Rekodi sauti',
    view_profile: 'Angalia profaili',
    members: 'Wanachama',
    free: 'Bure',
    paid: 'Lipa',
    newest: 'Mpya',
    popular: 'Maarufu',
    // Notifications page
    notif_title: 'Arifa',
    notif_empty: 'Hakuna arifa',
    notif_clear_all: 'Futa Zote',
    notif_tap_open: 'Bonyeza kufungua',
    notif_admin_view: 'Admin View',
    notif_admin_only: 'Admin Pekee',
    notif_payment_info: 'Unaona arifa za malipo kama Admin',
    // BottomNav
    nav_home: 'Nyumbani',
    nav_chat: 'Ujumbe',
    nav_services: 'Huduma',
    nav_settings: 'Mipangilio',
    // Settings
    settings_title: 'Mipangilio',
    settings_profile: 'Profaili',
    settings_dark: 'Hali ya Giza',
    settings_light: 'Hali ya Mwanga',
    settings_lang_sw: 'Kiswahili',
    settings_lang_en: 'English',
    settings_logout: 'Toka',
    settings_edit_profile: 'Hariri Profaili',
    settings_wallet: 'Mkoba',
    settings_downloads: 'Pakua',
    settings_saved: 'Zilizohifadhiwa',
    // Chat
    chat_title: 'Inbox',
    chat_no_msgs: 'Hakuna mazungumzo bado',
    chat_start: 'Anza mazungumzo na wanachama',
    chat_online: 'Mtandaoni',
    chat_writing: 'Anaandika...',
    // SexyRoom
    room_live_chat: 'Live Chat',
    room_write: 'Andika ujumbe...',
    room_login_write: 'Ingia kutuma ujumbe...',
    // Video
    video_title: 'Video',
    video_category_new: 'Category Mpya',
    video_upload: 'Pakia Video',
    video_no_videos: 'Hakuna video',
    video_free: 'BURE',
    video_views: 'views',
    video_play: 'Cheza',
    video_lock_msg: 'Bonyeza kulipa - bure daima baadaye',
    // Live
    live_title: 'Live',
    live_room: 'Live Room',
    live_video_call: 'Video Call',
    live_join: 'Ingia Live Room',
    live_free_vip: 'Bure (VIP)',
    live_unlocked: 'Imefunguliwa',
    live_no_options: 'Hakuna options bado',
    // Malaya
    malaya_title: 'Malaya',
    malaya_filter: 'Filter',
    malaya_search: 'Tafuta...',
    malaya_free: 'BURE',
    malaya_phone: 'Ona Namba ya Simu (BURE)',
    malaya_pay_phone: 'Lipia TZS {price} - Ona Namba',
    malaya_add: 'Ongeza Tangazo',
    malaya_no_posts: 'Hakuna matangazo',
    // Wallet
    wallet_title: 'Mkoba',
    wallet_balance: 'Salio la Akaunti',
    wallet_deposit: 'Weka Pesa',
    wallet_withdraw: 'Toa Pesa',
    wallet_history: 'Historia ya Malipo',
    wallet_pending: 'Inasubiri',
    wallet_approved: 'Imekubaliwa',
    wallet_rejected: 'Imekataliwa',
    wallet_amount: 'Kiasi',
    wallet_screenshot: 'Screenshot ya Malipo',
    wallet_send_request: 'Tuma Ombi la Malipo',
    wallet_no_history: 'Hakuna historia ya malipo',
  },
  en: {
    // Navigation
    home: 'Home',
    chat: 'Messages',
    notifications: 'Notifications',
    settings: 'Settings',
    profile: 'Profile',
    wallet: 'Wallet',
    services: 'Services',
    video: 'Video',
    live: 'Live',
    malaya: 'Malaya',
    sexyroom: 'Sexy Room',
    // Auth
    logout: 'Logout',
    login: 'Login',
    signup: 'Sign Up',
    // Actions
    save: 'Save',
    delete: 'Delete',
    cancel: 'Cancel',
    confirm: 'Confirm',
    send: 'Send',
    search: 'Search',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    balance: 'Balance',
    download: 'Download',
    share: 'Share',
    reply: 'Reply',
    edit: 'Edit',
    saved: 'Saved Items',
    no_items: 'No items found',
    // Services
    vip: 'VIP Member',
    business: 'Business Account',
    blue_tick: 'Blue Tick',
    payment: 'Payment',
    support: 'Support',
    // Theme
    dark_mode: 'Dark Mode',
    light_mode: 'Light Mode',
    language: 'Language',
    // Chat
    online: 'Online',
    message: 'Message',
    write_message: 'Write a message...',
    send_photo: 'Send photo',
    record_voice: 'Record voice',
    view_profile: 'View profile',
    members: 'Members',
    free: 'Free',
    paid: 'Pay',
    newest: 'Newest',
    popular: 'Popular',
    // Notifications page
    notif_title: 'Notifications',
    notif_empty: 'No notifications',
    notif_clear_all: 'Clear All',
    notif_tap_open: 'Tap to open',
    notif_admin_view: 'Admin View',
    notif_admin_only: 'Admin Only',
    notif_payment_info: 'You are viewing payment notifications as Admin',
    // BottomNav
    nav_home: 'Home',
    nav_chat: 'Chats',
    nav_services: 'Services',
    nav_settings: 'Settings',
    // Settings
    settings_title: 'Settings',
    settings_profile: 'Profile',
    settings_dark: 'Dark Mode',
    settings_light: 'Light Mode',
    settings_lang_sw: 'Kiswahili',
    settings_lang_en: 'English',
    settings_logout: 'Logout',
    settings_edit_profile: 'Edit Profile',
    settings_wallet: 'Wallet',
    settings_downloads: 'Downloads',
    settings_saved: 'Saved Items',
    // Chat
    chat_title: 'Inbox',
    chat_no_msgs: 'No conversations yet',
    chat_start: 'Start chatting with members',
    chat_online: 'Online',
    chat_writing: 'Typing...',
    // SexyRoom
    room_live_chat: 'Live Chat',
    room_write: 'Write a message...',
    room_login_write: 'Login to send messages...',
    // Video
    video_title: 'Video',
    video_category_new: 'New Category',
    video_upload: 'Upload Video',
    video_no_videos: 'No videos yet',
    video_free: 'FREE',
    video_views: 'views',
    video_play: 'Play',
    video_lock_msg: 'Tap to pay - free forever after',
    // Live
    live_title: 'Live',
    live_room: 'Live Room',
    live_video_call: 'Video Call',
    live_join: 'Join Live Room',
    live_free_vip: 'Free (VIP)',
    live_unlocked: 'Unlocked',
    live_no_options: 'No options yet',
    // Malaya
    malaya_title: 'Malaya',
    malaya_filter: 'Filter',
    malaya_search: 'Search...',
    malaya_free: 'FREE',
    malaya_phone: 'View Phone Number (FREE)',
    malaya_pay_phone: 'Pay TZS {price} - View Number',
    malaya_add: 'Add Listing',
    malaya_no_posts: 'No listings',
    // Wallet
    wallet_title: 'Wallet',
    wallet_balance: 'Account Balance',
    wallet_deposit: 'Deposit',
    wallet_withdraw: 'Withdraw',
    wallet_history: 'Payment History',
    wallet_pending: 'Pending',
    wallet_approved: 'Approved',
    wallet_rejected: 'Rejected',
    wallet_amount: 'Amount',
    wallet_screenshot: 'Payment Screenshot',
    wallet_send_request: 'Submit Payment Request',
    wallet_no_history: 'No payment history',
  },
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') !== 'false'; // default dark
  });
  const [language, setLanguageState] = useState<'sw' | 'en'>(() => {
    return (localStorage.getItem('language') as 'sw' | 'en') || 'sw';
  });

  // Global settings cache - shared by all components to eliminate duplicate DB queries
  const [settings, setSettings] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('slr_settings_cache') || '{}'); } catch { return {}; }
  });
  const settingsFetchedAt = useRef<number>(0);

  useEffect(() => {
    // Fetch settings once on mount, then every 60 seconds
    const fetchSettings = async () => {
      if (Date.now() - settingsFetchedAt.current < 30000) return; // throttle
      try {
        const { data } = await supabase.from('app_settings').select('*');
        const m: Record<string, string> = {};
        data?.forEach((r: any) => { m[r.key] = r.value; });
        setSettings(m);
        settingsFetchedAt.current = Date.now();
        try { localStorage.setItem('slr_settings_cache', JSON.stringify(m)); } catch {}
      } catch {}
    };
    fetchSettings();
    const interval = setInterval(fetchSettings, 60000);
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setSettings(prev => ({ ...prev, ...detail }));
        try { localStorage.setItem('slr_settings_cache', JSON.stringify({ ...settings, ...detail })); } catch {}
      }
    };
    window.addEventListener('app-settings-updated', handler);
    return () => { clearInterval(interval); window.removeEventListener('app-settings-updated', handler); };
  }, []);

  useEffect(() => {
    // Apply dark/light mode to document
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('language', language);
    // Set HTML lang attribute
    document.documentElement.lang = language === 'sw' ? 'sw' : 'en';
  }, [language]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const setLanguage = (lang: 'sw' | 'en') => setLanguageState(lang);

  const t = (key: string): string => {
    return translations[language]?.[key] || translations['sw']?.[key] || key;
  };

  return (
    <AppContext.Provider value={{ darkMode, toggleDarkMode, language, setLanguage, t, settings }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
