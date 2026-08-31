import React, { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';

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

export default function HelpButton() {
  const [isOpen, setIsOpen] = useState(false);
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
    setIsOpen(true);
  };

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
        className="fixed top-3 right-3 z-40 h-9 w-9 rounded-full bg-gray-800/80 border border-gray-700 text-gray-400 font-mono font-bold backdrop-blur-sm transition hover:text-purple-300 hover:border-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
      >
        ?
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            className="relative w-full max-w-sm rounded-xl border border-gray-700 bg-gray-800 p-6 sm:p-8 shadow-2xl motion-safe:animate-[help-in_180ms_ease-out]"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label={t('help.close')}
              className="absolute top-3 right-3 h-8 w-8 rounded-full text-gray-500 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              ✕
            </button>

            <h2
              id="help-title"
              className="font-mono text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-6 pr-8 break-words"
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

            <p className="border-t border-gray-700 mt-6 pt-4 text-xs text-gray-500">
              {t('help.rights')}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
