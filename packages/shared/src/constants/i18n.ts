export const SUPPORTED_LANGUAGES = ['sv', 'no', 'da', 'fi', 'en', 'de', 'es', 'fr', 'it'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'sv';
