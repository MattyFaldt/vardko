import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import svTranslation from '../../../../packages/shared/src/i18n/sv.json';
import enTranslation from '../../../../packages/shared/src/i18n/en.json';

i18next.use(initReactI18next).init({
  resources: {
    sv: { translation: svTranslation },
    en: { translation: enTranslation },
  },
  lng: 'sv',
  fallbackLng: 'sv',
  interpolation: {
    escapeValue: false,
  },
});

export default i18next;
