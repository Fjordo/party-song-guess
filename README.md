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



## GOOGLE API KEY

Google offre un piano gratuito generoso tramite la piattaforma **Google AI Studio**. Ecco i passaggi per ottenere la chiave:

1.  **Accedi al Portale:**
    Vai su [Google AI Studio (aistudio.google.com)](https://aistudio.google.com/).

2.  **Login:**
    Accedi con il tuo account Google standard.

3.  **Ottieni la Chiave:**
    * Nel menu a sinistra (o in alto a sinistra), clicca su **"Get API key"**.
    * Clicca sul pulsante blu **"Create API key"**.
    * Seleziona **"Create API key in new project"** (consigliato per isolare il progetto).

4.  **Copia e Salva:**
    * Il sistema genererà una stringa che inizia con `AIza...`.
    * **Copia subito questa stringa.** Non condividerla mai pubblicamente (non committarla su GitHub).
    * Inseriscila nel tuo file `.env` nel backend:
        ```env
        GEMINI_API_KEY=AIzaSy...
        ```

---

## 2. Limiti di Chiamata (Rate Limits)

Il modello che stiamo utilizzando appartiene alla categoria **Flash**. Questa categoria è progettata per essere rapida ed economica (o gratuita entro certi limiti).

Attualmente, il piano **"Free of Charge"** per i modelli Flash prevede i seguenti limiti (quote):

| Tipo di Limite | Valore (Free Tier) | Cosa significa per il Gioco? |
| :--- | :--- | :--- |
| **RPM** (Requests Per Minute) | **15 RPM** | Puoi avviare al massimo **15 partite al minuto**. Se 16 gruppi di amici premono "Start" nello stesso esatto minuto, il 16° riceverà un errore (gestito dal nostro codice). |
| **RPD** (Requests Per Day) | **1.500 RPD** | Puoi generare playlist per **1.500 partite al giorno**. |
| **TPM** (Tokens Per Minute) | **1.000.000 TPM** | Un milione di token al minuto. Poiché le nostre playlist consumano pochissimi token (circa 200-300 per chiamata), questo limite è irraggiungibile prima di finire gli RPM. |

### Note Importanti sul Piano Gratuito:
* **Costo:** €0.00 (Gratis per sempre entro i limiti sopra).
* **Privacy Dati:** Nel piano gratuito, Google si riserva il diritto di utilizzare i dati di input/output per migliorare i propri modelli. Poiché noi inviamo solo richieste generiche ("Dammi canzoni pop anni 90"), **non ci sono problemi di privacy** o dati sensibili.