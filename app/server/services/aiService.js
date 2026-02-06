const { GoogleGenerativeAI } = require("@google/generative-ai");

// Assicurati di avere GEMINI_API_KEY nel tuo file .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getSongListFromAI({ genres, decade, language, difficulty, count }) {
    // Richiediamo un buffer del 30% in più per coprire eventuali canzoni non trovate su Apple Music
    const safeCount = Math.ceil(count * 1.3); 

    const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: {
            responseMimeType: "application/json", // Forza l'output JSON puro
            temperature: 0.7, // Creativo ma non troppo allucinogeno
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
        return []; // Ritorna array vuoto in caso di errore per non crashare il server
    }
}

module.exports = { getSongListFromAI };