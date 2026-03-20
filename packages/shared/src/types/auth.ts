import type { UserRole } from '../constants/roles.js';

export interface LoginInput {
  email: string;
  password: string;
  clinicSlug?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    role: UserRole;
    clinicId: string | null;
    organizationId: string;
    displayName: string;
  };
}

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface SuperAdminLoginInput {
  email: string;
  password: string;
  totpCode: string;
}

export interface JWTPayload {
  userId: string;
  role: UserRole;
  organizationId: string;
  clinicId: string | null;
  iat: number;
  exp: number;
}

export interface AuthContext {
  userId: string;
  role: UserRole;
  organizationId: string;
  clinicId: string | null;
}
