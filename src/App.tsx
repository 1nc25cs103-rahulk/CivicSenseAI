import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { UnifiedAuthPortal, type AuthPortalTab } from './components/auth/UnifiedAuthPortal.tsx';
import { CitizenPortal } from './components/citizen/CitizenPortal.tsx';
import { OfflineBanner } from './components/common/OfflineBanner.tsx';
import { PublicLandingPage } from './components/public/PublicLandingPage.tsx';
import { useOnlineStatus } from './hooks/useOnlineStatus.ts';
import {
  consumeManualLanguageSelection,
  getCurrentLanguage,
  isSupportedLanguage,
  saveLocalLanguage,
} from './i18n/index.ts';
import {
  fetchComplaints,
  fetchCurrentUser,
  logoutApi,
  subscribeUnauthorized,
  syncOfflineDraftToServer,
  updateUserPreferencesApi,
} from './lib/api.ts';
import { getOfflineDrafts, removeOfflineDraft } from './lib/offlineQueue.ts';
import type { AuthRoute, Complaint, OfflineDraftComplaint, User } from './types/index.ts';
import { isAdminRole } from './types/index.ts';

const VALID_ROUTES = new Set<AuthRoute>([
  '/',
  '/auth',
  '/dashboard',
  '/citizen',
  '/admin',
  '/login/citizen',
  '/register/citizen',
  '/login/admin',
  '/forgot-password',
]);

function normalizePath(pathname: string): AuthRoute {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return VALID_ROUTES.has(trimmed as AuthRoute) ? (trimmed as AuthRoute) : '/';
}

function isCitizenRoute(route: AuthRoute): boolean {
  return route === '/dashboard' || route === '/citizen';
}

export default function App() {
  const { t, i18n } = useTranslation();
  const isOnline = useOnlineStatus();
  const [route, setRoute] = useState<AuthRoute>(() => normalizePath(window.location.pathname));
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginBanner, setLoginBanner] = useState<string | null>(null);

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineDraftComplaint[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const navigate = useCallback((nextRoute: AuthRoute, replace = false) => {
    setRoute(nextRoute);
    if (normalizePath(window.location.pathname) !== nextRoute) {
      if (replace) {
        window.history.replaceState(null, '', nextRoute);
      } else {
        window.history.pushState(null, '', nextRoute);
      }
    }
  }, []);

  const loadComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchComplaints();
      setComplaints(res.complaints);
    } catch {
      // Errors or offline fallback handled in api client
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDrafts = useCallback(async (userId?: number) => {
    if (!userId) {
      setOfflineDrafts([]);
      return;
    }
    const drafts = await getOfflineDrafts(userId);
    setOfflineDrafts(drafts);
  }, []);

  const handleSyncDrafts = useCallback(async () => {
    if (!navigator.onLine || !user) return;
    const drafts = await getOfflineDrafts(user.id);
    if (drafts.length === 0) return;

    setIsSyncing(true);
    try {
      for (const draft of drafts) {
        try {
          await syncOfflineDraftToServer(draft);
          await removeOfflineDraft(draft.localId);
        } catch {
          // Keep failed draft for next sync retry
        }
      }
      await loadDrafts(user.id);
      await loadComplaints();
    } finally {
      setIsSyncing(false);
    }
  }, [loadComplaints, loadDrafts, user]);

  const handleRemoveDraft = useCallback(
    async (localId: string) => {
      await removeOfflineDraft(localId);
      await loadDrafts(user?.id);
    },
    [loadDrafts, user?.id]
  );

  // Initial session validation
  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const current = await fetchCurrentUser();
        if (!active) return;
        setUser(current);

        if (current && isSupportedLanguage(current.preferred_language)) {
          saveLocalLanguage(current.preferred_language);
          if (getCurrentLanguage() !== current.preferred_language) {
            await i18n.changeLanguage(current.preferred_language);
          }
        }

        const currentPath = normalizePath(window.location.pathname);
        if (!current) {
          if (isCitizenRoute(currentPath) || currentPath === '/admin') {
            navigate('/auth', true);
          }
        } else if (!isAdminRole(current.role) && currentPath === '/admin') {
          navigate('/dashboard', true);
        } else if (isAdminRole(current.role) && isCitizenRoute(currentPath)) {
          navigate('/admin', true);
        }
      } finally {
        if (active) setAuthChecking(false);
      }
    };

    void init();

    return () => {
      active = false;
    };
  }, [i18n, navigate]);

  // Guard browser back/forward history against unauthenticated or cross-role console access
  useEffect(() => {
    const handlePopState = () => {
      const target = normalizePath(window.location.pathname);
      if (!user) {
        if (isCitizenRoute(target) || target === '/admin') {
          navigate('/auth', true);
          return;
        }
        setRoute(target);
        return;
      }

      if (!isAdminRole(user.role) && target === '/admin') {
        navigate('/dashboard', true);
        return;
      }
      if (isAdminRole(user.role) && isCitizenRoute(target)) {
        navigate('/admin', true);
        return;
      }
      setRoute(target);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigate, user]);

  // Global 401 listener (expired or invalidated session)
  useEffect(() => {
    return subscribeUnauthorized(() => {
      setUser(null);
      setComplaints([]);
      setOfflineDrafts([]);
      setLoginBanner(t('common.sessionExpired'));
      navigate('/auth', true);
    });
  }, [navigate, t]);

  // Fetch protected data only when an authenticated user enters their console
  useEffect(() => {
    if (!user) {
      setComplaints([]);
      setOfflineDrafts([]);
      return;
    }
    void loadComplaints();
    void loadDrafts(user.id);
  }, [loadComplaints, loadDrafts, user]);

  // Auto-sync offline drafts once reconnected and authenticated
  useEffect(() => {
    if (isOnline && user && offlineDrafts.length > 0 && !isSyncing) {
      void handleSyncDrafts();
    }
  }, [isOnline, user, offlineDrafts.length, isSyncing, handleSyncDrafts]);

  const handleAuthenticated = useCallback(
    (authedUser: User) => {
      setLoginBanner(null);
      const activeLang = getCurrentLanguage();
      const manualChoice = consumeManualLanguageSelection();

      if (manualChoice) {
        const syncedUser: User = { ...authedUser, preferred_language: activeLang };
        setUser(syncedUser);
        void updateUserPreferencesApi(activeLang).catch(() => {});
      } else if (isSupportedLanguage(authedUser.preferred_language)) {
        saveLocalLanguage(authedUser.preferred_language);
        if (activeLang !== authedUser.preferred_language) {
          void i18n.changeLanguage(authedUser.preferred_language);
        }
        setUser(authedUser);
      } else {
        setUser(authedUser);
      }

      navigate(isAdminRole(authedUser.role) ? '/admin' : '/dashboard', true);
    },
    [i18n, navigate]
  );

  const handleLogout = useCallback(async () => {
    await logoutApi();
    setUser(null);
    setComplaints([]);
    setOfflineDrafts([]);
    setLoginBanner(null);
    navigate('/', true);
  }, [navigate]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="text-center space-y-2">
          <div className="font-display text-lg font-bold text-white">{t('common.appName')}</div>
          <div className="text-xs text-slate-400">{t('common.verifyingSession')}</div>
        </div>
      </div>
    );
  }

  // Protected Citizen Dashboard (/dashboard & legacy /citizen)
  if (user && !isAdminRole(user.role) && isCitizenRoute(route)) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <OfflineBanner
          pendingCount={offlineDrafts.length}
          isSyncing={isSyncing}
          onSyncNow={() => void handleSyncDrafts()}
        />
        <CitizenPortal
          user={user}
          complaints={complaints}
          loading={loading}
          offlineDrafts={offlineDrafts}
          onRefreshData={loadComplaints}
          onRefreshDrafts={() => loadDrafts(user.id)}
          onSyncDrafts={handleSyncDrafts}
          onRemoveDraft={handleRemoveDraft}
          onUserUpdated={setUser}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  // Protected Government Administration Console (/admin)
  if (user && isAdminRole(user.role) && route === '/admin') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <OfflineBanner
          pendingCount={offlineDrafts.length}
          isSyncing={isSyncing}
          onSyncNow={() => void handleSyncDrafts()}
        />
        <AdminDashboard
          user={user}
          complaints={complaints}
          loading={loading}
          onRefreshAll={loadComplaints}
          onUserUpdated={setUser}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  // Unified Split-Screen Authentication Portal (/auth + legacy auth routes)
  if (
    route === '/auth' ||
    route === '/login/citizen' ||
    route === '/register/citizen' ||
    route === '/login/admin' ||
    route === '/forgot-password'
  ) {
    let initialTab: AuthPortalTab = 'citizen';
    let initialCitizenMode: 'signin' | 'register' = 'signin';

    if (route === '/register/citizen') {
      initialTab = 'citizen';
      initialCitizenMode = 'register';
    } else if (route === '/login/admin') {
      initialTab = 'official_signin';
    } else if (route === '/forgot-password') {
      initialTab = 'forgot';
    }

    return (
      <UnifiedAuthPortal
        key={route}
        initialTab={initialTab}
        initialCitizenMode={initialCitizenMode}
        bannerMessage={loginBanner}
        onNavigate={(next) => {
          setLoginBanner(null);
          navigate(next);
        }}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  // Default Public Civic Command Landing Page (/)
  return (
    <PublicLandingPage
      currentUser={user}
      onNavigate={(next) => {
        setLoginBanner(null);
        navigate(next);
      }}
    />
  );
}
