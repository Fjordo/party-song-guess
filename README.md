# Party Song Guess

[![Node.js CI](https://github.com/Fjordo/party-song-guess/actions/workflows/node.js.yml/badge.svg)](https://github.com/Fjordo/party-song-guess/actions/workflows/node.js.yml)
[![Tests](https://img.shields.io/badge/tests-107%20passing-brightgreen)](https://github.com/Fjordo/party-song-guess/actions)
[![Coverage](https://img.shields.io/badge/coverage-97.91%25-brightgreen)](https://github.com/Fjordo/party-song-guess)

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

## Testing

Il server include una suite completa di test automatici con Jest.

### Eseguire i test

```bash
cd app/server
npm test                  # Esegui tutti i 107 test
npm run test:watch        # Modalità watch (ri-esegue i test sui cambiamenti)
npm run test:coverage     # Genera il report di copertura
```

### Test Coverage

- **107 test** totali (43 checkAnswer + 19 languageDetection + 14 musicService + 11 aiService + 20 gameFlow)
- **97.91%** di copertura sui servizi
- **100%** di copertura sulle utility (checkAnswer, languageDetection)

### CI/CD

I test vengono eseguiti automaticamente su GitHub Actions ad ogni push/pull request su Node.js 20.x e 22.x.

## GOOGLE API KEY

Google offre un piano gratuito generoso tramite la piattaforma **Google AI Studio**. Ecco i passaggi per ottenere la chiave:

1. **Accedi al Portale:**
    Vai su [Google AI Studio (aistudio.google.com)](https://aistudio.google.com/).

2. **Login:**
    Accedi con il tuo account Google standard.

3. **Ottieni la Chiave:**
    - Nel menu a sinistra (o in alto a sinistra), clicca su **"Get API key"**.
    - Clicca sul pulsante blu **"Create API key"**.
    - Seleziona **"Create API key in new project"** (consigliato per isolare il progetto).

4. **Copia e Salva:**
    - Il sistema genererà una stringa che inizia con `AIza...`.
    - **Copia subito questa stringa.** Non condividerla mai pubblicamente (non committarla su GitHub).
    - Inseriscila nel tuo file `.env` nel backend:

        ```env
        GEMINI_API_KEY=AIzaSy...
        ```

---

## 2. Limiti di Chiamata (Rate Limits)

Il modello che stiamo utilizzando appartiene alla categoria **Flash**. Questa categoria è progettata per essere rapida ed economica (o gratuita entro certi limiti).

Attualmente, il piano **"Free of Charge"** per i modelli Flash prevede i seguenti limiti (quote):

| Tipo di Limite | Valore (Free Tier) | Cosa significa per il Gioco? |
| :--- | :--- | :--- |
| **RPM** (Requests Per Minute) | **5 RPM** | Puoi avviare al massimo **5 partite al minuto**. Se 6 gruppi di amici premono "Start" nello stesso esatto minuto, il 16° riceverà un errore (gestito dal nostro codice). |
| **RPD** (Requests Per Day) | **20 RPD** | Puoi generare playlist per **20 partite al giorno**. |
| **TPM** (Tokens Per Minute) | **250.000 TPM** | 250K token al minuto. Poiché le nostre playlist consumano pochissimi token (circa 200-300 per chiamata), questo limite è irraggiungibile prima di finire gli RPM. |

### Note Importanti sul Piano Gratuito

- **Costo:** €0.00 (Gratis per sempre entro i limiti sopra).
- **Privacy Dati:** Nel piano gratuito, Google si riserva il diritto di utilizzare i dati di input/output per migliorare i propri modelli. Poiché noi inviamo solo richieste generiche ("Dammi canzoni pop anni 90"), **non ci sono problemi di privacy** o dati sensibili.
=======

## TODO

- [ ] Versione Containerizzata
- [ ] Aggiungere pulsante Skip
