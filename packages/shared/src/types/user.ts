import type { UserRole } from '../constants/roles.js';
import type { SupportedLanguage } from '../constants/i18n.js';

export interface User {
  id: string;
  organizationId: string;
  clinicId: string | null;
  email: string;
  displayName: string;
  role: UserRole;
  preferredLanguage: SupportedLanguage;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuperAdmin {
  id: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}
