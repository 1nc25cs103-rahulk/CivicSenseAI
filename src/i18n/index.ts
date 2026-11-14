import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { SupportedLanguage } from '../types/index.ts';
import { SUPPORTED_LANGUAGES } from '../types/index.ts';
import enTranslation from '../locales/en/translation.json';
import hiTranslation from '../locales/hi/translation.json';
import knTranslation from '../locales/kn/translation.json';

export const LANGUAGE_STORAGE_KEY = 'civicsense_language';

let manualUnauthSelectionMade = false;

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function getSavedLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored)) return stored;
  } catch {
    // Ignore storage access restrictions
  }
  return 'en';
}

export function saveLocalLanguage(lang: SupportedLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Ignore storage access restrictions
  }
}

export function markManualLanguageSelection(): void {
  manualUnauthSelectionMade = true;
}

export function consumeManualLanguageSelection(): boolean {
  const val = manualUnauthSelectionMade;
  manualUnauthSelectionMade = false;
  return val;
}

export function getCurrentLanguage(): SupportedLanguage {
  const active = i18n.resolvedLanguage || i18n.language;
  return isSupportedLanguage(active) ? active : 'en';
}

const initialLanguage = getSavedLanguage();

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslation },
    kn: { translation: knTranslation },
    hi: { translation: hiTranslation },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLanguage;
}

i18n.on('languageChanged', (lng) => {
  const safe = isSupportedLanguage(lng) ? lng : 'en';
  saveLocalLanguage(safe);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = safe;
  }
});

export default i18n;
