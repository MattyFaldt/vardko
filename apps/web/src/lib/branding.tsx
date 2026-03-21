import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface ClinicBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  clinicName: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
}

export const DEFAULT_BRANDING: ClinicBranding = {
  primaryColor: '#2563eb',
  secondaryColor: '#16a34a',
  accentColor: '#f59e0b',
  logoUrl: null,
  clinicName: 'VårdKö',
  backgroundColor: '#eff6ff',
  textColor: '#1e293b',
  fontFamily: 'system-ui, sans-serif',
};

interface BrandingContextValue {
  branding: ClinicBranding;
  updateBranding: (updates: Partial<ClinicBranding>) => void;
}

const STORAGE_KEY = 'vardko_branding';

function loadBranding(): ClinicBranding {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_BRANDING, ...JSON.parse(raw) };
    }
  } catch { /* ignore */ }
  return DEFAULT_BRANDING;
}

function saveBranding(b: ClinicBranding) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch { /* ignore */ }
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  updateBranding: () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<ClinicBranding>(loadBranding);

  const update = useCallback((updates: Partial<ClinicBranding>) => {
    setBranding((prev) => {
      const next = { ...prev, ...updates };
      saveBranding(next);
      return next;
    });
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, updateBranding: update }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): ClinicBranding {
  return useContext(BrandingContext).branding;
}

export function useBrandingUpdate(): (updates: Partial<ClinicBranding>) => void {
  return useContext(BrandingContext).updateBranding;
}

export function brandingToCss(b: ClinicBranding): React.CSSProperties {
  return {
    '--brand-primary': b.primaryColor,
    '--brand-secondary': b.secondaryColor,
    '--brand-accent': b.accentColor,
    '--brand-bg': b.backgroundColor,
    '--brand-text': b.textColor,
    fontFamily: b.fontFamily,
  } as React.CSSProperties;
}
