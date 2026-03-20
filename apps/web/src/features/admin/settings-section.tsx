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
} from 'lucide-react';

/* ---------------------------------------------------------------------------
   SettingsSection
   --------------------------------------------------------------------------- */

export function SettingsSection() {
  // Köinställningar
  const [maxDefer, setMaxDefer] = useState(3);
  const [maxQueueSize, setMaxQueueSize] = useState(200);
  const [noShowTimeout, setNoShowTimeout] = useState(180);

  // Öppettider
  const [openHour, setOpenHour] = useState(7);
  const [closeHour, setCloseHour] = useState(17);

  // Språk
  const [language, setLanguage] = useState('sv');

  // QR
  const [qrUrl] = useState('https://vardko.se/q/kungsholmen');

  const hours = Array.from({ length: 24 }, (_, i) => i);

  function handleSave(section: string) {
    // placeholder
    alert(`Sparat: ${section}`);
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
            <input
              type="number"
              min={0}
              value={maxDefer}
              onChange={e => setMaxDefer(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Max köstorlek</label>
            <input
              type="number"
              min={1}
              value={maxQueueSize}
              onChange={e => setMaxQueueSize(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tidsgräns uteblivna (sekunder)</label>
            <input
              type="number"
              min={0}
              value={noShowTimeout}
              onChange={e => setNoShowTimeout(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px]"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={() => handleSave('Köinställningar')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            Spara
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
            <select
              value={openHour}
              onChange={e => setOpenHour(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] bg-white"
            >
              {hours.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Stänger</label>
            <select
              value={closeHour}
              onChange={e => setCloseHour(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] bg-white"
            >
              {hours.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={() => handleSave('Öppettider')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            Spara
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
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] bg-white"
          >
            <option value="sv">Svenska</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={() => handleSave('Språk')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            Spara
          </button>
        </div>
      </div>

      {/* QR-kod */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <QrCode className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-900">QR-kod</h3>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Aktuell QR-URL</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={qrUrl}
              className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm min-h-[44px] text-gray-600"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={() => handleSave('QR-kod')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" />
            Generera ny QR-kod
          </button>
        </div>
      </div>

      {/* Säkerhet */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 text-red-600" />
          <h3 className="text-sm font-semibold text-gray-900">Säkerhet</h3>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => handleSave('Daglig salt')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            <Key className="w-4 h-4" />
            Byt daglig salt
          </button>
          <button
            onClick={() => handleSave('QR-hemlighet')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" />
            Rotera QR-hemlighet
          </button>
        </div>
      </div>
    </div>
  );
}
