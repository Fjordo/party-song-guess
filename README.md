# Party Song Guess

Un gioco musicale multiplayer in tempo reale via browser. I giocatori devono indovinare il titolo della canzone riprodotta randomicamente.

## Struttura del Progetto

- `/app/client`: Frontend (React, Vite, TailwindCSS)
- `/app/server`: Backend (Node.js, Express, Socket.io)
- `/docs`: Documentazione del progetto

## Funzionalità

- **Real-time Multiplayer**: Sincronizzazione perfetta tra i client grazie a Socket.io.
- **Preview Musicali**: Utilizzo dell'API di iTunes per riprodurre 10 round di canzoni.
- **Sistema di Punti**: Chi indovina per primo ottiene il punto.

## Come avviare il progetto

### Preequisiti

NodeJS > 20.19 or > 22.12

### Server

```bash
cd app/server
npm install
npm run dev
```

### Client

```bash
cd app/client
npm install
npm run dev
```

## TODO

- [ ] Migliorare il layout con lo scrolling in verticale
- [ ] Rivedere l'elenco dei generi e inserire "tutti" come default
- [ ] Versione Containerizzata
- [ ] Rivedere l'opzione di gioco che sceglie le canzoni in base alla lingua del testo
- [ ] Aggiungere pulsante Skip
