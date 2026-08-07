import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isAdminPhone, isAdminEmail } from '@/lib/supabase';
import { UserProfile } from '@/types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  login: (user: User, profile: UserProfile) => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  requireAuth: (callback: () => void) => void;
  showAuthModal: boolean;
  setShowAuthModal: (v: boolean) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function checkIsAdmin(profile: any, authUser?: User | null): boolean {
  if (!profile) return false;
  if (profile.is_admin === true) return true;
  if (profile.google_email && isAdminEmail(profile.google_email)) return true;
  if (profile.phone && isAdminPhone(profile.phone)) return true;
  if (profile.email && isAdminEmail(profile.email)) return true;
  if (authUser?.email && isAdminEmail(authUser.email)) return true;
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const isAdmin = checkIsAdmin(profile, user);

  const fetchAndSetProfile = useCallback(async (userId: string, authUser?: User | null): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles').select('*').eq('id', userId).single();

      if (data) {
        // Check if user is BLOCKED - set account_status
        if (data.is_blocked || data.account_status === 'blocked') {
          setProfile(data as UserProfile);
          return data as UserProfile;
        }
        // Auto-sync Google user metadata
        if (authUser?.app_metadata?.provider === 'google') {
          const meta = authUser.user_metadata;
          const updates: any = {};
          if (!data.avatar_url && (meta?.avatar_url || meta?.picture)) updates.avatar_url = meta?.avatar_url || meta?.picture;
          if (!data.username && (meta?.full_name || meta?.name)) updates.username = meta?.full_name || meta?.name;
          if (!data.google_email && authUser.email) updates.google_email = authUser.email;
          if (isAdminEmail(authUser.email || '') && !data.is_admin) updates.is_admin = true;
          if (Object.keys(updates).length > 0) {
            await supabase.from('user_profiles').update(updates).eq('id', userId);
            Object.assign(data, updates);
          }
        }

        if (authUser && isAdminPhone(data.phone || '') && !data.is_admin) {
          await supabase.from('user_profiles').update({ is_admin: true }).eq('id', userId);
          data.is_admin = true;
        }

        setProfile(data as UserProfile);
        return data as UserProfile;
      }

      // Profile missing - create from auth user data
      if ((error?.code === 'PGRST116' || !data) && authUser) {
        console.log('Profile missing, creating for user:', userId);
        const meta = authUser.user_metadata;
        const isGoogle = authUser.app_metadata?.provider === 'google';
        const username = meta?.full_name || meta?.name || meta?.username || authUser.email?.split('@')[0] || 'User';
        const avatar = meta?.avatar_url || meta?.picture;
        const googleEmail = isGoogle ? authUser.email : null;
        const adminFlag = isAdminEmail(authUser.email || '') || isAdminEmail(googleEmail || '');

        const { data: newProf } = await supabase.from('user_profiles').upsert({
          id: userId,
          email: authUser.email || '',
          username,
          avatar_url: avatar,
          google_email: googleEmail,
          is_admin: adminFlag,
          balance: 0,
          referral_code: Math.random().toString(36).substring(2, 10).toUpperCase(),
          referral_count: 0,
          phone_visible: false,
          is_vip: false,
          is_business: false,
          is_blocked: false,
          account_status: 'active',
        }).select().single();

        if (newProf) {
          setProfile(newProf as UserProfile);
          return newProf as UserProfile;
        }
      }
    } catch (err) {
      console.error('fetchProfile error:', err);
    }
    return null;
  }, []);

  async function refreshProfile() {
    if (user) {
      const p = await fetchAndSetProfile(user.id, user);
      return p;
    }
  }

  // Expose refreshProfile globally so other pages can trigger balance refresh
  useEffect(() => {
    (window as any).__authRefreshProfile = refreshProfile;
    return () => { delete (window as any).__authRefreshProfile; };
  }, [user, fetchAndSetProfile]);

  function login(u: User, p: UserProfile) {
    console.log('AuthContext login:', u.email);
    setUser(u);
    setProfile(p);
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  function requireAuth(callback: () => void) {
    if (user && profile) callback();
    else setShowAuthModal(true);
  }

  useEffect(() => {
    let mounted = true;

    // Check existing session (handles page refresh + Google OAuth redirect)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('Session check:', session?.user?.email || 'none', 'provider:', session?.user?.app_metadata?.provider);
      if (mounted && session?.user) {
        setUser(session.user);
        await fetchAndSetProfile(session.user.id, session.user);
      }
      if (mounted) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      console.log('Auth event:', event, session?.user?.email, 'provider:', session?.user?.app_metadata?.provider);

      if (event === 'SIGNED_IN' && session?.user) {
        // Request push notification permission after login (delayed to not interrupt flow)
        setTimeout(() => {
          if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
          }
        }, 3000);
        // This fires on Google OAuth redirect - handle immediately
        setUser(session.user);
        // For Google OAuth: extract profile from metadata IMMEDIATELY for instant display
        const isGoogle = session.user.app_metadata?.provider === 'google';
        if (isGoogle) {
          const meta = session.user.user_metadata;
          const immediateProfile: UserProfile = {
            id: session.user.id,
            email: session.user.email || '',
            username: meta?.full_name || meta?.name || session.user.email?.split('@')[0] || 'User',
            avatar_url: meta?.avatar_url || meta?.picture || null,
            google_email: session.user.email || null,
            balance: 0,
            is_vip: false, is_business: false, is_admin: false, is_blocked: false,
            account_status: 'active',
            phone_visible: false,
            referral_count: 0,
          } as any;
          setProfile(immediateProfile);
          setLoading(false);
          // Force DOM update so content appears immediately without manual refresh
          window.dispatchEvent(new Event('auth-ready'));
        }
        // Then fetch full profile from DB in background
        const prof = await fetchAndSetProfile(session.user.id, session.user);
        console.log('SIGNED_IN profile:', prof?.username, 'google:', isGoogle);
        setLoading(false);

      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setLoading(false);

      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user);
        fetchAndSetProfile(session.user.id, session.user);

      } else if (event === 'USER_UPDATED' && session?.user) {
        setUser(session.user);
        await fetchAndSetProfile(session.user.id, session.user);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchAndSetProfile]);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      isAdmin,
      login,
      logout,
      refreshProfile,
      requireAuth,
      showAuthModal,
      setShowAuthModal,
      fetchAndSetProfile,
    } as any}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
