/**
 * Heuristic-based language detection for song titles and lyrics
 * @param {string} text - Text to analyze
 * @returns {string|null} - Language code ('it', 'es', 'en') or null
 */
function detectLanguage(text) {
    if (!text) return null;
    const s = text.toLowerCase();
    const words = s.split(/\s+/).filter(Boolean);

    const scores = { it: 0, en: 0, es: 0 };

    const itHints = ['che', 'non', 'per', 'con', 'una', 'uno', 'una', 'di', 'nel', 'della', 'delle', 'degli', 'gli'];
    const esHints = ['que', 'para', 'con', 'una', 'uno', 'del', 'de', 'las', 'los', 'el'];
    const enHints = ['the', 'and', 'you', 'me', 'of', 'in', 'on', 'love'];

    for (const w of words) {
        if (itHints.includes(w)) scores.it += 1;
        if (esHints.includes(w)) scores.es += 1;
        if (enHints.includes(w)) scores.en += 1;
    }

    // Accent hints
    if (/[áéíóúñ]/.test(s)) scores.es += 1;
    if (/[àèéìòù]/.test(s)) scores.it += 1;

    const entries = Object.entries(scores);
    entries.sort((a, b) => b[1] - a[1]);
    const [bestLang, bestScore] = entries[0];
    if (bestScore <= 0) return null;
    return bestLang;
}

module.exports = { detectLanguage };
