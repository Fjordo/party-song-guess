# Architecture Documentation

## Overview

Party Song Guess is a real-time multiplayer browser game where players guess the song title from a 30-second preview.

## Components

### Server (Node.js)

- **Framework**: Express + Socket.io
- **State Management**: In-memory (Variables `rooms` in `index.js`).
- **Music Service**: Fetches metadata and previews from iTunes Search API.
- **Game Logic**:
  - `RoomManager`: Handles room creation/joining (inline in index.js for now).
  - `GameLoop`: Manages rounds, timeouts (30s), and scoring.

### Client (React)

- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **Communication**: `socket.io-client`
- **Audio**: HTML5 `Audio` object controlled programmatically.

## Events Flow

1. **Lobby**: `create_room` -> `room_created` -> User shares ID.
2. **Game Start**: Owner clicks start -> `start_game` -> Server reads the song catalog -> `game_started` (typically a few ms; falls back to live AI discovery only when the catalog cannot fill the game).
3. **Round Loop**:
    - Server: `new_round` (sends previewUrl).
    - Client: Plays audio.
    - Client: User types guess -> `submit_guess`.
    - Server: Validates guess.
        - Correct: `round_winner` -> `update_scores` -> Wait 5s -> Next Round.
        - Default: Wait 30s -> `round_timeout` -> Wait 5s -> Next Round.
4. **Game Over**: Server emits `game_over` -> Client shows final scores.

## Song Catalog

Songs are no longer discovered when a game starts. The server keeps a SQLite
catalog (`app/server/db/schema.sql`) of songs tagged by genre, decade and
language, which:

- **is read at game start**, so starting a game costs no external call;
- **grows on every wake-up**, a few AI calls at a time, stopping as soon as the
  AI reports its usage limit;
- **corrects itself**: `play_count` / `guess_count` and the average time to
  answer override the difficulty the AI merely claimed;
- **repairs itself**: rotated preview URLs are re-resolved by provider id, and
  only genuinely unplayable songs are removed.

The provider (currently iTunes) appears only as a *value* in `songs.provider`,
never as a column name; `services/musicService.js` is the sole module that knows
the provider's response format.

## Future Improvements

- Move the catalog from SQLite to Postgres if the server ever needs to scale
  beyond a single machine (Fly volumes are single-attach).
- Better Fuzzy Matching (Levenshtein distance).
- OAuth with Spotify for full tracks.
