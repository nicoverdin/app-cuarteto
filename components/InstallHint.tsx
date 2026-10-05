"use client";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, X } from 'lucide-react';

const DISMISS_KEY = 'cuarteto:install-dismissed';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

const noopSubscribe = () => () => {};
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const wasDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

// Aviso discreto para añadir la app a la pantalla de inicio (una vez; se puede descartar).
export default function InstallHint() {
  // En servidor devuelven valores que ocultan el aviso, así no hay desajuste de hidratación.
  const standalone = useSyncExternalStore(noopSubscribe, isStandalone, () => true);
  const ios = useSyncExternalStore(noopSubscribe, isIos, () => false);
  const dismissedBefore = useSyncExternalStore(noopSubscribe, wasDismissed, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (standalone || dismissedBefore || dismissedNow || (!ios && !installEvent)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* se ignora */
    }
    setDismissedNow(true);
  };

  return (
    <div className="mb-5 flex items-start gap-3 rounded-2xl bg-surface border border-line px-4 py-3 text-sm text-ink-soft">
      <Download className="w-5 h-5 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-semibold text-ink">Ten el programa a mano</p>
        {ios ? (
          <p>En Safari pulsa Compartir y luego «Añadir a pantalla de inicio».</p>
        ) : (
          <button
            type="button"
            onClick={() => installEvent?.prompt()}
            className="mt-1 font-semibold text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            Instalar la app
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar aviso"
        className="w-8 h-8 -mr-2 -mt-1 flex items-center justify-center rounded-full text-ink-muted focus-visible:outline-2 focus-visible:outline-accent"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
