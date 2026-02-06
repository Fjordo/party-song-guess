const messages = {
  en: {
    appTitle: 'Party Song Guess',
    landing: {
      namePlaceholder: 'Your name',
      roundsLabel: 'Number of rounds',
      createRoom: 'Create Room',
      joinLabel: 'Or join:',
      joinPlaceholder: 'Room ID',
      joinButton: 'Join'
    },
    lobby: {
      waiting: 'Waiting for players...',
      startGame: 'Start Game',
      hostStarting: 'The host is about to start the game...'
    },
    game: {
      getReady: 'Get Ready...',
      guessTheSong: '🎵 GUESS THE SONG 🎵',
      timeUp: 'Time\'s Up!',
      guessed: 'guessed it!',
      inputPlaceholder: 'Song title...',
      scoreboard: 'Scoreboard',
      wrongGuess: 'Wrong answer, try again!'
    },
    errors: {
      title: 'Error',
      generic: 'An error occurred.',
      missingNameCreate: 'Enter your name to create a room.',
      missingNameJoin: 'Enter your name to join a room.',
      missingRoomId: 'Enter a valid room ID.',
      roomNotFound: 'Room not found or game already started.'
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
      joinButton: 'Unisciti'
    },
    lobby: {
      waiting: 'In attesa di giocatori...',
      startGame: 'Avvia Gioco',
      hostStarting: 'L\'host sta per avviare la partita...'
    },
    game: {
      getReady: 'Preparati...',
      guessTheSong: '🎵 INDOVINA LA CANZONE 🎵',
      timeUp: 'Tempo Scaduto!',
      guessed: 'ha indovinato!',
      inputPlaceholder: 'Titolo della canzone...',
      scoreboard: 'Classifica',
      wrongGuess: 'Risposta sbagliata, riprova!'
    },
    errors: {
      title: 'Errore',
      generic: 'Si è verificato un errore.',
      missingNameCreate: 'Inserisci il tuo nome per creare una stanza.',
      missingNameJoin: 'Inserisci il tuo nome per unirti a una stanza.',
      missingRoomId: 'Inserisci un ID stanza valido.',
      roomNotFound: 'Stanza non trovata o partita già iniziata.'
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

