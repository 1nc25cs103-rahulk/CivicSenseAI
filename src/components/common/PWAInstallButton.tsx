import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePWAInstall } from '../../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC<{ variant?: 'light' | 'navy' }> = ({ variant = 'light' }) => {
  const { t } = useTranslation();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const baseClass =
    variant === 'navy'
      ? 'inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
      : 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer';

  if (isInstallable) {
    return (
      <button type="button" onClick={() => void install()} className={baseClass}>
        <Download className="h-3.5 w-3.5 text-teal-600" />
        <span>{t('pwa.installApp')}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button type="button" onClick={() => setShowIOSGuide(true)} className={baseClass}>
          <Smartphone className="h-3.5 w-3.5 text-teal-600" />
          <span>{t('pwa.installApp')}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-base font-semibold text-slate-900">{t('pwa.iosTitle')}</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={t('pwa.closeLabel')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-slate-600 list-decimal pl-4">
                <li>{t('pwa.iosStep1')}</li>
                <li>{t('pwa.iosStep2')}</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                {t('common.done')}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
