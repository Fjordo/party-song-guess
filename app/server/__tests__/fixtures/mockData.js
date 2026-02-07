/**
 * Mock data fixtures for testing
 * Provides reusable mock responses for external APIs and room states
 */

// Mock iTunes API responses
const mockItunesSuccess = {
  data: {
    results: [
      {
        trackName: 'Wonderwall',
        artistName: 'Oasis',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/preview1.m4a',
        artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/artwork1.jpg'
      }
    ]
  }
};

const mockItunesMultipleSongs = {
  data: {
    results: [
      {
        trackName: 'Wonderwall',
        artistName: 'Oasis',
        previewUrl: 'https://audio-ssl.itunes.apple.com/preview1.m4a',
        artworkUrl100: 'https://artwork1.jpg'
      },
      {
        trackName: 'Song 2',
        artistName: 'Blur',
        previewUrl: 'https://audio-ssl.itunes.apple.com/preview2.m4a',
        artworkUrl100: 'https://artwork2.jpg'
      },
      {
        trackName: 'Creep',
        artistName: 'Radiohead',
        previewUrl: 'https://audio-ssl.itunes.apple.com/preview3.m4a',
        artworkUrl100: 'https://artwork3.jpg'
      },
      {
        trackName: 'Common People',
        artistName: 'Pulp',
        previewUrl: 'https://audio-ssl.itunes.apple.com/preview4.m4a',
        artworkUrl100: 'https://artwork4.jpg'
      },
      {
        trackName: 'Parklife',
        artistName: 'Blur',
        previewUrl: 'https://audio-ssl.itunes.apple.com/preview5.m4a',
        artworkUrl100: 'https://artwork5.jpg'
      }
    ]
  }
};

const mockItunesNoPreview = {
  data: {
    results: [
      {
        trackName: 'Song Without Preview',
        artistName: 'Artist',
        previewUrl: null,
        artworkUrl100: 'https://artwork.jpg'
      }
    ]
  }
};

const mockItunesEmpty = {
  data: {
    results: []
  }
};

// Mock Gemini AI responses
const mockGeminiPlaylist = [
  { artist: 'Oasis', title: 'Wonderwall' },
  { artist: 'Blur', title: 'Song 2' },
  { artist: 'Radiohead', title: 'Creep' },
  { artist: 'Pulp', title: 'Common People' },
  { artist: 'Blur', title: 'Parklife' }
];

const mockGeminiPlaylistSmall = [
  { artist: 'The Beatles', title: 'Hey Jude' },
  { artist: 'The Rolling Stones', title: 'Paint It Black' }
];

const mockGeminiPlaylistItalian = [
  { artist: 'Pino Daniele', title: 'Je so\' pazzo' },
  { artist: 'Lucio Battisti', title: 'Emozioni' },
  { artist: 'Vasco Rossi', title: 'Albachiara' }
];

// Mock room states
const mockLobbyRoom = {
  id: 'ABC12',
  players: [{ id: 'socket1', name: 'Alice', score: 0 }],
  state: 'LOBBY',
  currentRound: 0,
  totalRounds: 10,
  currentSong: null,
  scores: {}
};

const mockPlayingRoom = {
  id: 'XYZ89',
  players: [
    { id: 'socket1', name: 'Alice', score: 2 },
    { id: 'socket2', name: 'Bob', score: 1 }
  ],
  state: 'PLAYING',
  currentRound: 3,
  totalRounds: 5,
  currentSong: {
    title: 'Wonderwall',
    artist: 'Oasis',
    previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a',
    artwork: 'https://artwork.jpg'
  },
  songs: [
    {
      title: 'Wonderwall',
      artist: 'Oasis',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview1.m4a',
      artwork: 'https://artwork1.jpg'
    },
    {
      title: 'Song 2',
      artist: 'Blur',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview2.m4a',
      artwork: 'https://artwork2.jpg'
    },
    {
      title: 'Creep',
      artist: 'Radiohead',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview3.m4a',
      artwork: 'https://artwork3.jpg'
    },
    {
      title: 'Common People',
      artist: 'Pulp',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview4.m4a',
      artwork: 'https://artwork4.jpg'
    },
    {
      title: 'Parklife',
      artist: 'Blur',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview5.m4a',
      artwork: 'https://artwork5.jpg'
    }
  ],
  roundActive: true,
  scores: {}
};

const mockEndedRoom = {
  id: 'END99',
  players: [
    { id: 'socket1', name: 'Alice', score: 5 },
    { id: 'socket2', name: 'Bob', score: 3 }
  ],
  state: 'ENDED',
  currentRound: 5,
  totalRounds: 5,
  currentSong: null,
  songs: [],
  roundActive: false,
  scores: {}
};

// Game configuration presets
const mockGameConfigEasy = {
  genres: ['pop', 'rock'],
  decade: '2000s',
  language: 'English',
  difficulty: 'easy',
  rounds: 5
};

const mockGameConfigHard = {
  genres: ['indie', 'alternative'],
  decade: '1990s',
  language: 'English',
  difficulty: 'hard',
  rounds: 10
};

const mockGameConfigItalian = {
  genres: ['italian pop', 'cantautori'],
  decade: '1980s',
  language: 'Italian',
  difficulty: 'hard',
  rounds: 5
};

module.exports = {
  // iTunes API mocks
  mockItunesSuccess,
  mockItunesMultipleSongs,
  mockItunesNoPreview,
  mockItunesEmpty,

  // Gemini AI mocks
  mockGeminiPlaylist,
  mockGeminiPlaylistSmall,
  mockGeminiPlaylistItalian,

  // Room state mocks
  mockLobbyRoom,
  mockPlayingRoom,
  mockEndedRoom,

  // Game configuration presets
  mockGameConfigEasy,
  mockGameConfigHard,
  mockGameConfigItalian
};
