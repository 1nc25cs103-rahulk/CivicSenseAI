import React from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  isSupportedLanguage,
  markManualLanguageSelection,
  saveLocalLanguage,
} from '../../i18n/index.ts';
import { getStoredToken, updateUserPreferencesApi } from '../../lib/api.ts';
import type { SupportedLanguage, User } from '../../types/index.ts';

interface LanguageSelectorProps {
  variant?: 'light' | 'navy';
  isAuthenticated?: boolean;
  onLanguageUpdated?: (lang: SupportedLanguage, updatedUser?: User) => void;
}

const LANGUAGE_OPTIONS: Array<{ code: SupportedLanguage; nativeLabel: string }> = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'kn', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'hi', nativeLabel: 'हिन्दी' },
];

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  variant = 'light',
  isAuthenticated = false,
  onLanguageUpdated,
}) => {
  const { i18n, t } = useTranslation();
  const currentLang: SupportedLanguage = isSupportedLanguage(i18n.resolvedLanguage || i18n.language)
    ? ((i18n.resolvedLanguage || i18n.language) as SupportedLanguage)
    : 'en';

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (!isSupportedLanguage(next)) return;

    saveLocalLanguage(next);
    await i18n.changeLanguage(next);

    if (isAuthenticated || getStoredToken()) {
      try {
        const updatedUser = await updateUserPreferencesApi(next);
        onLanguageUpdated?.(next, updatedUser);
        return;
      } catch {
        // Keep immediate client-side switch even if offline or request fails
      }
    } else {
      markManualLanguageSelection();
    }

    onLanguageUpdated?.(next);
  };

  const containerClass =
    variant === 'navy'
      ? 'inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white focus-within:border-teal-300'
      : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-slate-300 focus-within:border-teal-600';

  const selectClass =
    variant === 'navy'
      ? 'bg-transparent text-xs font-medium text-white focus:outline-none cursor-pointer [&>option]:text-slate-900'
      : 'bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer';

  return (
    <div className={containerClass}>
      <Globe
        className={`h-3.5 w-3.5 shrink-0 ${variant === 'navy' ? 'text-teal-300' : 'text-teal-600'}`}
        aria-hidden="true"
      />
      <label htmlFor={`language-selector-${variant}`} className="sr-only">
        {t('common.selectLanguage')}
      </label>
      <select
        id={`language-selector-${variant}`}
        aria-label={t('common.selectLanguage')}
        value={currentLang}
        onChange={(e) => void handleChange(e)}
        className={selectClass}
      >
        {LANGUAGE_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.nativeLabel}
          </option>
        ))}
      </select>
    </div>
  );
};
