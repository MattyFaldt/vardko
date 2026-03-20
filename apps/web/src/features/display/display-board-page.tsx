import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Monitor, Users, Clock, DoorOpen, ArrowRight } from 'lucide-react';
import { useDemo } from '../../lib/demo-data.js';

function useCurrentTime() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function useAutoHideCursor() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const show = () => {
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), 3000);
    };

    window.addEventListener('mousemove', show);
    window.addEventListener('mousedown', show);

    // Start the initial hide timer
    timerRef.current = setTimeout(() => setVisible(false), 3000);

    return () => {
      window.removeEventListener('mousemove', show);
      window.removeEventListener('mousedown', show);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return visible;
}

function ServingCard({
  ticketNumber,
  roomName,
  isNew,
}: {
  ticketNumber: number;
  roomName: string;
  isNew: boolean;
}) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center rounded-3xl px-10 py-8 transition-all duration-500',
        isNew
          ? 'ring-4 ring-[#4ade80] shadow-[0_0_40px_rgba(74,222,128,0.3)] animate-[pulse-green_2s_ease-in-out_3]'
          : 'ring-1 ring-white/10',
      ].join(' ')}
      style={{ backgroundColor: '#1e293b' }}
    >
      <span className="text-[#4ade80] text-2xl font-semibold tracking-wide uppercase mb-2">
        Nummer
      </span>
      <span className="text-white font-bold leading-none" style={{ fontSize: '7rem' }}>
        {ticketNumber}
      </span>
      <div className="flex items-center gap-3 mt-4 text-slate-300 text-2xl">
        <ArrowRight className="w-7 h-7 text-[#4ade80]" />
        <span className="font-medium">{roomName}</span>
      </div>
    </div>
  );
}

export function DisplayBoardPage() {
  const { clinicSlug } = useParams<{ clinicSlug: string }>();
  const { clinicName, calledTickets, stats } = useDemo();
  const now = useCurrentTime();
  const cursorVisible = useAutoHideCursor();

  // Track which tickets are "newly called" for highlight animation
  const prevTicketsRef = useRef<Set<number>>(new Set());
  const [newTickets, setNewTickets] = useState<Set<number>>(new Set());

  useEffect(() => {
    const currentNumbers = new Set(calledTickets.map((t) => t.ticketNumber));
    const justCalled = new Set<number>();

    currentNumbers.forEach((num) => {
      if (!prevTicketsRef.current.has(num)) {
        justCalled.add(num);
      }
    });

    if (justCalled.size > 0) {
      setNewTickets(justCalled);
      const timeout = setTimeout(() => setNewTickets(new Set()), 6000);
      return () => clearTimeout(timeout);
    }

    prevTicketsRef.current = currentNumbers;
  }, [calledTickets]);

  // Update the previous ref after the new-ticket effect runs
  useEffect(() => {
    prevTicketsRef.current = new Set(calledTickets.map((t) => t.ticketNumber));
  }, [calledTickets]);

  const formattedTime = useMemo(() => {
    return now.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [now]);

  const formattedDate = useMemo(() => {
    return now.toLocaleDateString('sv-SE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [now]);

  // Determine grid columns based on card count
  const gridCols =
    calledTickets.length <= 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : calledTickets.length <= 4
        ? 'grid-cols-2'
        : calledTickets.length <= 6
          ? 'grid-cols-3'
          : 'grid-cols-4';

  return (
    <>
      {/* Inject keyframes for the green pulse animation */}
      <style>{`
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 20px rgba(74,222,128,0.2); }
          50% { box-shadow: 0 0 60px rgba(74,222,128,0.5); }
        }
      `}</style>

      <div
        className="flex flex-col min-h-screen select-none overflow-hidden"
        style={{
          backgroundColor: '#0f172a',
          cursor: cursorVisible ? 'default' : 'none',
        }}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-12 py-8 border-b border-white/10">
          <div className="flex items-center gap-5">
            <Monitor className="w-10 h-10 text-[#4ade80]" />
            <div>
              <h1 className="text-white text-4xl font-bold tracking-tight">
                {clinicName}
              </h1>
              <p className="text-slate-400 text-lg mt-1 capitalize">{formattedDate}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-white font-mono font-bold" style={{ fontSize: '3.5rem' }}>
              {formattedTime}
            </div>
          </div>
        </header>

        {/* Main content area */}
        <main className="flex-1 flex flex-col items-center justify-center px-12 py-10">
          {/* Section heading */}
          <div className="flex items-center gap-4 mb-10">
            <div className="h-px w-16 bg-[#4ade80]/40" />
            <h2 className="text-[#4ade80] text-3xl font-semibold tracking-widest uppercase">
              Nu betjänas
            </h2>
            <div className="h-px w-16 bg-[#4ade80]/40" />
          </div>

          {calledTickets.length > 0 ? (
            <div className={`grid ${gridCols} gap-8 w-full max-w-7xl`}>
              {calledTickets.map((ticket) => (
                <ServingCard
                  key={ticket.ticketNumber}
                  ticketNumber={ticket.ticketNumber}
                  roomName={ticket.roomName}
                  isNew={newTickets.has(ticket.ticketNumber)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 gap-6">
              <Users className="w-20 h-20 text-slate-600" />
              <p className="text-slate-400 text-3xl font-medium">
                Inga patienter kallas just nu
              </p>
            </div>
          )}
        </main>

        {/* Bottom status bar */}
        <footer
          className="flex items-center justify-center gap-12 px-12 py-6 border-t border-white/10"
          style={{ backgroundColor: '#1e293b' }}
        >
          <div className="flex items-center gap-3 text-slate-200 text-2xl">
            <Users className="w-7 h-7 text-[#4ade80]" />
            <span>
              <span className="font-bold text-white">{stats.waitingCount}</span>{' '}
              {stats.waitingCount === 1 ? 'person' : 'personer'} väntar
            </span>
          </div>

          <div className="w-px h-8 bg-white/20" />

          <div className="flex items-center gap-3 text-slate-200 text-2xl">
            <Clock className="w-7 h-7 text-[#4ade80]" />
            <span>
              Beräknad väntetid:{' '}
              <span className="font-bold text-white">{stats.avgWaitMinutes}</span> min
            </span>
          </div>

          <div className="w-px h-8 bg-white/20" />

          <div className="flex items-center gap-3 text-slate-200 text-2xl">
            <DoorOpen className="w-7 h-7 text-[#4ade80]" />
            <span>
              <span className="font-bold text-white">{stats.activeRooms}</span> rum aktiva
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
