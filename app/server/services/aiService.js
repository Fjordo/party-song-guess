const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getSongListFromAI({ genres, decade, language, difficulty, count }) {
    // Request 30% more to cover songs not found on Apple Music
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

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        return JSON.parse(response.text());
    } catch (error) {
        console.error("Gemini Error:", error);
        return []; // Return empty array on error to avoid crashing the server
    }
}

module.exports = { getSongListFromAI };