export interface OrganizationSettings {
  maxClinics?: number;
  allowedFeatures?: string[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: OrganizationSettings;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
