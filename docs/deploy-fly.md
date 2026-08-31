# Deploy su fly.io

## Prerequisiti

```bash
# Installa flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login
```

---

## 1. Deploy del Server

```bash
cd app/server
```

### Crea l'app (prima volta)

```bash
fly apps create <nome-server>   # es. party-song-guess-server
```

Aggiorna `fly.toml` con il nome scelto:

```toml
app = "<nome-server>"
```

### Imposta i secret (NON committarli mai)

```bash
fly secrets set GEMINI_API_KEY="la-tua-chiave" --app <nome-server>
fly secrets set ALLOWED_ORIGIN="https://<nome-client>.fly.dev" --app <nome-server>
```

### Deploy

```bash
fly deploy --app <nome-server>
```

Verifica che sia up:

```bash
curl https://<nome-server>.fly.dev/health
# Risposta attesa: OK
```

---

## 2. Deploy del Client

```bash
cd app/client
```

### Crea l'app (prima volta)

```bash
fly apps create <nome-client>   # es. party-song-guess-client
```

Aggiorna `fly.toml` con il nome scelto e l'URL del server:

```toml
app = "<nome-client>"

[build.args]
  VITE_SERVER_URL = "https://<nome-server>.fly.dev"
```

### Deploy

```bash
fly deploy --app <nome-client>
```

---

## Aggiornamenti successivi

### Volume per il catalogo canzoni (una tantum, prima del primo deploy)

Il catalogo si accumula nel tempo: senza un volume il disco della macchina viene
azzerato a ogni deploy.

```bash
fly volumes create catalog_data --region cdg --size 1 --app <nome-app-server>
```

### Deploy

```bash
# Server
cd app/server && fly deploy

# Client
cd app/client && fly deploy
```

---

## Note importanti

- **Server: `min_machines_running = 0`** — il server dorme quando nessuno gioca e il proxy lo risveglia
  alla prima connessione. Una partita in corso tiene aperti i websocket, quindi il proxy non ferma una
  macchina che sta effettivamente ospitando giocatori.
- **L'health check va tenuto**: su Fly Machines i check di `[[http_service.checks]]` sono eseguiti da
  `flyd` localmente sulla macchina, non passano dal proxy, quindi **non** contano come traffico e non
  impediscono l'auto-stop. Al risveglio anzi servono, perché il proxy attende che la macchina risulti
  sana prima di instradarle le richieste.
- **Attenzione ai monitor di uptime esterni**: un servizio che chiama `/health` dall'esterno passa dal
  proxy e terrebbe la macchina sveglia per sempre, vanificando il risparmio.
- **Il volume del catalogo va creato PRIMA del primo deploy** che contiene `[[mounts]]`, altrimenti la
  macchina non parte (vedi sopra).
- **`GEMINI_API_KEY` e `ALLOWED_ORIGIN` sono secret fly.io**, non variabili d'ambiente nel `fly.toml`.
- **`VITE_SERVER_URL`** nel `fly.toml` del client è un build arg (non un secret): viene baked nel bundle JS al momento del build, quindi non contiene dati sensibili.
- WebSocket (Socket.IO) funziona nativamente su fly.io con HTTPS/WSS.
