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

```bash
# Server
cd app/server && fly deploy

# Client
cd app/client && fly deploy
```

---

## Note importanti

- **Server: tieni `min_machines_running = 1`** — le room sono in memoria; un cold-start le azzererebbe.
- **`GEMINI_API_KEY` e `ALLOWED_ORIGIN` sono secret fly.io**, non variabili d'ambiente nel `fly.toml`.
- **`VITE_SERVER_URL`** nel `fly.toml` del client è un build arg (non un secret): viene baked nel bundle JS al momento del build, quindi non contiene dati sensibili.
- WebSocket (Socket.IO) funziona nativamente su fly.io con HTTPS/WSS.
