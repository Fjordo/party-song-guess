/**
 * Integration tests for game flow logic
 * Tests complete game workflows with mocked external dependencies
 */

// Setup mocks BEFORE any imports
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn();

jest.mock('axios');
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel
    }))
  };
});

const axios = require('axios');
const { checkAnswer } = require('../../utils/checkAnswer');
const { detectLanguage } = require('../../utils/languageDetection');
const { getRandomSongs, searchAndGetPreview } = require('../../services/musicService');
const { getSongListFromAI } = require('../../services/aiService');
const {
  mockItunesMultipleSongs,
  mockGeminiPlaylist,
  mockGameConfigEasy
} = require('../fixtures/mockData');

describe('Game Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockGetGenerativeModel.mockReturnValue({
      generateContent: mockGenerateContent
    });
  });

  describe('Complete Game Cycle - AI Playlist Generation', () => {
    test('should generate a full playlist from AI recommendations and iTunes', async () => {
      // Mock Gemini AI response
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(mockGeminiPlaylist)
        }
      });

      // Mock iTunes API responses for each song
      axios.get.mockResolvedValue(mockItunesMultipleSongs);

      // Simulate the AI playlist generation workflow
      const aiRecommendations = await getSongListFromAI({
        genres: mockGameConfigEasy.genres,
        decade: mockGameConfigEasy.decade,
        language: mockGameConfigEasy.language,
        difficulty: mockGameConfigEasy.difficulty,
        count: mockGameConfigEasy.rounds
      });

      expect(aiRecommendations).toHaveLength(5);

      // Simulate iTunes lookup for each song
      const searchPromises = aiRecommendations.map(song =>
        searchAndGetPreview(song.artist, song.title)
      );

      const results = await Promise.all(searchPromises);
      const validSongs = results.filter(song => song !== null);

      expect(validSongs.length).toBeGreaterThan(0);
      expect(validSongs.length).toBeLessThanOrEqual(mockGameConfigEasy.rounds);

      // Verify all songs have required properties
      validSongs.forEach(song => {
        expect(song).toHaveProperty('title');
        expect(song).toHaveProperty('artist');
        expect(song).toHaveProperty('previewUrl');
        expect(song).toHaveProperty('artwork');
        expect(song.previewUrl).not.toBeNull();
      });
    });

    test('should handle AI returning no results gracefully', async () => {
      // Mock Gemini returning empty array
      mockGenerateContent.mockResolvedValue({
        response: { text: () => JSON.stringify([]) }
      });

      const aiRecommendations = await getSongListFromAI({
        genres: ['unknowngenre'],
        decade: '2030s',
        language: 'Klingon',
        difficulty: 'easy',
        count: 5
      });

      expect(aiRecommendations).toEqual([]);
      // In real game flow, this would trigger error state
    });

    test('should filter out songs without preview URLs', async () => {
      // Mock AI recommendations
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { artist: 'Artist 1', title: 'Song 1' },
            { artist: 'Artist 2', title: 'Song 2' }
          ])
        }
      });

      // First song has preview, second doesn't
      axios.get
        .mockResolvedValueOnce({
          data: {
            results: [{
              trackName: 'Song 1',
              artistName: 'Artist 1',
              previewUrl: 'https://preview1.m4a',
              artworkUrl100: 'https://art1.jpg'
            }]
          }
        })
        .mockResolvedValueOnce({
          data: {
            results: [{
              trackName: 'Song 2',
              artistName: 'Artist 2',
              previewUrl: null, // No preview
              artworkUrl100: 'https://art2.jpg'
            }]
          }
        });

      const aiRecommendations = await getSongListFromAI({
        genres: ['pop'],
        decade: '2020s',
        language: 'English',
        difficulty: 'easy',
        count: 2
      });

      const searchPromises = aiRecommendations.map(song =>
        searchAndGetPreview(song.artist, song.title)
      );

      const results = await Promise.all(searchPromises);
      const validSongs = results.filter(song => song !== null);

      // Only 1 song should remain after filtering
      expect(validSongs).toHaveLength(1);
      expect(validSongs[0].title).toBe('Song 1');
    });
  });

  describe('Round Progression and Scoring', () => {
    test('should correctly identify correct answers using checkAnswer', () => {
      const songTitle = 'Wonderwall';

      // Exact match
      expect(checkAnswer('Wonderwall', songTitle)).toBe(true);

      // Case insensitive
      expect(checkAnswer('wonderwall', songTitle)).toBe(true);

      // With punctuation
      expect(checkAnswer('Wonderwall!', songTitle)).toBe(true);

      // Partial match (should fail with stricter rules)
      expect(checkAnswer('Wonder', songTitle)).toBe(false);

      // Wrong answer
      expect(checkAnswer('Champagne Supernova', songTitle)).toBe(false);
    });

    test('should track player scores correctly across multiple rounds', () => {
      // Simulate a game state
      const players = [
        { id: 'player1', name: 'Alice', score: 0 },
        { id: 'player2', name: 'Bob', score: 0 }
      ];

      const currentSong = {
        title: 'Wonderwall',
        artist: 'Oasis',
        previewUrl: 'https://preview.m4a',
        artwork: 'https://artwork.jpg'
      };

      // Round 1: Alice wins
      const aliceGuess = 'wonderwall';
      if (checkAnswer(aliceGuess, currentSong.title)) {
        const winner = players.find(p => p.name === 'Alice');
        winner.score += 1;
      }

      expect(players[0].score).toBe(1);
      expect(players[1].score).toBe(0);

      // Round 2: Bob wins
      const currentSong2 = { title: 'Song 2', artist: 'Blur' };
      const bobGuess = 'song 2';
      if (checkAnswer(bobGuess, currentSong2.title)) {
        const winner = players.find(p => p.name === 'Bob');
        winner.score += 1;
      }

      expect(players[0].score).toBe(1);
      expect(players[1].score).toBe(1);

      // Round 3: Alice wins again
      const currentSong3 = { title: 'Creep', artist: 'Radiohead' };
      const aliceGuess2 = 'creep';
      if (checkAnswer(aliceGuess2, currentSong3.title)) {
        const winner = players.find(p => p.name === 'Alice');
        winner.score += 1;
      }

      expect(players[0].score).toBe(2);
      expect(players[1].score).toBe(1);
    });

    test('should handle race condition where only first correct guess scores', () => {
      let roundActive = true;
      const players = [
        { id: 'player1', name: 'Alice', score: 0 },
        { id: 'player2', name: 'Bob', score: 0 }
      ];
      const currentSong = { title: 'Wonderwall' };

      // Alice submits first
      const aliceGuess = 'wonderwall';
      if (roundActive && checkAnswer(aliceGuess, currentSong.title)) {
        roundActive = false; // Round ends immediately
        players[0].score += 1;
      }

      // Bob submits 50ms later (round already ended)
      const bobGuess = 'wonderwall';
      if (roundActive && checkAnswer(bobGuess, currentSong.title)) {
        players[1].score += 1;
      }

      // Only Alice should score
      expect(players[0].score).toBe(1);
      expect(players[1].score).toBe(0);
      expect(roundActive).toBe(false);
    });
  });

  describe('Game State Transitions', () => {
    test('should transition through game states: LOBBY → LOADING → PLAYING → ENDED', () => {
      const room = {
        id: 'TEST1',
        players: [{ id: 'p1', name: 'Alice', score: 0 }],
        state: 'LOBBY',
        currentRound: 0,
        totalRounds: 3,
        songs: []
      };

      // Start game: LOBBY → LOADING
      expect(room.state).toBe('LOBBY');
      room.state = 'LOADING';
      expect(room.state).toBe('LOADING');

      // Game loaded: LOADING → PLAYING
      room.songs = [
        { title: 'Song 1', artist: 'Artist 1', previewUrl: 'url1', artwork: 'art1' },
        { title: 'Song 2', artist: 'Artist 2', previewUrl: 'url2', artwork: 'art2' },
        { title: 'Song 3', artist: 'Artist 3', previewUrl: 'url3', artwork: 'art3' }
      ];
      room.state = 'PLAYING';
      expect(room.state).toBe('PLAYING');

      // Play all rounds
      for (let i = 0; i < room.totalRounds; i++) {
        room.currentRound = i + 1;
        room.currentSong = room.songs[i];
        room.roundActive = true;

        // Simulate correct guess
        room.roundActive = false;
        room.players[0].score += 1;
      }

      // End game: PLAYING → ENDED
      room.state = 'ENDED';
      expect(room.state).toBe('ENDED');
      expect(room.currentRound).toBe(3);
      expect(room.players[0].score).toBe(3);
    });

    test('should prevent joining room in PLAYING state', () => {
      const room = {
        id: 'ROOM1',
        state: 'PLAYING',
        players: [{ id: 'p1', name: 'Alice', score: 0 }]
      };

      const canJoin = room.state === 'LOBBY';
      expect(canJoin).toBe(false);
    });

    test('should prevent joining room in ENDED state', () => {
      const room = {
        id: 'ROOM2',
        state: 'ENDED',
        players: [{ id: 'p1', name: 'Alice', score: 5 }]
      };

      const canJoin = room.state === 'LOBBY';
      expect(canJoin).toBe(false);
    });

    test('should allow joining room in LOBBY state', () => {
      const room = {
        id: 'ROOM3',
        state: 'LOBBY',
        players: [{ id: 'p1', name: 'Alice', score: 0 }]
      };

      const canJoin = room.state === 'LOBBY';
      expect(canJoin).toBe(true);

      // Simulate join
      if (canJoin) {
        room.players.push({ id: 'p2', name: 'Bob', score: 0 });
      }

      expect(room.players).toHaveLength(2);
    });
  });

  describe('Language Detection Integration', () => {
    test('should detect Italian songs correctly', () => {
      expect(detectLanguage('Napule è')).toBe('it');
      expect(detectLanguage('che bella canzone')).toBe('it'); // Has 'che' hint
      expect(detectLanguage('Nel blu dipinto di blu')).toBe('it');
    });

    test('should detect English songs correctly', () => {
      expect(detectLanguage('The Sound of Silence')).toBe('en');
      expect(detectLanguage('Love Me Do')).toBe('en');
      expect(detectLanguage('Wonderwall')).toBe(null); // No language hints in title alone
    });

    test('should detect Spanish songs correctly', () => {
      expect(detectLanguage('El Condor Pasa')).toBe('es');
      expect(detectLanguage('La Bamba')).toBe(null); // 'la' not in hints
    });

    test('should filter playlist by detected language', () => {
      const songs = [
        { title: 'Che bella canzone', artist: 'Italian Artist' },
        { title: 'The Song', artist: 'English Artist' },
        { title: 'Napule è', artist: 'Pino Daniele' }
      ];

      // Simulate language filtering
      const italianSongs = songs.filter(song => {
        const text = `${song.title} ${song.artist}`;
        return detectLanguage(text) === 'it';
      });

      expect(italianSongs.length).toBeGreaterThan(0);
      expect(italianSongs.length).toBeLessThanOrEqual(songs.length);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle empty playlist gracefully', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => JSON.stringify([]) }
      });

      const aiRecommendations = await getSongListFromAI({
        genres: ['pop'],
        decade: '2020s',
        language: 'English',
        difficulty: 'easy',
        count: 5
      });

      expect(aiRecommendations).toEqual([]);
      // Room should remain in LOBBY state, not transition to PLAYING
    });

    test('should handle all songs without previews', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { artist: 'Artist 1', title: 'Song 1' },
            { artist: 'Artist 2', title: 'Song 2' }
          ])
        }
      });

      // All songs have no preview
      axios.get.mockResolvedValue({
        data: {
          results: [{
            trackName: 'Song',
            artistName: 'Artist',
            previewUrl: null,
            artworkUrl100: 'https://art.jpg'
          }]
        }
      });

      const aiRecommendations = await getSongListFromAI({
        genres: ['pop'],
        decade: '2020s',
        language: 'English',
        difficulty: 'easy',
        count: 2
      });

      const searchPromises = aiRecommendations.map(song =>
        searchAndGetPreview(song.artist, song.title)
      );

      const results = await Promise.all(searchPromises);
      const validSongs = results.filter(song => song !== null);

      expect(validSongs).toHaveLength(0);
      // Should trigger error in game flow
    });

    test('should handle round progression with remaining rounds', () => {
      const room = {
        currentRound: 3,
        totalRounds: 5,
        songs: Array(5).fill({ title: 'Song', artist: 'Artist', previewUrl: 'url', artwork: 'art' })
      };

      const hasMoreRounds = room.currentRound < room.totalRounds;
      expect(hasMoreRounds).toBe(true);

      // Simulate next round
      if (hasMoreRounds) {
        room.currentRound += 1;
      }

      expect(room.currentRound).toBe(4);
    });

    test('should end game when all rounds completed', () => {
      const room = {
        currentRound: 5,
        totalRounds: 5,
        state: 'PLAYING'
      };

      const hasMoreRounds = room.currentRound < room.totalRounds;
      expect(hasMoreRounds).toBe(false);

      // Should end game
      if (!hasMoreRounds) {
        room.state = 'ENDED';
      }

      expect(room.state).toBe('ENDED');
    });
  });

  describe('Playlist Shuffling and Slicing', () => {
    test('should shuffle and slice playlist correctly', () => {
      const songs = [
        { title: 'Song 1', artist: 'Artist 1', previewUrl: 'url1', artwork: 'art1' },
        { title: 'Song 2', artist: 'Artist 2', previewUrl: 'url2', artwork: 'art2' },
        { title: 'Song 3', artist: 'Artist 3', previewUrl: 'url3', artwork: 'art3' },
        { title: 'Song 4', artist: 'Artist 4', previewUrl: 'url4', artwork: 'art4' },
        { title: 'Song 5', artist: 'Artist 5', previewUrl: 'url5', artwork: 'art5' }
      ];

      // Shuffle (Fisher-Yates)
      const shuffled = songs.sort(() => Math.random() - 0.5);

      // Slice to requested rounds
      const requestedRounds = 3;
      const finalPlaylist = shuffled.slice(0, requestedRounds);

      expect(finalPlaylist).toHaveLength(requestedRounds);
      expect(finalPlaylist.length).toBeLessThanOrEqual(songs.length);
    });

    test('should handle playlist with fewer songs than requested rounds', () => {
      const songs = [
        { title: 'Song 1', artist: 'Artist 1', previewUrl: 'url1', artwork: 'art1' },
        { title: 'Song 2', artist: 'Artist 2', previewUrl: 'url2', artwork: 'art2' }
      ];

      const requestedRounds = 5;
      const finalPlaylist = songs.slice(0, requestedRounds);

      // Should return only available songs
      expect(finalPlaylist).toHaveLength(2);
      expect(finalPlaylist.length).toBeLessThan(requestedRounds);
    });
  });
});
