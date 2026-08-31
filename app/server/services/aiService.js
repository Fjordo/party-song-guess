const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createLogger } = require("../utils/logger");

const log = createLogger("ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Whether an error from the Gemini SDK means we hit a usage limit.
 *
 * Kept here so the heuristic lives in one place: callers only need to ask
 * the question, not know how the SDK reports it.
 *
 * @param {Error} error
 * @returns {boolean}
 */
function isQuotaError(error) {
    if (!error) return false;
    // GoogleGenerativeAIFetchError exposes the HTTP status
    if (error.status === 429) return true;
    return /quota|RESOURCE_EXHAUSTED|rate limit|too many requests/i.test(error.message || '');
}

/**
 * Ask Gemini for a playlist of songs matching the given criteria.
 *
 * Error handling is deliberately split in two:
 *  - content problems (malformed JSON, empty list) resolve to an empty array,
 *    because "the AI found nothing" is a normal outcome the caller can absorb;
 *  - call problems (network, 4xx/5xx) are rethrown, tagged with `isQuotaError`,
 *    because a exhausted quota must be distinguishable from an empty result:
 *    the catalog builder stops on it and the server logs it.
 *
 * @param {{genres: string[], decade: ?string, language: ?string, difficulty: string, count: number}} params
 * @returns {Promise<Array<{artist: string, title: string}>>}
 * @throws {Error} - On API/network failure; `error.isQuotaError` marks limit errors
 */
async function getSongListFromAI({ genres, decade, language, difficulty, count }) {
    // Request 30% more to cover songs not found on the music provider
    const safeCount = Math.ceil(count * 1.3);

    const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
        }
    });

    const prompt = `Sei un esperto curatore musicale. Crea una playlist di ${safeCount} canzoni che rispettino RIGOROSAMENTE questi criteri:
    - Generi: ${genres.join(", ")}
    - Decennio/Periodo: ${decade || "Qualsiasi"}
    - Lingua: ${language || "Qualsiasi"}
    - Livello di Oscurità/Difficoltà: ${difficulty === 'hard' ? 'Canzoni meno note, B-sides, o artisti di nicchia (NON HIT GLOBALI)' : 'Grandi successi commerciali e Hit famose'}

    Restituisci un array JSON di oggetti. Ogni oggetto deve avere esattamente queste chiavi: "artist", "title".
    Esempio: [{"artist": "Pino Daniele", "title": "Je so' pazzo"}]`;

    log.debug('requesting %d songs: genres=[%s] decade=%s language=%s difficulty=%s',
        safeCount, genres.join(','), decade || 'any', language || 'any', difficulty);

    const startedAt = Date.now();

    let response;
    try {
        const result = await model.generateContent(prompt);
        response = result.response;
    } catch (error) {
        if (isQuotaError(error)) {
            error.isQuotaError = true;
            log.warn("quota/rate limit reached after %dms:", Date.now() - startedAt, error.message);
        } else {
            log.error("call failed after %dms:", Date.now() - startedAt, error.message);
        }
        throw error;
    }

    try {
        const parsed = JSON.parse(response.text());
        const songs = Array.isArray(parsed) ? parsed : [];
        log.debug('answered with %d song(s) in %dms', songs.length, Date.now() - startedAt);
        return songs;
    } catch (error) {
        log.error("returned malformed JSON after %dms:", Date.now() - startedAt, error.message);
        return [];
    }
}

module.exports = { getSongListFromAI, isQuotaError };
