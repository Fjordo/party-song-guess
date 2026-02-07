# AGENTS.md - AI Assistant Guide

> **Purpose**: This document helps AI coding assistants (Claude, GitHub Copilot, etc.) understand the Party Song Guess codebase architecture and make safe, contextual changes.

---

## 1. Project Overview

**Party Song Guess** is a real-time multiplayer music game played via browser. Players compete to guess song titles from 30-second audio previews. The first player to guess correctly wins the round and earns a point.

**Tech Stack**:
- **Frontend**: React 19, Vite 7, TailwindCSS 4
- **Backend**: Node.js (Express 4, Socket.io 4)
- **APIs**: iTunes Search API (song previews), Google Gemini AI (playlist generation)
- **Requirements**: Node.js >20.19 or >22.12

**Key Features**:
- Real-time multiplayer synchronization via Socket.io
- Configurable game settings (genres, decades, difficulty, language)
- Intelligent answer matching (handles typos and variations)
- Multi-language support (English, Italian, Spanish)

---

## 2. Architecture Overview

### Client-Server Model
```
React Frontend (Vite)  ←→ Socket.io ←→ Node.js Backend (Express)
     (Port 5173)           WebSocket         (Port 3000)
                                                   ↓
                                          [iTunes API, Gemini AI]
```

### Core Principles
1. **Server as Source of Truth**: All game state mutations happen server-side to prevent cheating
2. **Real-time Synchronization**: Socket.io broadcasts events to all players in a room
3. **In-Memory State**: Game rooms are ephemeral (no database, stored in `rooms` object)
4. **Event-Driven Architecture**: Client and server communicate exclusively via Socket.io events

### Game State Machine
```
LANDING (enter name, create/join room)
   ↓
LOBBY (configure settings, wait for players)
   ↓
PLAYING (10 rounds of song guessing)
   ↓
ENDED (show final scores & rankings)
```

---

## 3. Directory Structure & Critical Files

```
party-song-guess/
├── app/
│   ├── client/
│   │   ├── src/
│   │   │   ├── App.jsx                    # [CRITICAL] Main state management & Socket client
│   │   │   ├── main.jsx                   # [LOW] React entry point
│   │   │   ├── i18n.js                    # [LOW] Internationalization (EN/IT/ES)
│   │   │   ├── components/
│   │   │   │   ├── Lobby.jsx              # [HIGH] Pre-game configuration UI
│   │   │   │   └── GameRoom.jsx           # [HIGH] Active gameplay interface
│   │   │   └── assets/                    # [LOW] Images and static files
│   │   ├── package.json                   # Frontend dependencies
│   │   ├── vite.config.js                 # [LOW] Build configuration
│   │   ├── tailwind.config.js             # [LOW] Styling configuration
│   │   └── index.html                     # [LOW] HTML entry point
│   │
│   └── server/
│       ├── index.js                       # [CRITICAL] Socket.io handlers & game loop
│       ├── package.json                   # Backend dependencies
│       ├── .env                           # [MODERATE] GEMINI_API_KEY configuration
│       └── services/
│           ├── musicService.js            # [MODERATE] iTunes API integration
│           └── aiService.js               # [MODERATE] Google Gemini AI integration
│
├── docs/                                  # Project documentation
└── README.md                              # Setup instructions
```

### Risk Levels
- **[CRITICAL]**: Changes affect real-time multiplayer synchronization - test thoroughly with multiple clients
- **[HIGH]**: Changes impact all users' UI/UX - verify responsive design
- **[MODERATE]**: External API integrations - check error handling and fallbacks
- **[LOW]**: Styling, i18n, config files - minimal risk

---

## 4. Key Patterns & Conventions

### Real-time Communication Pattern

**Server broadcasts to room**:
```javascript
// Send event to all players in a specific room
io.to(roomId).emit('event_name', data);

// Send to specific player only
socket.emit('event_name', data);
```

**Client listens**:
```javascript
// In App.jsx or component
socket.on('event_name', (data) => {
  // Update state based on server event
});
```

**Critical Rule**: All state mutations (scores, round progression, game status) happen **server-side only**. Client state updates are **reactions** to server events.

### Socket Event Convention

| Category | Events | Direction | Purpose |
|----------|--------|-----------|---------|
| **Room Lifecycle** | `create_room`, `room_created` | Client→Server→Client | Player creates game room |
| | `join_room`, `room_joined` | Client→Server→Client | Player joins existing room |
| | `player_joined` | Server→All in room | Notify others of new player |
| **Game Flow** | `start_game` | Client→Server | Host initiates game |
| | `game_started` | Server→All | Game begins, switch to PLAYING state |
| | `start_countdown` | Server→All | 3-second pre-round countdown |
| | `new_round` | Server→All | New song preview delivered |
| | `round_winner` | Server→All | Someone guessed correctly |
| | `round_timeout` | Server→All | 30 seconds elapsed, no winner |
| | `game_over` | Server→All | All rounds complete, show rankings |
| **Player Actions** | `submit_guess` | Client→Server | Player submits answer |
| | `wrong_guess` | Server→Player | Incorrect answer (only to that player) |
| | `update_scores` | Server→All | Update leaderboard after scoring |
| **Errors** | `error` | Server→Player | Error notification (e.g., room not found) |

### Answer Validation Pattern

Located in [app/server/index.js:~40](app/server/index.js), the `checkAnswer()` function uses multi-layer matching:

1. **Exact match**: After normalization (lowercase, remove punctuation, strip parentheses/feat.)
2. **Substring match**: Either guess contains title or vice versa
3. **Word overlap**: At least 60% of title words appear in guess
4. **Levenshtein distance**: ≥0.7 similarity (allows typos)

**Example matches**:
- "Wonderwall" matches "wonderwall", "WONDERWALL", "Wonderwall (Remastered)"
- "The Beatles" matches "beatles", "Beatles", "hey beatles"
- "Smells Like Teen Spirit" matches "teen spirit", "smells teen spirit"

### State Management Pattern

**Client-side** ([app/client/src/App.jsx](app/client/src/App.jsx)):
- Centralized state in `App.jsx` for:
  - `gameState`: LANDING, LOBBY, PLAYING, ENDED
  - `room`: Current room object
  - `players`: Array with scores
  - Game settings: genres, decade, language, difficulty
- Component-level state for UI-only concerns (loading spinners, input values)

**Server-side** ([app/server/index.js](app/server/index.js)):
```javascript
rooms[roomId] = {
  id: string,                    // 5-character room code
  players: [{ id, name, score }], // Player list
  state: 'LOBBY|PLAYING|ENDED',   // Game phase
  currentRound: number,           // Round counter (1-based)
  totalRounds: number,            // Total rounds (5, 10, 15, or 20)
  currentSong: { title, artist, previewUrl, artwork },
  songs: [],                      // Playlist array
  roundActive: boolean            // Prevents double-scoring
}
```

---

## 5. Common Development Tasks

### Adding a New Game Setting

**Example**: Add "explicit content" filter

1. **Add UI control** in [app/client/src/components/Lobby.jsx](app/client/src/components/Lobby.jsx):
   ```javascript
   <button onClick={() => setExplicitFilter(!explicitFilter)}>
     {explicitFilter ? 'Clean' : 'Any'}
   </button>
   ```

2. **Add state** in [app/client/src/App.jsx](app/client/src/App.jsx):
   ```javascript
   const [explicitFilter, setExplicitFilter] = useState(false);
   ```

3. **Include in socket payload** when starting game:
   ```javascript
   socket.emit('start_game', {
     roomId: room.id,
     // ... existing settings
     explicitFilter: explicitFilter
   });
   ```

4. **Handle in server** at [app/server/index.js:~80](app/server/index.js):
   ```javascript
   socket.on('start_game', async ({ roomId, explicitFilter, ... }) => {
     // Pass to music service
     const songs = await musicService.getRandomSongs(..., explicitFilter);
   });
   ```

5. **Apply in music service** at [app/server/services/musicService.js](app/server/services/musicService.js):
   ```javascript
   async function getRandomSongs(genre, limit, language, difficulty, explicitFilter) {
     const params = {
       term: genre,
       explicit: explicitFilter ? 'No' : 'Yes'
     };
     // ... fetch logic
   }
   ```

### Adding a New Socket Event

**Example**: Add "player_ready" event for ready-check system

1. **Server handler** in [app/server/index.js](app/server/index.js):
   ```javascript
   socket.on('player_ready', ({ roomId, playerId }) => {
     const room = rooms[roomId];
     if (!room) return;

     // Update player ready status
     const player = room.players.find(p => p.id === playerId);
     if (player) player.ready = true;

     // Broadcast to all players in room
     io.to(roomId).emit('player_ready_update', {
       playerId,
       players: room.players
     });
   });
   ```

2. **Client emitter** in [app/client/src/components/Lobby.jsx](app/client/src/components/Lobby.jsx):
   ```javascript
   const handleReadyClick = () => {
     socket.emit('player_ready', {
       roomId: room.id,
       playerId: socket.id
     });
   };
   ```

3. **Client listener** in [app/client/src/App.jsx](app/client/src/App.jsx):
   ```javascript
   socket.on('player_ready_update', ({ playerId, players }) => {
     setPlayers(players);
   });
   ```

4. **Test with multiple clients**: Open 2+ browser tabs, verify all clients receive updates

### Modifying Game Rules

**Round timeout**: Change 30-second limit in [app/server/index.js:~240](app/server/index.js):
```javascript
// Find this line:
const roundTimeout = setTimeout(() => {
  // ... timeout logic
}, 30000); // ← Change to 45000 for 45 seconds
```

**Scoring system**: Modify score increment in [app/server/index.js:~200](app/server/index.js):
```javascript
// Current: +1 point per correct answer
winner.score += 1;

// Alternative: Points based on speed (first guess = 3 pts, second = 2 pts, etc.)
winner.score += Math.max(1, room.players.length - guessCount);
```

**Answer matching strictness**: Edit `checkAnswer()` in [app/server/index.js:~40](app/server/index.js):
```javascript
// Find Levenshtein threshold:
const similarity = 1 - distance / Math.max(guess.length, title.length);
return similarity >= 0.7; // ← Increase to 0.85 for stricter matching
```

**Difficulty logic**: Edit [app/server/services/musicService.js:~60](app/server/services/musicService.js):
```javascript
// Easy difficulty takes top results (popular songs)
if (difficulty === 'easy') {
  return results.slice(0, limit); // ← Change to slice(0, limit * 2) for more variety
}
```

### Adding Internationalization

1. **Add translation keys** in [app/client/src/i18n.js](app/client/src/i18n.js):
   ```javascript
   const messages = {
     en: {
       lobby: {
         newFeature: "New Feature Label"
       }
     },
     it: {
       lobby: {
         newFeature: "Etichetta Nuova Funzione"
       }
     },
     es: {
       lobby: {
         newFeature: "Nueva Etiqueta de Función"
       }
     }
   };
   ```

2. **Use in components**:
   ```javascript
   import { t } from '../i18n';

   <button>{t('lobby.newFeature')}</button>
   ```

---

## 6. Data Flow Example: One Complete Round

```
1. COUNTDOWN PHASE (3 seconds)
   Server → All clients: 'start_countdown' { duration: 3 }
   Clients display: Full-screen countdown overlay "3... 2... 1..."

2. ROUND START (30 seconds max)
   Server → All clients: 'new_round' { roundNumber: 1, previewUrl: "https://..." }
   Clients:
   - Play audio preview (HTML5 <audio> element)
   - Enable guess input field
   - Show "🎵 GUESS THE SONG 🎵"

3. PLAYER GUESSES
   Client (Alice) → Server: 'submit_guess' { roomId: "ABC12", guess: "Wonderwall" }
   Server:
   - Checks if round still active (roundActive === true)
   - Validates answer via checkAnswer("Wonderwall", "Wonderwall - Oasis")
   - Result: CORRECT ✓

4. SCORING & BROADCAST
   Server actions:
   - Set roundActive = false (prevent double-scoring)
   - Increment Alice's score: player.score += 1
   - Clear round timeout timer

   Server → All clients: 'round_winner' {
     player: "Alice",
     song: { title: "Wonderwall", artist: "Oasis", artwork: "..." }
   }

   Server → All clients: 'update_scores' { players: [...] }

   Clients:
   - Stop audio playback
   - Display winner message: "Alice guessed it!"
   - Show album artwork
   - Update scoreboard/leaderboard

5. NEXT ROUND (after 1 second delay)
   Server waits 1000ms, then:
   - Increments currentRound
   - Checks if currentRound < totalRounds
   - If more rounds: Go to step 1 (countdown)
   - If finished: Emit 'game_over' with final rankings

6. ALTERNATIVE: TIMEOUT (no one guessed in 30s)
   Server → All clients: 'round_timeout' { song: { title, artist, ... } }
   Clients:
   - Display "Time's up! The song was: [title] by [artist]"
   - Show album artwork

   Server waits 5000ms, then goes to step 5
```

---

## 7. Integration Points

### iTunes Search API

**File**: [app/server/services/musicService.js](app/server/services/musicService.js)

**Endpoint**: `https://itunes.apple.com/search`

**Key Function**: `getRandomSongs(genre, limit, language, difficulty)`

**Parameters**:
```javascript
{
  term: "pop rock 90s",      // Genre + decade keywords
  media: "music",
  entity: "song",
  limit: 50,                  // Fetch more than needed for filtering
  explicit: "Yes"             // Include explicit content
}
```

**Response Processing**:
1. Fetch results from iTunes API
2. Filter by language (simple heuristic checking keywords and accents)
3. Apply difficulty:
   - **Easy**: Take top 100 results (popular/chart-topping songs)
   - **Hard**: Randomize full result set (includes obscure B-sides)
4. Filter out songs without `previewUrl` (30-second clip required)
5. Return array: `[{ title, artist, previewUrl, artwork }, ...]`

**Fallback Behavior**: Returns empty array `[]` on API failure (graceful degradation)

**Alternative Function**: `searchAndGetPreview(artist, title)`
- Used by Gemini AI to fetch specific songs
- Searches by exact artist + title
- 5-second timeout to prevent blocking

### Google Gemini AI

**File**: [app/server/services/aiService.js](app/server/services/aiService.js)

**Model**: `gemini-3-flash-preview` (fast, cost-effective)

**Purpose**: Generate thematic playlists based on game settings

**Prompt Construction**:
```javascript
Generate ${roundCount * 1.3} songs matching:
- Genres: [${genres.join(', ')}]
- Decade: ${decade || 'any'}
- Language: ${language || 'any'}
- Difficulty: ${difficulty === 'easy' ? 'famous hits' : 'obscure B-sides'}

Return JSON array: [{ "artist": "...", "title": "..." }, ...]
```

**Buffer Factor**: Requests 30% more songs than needed (e.g., 13 songs for 10 rounds) to account for iTunes preview unavailability

**Error Handling**:
- Returns empty array `[]` on failure
- Fallback to iTunes random search in `musicService.js`

**Rate Limits** (Free Tier):
- **5 requests/minute**: Max 5 games can start simultaneously
- **20 requests/day**: Max 20 games per day
- **250K tokens/minute**: Ample capacity (playlists use ~200-300 tokens each)

**Privacy Note**: Free tier allows Google to use inputs for model improvement, but we only send generic queries (no sensitive data)

---

## 8. Testing & Verification

### Development Setup

1. **Start server** (terminal 1):
   ```bash
   cd app/server
   npm install
   npm run dev  # nodemon on port 3000
   ```

2. **Start client** (terminal 2):
   ```bash
   cd app/client
   npm install
   npm run dev  # Vite on port 5173 (default)
   ```

3. **Open multiple browser tabs**: Simulate multiplayer by opening 2+ tabs at `http://localhost:5173`

### Critical Test Scenarios

**Test 1: Basic Multiplayer Flow**
1. Tab 1: Create room as "Alice"
2. Tab 2: Join room (enter room code) as "Bob"
3. Tab 1: Configure settings, start game
4. Both tabs: Verify countdown shows simultaneously
5. Both tabs: Verify song preview plays
6. Tab 1: Submit correct guess
7. Both tabs: Verify Alice's score updates in real-time

**Test 2: Simultaneous Guesses**
1. Two players in same room
2. Both submit correct answer within ~100ms of each other
3. Expected: Only first submission scores (server's `roundActive` flag prevents double-scoring)
4. Second player should receive `wrong_guess` (round already ended)

**Test 3: Player Disconnect Mid-Game**
1. Start game with 3 players
2. One player closes browser tab during round
3. Expected: Other players continue normally, disconnected player removed from room

**Test 4: API Failure Fallback**
1. **Gemini AI fails**: Stop server, remove `GEMINI_API_KEY` from `.env`, restart
   - Expected: Falls back to iTunes random search
2. **iTunes returns songs without previews**:
   - Expected: Those songs are filtered out, game continues with remaining songs
   - If zero songs with previews: Game will fail gracefully (show error to host)

**Test 5: Answer Validation Edge Cases**
1. Test with typos: "Wonderwal" should match "Wonderwall"
2. Test with articles: "Beatles" should match "The Beatles"
3. Test with features: "Song" should match "Song (feat. Artist)"
4. Test with partial match: "Teen Spirit" should match "Smells Like Teen Spirit"

### Automated Testing

The server has a comprehensive test suite using **Jest** covering unit tests and integration tests.

**Test Coverage** (as of latest):
- **Total Tests**: 107 passing
- **Services Coverage**: 97.91% statements, 85.71% branches, 100% functions
- **Test Types**: Unit tests (87 tests) + Integration tests (20 tests)

**Running Tests**:
```bash
cd app/server
npm test                  # Run all tests
npm run test:watch        # Watch mode (re-run on file changes)
npm run test:coverage     # Generate coverage report
```

**Test Files Structure**:
```
app/server/__tests__/
├── unit/
│   ├── checkAnswer.test.js          # 43 tests - Answer validation algorithm
│   ├── languageDetection.test.js    # 19 tests - Heuristic language detection
│   ├── musicService.test.js         # 14 tests - iTunes API integration
│   └── aiService.test.js            # 11 tests - Gemini AI integration
├── integration/
│   └── gameFlow.test.js             # 20 tests - Complete game workflows
└── fixtures/
    └── mockData.js                  # Reusable mock responses
```

**What's Tested**:

1. **Answer Validation** ([app/server/utils/checkAnswer.js](app/server/utils/checkAnswer.js)):
   - Exact matches (case-insensitive)
   - Punctuation handling ("Song!" → "Song")
   - Parentheses removal ("Song (Remix)" → "Song")
   - Featured artists stripping ("Song feat. Artist" → "Song")
   - Substring matches ("Wonder" matches "Wonderwall")
   - Word overlap (≥60% threshold)
   - Levenshtein distance for typos (≥70% similarity)
   - Edge cases (null, empty strings, whitespace)
   - Accented characters (Italian, Spanish, French)

2. **Language Detection** ([app/server/utils/languageDetection.js](app/server/utils/languageDetection.js)):
   - Italian keyword hints ('che', 'non', 'per', accents: àèéìòù)
   - Spanish keyword hints ('que', 'para', 'el', accents: áéíóúñ)
   - English keyword hints ('the', 'and', 'you', 'love')
   - Mixed language handling (returns dominant)
   - Edge cases (null, empty, no hints)

3. **Music Service** ([app/server/services/musicService.js](app/server/services/musicService.js)):
   - iTunes API integration with mocked axios
   - `searchAndGetPreview()`: Song lookup, preview filtering, timeout handling
   - `getRandomSongs()`: Easy/hard difficulty, language filtering
   - Error handling (API failures, empty results)

4. **AI Service** ([app/server/services/aiService.js](app/server/services/aiService.js)):
   - Gemini AI integration with mocked API
   - Playlist generation with genres, decade, language, difficulty
   - 30% buffer calculation for song count
   - JSON parsing error handling
   - API error graceful degradation

5. **Game Flow Integration**:
   - Complete AI → iTunes workflow
   - Score tracking across multiple rounds
   - Race condition handling (simultaneous guesses)
   - Game state transitions (LOBBY → LOADING → PLAYING → ENDED)
   - Playlist shuffling and slicing
   - Error scenarios (empty playlists, no previews)

**Mocking Strategy**:
- **axios**: Mocked for iTunes API calls (no actual HTTP requests)
- **@google/generative-ai**: Mocked for Gemini AI calls (no API costs)
- **External dependencies**: All external APIs are mocked to ensure fast, deterministic tests

**Coverage Limitations**:
- [app/server/index.js](app/server/index.js) (Socket.io event handlers): **0% coverage**
  - **Reason**: Requires architectural refactoring to make Socket.io handlers testable
  - **Workaround**: Manual testing with multiple browser tabs (see "Critical Test Scenarios" above)
  - **Future**: Extract Socket.io handlers to separate module for integration testing

**When to Run Tests**:
- Before committing changes to critical functions (checkAnswer, musicService, aiService)
- After modifying answer validation algorithm
- When adding new features to services or utilities
- Before merging pull requests

**Adding New Tests**:
1. Create test file in appropriate directory (`__tests__/unit/` or `__tests__/integration/`)
2. Mock external dependencies at top of file
3. Use descriptive `describe()` blocks for organization
4. Follow existing patterns (see [checkAnswer.test.js](app/server/__tests__/unit/checkAnswer.test.js) for examples)
5. Run `npm test` to verify all tests pass

### Debugging Tips

**Socket.io events**: Add logging in [app/server/index.js](app/server/index.js):
```javascript
socket.onAny((eventName, ...args) => {
  console.log(`[${eventName}]`, args);
});
```

**Client state inspection**: Use React DevTools to inspect `App.jsx` state in real-time

**Room state inspection**: Add endpoint in [app/server/index.js](app/server/index.js):
```javascript
app.get('/debug/rooms', (req, res) => {
  res.json(rooms);
});
```
Then visit: `http://localhost:3000/debug/rooms`

---

## 9. Common Pitfalls & Solutions

### Pitfall 1: Round Doesn't Progress After Winner
**Symptom**: Game freezes after someone guesses correctly
**Cause**: `roundActive` flag not reset, or timeout not cleared
**Solution**: Check [app/server/index.js:~200](app/server/index.js) - ensure `clearTimeout(roundTimeout)` is called

### Pitfall 2: Scores Don't Update in Real-time
**Symptom**: Winner's score updates but other clients don't see it
**Cause**: Emitting to single player instead of broadcasting to room
**Solution**: Use `io.to(roomId).emit('update_scores', ...)` not `socket.emit(...)`

### Pitfall 3: Multiple Players Score for Same Round
**Symptom**: Two players both get points for the same round
**Cause**: Race condition - `roundActive` check not atomic
**Solution**: Set `roundActive = false` IMMEDIATELY when first correct guess received (before any async operations)

### Pitfall 4: Client State Desync After Reconnect
**Symptom**: Player refreshes page and can't rejoin game
**Cause**: Socket.io generates new socket ID on reconnect, server doesn't recognize player
**Solution**: Currently no reconnect logic - players must stay connected. To implement: use persistent player IDs (localStorage) and handle `reconnect` event

### Pitfall 5: Songs Play Overlapping Audio
**Symptom**: New round starts but previous song still playing
**Cause**: Audio element not paused before new preview loads
**Solution**: In [app/client/src/components/GameRoom.jsx](app/client/src/components/GameRoom.jsx), always call `audioRef.current.pause()` before loading new `previewUrl`

---

## 10. Quick Reference

### Find This by Searching For:

| Need to Find | Search For | File |
|--------------|-----------|------|
| Answer validation logic | `function checkAnswer` | [app/server/index.js](app/server/index.js) |
| Socket event handlers | `socket.on('` | [app/server/index.js](app/server/index.js) |
| Room creation logic | `socket.on('create_room'` | [app/server/index.js](app/server/index.js) |
| Game start logic | `socket.on('start_game'` | [app/server/index.js](app/server/index.js) |
| Round timeout logic | `const roundTimeout = setTimeout` | [app/server/index.js](app/server/index.js) |
| iTunes API calls | `axios.get('https://itunes.apple.com` | [app/server/services/musicService.js](app/server/services/musicService.js) |
| Gemini AI calls | `model.generateContent` | [app/server/services/aiService.js](app/server/services/aiService.js) |
| Client socket listeners | `socket.on('` in useEffect | [app/client/src/App.jsx](app/client/src/App.jsx) |
| Game state transitions | `setGameState('` | [app/client/src/App.jsx](app/client/src/App.jsx) |
| Lobby UI configuration | Genre/decade/difficulty toggles | [app/client/src/components/Lobby.jsx](app/client/src/components/Lobby.jsx) |
| Gameplay UI | Audio playback, guess input | [app/client/src/components/GameRoom.jsx](app/client/src/components/GameRoom.jsx) |
| Translation strings | `const messages = {` | [app/client/src/i18n.js](app/client/src/i18n.js) |

### Environment Variables

**File**: `app/server/.env`

```bash
GEMINI_API_KEY=AIzaSy...  # Required: Get from https://aistudio.google.com
PORT=3000                  # Optional: Server port (default 3000)
```

### Port Configuration

- **Backend**: Port 3000 (configurable via `PORT` env var)
- **Frontend**: Port 5173 (Vite default, configurable in `vite.config.js`)
- **Socket.io Connection**: Client connects to `http://{hostname}:3000`

To change backend port:
1. Update `.env` in `app/server/`
2. Update socket connection URL in [app/client/src/App.jsx](app/client/src/App.jsx):
   ```javascript
   const socket = io('http://localhost:YOUR_NEW_PORT');
   ```

---

## Conclusion

This document provides a high-level overview of the Party Song Guess architecture. For detailed implementation, refer to the source files linked throughout this guide. When making changes, always test with multiple clients to verify real-time synchronization works correctly.

**Key Takeaways for AI Assistants**:
1. Server is source of truth - all state mutations happen server-side
2. Socket.io events are the primary communication mechanism
3. Test multiplayer scenarios with 2+ browser tabs
4. Answer validation is intentionally lenient (handles typos, partial matches)
5. External API failures are handled gracefully with fallbacks

For questions or issues, refer to the inline code comments and README.md for setup instructions.
