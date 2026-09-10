import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

function invitationUrl(roomId) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', roomId);
    return url.toString();
}

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Unable to copy');
}

function ShareIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>;
}

export default function ShareRoomButton({ roomId }) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [feedback, setFeedback] = useState('');
    const triggerRef = useRef(null);
    const closeRef = useRef(null);
    const hasNativeShare = typeof navigator.share === 'function';
    const url = invitationUrl(roomId);

    useEffect(() => {
        if (!isOpen) return undefined;
        closeRef.current?.focus();
        const closeOnEscape = event => {
            if (event.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [isOpen]);

    const closeDialog = () => {
        setIsOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
    };

    const handleCopyCode = async () => {
        try {
            await copyText(roomId);
            setFeedback(t('share.codeCopied'));
        } catch {
            setFeedback(t('share.error'));
        }
    };

    const share = async (kind) => {
        const fallbackValue = kind === 'link' ? url : roomId;
        if (!hasNativeShare) {
            try {
                await copyText(fallbackValue);
                setFeedback(t(kind === 'link' ? 'share.linkCopied' : 'share.codeCopied'));
            } catch {
                setFeedback(t('share.error'));
            }
            return;
        }

        try {
            await navigator.share(kind === 'link'
                ? { title: t('appTitle'), text: t('share.inviteText'), url }
                : { title: t('appTitle'), text: roomId });
            closeDialog();
        } catch (error) {
            if (error?.name !== 'AbortError') setFeedback(t('share.error'));
        }
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className="share-trigger"
                onClick={() => { setFeedback(''); setIsOpen(true); }}
                aria-haspopup="dialog"
            >
                <ShareIcon />
                <span>{t('share.open')}</span>
            </button>

            {isOpen && createPortal(
                <div className="share-overlay" onClick={closeDialog}>
                    <div
                        className="share-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="share-title"
                        onClick={event => event.stopPropagation()}
                    >
                        <header className="share-dialog-header">
                            <div>
                                <p className="eyebrow">{t('share.eyebrow')}</p>
                                <h2 id="share-title">{t('share.title')}</h2>
                            </div>
                            <button ref={closeRef} type="button" className="share-close" onClick={closeDialog} aria-label={t('help.close')}>×</button>
                        </header>

                        <div className="share-room-code">
                            <span>{t('share.roomCode')}</span>
                            <strong>{roomId}</strong>
                        </div>

                        <div className="share-actions">
                            <button type="button" onClick={handleCopyCode}>
                                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>
                                <span><strong>{t('share.copyCode')}</strong><small>{t('share.copyCodeHint')}</small></span>
                            </button>
                            <button type="button" onClick={() => share('link')}>
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></svg>
                                <span><strong>{t('share.shareLink')}</strong><small>{t('share.shareLinkHint')}</small></span>
                            </button>
                            <button type="button" onClick={() => share('code')}>
                                <ShareIcon />
                                <span><strong>{t('share.shareCode')}</strong><small>{t('share.shareCodeHint')}</small></span>
                            </button>
                        </div>

                        {!hasNativeShare && <p className="share-support-note">{t('share.nativeUnavailable')}</p>}
                        <p className="share-feedback" role="status" aria-live="polite">{feedback}</p>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
