const messages = {
  en: {
    appTitle: 'Party Song Guess',
    landing: {
      namePlaceholder: 'Your name',
      roundsLabel: 'Number of rounds',
      createRoom: 'Create Room',
      joinLabel: 'Or join:',
      joinPlaceholder: 'Room ID',
      joinButton: 'Join',
      genresLabel: 'Music genres',
      decadesLabel: 'Decade',
      anyDecade: 'Any decade',
      difficultyLabel: 'Difficulty',
      difficulty_easy: 'Easy (popular songs)',
      difficulty_hard: 'Hard (random songs)',
      languageLabel: 'Song language',
      language_any: 'Any language',
      language_it: 'Italian',
      language_en: 'English',
      language_es: 'Spanish',
      genre_pop: 'Pop',
      genre_rock: 'Rock',
      genre_hiphop: 'Hip-hop',
      genre_rap: 'Rap',
      genre_trap: 'Trap',
      genre_dance: 'Dance',
      genre_jazz: 'Jazz',
      genre_metal: 'Metal',
      genre_indie: 'Indie',
      genre_electronic: 'Electronic',
      genre_rnb: 'R&B',
      decade_50s: '1950s',
      decade_60s: '1960s',
      decade_70s: '1970s',
      decade_80s: '1980s',
      decade_90s: '1990s',
      decade_2000s: '2000s',
      decade_2010s: '2010s',
      decade_2020s: '2020s'
    },
    lobby: {
      waiting: 'Waiting for players...',
      startGame: 'Start Game',
      generating: 'Generating...',
      hostStarting: 'The host is about to start the game...'
    },
    game: {
      getReady: 'Get Ready...',
      guessTheSong: '🎵 GUESS THE SONG 🎵',
      round: 'Round',
      submit: 'SUBMIT',
      timeUp: 'Time\'s Up!',
      guessed: 'guessed it!',
      inputPlaceholder: 'Song title...',
      scoreboard: 'Scoreboard',
      wrongGuess: 'Wrong answer, try again!',
      gameOver: 'Game Over!',
      newGame: 'New Game'
    },
    errors: {
      title: 'Error',
      generic: 'An error occurred.',
      missingNameCreate: 'Enter your name to create a room.',
      missingNameJoin: 'Enter your name to join a room.',
      missingRoomId: 'Enter a valid room ID.',
      roomNotFound: 'Room not found or game already started.',
      generationFailed: 'The AI service is temporarily unavailable. Please try again.'
    }
  },
  it: {
    appTitle: 'Party Song Guess',
    landing: {
      namePlaceholder: 'Il tuo nome',
      roundsLabel: 'Numero di round',
      createRoom: 'Crea Stanza',
      joinLabel: 'Oppure unisciti:',
      joinPlaceholder: 'ID Stanza',
      joinButton: 'Unisciti',
      genresLabel: 'Generi musicali',
      decadesLabel: 'Decennio',
      anyDecade: 'Qualsiasi decennio',
      difficultyLabel: 'Difficoltà',
      difficulty_easy: 'Facile (brani popolari)',
      difficulty_hard: 'Difficile (brani casuali)',
      languageLabel: 'Lingua della canzone',
      language_any: 'Qualsiasi lingua',
      language_it: 'Italiano',
      language_en: 'Inglese',
      language_es: 'Spagnolo',
      genre_pop: 'Pop',
      genre_rock: 'Rock',
      genre_hiphop: 'Hip-hop',
      genre_rap: 'Rap',
      genre_trap: 'Trap',
      genre_dance: 'Dance',
      genre_jazz: 'Jazz',
      genre_metal: 'Metal',
      genre_indie: 'Indie',
      genre_electronic: 'Elettronica',
      genre_rnb: 'R&B',
      decade_50s: 'Anni 50',
      decade_60s: 'Anni 60',
      decade_70s: 'Anni 70',
      decade_80s: 'Anni 80',
      decade_90s: 'Anni 90',
      decade_2000s: 'Anni 2000',
      decade_2010s: 'Anni 2010',
      decade_2020s: 'Anni 2020'
    },
    lobby: {
      waiting: 'In attesa di giocatori...',
      startGame: 'Avvia Gioco',
      generating: 'Generazione in corso...',
      hostStarting: 'L\'host sta per avviare la partita...'
    },
    game: {
      getReady: 'Preparati...',
      guessTheSong: '🎵 INDOVINA LA CANZONE 🎵',
      round: 'Round',
      submit: 'INVIA',
      timeUp: 'Tempo Scaduto!',
      guessed: 'ha indovinato!',
      inputPlaceholder: 'Titolo della canzone...',
      scoreboard: 'Classifica',
      wrongGuess: 'Risposta sbagliata, riprova!',
      gameOver: 'Partita Finita!',
      newGame: 'Nuova Partita'
    },
    errors: {
      title: 'Errore',
      generic: 'Si è verificato un errore.',
      missingNameCreate: 'Inserisci il tuo nome per creare una stanza.',
      missingNameJoin: 'Inserisci il tuo nome per unirti a una stanza.',
      missingRoomId: 'Inserisci un ID stanza valido.',
      roomNotFound: 'Stanza non trovata o partita già iniziata.',
      generationFailed: 'Il servizio AI è temporaneamente non disponibile. Riprova.'
    }
  }
};

const browserLang = typeof navigator !== 'undefined'
  ? navigator.language.split('-')[0]
  : 'en';

const currentLocale = messages[browserLang] ? browserLang : 'en';

export function t(path) {
  const parts = path.split('.');
  let value = messages[currentLocale];

  for (const p of parts) {
    if (!value || typeof value !== 'object') break;
    value = value[p];
  }

  if (typeof value === 'string') {
    return value;
  }

  // fallback to English
  value = messages.en;
  for (const p of parts) {
    if (!value || typeof value !== 'object') break;
    value = value[p];
  }

  return typeof value === 'string' ? value : path;
}

