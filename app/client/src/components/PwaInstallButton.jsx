import { useEffect, useState } from 'react'
import { t } from '../i18n'

function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export default function PwaInstallButton() {
    const [installPrompt, setInstallPrompt] = useState(null)
    const [isInstalled, setIsInstalled] = useState(isStandaloneMode)

    useEffect(() => {
        const handleBeforeInstallPrompt = event => {
            event.preventDefault()
            setInstallPrompt(event)
        }
        const handleAppInstalled = () => {
            setInstallPrompt(null)
            setIsInstalled(true)
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        window.addEventListener('appinstalled', handleAppInstalled)
        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
            window.removeEventListener('appinstalled', handleAppInstalled)
        }
    }, [])

    if (isInstalled || !installPrompt) return null

    const installApp = async () => {
        await installPrompt.prompt()
        const result = await installPrompt.userChoice
        if (result.outcome === 'accepted') setIsInstalled(true)
        setInstallPrompt(null)
    }

    return (
        <button
            type="button"
            onClick={installApp}
            className="install-button"
            aria-label={t('pwa.install')}
            title={t('pwa.install')}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
            </svg>
            <span>{t('pwa.install')}</span>
        </button>
    )
}
