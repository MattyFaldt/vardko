import { useState } from 'react';
import {
  Save,
  QrCode,
  Shield,
  Clock,
  Globe,
  ListOrdered,
  RefreshCw,
  Key,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Code,
  Monitor,
} from 'lucide-react';
import { useDemo } from '../../lib/demo-data';

function generateQrSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function SettingsSection() {
  const { clinicSlug, clinicName } = useDemo();

  const [maxDefer, setMaxDefer] = useState(3);
  const [maxQueueSize, setMaxQueueSize] = useState(200);
  const [noShowTimeout, setNoShowTimeout] = useState(180);
  const [openHour, setOpenHour] = useState(7);
  const [closeHour, setCloseHour] = useState(17);
  const [language, setLanguage] = useState('sv');

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://vardko.vercel.app';
  const [qrToken, setQrToken] = useState(clinicSlug);
  const [showQrConfirm, setShowQrConfirm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showEmbed, setShowEmbed] = useState(false);

  const queueUrl = `${baseUrl}/queue/${qrToken}`;
  const qrApiUrl = `${baseUrl}/qr/${qrToken}`;
  const embedUrl = `${baseUrl}/qr/${qrToken}/embed`;
  const iframeSnippet = `<iframe src="${embedUrl}" width="400" height="500" style="border:none;border-radius:16px;" title="${clinicName} — QR-kod"></iframe>`;

  const hours = Array.from({ length: 24 }, (_, i) => i);

  function handleSave(section: string) {
    alert(`Sparat: ${section}`);
  }

  function confirmNewQr() {
    setQrToken(generateQrSlug());
    setShowQrConfirm(false);
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  function CopyBtn({ text, label }: { text: string; label: string }) {
    return (
      <button onClick={() => copyToClipboard(text, label)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[36px] shrink-0">
        {copied === label ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
        {copied === label ? 'Kopierad!' : 'Kopiera'}
      </button>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900">Inställningar</h2>

      {/* Köinställningar */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <ListOrdered className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Köinställningar</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Max antal uppskjutningar</label>
            <input type="number" min={0} value={maxDefer} onChange={e => setMaxDefer(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Max köstorlek</label>
            <input type="number" min={1} value={maxQueueSize} onChange={e => setMaxQueueSize(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tidsgräns uteblivna (sek)</label>
            <input type="number" min={0} value={noShowTimeout} onChange={e => setNoShowTimeout(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px]" />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={() => handleSave('Köinställningar')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors min-h-[44px]">
            <Save className="w-4 h-4" /> Spara
          </button>
        </div>
      </div>

      {/* Öppettider */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-5 h-5 text-amber-600" />
          <h3 className="text-sm font-semibold text-gray-900">Öppettider</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Öppnar</label>
            <select value={openHour} onChange={e => setOpenHour(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] bg-white">
              {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Stänger</label>
            <select value={closeHour} onChange={e => setCloseHour(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] bg-white">
              {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={() => handleSave('Öppettider')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors min-h-[44px]">
            <Save className="w-4 h-4" /> Spara
          </button>
        </div>
      </div>

      {/* Språk */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-5 h-5 text-green-600" />
          <h3 className="text-sm font-semibold text-gray-900">Språk</h3>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Standardspråk</label>
          <select value={language} onChange={e => setLanguage(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] bg-white">
            <option value="sv">Svenska</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={() => handleSave('Språk')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors min-h-[44px]">
            <Save className="w-4 h-4" /> Spara
          </button>
        </div>
      </div>

      {/* ══════════ QR-kod ══════════ */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-900">QR-kod</h3>
        </div>

        <div className="flex flex-col sm:flex-row gap-5">
          <div className="flex flex-col items-center gap-3 p-4 bg-white border-2 border-dashed border-gray-200 rounded-xl sm:min-w-[180px]">
            <div className="w-36 h-36 bg-gray-100 rounded-lg flex items-center justify-center">
              <QrCode className="w-20 h-20 text-gray-400" />
            </div>
            <p className="text-[10px] text-gray-500 text-center font-mono break-all max-w-[160px]">{queueUrl}</p>
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kö-URL (patienter skannar denna)</label>
              <div className="flex items-center gap-2">
                <input type="text" readOnly value={queueUrl}
                  className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs min-h-[44px] text-gray-600 font-mono" />
                <CopyBtn text={queueUrl} label="queue-url" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                <Monitor className="w-3.5 h-3.5 inline mr-1" />
                API-endpoint för skärmar (hämtar aktuell QR-bild)
              </label>
              <div className="flex items-center gap-2">
                <input type="text" readOnly value={qrApiUrl}
                  className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs min-h-[44px] text-gray-600 font-mono" />
                <CopyBtn text={qrApiUrl} label="qr-api" />
              </div>
              <p className="text-xs text-gray-400 mt-1">Returnerar QR-kod som SVG/PNG. Uppdateras automatiskt när ny QR genereras.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                <ExternalLink className="w-3.5 h-3.5 inline mr-1" />
                Inbäddningssida (för väntrumsvisning)
              </label>
              <div className="flex items-center gap-2">
                <input type="text" readOnly value={embedUrl}
                  className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs min-h-[44px] text-gray-600 font-mono" />
                <CopyBtn text={embedUrl} label="embed-url" />
                <a href={embedUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[36px] shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" /> Öppna
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Embed snippet */}
        <div>
          <button onClick={() => setShowEmbed(!showEmbed)}
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700">
            <Code className="w-4 h-4" />
            {showEmbed ? 'Dölj inbäddningskod' : 'Visa inbäddningskod (iframe)'}
          </button>
          {showEmbed && (
            <div className="mt-3 relative">
              <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto font-mono whitespace-pre-wrap break-all">
                {iframeSnippet}
              </pre>
              <button onClick={() => copyToClipboard(iframeSnippet, 'iframe')}
                className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-700 text-xs text-gray-300 hover:bg-gray-600 transition-colors">
                {copied === 'iframe' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {copied === 'iframe' ? 'Kopierad!' : 'Kopiera'}
              </button>
              <p className="text-xs text-gray-400 mt-2">Klistra in denna HTML-kod på valfri webbsida eller digital skylt. QR-koden och klinikinfo uppdateras automatiskt.</p>
            </div>
          )}
        </div>

        {/* Generate new QR with warning */}
        <div className="border-t border-gray-100 pt-4">
          {!showQrConfirm ? (
            <button onClick={() => setShowQrConfirm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors min-h-[44px]">
              <RefreshCw className="w-4 h-4" /> Generera ny QR-kod
            </button>
          ) : (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Varning: Alla befintliga QR-koder slutar fungera</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Om du genererar en ny QR-kod kommer <strong>alla utskrivna QR-koder</strong> och <strong>QR-koder som visas på skärmar via bild-URL</strong> att sluta fungera omedelbart.
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    Skärmar som använder <strong>API-endpointen</strong> eller <strong>iframe-widgeten</strong> uppdateras automatiskt — men fysiskt utskrivna QR-koder måste skrivas ut på nytt.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button onClick={confirmNewQr}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors min-h-[44px]">
                  <RefreshCw className="w-4 h-4" /> Ja, generera ny QR-kod
                </button>
                <button onClick={() => setShowQrConfirm(false)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px]">
                  Avbryt
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Säkerhet */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 text-red-600" />
          <h3 className="text-sm font-semibold text-gray-900">Säkerhet</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={() => handleSave('Daglig salt')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]">
            <Key className="w-4 h-4" /> Byt daglig salt
          </button>
          <button onClick={() => handleSave('QR-hemlighet')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]">
            <RefreshCw className="w-4 h-4" /> Rotera QR-hemlighet
          </button>
        </div>
      </div>
    </div>
  );
}
