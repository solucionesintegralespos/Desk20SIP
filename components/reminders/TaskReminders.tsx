'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, BellRing, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { timeLabel } from '@/lib/schedule';
import { takeDueReminders, snoozeReminder, type ReminderTask, type ReminderMarks } from '@/lib/reminders';

type Permission = NotificationPermission | 'unsupported';

const POLL_MS = 5 * 60 * 1000;
const CHECK_MS = 15 * 1000;
const SNOOZE_MS = 10 * 60 * 1000;
const NOTIFY_KEY = 'sip-browser-notifications';
export const SCHEDULE_CHANGED = 'sip-schedule-changed';
const taskUrl = (task: ReminderTask) => `/dashboard/schedule?event=${encodeURIComponent(task.id)}`;

function whenLabel(task: ReminderTask, today: string) {
  const day = task.date === today ? 'Hoy' : new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(task.date + 'T12:00:00Z'));
  return `${day} a las ${timeLabel(task.start)}`;
}
function readLocal(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function writeLocal(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Storage disabled: in-memory state still applies. */ } }
function notificationPermission(): Permission {
  return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext ? Notification.permission : 'unsupported';
}

const ReminderContext = createContext<{ permission: Permission; enabled: boolean; toggle: () => void } | null>(null);

export function TaskReminders({ userId, children }: { userId: string; children: ReactNode }) {
  const router = useRouter();
  const [permission, setPermission] = useState<Permission>('unsupported');
  const [enabled, setEnabled] = useState(false);
  const tasks = useRef<ReminderTask[]>([]);
  const today = useRef('');
  const memory = useRef<ReminderMarks>({});
  const lastLoad = useRef(0);
  const stopped = useRef(false);
  const notifyRef = useRef(false);
  const storageKey = `sip-task-reminders:${userId}`;

  // Marks live in localStorage so reloads and other tabs do not repeat a reminder.
  const readMarks = useCallback((): ReminderMarks => {
    try { return { ...memory.current, ...JSON.parse(readLocal(storageKey) || '{}') }; } catch { return { ...memory.current }; }
  }, [storageKey]);
  const saveMarks = useCallback((marks: ReminderMarks) => {
    memory.current = marks;
    writeLocal(storageKey, JSON.stringify(marks));
  }, [storageKey]);

  const show = useCallback((task: ReminderTask, key: string) => {
    const when = whenLabel(task, today.current);
    const open = () => router.push(taskUrl(task));
    toast.custom(t => <ReminderCard task={task} when={when}
      onOpen={() => { toast.remove(t.id); open(); }}
      onSnooze={() => { toast.remove(t.id); saveMarks(snoozeReminder(readMarks(), key, SNOOZE_MS)); toast.success('Te lo recordaremos en 10 minutos'); }}
      onClose={() => toast.remove(t.id)} />, { id: `task-reminder:${key}`, duration: Infinity, position: 'top-right' });
    // The in-app card is always shown; the system notification helps when the window is in the background.
    if (notifyRef.current && notificationPermission() === 'granted' && !document.hasFocus()) {
      try {
        const notification = new Notification('🔔 Recordatorio de tarea', { body: `Tienes una tarea programada:\n"${task.title}"\n${when}`, tag: key, icon: '/brand/sip-logo-mail.png' });
        notification.onclick = () => { window.focus(); open(); notification.close(); };
      } catch { /* Some mobile browsers only allow notifications from a service worker. */ }
    }
  }, [router, readMarks, saveMarks]);

  const check = useCallback(() => {
    if (!tasks.current.some(task => Date.parse(task.scheduledAt) <= Date.now())) return;
    const { due, marks } = takeDueReminders(tasks.current, readMarks());
    if (!due.length) return;
    saveMarks(marks);
    due.forEach(({ task, key }) => show(task, key));
  }, [readMarks, saveMarks, show]);

  const load = useCallback(async () => {
    if (stopped.current) return;
    lastLoad.current = Date.now();
    try {
      const response = await fetch('/api/schedule/reminders', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) { stopped.current = true; return; }
      if (!response.ok) return;
      const result = await response.json() as { tasks: ReminderTask[]; today: string };
      tasks.current = result.tasks; today.current = result.today;
      check();
    } catch { /* Offline: retry on the next poll. */ }
  }, [check]);

  useEffect(() => {
    setPermission(notificationPermission());
    const on = readLocal(NOTIFY_KEY) === 'on';
    setEnabled(on); notifyRef.current = on;
    void load();
    // Network every few minutes; the local clock comparison runs more often and costs nothing.
    const poll = window.setInterval(() => void load(), POLL_MS);
    const tick = window.setInterval(check, CHECK_MS);
    const resume = () => { if (document.visibilityState === 'visible') { if (Date.now() - lastLoad.current > 60000) void load(); else check(); } };
    const refresh = () => void load();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener(SCHEDULE_CHANGED, refresh);
    return () => { window.clearInterval(poll); window.clearInterval(tick); document.removeEventListener('visibilitychange', resume); window.removeEventListener(SCHEDULE_CHANGED, refresh); };
  }, [load, check]);

  async function toggle() {
    if (enabled) {
      setEnabled(false); notifyRef.current = false; writeLocal(NOTIFY_KEY, 'off');
      toast('Notificaciones del navegador desactivadas. Los recordatorios seguirán apareciendo en la aplicación.');
      return;
    }
    if (notificationPermission() === 'unsupported') return;
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      setEnabled(true); notifyRef.current = true; writeLocal(NOTIFY_KEY, 'on');
      toast.success('Notificaciones del navegador activadas');
    } else toast.error('El navegador no concedió el permiso. Los recordatorios se mostrarán dentro de la aplicación.');
  }

  return <ReminderContext.Provider value={{ permission, enabled, toggle: () => void toggle() }}>{children}</ReminderContext.Provider>;
}

function ReminderCard({ task, when, onOpen, onSnooze, onClose }: { task: ReminderTask; when: string; onOpen: () => void; onSnooze: () => void; onClose: () => void }) {
  return <div role="alert" className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-primary-100 border-t-4 border-t-brand-amber bg-white p-4 text-gray-900 shadow-lg">
    <div className="flex items-start gap-3">
      <span className="rounded-full bg-primary-50 p-2 text-primary-600"><BellRing size={18} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary-700">Recordatorio</p>
        <p className="text-sm text-gray-600">Tienes una tarea programada</p>
        <p className="mt-2 font-semibold break-words">{task.title}</p>
        {task.clientName && <p className="text-sm text-gray-600 break-words">{task.clientName}</p>}
        <p className="text-sm text-gray-600">{when}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Cerrar recordatorio" className="rounded p-1 text-gray-500 hover:bg-gray-100"><X size={16} /></button>
    </div>
    <div className="mt-3 flex justify-end gap-2">
      <button type="button" onClick={onSnooze} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Posponer</button>
      <button type="button" onClick={onOpen} className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700">Ver tarea</button>
    </div>
  </div>;
}

export function NotificationToggle({ compact = false }: { compact?: boolean }) {
  const context = useContext(ReminderContext);
  if (!context) return null;
  const { permission, enabled, toggle } = context;
  const unsupported = permission === 'unsupported';
  const label = unsupported ? 'Notificaciones no disponibles' : enabled ? 'Desactivar notificaciones' : 'Activar notificaciones';
  const title = unsupported ? 'Este navegador no permite notificaciones en esta conexión (requieren HTTPS). Los recordatorios se muestran dentro de la aplicación.'
    : permission === 'denied' && !enabled ? 'El permiso está bloqueado en el navegador. Habilítalo en la configuración del sitio.' : label;
  const Icon = enabled ? Bell : BellOff;
  if (compact) return <button type="button" onClick={toggle} disabled={unsupported} aria-pressed={enabled} aria-label={label} title={title} className="p-3 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary-500"><Icon size={20} /></button>;
  return <button type="button" onClick={toggle} disabled={unsupported} aria-pressed={enabled} aria-label={label} title={title} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg border-l-4 border-transparent text-sm font-medium text-left text-primary-100 hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 disabled:hover:bg-transparent"><Icon size={18} className="shrink-0" /><span className="truncate">Notificaciones</span><span aria-hidden="true" className={`ml-auto shrink-0 h-4 w-7 rounded-full p-0.5 transition-colors ${enabled ? 'bg-brand-amber' : 'bg-white/25'}`}><span className={`block h-3 w-3 rounded-full bg-white transition-transform ${enabled ? 'translate-x-3' : ''}`} /></span></button>;
}
