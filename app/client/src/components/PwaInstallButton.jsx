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
            className="mb-4 rounded-lg border border-cyan-400/70 bg-cyan-950/60 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-900/80"
        >
            {t('pwa.install')}
        </button>
    )
}