import { useState, useCallback, useMemo } from 'react';
import svTranslations from '../../../../packages/shared/src/i18n/sv.json';
import enTranslations from '../../../../packages/shared/src/i18n/en.json';

export type Language = 'sv' | 'en';

const translations: Record<string, Record<string, unknown>> = {
  sv: svTranslations,
  en: enTranslations,
};

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return params[key] !== undefined ? String(params[key]) : `{{${key}}}`;
  });
}

const STORAGE_KEY = 'vardko_language';

function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'sv') return stored;
  } catch {
    // localStorage unavailable
  }
  return 'sv';
}

function storeLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage unavailable
  }
}

export function useTranslation() {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    storeLanguage(lang);
  }, []);

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>): string => {
      // Try current language first
      const value = getNestedValue(translations[language] as Record<string, unknown>, key);
      if (value !== undefined) return interpolate(value, params);

      // Fallback to Swedish
      if (language !== 'sv') {
        const svValue = getNestedValue(translations.sv as Record<string, unknown>, key);
        if (svValue !== undefined) return interpolate(svValue, params);
      }

      // Fallback to key itself
      return key;
    };
  }, [language]);

  return { t, language, setLanguage };
}
