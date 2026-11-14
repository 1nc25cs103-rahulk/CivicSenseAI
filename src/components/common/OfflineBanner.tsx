import React from 'react';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.ts';

interface OfflineBannerProps {
  pendingCount: number;
  isSyncing: boolean;
  onSyncNow: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ pendingCount, isSyncing, onSyncNow }) => {
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();

  if (isOnline && pendingCount === 0) return null;

  if (!isOnline) {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <CloudOff className="h-4 w-4 text-amber-700 shrink-0" />
            <span>
              {t('offline.offlineBanner')}
              {pendingCount > 0 ? ` ${t('offline.queuedSuffix', { count: pendingCount })}` : ''}.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-teal-200 bg-teal-50 px-4 py-2 text-xs text-teal-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <Wifi className="h-4 w-4 text-teal-700 shrink-0" />
          <span>
            {pendingCount === 1
              ? t('offline.restoredOne', { count: pendingCount })
              : t('offline.restoredMany', { count: pendingCount })}
          </span>
        </div>
        <button
          type="button"
          disabled={isSyncing}
          onClick={onSyncNow}
          className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3 py-1 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? t('offline.syncing') : t('offline.syncNow')}</span>
        </button>
      </div>
    </div>
  );
};
