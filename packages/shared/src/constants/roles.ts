export const USER_ROLES = ['org_admin', 'clinic_admin', 'staff'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACTOR_TYPES = ['staff', 'patient', 'system', 'admin', 'superadmin'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  org_admin: 3,
  clinic_admin: 2,
  staff: 1,
};
