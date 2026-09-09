const messages = {
  en: {
    appTitle: 'Party Song Guess',
    pwa: {
      install: 'Install app'
    },
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
    share: {
      open: 'Share',
      eyebrow: 'ROOM INVITE',
      title: 'Share this room',
      roomCode: 'Room code',
      copyCode: 'Copy code',
      copyCodeHint: 'Copy only the room code',
      shareLink: 'Share invitation link',
      shareLinkHint: 'Opens this room directly',
      shareCode: 'Share code',
      shareCodeHint: 'Send only the room code',
      inviteText: 'Join my Party Song Guess room!',
      codeCopied: 'Room code copied.',
      linkCopied: 'Invitation link copied.',
      nativeUnavailable: 'Sharing apps are not available in this browser. The selected content will be copied instead.',
      error: 'Unable to share. Please try again.',
      invitedRoom: 'You were invited to room',
      joinRoom: 'Join this room',
      orCreate: 'Or create a new room'
    },
    game: {
      getReady: 'Get Ready...',
      guessTheSong: '🎵 GUESS THE SONG 🎵',
      round: 'Round',
      submit: 'SUBMIT',
      skipSong: 'Skip song',
      timeRemaining: 'Time remaining',
      volume: 'Volume',
      resumeAudio: 'Play audio',
      albumArt: 'Album artwork',
      rematch: 'Rematch',
      waitingRematch: 'Waiting for the host to start a rematch...',
      reconnectingPlayer: 'Reconnecting...',
      songSkipped: 'Song skipped',
      leaveGame: 'Leave game',
      timeUp: 'Time\'s Up!',
      guessed: 'guessed it!',
      inputPlaceholder: 'Song title...',
      scoreboard: 'Scoreboard',
      wrongGuess: 'Wrong answer, try again!',
      gameOver: 'Game Over!',
      newGame: 'New Game'
    },
    connection: {
      reconnecting: 'Reconnecting to your game. Your seat is reserved for 1 minute.',
      waking: 'Waking up the server, one moment...'
    },
    help: {
      open: 'About this app',
      catalogTitle: 'Indexed songs by genre',
      catalogTotal: 'Total unique songs',
      catalogLoading: 'Loading catalog...',
      catalogUnavailable: 'Catalog unavailable. Reopen Help to try again.',
      catalogNote: 'A song can belong to multiple genres. Counts are updated each time you open Help.',
      close: 'Close',
      createdBy: 'Made by',
      version: 'Version',
      rights: '© 2026 Fjordo · Just for fun'
    },
    errors: {
      title: 'Error',
      generic: 'An error occurred.',
      sessionExpired: 'Unable to resume this session. It may have expired, be open in another tab, or the server may have restarted. Please join or create a room.',
      sessionReplaced: 'Your game was resumed in another tab.',
      missingNameCreate: 'Enter your name to create a room.',
      missingNameJoin: 'Enter your name to join a room.',
      missingRoomId: 'Enter a valid room ID.',
      roomNotFound: 'Room not found or game already started.',
      aiTimeout: 'The AI took too long to respond. Please try again.',
      generationFailed: 'The AI service is temporarily unavailable. Please try again.',
      disconnected: 'Connection lost. Please rejoin or create a new room.',
      serverUnavailable: 'Unable to reach the server. Please try again later.'
    }
  },
  it: {
    appTitle: 'Party Song Guess',
    pwa: {
      install: "Installa l'app"
    },
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
    share: {
      open: 'Condividi',
      eyebrow: 'INVITO ALLA STANZA',
      title: 'Condividi la stanza',
      roomCode: 'Codice stanza',
      copyCode: 'Copia codice',
      copyCodeHint: 'Copia soltanto il codice',
      shareLink: 'Condividi link di invito',
      shareLinkHint: 'Apre direttamente questa stanza',
      shareCode: 'Condividi codice',
      shareCodeHint: 'Invia soltanto il codice stanza',
      inviteText: 'Entra nella mia stanza di Party Song Guess!',
      codeCopied: 'Codice stanza copiato.',
      linkCopied: 'Link di invito copiato.',
      nativeUnavailable: 'Le app di condivisione non sono disponibili in questo browser. Il contenuto selezionato verrà copiato.',
      error: 'Impossibile condividere. Riprova.',
      invitedRoom: 'Sei stato invitato nella stanza',
      joinRoom: 'Entra nella stanza',
      orCreate: 'Oppure crea una nuova stanza'
    },
    game: {
      getReady: 'Preparati...',
      guessTheSong: '🎵 INDOVINA LA CANZONE 🎵',
      round: 'Round',
      submit: 'INVIA',
      skipSong: 'Salta canzone',
      timeRemaining: 'Tempo rimasto',
      volume: 'Volume',
      resumeAudio: 'Avvia audio',
      albumArt: 'Copertina album',
      rematch: 'Rivincita',
      waitingRematch: "In attesa che l’host avvii la rivincita...",
      reconnectingPlayer: 'Riconnessione...',
      songSkipped: 'Canzone saltata',
      leaveGame: 'Abbandona partita',
      timeUp: 'Tempo Scaduto!',
      guessed: 'ha indovinato!',
      inputPlaceholder: 'Titolo della canzone...',
      scoreboard: 'Classifica',
      wrongGuess: 'Risposta sbagliata, riprova!',
      gameOver: 'Partita Finita!',
      newGame: 'Nuova Partita'
    },
    connection: {
      waking: 'Sto riattivando il server, un attimo...',
      reconnecting: 'Riconnessione alla partita. Il tuo posto resta riservato per 1 minuto.'
    },
    help: {
      open: "Info sull'app",
      catalogTitle: 'Canzoni indicizzate per genere',
      catalogTotal: 'Totale canzoni uniche',
      catalogLoading: 'Caricamento catalogo...',
      catalogUnavailable: 'Catalogo non disponibile. Riapri Help per riprovare.',
      catalogNote: 'Una canzone può appartenere a più generi. I conteggi si aggiornano a ogni apertura di Help.',
      close: 'Chiudi',
      createdBy: 'Creato da',
      version: 'Versione',
      rights: '© 2026 Fjordo · Solo per divertimento'
    },
    errors: {
      title: 'Errore',
      generic: 'Si è verificato un errore.',
      sessionExpired: 'Impossibile riprendere la sessione: potrebbe essere scaduta, aperta in un’altra scheda oppure il server è stato riavviato. Rientra o crea una stanza.',
      sessionReplaced: 'La partita è stata ripresa in un’altra scheda.',
      missingNameCreate: 'Inserisci il tuo nome per creare una stanza.',
      missingNameJoin: 'Inserisci il tuo nome per unirti a una stanza.',
      missingRoomId: 'Inserisci un ID stanza valido.',
      roomNotFound: 'Stanza non trovata o partita già iniziata.',
      aiTimeout: 'L\'AI ha impiegato troppo tempo a rispondere. Riprova.',
      generationFailed: 'Il servizio AI è temporaneamente non disponibile. Riprova.',
      disconnected: 'Connessione persa. Rientra o crea una nuova stanza.',
      serverUnavailable: 'Impossibile raggiungere il server. Riprova più tardi.'
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

