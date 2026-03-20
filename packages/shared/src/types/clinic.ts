import type { SupportedLanguage } from '../constants/i18n.js';

export interface ClinicSettings {
  maxPostponements?: number;
  defaultServiceTimeSeconds?: number;
  maxQueueSize?: number;
  noShowTimerSeconds?: number;
  openingHour?: number;
  closingHour?: number;
}

export interface Clinic {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  address: string | null;
  timezone: string;
  defaultLanguage: SupportedLanguage;
  settings: ClinicSettings;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
