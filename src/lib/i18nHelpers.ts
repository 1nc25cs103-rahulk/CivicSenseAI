import type { TFunction } from 'i18next';
import type { SupportedLanguage } from '../types/index.ts';

const LOCALE_MAP: Record<SupportedLanguage, string> = {
  en: 'en-IN',
  kn: 'kn-IN',
  hi: 'hi-IN',
};

export function getIntlLocale(lang: string): string {
  if (lang === 'kn' || lang === 'hi' || lang === 'en') {
    return LOCALE_MAP[lang];
  }
  return 'en-IN';
}

export function formatLocaleDate(dateInput: string | number | Date, lang: string): string {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString(getIntlLocale(lang), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatLocaleDateTime(dateInput: string | number | Date, lang: string): string {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleString(getIntlLocale(lang));
}

export function formatLocaleTime(dateInput: string | number | Date, lang: string): string {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleTimeString(getIntlLocale(lang));
}

export function translateCategory(t: TFunction, category: string): string {
  return t(`categories.${category}`, { defaultValue: category });
}

export function translateStatus(t: TFunction, status: string): string {
  return t(`statuses.${status}`, { defaultValue: status });
}

export function translatePriority(t: TFunction, priority: string): string {
  return t(`priorities.${priority}`, { defaultValue: priority });
}

export function translateDepartment(t: TFunction, department: string): string {
  return t(`departments.${department}`, { defaultValue: department });
}

export function translateDistrict(t: TFunction, district: string): string {
  return t(`districts.${district}`, { defaultValue: district });
}

export function translateLanguageName(t: TFunction, langCode: string): string {
  return t(`languages.${langCode}`, { defaultValue: langCode.toUpperCase() });
}
