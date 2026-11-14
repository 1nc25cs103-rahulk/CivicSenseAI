import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminLoginForm } from './components/auth/AdminLoginForm.tsx';
import { AuthLandingPage } from './components/auth/AuthLandingPage.tsx';
import { CitizenLoginForm } from './components/auth/CitizenLoginForm.tsx';
import { CitizenRegisterForm } from './components/auth/CitizenRegisterForm.tsx';
import { ForgotPasswordFlow } from './components/auth/ForgotPasswordFlow.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { CitizenPortal } from './components/citizen/CitizenPortal.tsx';
import { OfflineBanner } from './components/common/OfflineBanner.tsx';
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
  fetchHealth,
  logoutApi,
  subscribeUnauthorized,
  syncOfflineDraftToServer,
  updateUserPreferencesApi,
} from './lib/api.ts';
import { getOfflineDrafts, removeOfflineDraft } from './lib/offlineQueue.ts';
import type { AuthRoute, Complaint, OfflineDraftComplaint, User } from './types/index.ts';

const VALID_ROUTES = new Set<AuthRoute>([
  '/',
  '/login/citizen',
  '/register/citizen',
  '/login/admin',
  '/forgot-password',
  '/citizen',
  '/admin',
]);

function normalizePath(pathname: string): AuthRoute {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return VALID_ROUTES.has(trimmed as AuthRoute) ? (trimmed as AuthRoute) : '/';
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
  const [aiMode, setAiMode] = useState<'rules' | 'hybrid-gemini'>('rules');
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

  // Initial session validation & health probe
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
          if (currentPath === '/citizen' || currentPath === '/admin') {
            navigate('/', true);
          }
        } else if (current.role === 'CITIZEN' && currentPath === '/admin') {
          navigate('/citizen', true);
        } else if (current.role === 'ADMIN' && currentPath === '/citizen') {
          navigate('/admin', true);
        }
      } finally {
        if (active) setAuthChecking(false);
      }
    };

    void init();

    fetchHealth()
      .then((h) => {
        if (active) setAiMode(h.aiMode);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [i18n, navigate]);

  // Guard browser back/forward history against unauthenticated or cross-role console access
  useEffect(() => {
    const handlePopState = () => {
      const target = normalizePath(window.location.pathname);
      if (!user) {
        if (target === '/citizen' || target === '/admin') {
          navigate('/', true);
          return;
        }
        setRoute(target);
        return;
      }

      if (user.role === 'CITIZEN' && target === '/admin') {
        navigate('/citizen', true);
        return;
      }
      if (user.role === 'ADMIN' && target === '/citizen') {
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
      navigate('/', true);
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

      navigate(authedUser.role === 'ADMIN' ? '/admin' : '/citizen', true);
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="text-center space-y-2">
          <div className="font-display text-lg font-bold text-slate-900">{t('common.appName')}</div>
          <div className="text-xs text-slate-500">{t('common.verifyingSession')}</div>
        </div>
      </div>
    );
  }

  // Protected console views when authenticated and on console route
  if (user && user.role === 'CITIZEN' && route === '/citizen') {
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

  if (user && user.role === 'ADMIN' && route === '/admin') {
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

  // Public Authentication & Recovery Routes
  if (route === '/login/citizen') {
    return (
      <CitizenLoginForm
        onNavigate={(next) => {
          setLoginBanner(null);
          navigate(next);
        }}
        onAuthenticated={handleAuthenticated}
        bannerMessage={loginBanner}
      />
    );
  }

  if (route === '/register/citizen') {
    return (
      <CitizenRegisterForm
        onNavigate={(next) => {
          setLoginBanner(null);
          navigate(next);
        }}
        onRegisteredSuccess={(msg) => {
          setLoginBanner(msg);
          navigate('/login/citizen', true);
        }}
      />
    );
  }

  if (route === '/login/admin') {
    return (
      <AdminLoginForm
        onNavigate={(next) => {
          setLoginBanner(null);
          navigate(next);
        }}
        onAuthenticated={handleAuthenticated}
        bannerMessage={loginBanner}
      />
    );
  }

  if (route === '/forgot-password') {
    return (
      <ForgotPasswordFlow
        onNavigate={(next) => {
          setLoginBanner(null);
          navigate(next);
        }}
        onResetComplete={(msg, targetLogin) => {
          setLoginBanner(msg);
          navigate(targetLogin, true);
        }}
      />
    );
  }

  // Default Landing Screen (Zero auto-redirect into Citizen or Admin consoles)
  return (
    <AuthLandingPage
      onNavigate={(next) => {
        setLoginBanner(null);
        navigate(next);
      }}
      aiMode={aiMode}
    />
  );
}
