import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Ticket,
  Clock,
  Users,
  DoorOpen,
  LogOut,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ArrowDown,
} from 'lucide-react';
import { useDemo, DemoPatient } from '../../lib/demo-data';
import { useTranslation, Language } from '../../lib/use-translation';
import { useBranding } from '../../lib/branding';

const PERSONNUMMER_REGEX = /^\d{8}-\d{4}$/;
const SESSION_KEY_PREFIX = 'vardko_queue_';
const DEFAULT_MAX_POSTPONEMENTS = 3;

function formatPersonnummer(raw: string): string {
  const digits = raw.replace(/[^\d-]/g, '');
  if (digits.length <= 8 && !digits.includes('-')) return digits;
  if (digits.length > 8 && !digits.includes('-')) {
    return digits.slice(0, 8) + '-' + digits.slice(8, 12);
  }
  return digits.slice(0, 13);
}

interface SavedSession {
  patientId: string;
  ticketNumber: number;
  clinicSlug: string;
  savedAt: number;
}

function saveSession(clinicSlug: string, patientId: string, ticketNumber: number) {
  const data: SavedSession = { patientId, ticketNumber, clinicSlug, savedAt: Date.now() };
  try {
    sessionStorage.setItem(SESSION_KEY_PREFIX + clinicSlug, JSON.stringify(data));
  } catch { /* sessionStorage unavailable */ }
}

function loadSession(clinicSlug: string): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + clinicSlug);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedSession;
    // Expire after 24 hours
    if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
      sessionStorage.removeItem(SESSION_KEY_PREFIX + clinicSlug);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function clearSession(clinicSlug: string) {
  try {
    sessionStorage.removeItem(SESSION_KEY_PREFIX + clinicSlug);
  } catch { /* ignore */ }
}

function LanguageSwitcher({ language, setLanguage }: { language: Language; setLanguage: (l: Language) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/80 p-0.5 shadow-sm ring-1 ring-gray-200">
      <button
        onClick={() => setLanguage('sv')}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          language === 'sv'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Svenska
      </button>
      <button
        onClick={() => setLanguage('en')}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          language === 'en'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        English
      </button>
    </div>
  );
}

export function PatientQueuePage() {
  const { clinicSlug } = useParams<{ clinicSlug: string }>();
  const { clinicName, joinQueue, postponePatient, patients, stats, calledTickets } = useDemo();
  const { t, language, setLanguage } = useTranslation();
  const branding = useBranding();

  const primary = branding.primaryColor;
  const bg = branding.backgroundColor;
  const textColor = branding.textColor;

  const [personnummer, setPersonnummer] = useState('');
  const [personnummerError, setPersonnummerError] = useState('');
  const [myTicket, setMyTicket] = useState<DemoPatient | null>(null);
  const [view, setView] = useState<'initial' | 'queue' | 'called'>('initial');
  const [calledRoom, setCalledRoom] = useState('');
  const [pulseKey, setPulseKey] = useState(0);
  const [restored, setRestored] = useState(false);

  // Postpone state
  const [postponeCount, setPostponeCount] = useState(0);
  const [showPostponeForm, setShowPostponeForm] = useState(false);
  const [postponePositions, setPostponePositions] = useState(1);

  // Restore session on mount
  useEffect(() => {
    if (restored || !clinicSlug) return;
    setRestored(true);

    const saved = loadSession(clinicSlug);
    if (!saved) return;

    const match = patients.find(p => p.id === saved.patientId);
    if (!match) return;

    // Only restore if patient is still active in queue
    if (match.status === 'waiting' || match.status === 'called' || match.status === 'in_progress') {
      setMyTicket(match);
      if (match.status === 'called' || match.status === 'in_progress') {
        const called = calledTickets.find(ct => ct.ticketNumber === match.ticketNumber);
        if (called) {
          setCalledRoom(called.roomName);
          setView('called');
        } else {
          setView('queue');
        }
      } else {
        setView('queue');
      }
    } else {
      // Ticket completed/cancelled/no-show — clear stale session
      clearSession(clinicSlug);
    }
  }, [clinicSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track position updates from the demo context
  useEffect(() => {
    if (!myTicket) return;

    const match = patients.find(p => p.id === myTicket.id);
    if (!match) return;

    setMyTicket(match);

    // If ticket is done, clear session
    if (match.status === 'completed' || match.status === 'no_show' || match.status === 'cancelled') {
      if (clinicSlug) clearSession(clinicSlug);
      return;
    }

    if (match.status === 'called' || match.status === 'in_progress') {
      const called = calledTickets.find(ct => ct.ticketNumber === match.ticketNumber);
      if (called) {
        setCalledRoom(called.roomName);
        setView('called');
        setPulseKey(k => k + 1);
      }
    }
  }, [patients, calledTickets, myTicket?.id, clinicSlug]);

  const handlePersonnummerChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPersonnummer(e.target.value);
    setPersonnummer(formatted);
    if (personnummerError) setPersonnummerError('');
  }, [personnummerError]);

  const handleJoinQueue = useCallback(() => {
    if (!PERSONNUMMER_REGEX.test(personnummer)) {
      setPersonnummerError(t('queue.personnummerError'));
      return;
    }

    const patient = joinQueue();
    setMyTicket(patient);
    setView('queue');
    setPostponeCount(0);
    if (clinicSlug) saveSession(clinicSlug, patient.id, patient.ticketNumber);
  }, [personnummer, joinQueue, clinicSlug, t]);

  const handleLeaveQueue = useCallback(() => {
    if (clinicSlug) clearSession(clinicSlug);
    setMyTicket(null);
    setView('initial');
    setPersonnummer('');
    setPostponeCount(0);
    setShowPostponeForm(false);
  }, [clinicSlug]);

  const handlePostpone = useCallback(() => {
    if (!myTicket) return;
    const success = postponePatient(myTicket.id, postponePositions);
    if (success) {
      setPostponeCount(c => c + 1);
      setShowPostponeForm(false);
      setPostponePositions(1);
    }
  }, [myTicket, postponePatient, postponePositions]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleJoinQueue();
    },
    [handleJoinQueue],
  );

  // ---- Initial view ----
  if (view === 'initial') {
    return (
      <div className="min-h-screen px-4 py-8" style={{ background: `linear-gradient(to bottom, ${bg}, white)`, fontFamily: branding.fontFamily }}>
        <div className="mx-auto max-w-md">
          {/* Language switcher */}
          <div className="mb-4 flex justify-end">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
          </div>

          {/* Header */}
          <div className="mb-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg" style={{ backgroundColor: primary }}>
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="" className="h-10 w-10 rounded-xl object-contain" />
              ) : (
                <Ticket className="h-8 w-8 text-white" />
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: textColor }}>VårdKö</h1>
            <p className="mt-1 text-lg font-medium" style={{ color: primary }}>{clinicName}</p>
          </div>

          {/* Queue stats summary */}
          <div className="mb-8 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-100">
              <Users className="mx-auto mb-1 h-5 w-5" style={{ color: primary }} />
              <p className="text-xl font-bold text-gray-900">{stats.waitingCount}</p>
              <p className="text-xs text-gray-500">{t('queue.inQueue')}</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-100">
              <DoorOpen className="mx-auto mb-1 h-5 w-5" style={{ color: branding.secondaryColor }} />
              <p className="text-xl font-bold text-gray-900">{stats.activeRooms}</p>
              <p className="text-xs text-gray-500">{t('queue.activeRooms')}</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-100">
              <Clock className="mx-auto mb-1 h-5 w-5" style={{ color: branding.accentColor }} />
              <p className="text-xl font-bold text-gray-900">~{stats.avgWaitMinutes}</p>
              <p className="text-xs text-gray-500">{t('queue.avgWait')}</p>
            </div>
          </div>

          {/* Join form card */}
          <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-100">
            <h2 className="mb-1 text-lg font-semibold text-gray-900">{t('queue.joinQueueTitle')}</h2>
            <p className="mb-5 text-sm text-gray-500">
              {t('queue.joinQueueSubtitle')}
            </p>

            <label htmlFor="personnummer" className="mb-1.5 block text-sm font-medium text-gray-700">
              {t('queue.personnummerLabel')}
            </label>
            <input
              id="personnummer"
              type="text"
              inputMode="numeric"
              placeholder={t('queue.personnummerPlaceholder')}
              value={personnummer}
              onChange={handlePersonnummerChange}
              onKeyDown={handleKeyDown}
              maxLength={13}
              className={`w-full rounded-xl border-2 px-4 py-3 text-center text-lg font-mono tracking-widest outline-none transition-colors ${
                personnummerError
                  ? 'border-red-400 bg-red-50 focus:border-red-500'
                  : 'border-gray-200 bg-gray-50 focus:border-blue-500 focus:bg-white'
              }`}
            />
            {personnummerError && (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{personnummerError}</span>
              </div>
            )}

            <button
              onClick={handleJoinQueue}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all active:scale-[0.98]"
              style={{ backgroundColor: primary }}
            >
              {t('patient.joinQueue')}
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            {t('queue.personnummerDisclaimer')}
          </p>
        </div>
      </div>
    );
  }

  // ---- Called view ----
  if (view === 'called') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white px-4 py-8">
        <div className="mx-auto max-w-md">
          {/* Language switcher */}
          <div className="mb-4 flex justify-end">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
          </div>

          {/* Pulsing success header */}
          <div className="mb-8 text-center">
            <div
              key={pulseKey}
              className="mx-auto mb-4 flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-200"
            >
              <CheckCircle2 className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-emerald-800">{t('queue.yourTurn', { roomName: calledRoom }).split('!')[0]}!</h1>
          </div>

          {/* Room card */}
          <div className="mb-6 rounded-2xl bg-white p-8 text-center shadow-lg ring-2 ring-emerald-200">
            <p className="mb-2 text-sm font-medium uppercase tracking-wider text-emerald-600">
              {t('queue.goTo')}
            </p>
            <p className="text-5xl font-extrabold tracking-tight text-gray-900">
              {calledRoom}
            </p>
            <div className="mx-auto mt-4 h-px w-16 bg-emerald-200" />
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2">
              <Ticket className="h-4 w-4 text-emerald-600" />
              <span className="font-mono text-lg font-bold text-emerald-700">
                #{myTicket?.ticketNumber}
              </span>
            </div>
          </div>

          {/* Instruction */}
          <div className="rounded-xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-100">
            <p className="text-sm text-emerald-800">
              {t('queue.goToInstruction', { room: calledRoom })}
            </p>
          </div>

          <button
            onClick={handleLeaveQueue}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    );
  }

  // ---- In queue view ----
  const position = myTicket?.position ?? 0;
  const estimatedWait = myTicket?.estimatedWaitMinutes ?? 0;
  const progressPercent = position <= 1 ? 90 : Math.max(10, 100 - position * 15);
  const canPostpone = postponeCount < DEFAULT_MAX_POSTPONEMENTS;

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: `linear-gradient(to bottom, ${bg}, white)`, fontFamily: branding.fontFamily }}>
      <div className="mx-auto max-w-md">
        {/* Language switcher */}
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher language={language} setLanguage={setLanguage} />
        </div>

        {/* Status bar */}
        <div className="mb-6 flex items-center justify-between rounded-xl px-4 py-3 text-sm text-white shadow-md" style={{ backgroundColor: primary }}>
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span>{t('queue.peopleWaiting', { count: stats.waitingCount })}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DoorOpen className="h-4 w-4" />
            <span>{t('queue.roomsActive', { count: stats.activeRooms })}</span>
          </div>
        </div>

        {/* Header */}
        <div className="mb-6 text-center">
          <p className="text-sm font-medium" style={{ color: primary }}>{clinicName}</p>
          <h1 className="text-xl font-bold" style={{ color: textColor }}>{t('queue.youAreInQueue')}</h1>
        </div>

        {/* Ticket card — boarding pass style */}
        <div className="mb-6 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-gray-100">
          {/* Top section */}
          <div className="px-6 py-4 text-center text-white" style={{ backgroundColor: primary }}>
            <p className="text-xs font-medium uppercase tracking-widest" style={{ opacity: 0.7 }}>
              {t('queue.yourTicketNumber')}
            </p>
            <p className="mt-1 font-mono text-6xl font-extrabold tracking-tight">
              {myTicket?.ticketNumber}
            </p>
          </div>

          {/* Perforated divider */}
          <div className="relative">
            <div className="absolute -left-3 -top-3 h-6 w-6 rounded-full" style={{ backgroundColor: bg }} />
            <div className="absolute -right-3 -top-3 h-6 w-6 rounded-full" style={{ backgroundColor: bg }} />
            <div className="border-t-2 border-dashed border-gray-200" />
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4 px-6 py-5">
            <div className="text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {t('queue.positionInQueue')}
              </p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{position}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {t('queue.estimatedWaitLabel')}
              </p>
              <div className="mt-1 flex items-center justify-center gap-1">
                <Clock className="h-5 w-5" style={{ color: primary }} />
                <span className="text-3xl font-bold text-gray-900">
                  {estimatedWait}
                </span>
                <span className="text-sm text-gray-500">{t('queue.minUnit')}</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-6 pb-5">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progressPercent}%`, backgroundColor: primary }}
              />
            </div>
            <p className="mt-2 text-center text-xs text-gray-400">
              {position === 1
                ? t('queue.nextInLine')
                : t('queue.peopleBefore', {
                    count: position - 1,
                    word: position - 1 === 1 ? t('queue.personSingular') : t('queue.personPlural'),
                  })}
            </p>
          </div>
        </div>

        {/* Helpful tips */}
        <div className="mb-4 rounded-xl bg-blue-50 p-4 ring-1 ring-blue-100">
          <p className="text-sm text-blue-800">
            {t('queue.stayNearby')}
          </p>
        </div>

        {/* Postpone button / form */}
        <div className="mb-4">
          {canPostpone ? (
            <>
              {!showPostponeForm ? (
                <button
                  onClick={() => setShowPostponeForm(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-300 bg-white px-6 py-3 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 active:scale-[0.98]"
                >
                  <ArrowDown className="h-4 w-4" />
                  {t('queue.postponeButton')}
                </button>
              ) : (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                  <label
                    htmlFor="postpone-positions"
                    className="mb-2 block text-sm font-medium text-amber-800"
                  >
                    {t('queue.postponeLabel')}
                  </label>
                  <input
                    id="postpone-positions"
                    type="number"
                    min={1}
                    max={10}
                    value={postponePositions}
                    onChange={e => {
                      const val = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                      setPostponePositions(val);
                    }}
                    className="mb-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-center text-lg font-mono outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handlePostpone}
                      className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 active:scale-[0.98]"
                    >
                      {t('common.confirm')}
                    </button>
                    <button
                      onClick={() => {
                        setShowPostponeForm(false);
                        setPostponePositions(1);
                      }}
                      className="flex-1 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl bg-amber-50 p-3 text-center ring-1 ring-amber-200">
              <p className="text-xs text-amber-700">
                {t('queue.postponeMaxReached', { max: DEFAULT_MAX_POSTPONEMENTS })}
              </p>
            </div>
          )}
        </div>

        {/* Leave queue */}
        <button
          onClick={handleLeaveQueue}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-red-200 bg-white px-6 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 active:scale-[0.98]"
        >
          <LogOut className="h-4 w-4" />
          {t('patient.leaveQueue')}
        </button>
      </div>
    </div>
  );
}
