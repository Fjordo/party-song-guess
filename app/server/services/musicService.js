const axios = require('axios');

// --- Helper esistente (puoi lasciarlo, anche se con l'AI serve meno) ---
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

// --- Metodo Vecchio (Ricerca Casuale) ---
async function getRandomSongs(genre = 'pop', limit = 10, language = null, difficulty = 'hard') {
    try {
        const response = await axios.get('https://itunes.apple.com/search', {
            params: {
                term: genre,
                media: 'music',
                entity: 'song',
                limit: 50
            }
        });

        let results = response.data.results;
        if (!results || results.length === 0) return [];

        if (language) {
            results = results.filter(song => {
                const text = `${song.trackName || ''} ${song.artistName || ''} ${song.collectionName || ''}`;
                return detectLanguage(text) === language;
            });
            if (results.length === 0) {
                results = response.data.results;
            }
        }

        let selected;
        if (difficulty === 'easy') {
            const topPool = results.slice(0, 100);
            selected = topPool.sort(() => 0.5 - Math.random()).slice(0, limit);
        } else {
            const shuffled = results.sort(() => 0.5 - Math.random());
            selected = shuffled.slice(0, limit);
        }

        return selected.map(song => ({
            title: song.trackName,
            artist: song.artistName,
            previewUrl: song.previewUrl,
            artwork: song.artworkUrl100
        }));
    } catch (error) {
        console.error('Error fetching songs:', error.message);
        return [];
    }
}

// --- NUOVO METODO (Ricerca Specifica per AI) ---
// Questo è quello che viene chiamato dal loop nel tuo file principale
async function searchAndGetPreview(queryOrArtist, title = null) {
    try {
        // Costruiamo la stringa di ricerca. 
        // Supporta sia una stringa unica ("Pino Daniele Napule è") che due parametri.
        let searchTerm = title ? `${queryOrArtist} ${title}` : queryOrArtist;
        
        // Pulizia caratteri speciali per evitare errori URL
        searchTerm = searchTerm.replace(/[^a-zA-Z0-9 àèéìòù]/g, " ");

        const response = await axios.get('https://itunes.apple.com/search', {
            params: {
                term: searchTerm,
                media: 'music',
                entity: 'song',
                limit: 1 // Ne vogliamo solo una, la più rilevante
            },
            timeout: 5000 // Timeout per non bloccare il gioco
        });

        if (response.data.results && response.data.results.length > 0) {
            const track = response.data.results[0];
            
            // Se non c'è l'audio, è inutile per il gioco
            if (!track.previewUrl) return null;

            return {
                title: track.trackName,
                artist: track.artistName,
                previewUrl: track.previewUrl,
                artwork: track.artworkUrl100
            };
        }
        return null;
    } catch (error) {
        // Non logghiamo l'errore per ogni singola canzone per non sporcare la console,
        // ritorniamo null e il sistema proverà la prossima canzone.
        return null;
    }
}

// --- EXPORT ---
// Ricordati di esportare entrambi i metodi!
module.exports = { 
    getRandomSongs, 
    searchAndGetPreview 
};