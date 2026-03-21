import { useParams } from 'react-router-dom';
import { QrCodeSvg } from '../../components/qr-code';
import { useBranding } from '../../lib/branding';

/**
 * Embeddable QR code page — designed for iframe embedding on waiting room screens.
 * URL: /qr/:clinicSlug/embed
 *
 * Shows the clinic QR code with branding. Auto-refreshes when the QR token changes
 * because the iframe src changes centrally via the API.
 */
export function QrEmbedPage() {
  const { clinicSlug } = useParams<{ clinicSlug: string }>();
  const branding = useBranding();
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://vardko.vercel.app';
  const queueUrl = `${baseUrl}/queue/${clinicSlug}`;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
      {/* Brand */}
      <div className="mb-6 flex items-center gap-3">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="" className="w-10 h-10 rounded-xl object-contain" />
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: branding.primaryColor }}>
            <span className="text-white font-bold text-sm">VK</span>
          </div>
        )}
        <span className="text-xl font-bold text-gray-900">{branding.clinicName || 'VårdKö'}</span>
      </div>

      {/* QR Code area */}
      <div className="bg-white border-2 border-gray-100 rounded-2xl p-8 shadow-sm flex flex-col items-center gap-4">
        <QrCodeSvg url={queueUrl} size={220} className="rounded-xl" />
        <p className="text-xs text-gray-400 font-mono text-center break-all max-w-[220px]">{queueUrl}</p>
      </div>

      {/* Instructions */}
      <div className="mt-6 text-center max-w-xs">
        <p className="text-base font-semibold text-gray-900">Skanna för att ställa dig i kön</p>
        <p className="text-sm text-gray-500 mt-1">Öppna kameran på din mobil och rikta den mot QR-koden</p>
      </div>

      {/* Clinic slug indicator */}
      <p className="mt-8 text-xs text-gray-300">{clinicSlug}</p>
    </div>
  );
}
