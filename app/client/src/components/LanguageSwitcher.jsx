import { useTranslation } from 'react-i18next';

const LANGUAGES = [
    { code: 'it', label: 'IT' },
    { code: 'en', label: 'EN' },
    { code: 'es', label: 'ES' }
];

export default function LanguageSwitcher() {
    const { t, i18n } = useTranslation();
    const currentLanguage = i18n.resolvedLanguage || i18n.language.split('-')[0];

    return (
        <label className="language-switcher">
            <span className="sr-only">{t('language.selector')}</span>
            <select
                value={currentLanguage}
                onChange={event => i18n.changeLanguage(event.target.value)}
                aria-label={t('language.selector')}
            >
                {LANGUAGES.map(language => (
                    <option key={language.code} value={language.code}>{language.label}</option>
                ))}
            </select>
        </label>
    );
}
