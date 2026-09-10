import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0';

// The title resolves one character at a time, the way a song title resolves at
// the end of a round. Monospace keeps the '?' substitution from shifting the
// layout, and it is already this app's voice for identifiers (room ID, score).
const REVEAL_STEP_MS = 40;

function maskTitle(title, revealed) {
  return title
    .split('')
    .map((char, i) => (i < revealed || char === ' ' ? char : '?'))
    .join('');
}

export default function HelpButton({ socket }) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [catalog, setCatalog] = useState({ status: 'loading' });
  const appTitle = t('appTitle');
  const [revealed, setRevealed] = useState(appTitle.length);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const hasOpened = useRef(false);

  const openDialog = () => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Reduced motion opens on the resolved title; the interval below then has
    // nothing left to reveal and clears itself on its first tick.
    setRevealed(prefersReducedMotion ? appTitle.length : 0);
    setCatalog({ status: 'loading' });
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    let active = true;
    let requestId = 0;
    const requestStats = () => {
      const id = ++requestId;
      // Do not queue requests while the sleeping server is disconnected.
      socket.timeout(8000).volatile.emit('get_catalog_stats', (error, data) => {
        if (!active || id !== requestId) return;
        setCatalog(error || data?.error || !Array.isArray(data?.byGenre)
          ? { status: 'error' }
          : { status: 'ready', ...data });
      });
    };
    socket.on('connect', requestStats);
    requestStats();
    return () => {
      active = false;
      socket.off('connect', requestStats);
    };
  }, [isOpen, socket]);

  // Step the reveal forward while the dialog is open.
  useEffect(() => {
    if (!isOpen) return undefined;

    const timer = setInterval(() => {
      setRevealed((current) => {
        if (current >= appTitle.length) {
          clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, REVEAL_STEP_MS);

    return () => clearInterval(timer);
  }, [isOpen, appTitle]);

  // Move focus into the dialog on open, and hand it back to the trigger on close.
  // The mount pass is skipped so the button does not steal focus on page load.
  useEffect(() => {
    if (isOpen) {
      hasOpened.current = true;
      closeRef.current?.focus();
    } else if (hasOpened.current) {
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = panelRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-label={t('help.open')}
        className="help-trigger"
      >
        ?
      </button>

      {isOpen && createPortal((
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            className="relative w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-y-contain rounded-xl border border-gray-700 bg-gray-800 p-4 sm:p-8 shadow-2xl motion-safe:animate-[help-in_180ms_ease-out]"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label={t('help.close')}
              className="absolute top-2 right-2 h-12 w-12 rounded-full text-gray-400 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 touch-manipulation"
            >
              ✕
            </button>

            <h2
              id="help-title"
              className="font-mono text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-6 pr-12 break-words"
            >
              {maskTitle(appTitle, revealed)}
            </h2>

            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 items-baseline">
              <dt className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                {t('help.createdBy')}
              </dt>
              <dd className="text-sm font-semibold text-white">Fjordo</dd>

              <dt className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                {t('help.version')}
              </dt>
              <dd className="font-mono text-sm text-purple-300">{APP_VERSION}</dd>
            </dl>

            <section className="border-t border-gray-700 mt-6 pt-4" aria-labelledby="catalog-title">
              <h3 id="catalog-title" className="text-sm font-semibold text-white mb-3">
                {t('help.catalogTitle')}
              </h3>
              <div aria-live="polite" aria-busy={catalog.status === 'loading'}>
                {catalog.status === 'loading' && (
                  <p className="text-sm text-gray-400">{t('help.catalogLoading')}</p>
                )}
                {catalog.status === 'error' && (
                  <p className="text-sm text-gray-400">{t('help.catalogUnavailable')}</p>
                )}
                {catalog.status === 'ready' && (
                  <>
                    <p className="flex justify-between gap-3 text-sm mb-3">
                      <span className="text-gray-300">{t('help.catalogTotal')}</span>
                      <span className="font-mono font-bold text-purple-300">{catalog.total.toLocaleString(i18n.resolvedLanguage)}</span>
                    </p>
                    <dl className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-x-4 gap-y-2">
                      {catalog.byGenre.map(({ genre, count }) => (
                        <div key={genre} className="flex justify-between gap-2 text-sm">
                          <dt className="text-gray-400">{t(`landing.genre_${genre}`)}</dt>
                          <dd className="font-mono text-purple-200">{count.toLocaleString(i18n.resolvedLanguage)}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 text-xs text-gray-400">{t('help.catalogNote')}</p>
                  </>
                )}
              </div>
            </section>

            <p className="border-t border-gray-700 mt-6 pt-4 text-xs text-gray-500">
              {t('help.rights')}
            </p>
          </div>
        </div>
      ), document.body)}
    </>
  );
}
