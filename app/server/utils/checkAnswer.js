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
            .replace(/\(.*?\)/g, '') // remove parentheses e.g. (Remix)
            .replace(/\bfeat\.?\b.*$/g, '') // drop "feat." and following
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const g = clean(guess);
    const a = clean(actual);

    if (!g || !a) return false;

    // Exact or substring match after normalization
    if (g === a) return true;
    if (g.includes(a) || a.includes(g)) return true;

    // Word-overlap heuristic: at least 60% of actual's words must appear in guess
    const aWords = Array.from(new Set(a.split(' ')));
    const gWords = new Set(g.split(' '));
    const common = aWords.filter((w) => gWords.has(w));
    if (aWords.length > 0 && common.length / aWords.length >= 0.6) {
        return true;
    }

    // Levenshtein distance similarity for small typos
    const similarity = (s1, s2) => {
        const len1 = s1.length;
        const len2 = s2.length;
        if (len1 === 0 || len2 === 0) return 0;

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

    // Accept answers with reasonably high similarity (allows for typos)
    return similarity(g, a) >= 0.7;
}

module.exports = { checkAnswer };
