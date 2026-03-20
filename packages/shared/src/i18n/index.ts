import type { SupportedLanguage } from '../constants/i18n.js';

export const translationImports: Record<SupportedLanguage, () => Promise<Record<string, unknown>>> =
  {
    sv: () => import('./sv.json'),
    en: () => import('./en.json'),
    no: () => Promise.resolve({}),
    da: () => Promise.resolve({}),
    fi: () => Promise.resolve({}),
    de: () => Promise.resolve({}),
    es: () => Promise.resolve({}),
    fr: () => Promise.resolve({}),
    it: () => Promise.resolve({}),
  };
