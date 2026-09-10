import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const RULES = [
    ['setup', '01'],
    ['guess', '02'],
    ['score', '03'],
    ['winner', '04']
];

export default function GameRulesButton() {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef(null);
    const closeRef = useRef(null);
    const panelRef = useRef(null);

    const closeDialog = useCallback(() => {
        setIsOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
    }, []);

    useEffect(() => {
        if (!isOpen) return undefined;
        closeRef.current?.focus();

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeDialog();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = panelRef.current?.querySelectorAll(
                'button, [href], [tabindex]:not([tabindex="-1"])'
            );
            if (!focusable?.length) return;
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

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, closeDialog]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className="rules-teaser"
                onClick={() => setIsOpen(true)}
                aria-haspopup="dialog"
            >
                <span>{t('rules.teaser')}</span>
                <strong>{t('rules.open')}</strong>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                </svg>
            </button>

            {isOpen && createPortal(
                <div className="rules-overlay" onClick={closeDialog}>
                    <div
                        ref={panelRef}
                        className="rules-dialog custom-scrollbar"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="rules-title"
                        aria-describedby="rules-intro"
                        onClick={event => event.stopPropagation()}
                    >
                        <header className="rules-dialog-header">
                            <div>
                                <p className="eyebrow">{t('rules.eyebrow')}</p>
                                <h2 id="rules-title">{t('rules.title')}</h2>
                            </div>
                            <button
                                ref={closeRef}
                                type="button"
                                className="rules-close"
                                onClick={closeDialog}
                                aria-label={t('rules.close')}
                            >
                                ×
                            </button>
                        </header>

                        <p id="rules-intro" className="rules-intro">{t('rules.intro')}</p>

                        <ol className="rules-list">
                            {RULES.map(([key, number]) => (
                                <li key={key}>
                                    <span aria-hidden="true">{number}</span>
                                    <div>
                                        <h3>{t(`rules.${key}Title`)}</h3>
                                        <p>{t(`rules.${key}Text`)}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>

                        <div className="rules-facts" aria-label={t('rules.quickFacts')}>
                            <span><strong>30</strong> {t('rules.seconds')}</span>
                            <span><strong>+1</strong> {t('rules.point')}</span>
                            <span><strong>5–20</strong> {t('rules.rounds')}</span>
                        </div>

                        <button type="button" className="primary-button rules-confirm" onClick={closeDialog}>
                            {t('rules.confirm')}
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
