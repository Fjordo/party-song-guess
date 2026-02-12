/**
 * Answer validation function with 5-tiered matching strategy
 * @param {string} guess - User's answer
 * @param {string} actual - Correct song title
 * @returns {boolean} - Whether the guess is acceptable
 */
function checkAnswer(guess, actual) {
    if (!guess || !actual) return false;

    // Normalize strings: lowercase, remove punctuation, collapse spaces
    const clean = (str) =>
        str
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/\(.*?\)/g, '') // remove parentheses e.g. (Remix)
            .replace(/\bfeat\.?\b.*$/g, '') // drop "feat." and following
            .replace(/[^\w\s]/g, ' ') // remove special chars
            .replace(/\s+/g, ' ')
            .trim();

    const g = clean(guess);
    const a = clean(actual);

    if (!g || !a) return false;

    // 1. Exact match
    if (g === a) return true;

    // 2. Token-based overlap (handles "The Beatles" vs "Beatles")
    const getTokens = (str) => {
        const stopwords = new Set(['the', 'a', 'an', 'le', 'la', 'il', 'lo', 'i', 'gli', 'un', 'una', 'uno', 'el', 'los', 'las', 'unos', 'unas', 'and', 'of', 'in', 'on', 'at', 'to']);
        return new Set(str.split(' ').filter(w => w.length > 0 && !stopwords.has(w)));
    };

    const gTokens = getTokens(g);
    const aTokens = getTokens(a);

    // If after removing stopwords we have no tokens (e.g. answer was just "The"), fallback to raw tokens
    const finalGTokens = gTokens.size > 0 ? gTokens : new Set(g.split(' ').filter(w => w));
    const finalATokens = aTokens.size > 0 ? aTokens : new Set(a.split(' ').filter(w => w));

    if (finalATokens.size > 0) {
        const intersection = [...finalGTokens].filter(x => finalATokens.has(x));
        // Require high overlap: 
        // If guess has all important words from answer, it's good. 
        // We also check that guess doesn't have too many *extra* words? 
        // For now, let's stick to user's "80%" idea or simply:
        // If > 75% of answer's important tokens are in guess.
        const overlapRatio = intersection.length / finalATokens.size;

        // Also check if guess is not wildly different in length (prevent "Love" matching "I Love You And More...")
        // Actually, if I say "Queen" and answer is "Queen", ratio is 1.
        // If answer is "Dancing Queen", guess "Queen", ratio 0.5.
        // If threshold is 0.8, "Dancing Queen" fails "Queen". This is probably correct.
        // But "The Beatles" (tokens: Beatles) vs "Beatles" (tokens: Beatles) -> 1.0. Correct.
        if (overlapRatio >= 0.8) return true;
    }

    // 3. Levenshtein distance similarity for typos
    const similarity = (s1, s2) => {
        const len1 = s1.length;
        const len2 = s2.length;
        if (len1 === 0 || len2 === 0) return 0;

        // Optimization: if length difference is too big, similarity will definitely be low
        if (Math.abs(len1 - len2) / Math.max(len1, len2) > 0.3) return 0;

        const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));
        for (let i = 0; i <= len1; i++) dp[i][0] = i;
        for (let j = 0; j <= len2; j++) dp[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1, // deletion
                    dp[i][j - 1] + 1, // insertion
                    dp[i - 1][j - 1] + cost // substitution
                );
            }
        }

        const dist = dp[len1][len2];
        const maxLen = Math.max(len1, len2);
        return 1 - dist / maxLen;
    };

    // Stricter threshold for fuzzy match (0.75 allows 1 error in 4 chars, e.g. "Sonf" for "Song")
    // This prevents "a" roughly matching short words or just general noise
    return similarity(g, a) >= 0.75;
}

module.exports = { checkAnswer };
