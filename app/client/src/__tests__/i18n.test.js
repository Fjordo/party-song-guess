import test from 'node:test';
import assert from 'node:assert/strict';
import i18n from '../i18n.js';

const LANGUAGES = ['en', 'it', 'es'];

function translationKeys(value, prefix = '') {
    return Object.entries(value).flatMap(([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return child && typeof child === 'object'
            ? translationKeys(child, path)
            : [path];
    });
}

test('all supported languages expose the same translation keys', () => {
    const reference = translationKeys(i18n.getResourceBundle('en', 'translation')).sort();

    for (const language of LANGUAGES) {
        const keys = translationKeys(i18n.getResourceBundle(language, 'translation')).sort();
        assert.deepEqual(keys, reference, `${language} must match the English catalog`);
    }
});

test('every translation key resolves in every supported language', () => {
    const keys = translationKeys(i18n.getResourceBundle('en', 'translation'));

    for (const language of LANGUAGES) {
        for (const key of keys) {
            assert.notEqual(i18n.t(key, { lng: language, count: 2 }), key, `${language}.${key}`);
        }
    }
});

test('score labels use the correct singular and plural forms', () => {
    assert.equal(i18n.t('game.points', { lng: 'en', count: 1 }), '1 pt');
    assert.equal(i18n.t('game.points', { lng: 'en', count: 2 }), '2 pts');
    assert.equal(i18n.t('game.points', { lng: 'it', count: 1 }), '1 punto');
    assert.equal(i18n.t('game.points', { lng: 'it', count: 2 }), '2 punti');
    assert.equal(i18n.t('game.points', { lng: 'es', count: 1 }), '1 punto');
    assert.equal(i18n.t('game.points', { lng: 'es', count: 2 }), '2 puntos');
});

test('the active language can change without reinitializing i18next', async () => {
    for (const language of LANGUAGES) {
        await i18n.changeLanguage(language);
        assert.equal(i18n.resolvedLanguage, language);
        assert.notEqual(i18n.t('rules.title'), 'rules.title');
    }
});
