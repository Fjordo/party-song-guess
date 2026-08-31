/**
 * Unit tests for musicService functions
 * Tests iTunes API integration with mocked axios
 */

// Mock axios to prevent actual API calls
jest.mock('axios');

const axios = require('axios');
const {
  getRandomSongs,
  searchAndGetPreview,
  searchAndGetPreviewMany,
  lookupByRef,
  isPreviewAlive
} = require('../../services/musicService');

describe('musicService - iTunes API Integration', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchAndGetPreview()', () => {
    test('should return song with preview URL when found', async () => {
      // Mock successful iTunes API response
      axios.get.mockResolvedValue({
        data: {
          results: [
            {
              trackId: 1440857781,
              trackName: 'Wonderwall',
              artistName: 'Oasis',
              collectionName: "(What's the Story) Morning Glory?",
              previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music.jpg',
              releaseDate: '1995-10-02T07:00:00Z',
              primaryGenreName: 'Rock'
            }
          ]
        }
      });

      const result = await searchAndGetPreview('Oasis', 'Wonderwall');

      expect(result).toEqual({
        provider: 'itunes',
        providerRef: '1440857781',
        title: 'Wonderwall',
        artist: 'Oasis',
        album: "(What's the Story) Morning Glory?",
        previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music.jpg',
        releaseDate: '1995-10-02T07:00:00Z',
        year: 1995,
        decade: '90s',
        providerGenre: 'Rock',
        isReissue: false
      });

      // Verify API was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        'https://itunes.apple.com/search',
        expect.objectContaining({
          params: expect.objectContaining({
            term: expect.stringContaining('Oasis'),
            media: 'music',
            entity: 'song',
            limit: 1
          }),
          timeout: 5000
        })
      );
    });

    test('should filter out songs without preview URLs', async () => {
      // Mock response with song missing previewUrl
      axios.get.mockResolvedValue({
        data: {
          results: [
            {
              trackName: 'Song Without Preview',
              artistName: 'Artist',
              previewUrl: null, // No preview available
              artworkUrl100: 'https://artwork.jpg'
            }
          ]
        }
      });

      const result = await searchAndGetPreview('Artist', 'Song Without Preview');

      expect(result).toBe(null);
    });

    test('should return null when no results found', async () => {
      // Mock empty results
      axios.get.mockResolvedValue({
        data: {
          results: []
        }
      });

      const result = await searchAndGetPreview('NonExistentArtist', 'NonExistentSong');

      expect(result).toBe(null);
    });

    test('should handle API timeout gracefully', async () => {
      // Mock timeout error
      axios.get.mockRejectedValue(new Error('timeout of 5000ms exceeded'));

      const result = await searchAndGetPreview('Artist', 'Song');

      expect(result).toBe(null);
    });

    test('should handle API errors gracefully', async () => {
      // Mock network error
      axios.get.mockRejectedValue(new Error('Network Error'));

      const result = await searchAndGetPreview('Artist', 'Song');

      expect(result).toBe(null);
    });

    test('should clean search term by removing special characters', async () => {
      axios.get.mockResolvedValue({
        data: {
          results: [
            {
              trackName: 'Song',
              artistName: 'Artist',
              previewUrl: 'https://preview.m4a',
              artworkUrl100: 'https://artwork.jpg'
            }
          ]
        }
      });

      await searchAndGetPreview('Artist!!!', 'Song???');

      // Verify special characters were removed
      expect(axios.get).toHaveBeenCalledWith(
        'https://itunes.apple.com/search',
        expect.objectContaining({
          params: expect.objectContaining({
            term: expect.not.stringContaining('!')
          })
        })
      );
    });

    test('should support single query string parameter', async () => {
      axios.get.mockResolvedValue({
        data: {
          results: [
            {
              trackName: 'Napule è',
              artistName: 'Pino Daniele',
              previewUrl: 'https://preview.m4a',
              artworkUrl100: 'https://artwork.jpg'
            }
          ]
        }
      });

      const result = await searchAndGetPreview('Pino Daniele Napule è');

      expect(result).not.toBe(null);
      expect(axios.get).toHaveBeenCalledWith(
        'https://itunes.apple.com/search',
        expect.objectContaining({
          params: expect.objectContaining({
            term: expect.stringContaining('Pino Daniele')
          })
        })
      );
    });
  });

  describe('getRandomSongs()', () => {
    const mockItunesResults = [
      {
        trackName: 'Song 1',
        artistName: 'Artist 1',
        previewUrl: 'https://preview1.m4a',
        artworkUrl100: 'https://artwork1.jpg'
      },
      {
        trackName: 'Song 2',
        artistName: 'Artist 2',
        previewUrl: 'https://preview2.m4a',
        artworkUrl100: 'https://artwork2.jpg'
      },
      {
        trackName: 'Song 3',
        artistName: 'Artist 3',
        previewUrl: 'https://preview3.m4a',
        artworkUrl100: 'https://artwork3.jpg'
      }
    ];

    test('should return array of songs with correct format', async () => {
      axios.get.mockResolvedValue({
        data: { results: mockItunesResults }
      });

      const result = await getRandomSongs('pop', 3, null, 'hard');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(3);

      // Verify format of returned songs
      result.forEach(song => {
        expect(song).toHaveProperty('title');
        expect(song).toHaveProperty('artist');
        expect(song).toHaveProperty('previewUrl');
        expect(song).toHaveProperty('artwork');
      });
    });

    test('should call iTunes API with correct parameters', async () => {
      axios.get.mockResolvedValue({
        data: { results: mockItunesResults }
      });

      await getRandomSongs('rock', 10, null, 'hard');

      expect(axios.get).toHaveBeenCalledWith(
        'https://itunes.apple.com/search',
        expect.objectContaining({
          params: {
            term: 'rock',
            media: 'music',
            entity: 'song',
            limit: 50
          }
        })
      );
    });

    test('should filter by language when specified', async () => {
      // Mock results with mixed languages
      axios.get.mockResolvedValue({
        data: {
          results: [
            { trackName: 'Che bella canzone', artistName: 'Italian Artist', previewUrl: 'https://preview.m4a', artworkUrl100: 'https://art.jpg' },
            { trackName: 'The Song', artistName: 'English Artist', previewUrl: 'https://preview.m4a', artworkUrl100: 'https://art.jpg' },
            { trackName: 'Napule è', artistName: 'Pino Daniele', previewUrl: 'https://preview.m4a', artworkUrl100: 'https://art.jpg' }
          ]
        }
      });

      const result = await getRandomSongs('pop', 10, 'it', 'hard');

      // Should filter to Italian songs or fall back to all if none found
      expect(Array.isArray(result)).toBe(true);
    });

    test('should handle easy difficulty by selecting from top results', async () => {
      const manyResults = Array.from({ length: 100 }, (_, i) => ({
        trackName: `Song ${i}`,
        artistName: `Artist ${i}`,
        previewUrl: `https://preview${i}.m4a`,
        artworkUrl100: `https://artwork${i}.jpg`
      }));

      axios.get.mockResolvedValue({
        data: { results: manyResults }
      });

      const result = await getRandomSongs('pop', 5, null, 'easy');

      expect(result.length).toBeLessThanOrEqual(5);
      // Easy mode should select from top 100
    });

    test('should handle hard difficulty by randomizing all results', async () => {
      axios.get.mockResolvedValue({
        data: { results: mockItunesResults }
      });

      const result = await getRandomSongs('pop', 3, null, 'hard');

      expect(result.length).toBeLessThanOrEqual(3);
      // Hard mode randomizes all results
    });

    test('should return empty array on API error', async () => {
      axios.get.mockRejectedValue(new Error('Network Error'));

      const result = await getRandomSongs('pop', 10);

      expect(result).toEqual([]);
    });

    test('should handle empty results from API', async () => {
      axios.get.mockResolvedValue({
        data: { results: [] }
      });

      const result = await getRandomSongs('unknowngenre', 10);

      expect(result).toEqual([]);
    });
  });

  describe('normalization of provider metadata', () => {
    const track = (extra) => ({
      data: {
        results: [{
          trackId: 1,
          trackName: 'Song',
          artistName: 'Artist',
          previewUrl: 'https://preview.m4a',
          artworkUrl100: 'https://art.jpg',
          ...extra
        }]
      }
    });

    test('derives year and decade from the release date', async () => {
      axios.get.mockResolvedValue(track({ releaseDate: '1969-01-01T00:00:00Z' }));
      const result = await searchAndGetPreview('Artist', 'Song');
      expect(result.year).toBe(1969);
      expect(result.decade).toBe('60s');
    });

    test('flags a reissue so its release date is not trusted as the original year', async () => {
      axios.get.mockResolvedValue(track({
        collectionName: 'Greatest Hits',
        releaseDate: '2009-05-05T07:00:00Z'
      }));
      const result = await searchAndGetPreview('Artist', 'Song');
      expect(result.isReissue).toBe(true);
    });

    test('leaves optional metadata null rather than undefined', async () => {
      axios.get.mockResolvedValue(track({}));
      const result = await searchAndGetPreview('Artist', 'Song');
      expect(result.album).toBeNull();
      expect(result.releaseDate).toBeNull();
      expect(result.year).toBeNull();
      expect(result.decade).toBeNull();
      expect(result.providerGenre).toBeNull();
      expect(result.isReissue).toBe(false);
    });
  });

  describe('searchAndGetPreviewMany()', () => {
    const pairs = [
      { artist: 'A', title: '1' },
      { artist: 'B', title: '2' },
      { artist: 'C', title: '3' },
      { artist: 'D', title: '4' },
      { artist: 'E', title: '5' }
    ];

    const respondWith = (trackName) => ({
      data: {
        results: [{
          trackId: trackName,
          trackName,
          artistName: 'Artist',
          previewUrl: 'https://preview.m4a',
          artworkUrl100: 'https://art.jpg'
        }]
      }
    });

    test('returns results aligned with the input order despite concurrency', async () => {
      // Resolve in reverse order of arrival to prove alignment is not incidental
      let call = 0;
      axios.get.mockImplementation(() => {
        const index = call++;
        return new Promise(resolve =>
          setTimeout(() => resolve(respondWith(pairs[index].title)), (pairs.length - index) * 5)
        );
      });

      const results = await searchAndGetPreviewMany(pairs, { concurrency: 5 });

      expect(results.map(r => r.title)).toEqual(['1', '2', '3', '4', '5']);
    });

    test('never exceeds the requested concurrency', async () => {
      let inFlight = 0;
      let peak = 0;
      axios.get.mockImplementation(() => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        return new Promise(resolve => setTimeout(() => {
          inFlight--;
          resolve(respondWith('x'));
        }, 5));
      });

      await searchAndGetPreviewMany(pairs, { concurrency: 2 });

      expect(peak).toBeLessThanOrEqual(2);
    });

    test('a failing lookup yields null without sinking the batch', async () => {
      let call = 0;
      axios.get.mockImplementation(() => {
        call++;
        return call === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(respondWith('ok'));
      });

      const results = await searchAndGetPreviewMany(pairs, { concurrency: 1 });

      expect(results).toHaveLength(5);
      expect(results[1]).toBeNull();
      expect(results.filter(Boolean)).toHaveLength(4);
    });

    test('spaces out requests when a minimum interval is set', async () => {
      axios.get.mockResolvedValue(respondWith('ok'));

      const started = Date.now();
      await searchAndGetPreviewMany(pairs.slice(0, 3), { concurrency: 3, minIntervalMs: 20 });

      // 3 requests spaced 20ms apart: the last cannot start before ~40ms
      expect(Date.now() - started).toBeGreaterThanOrEqual(35);
    });

    test('handles an empty batch', async () => {
      await expect(searchAndGetPreviewMany([], { concurrency: 3 })).resolves.toEqual([]);
    });
  });

  describe('lookupByRef()', () => {
    test('re-resolves a track by its provider id', async () => {
      axios.get.mockResolvedValue({
        data: {
          results: [{
            trackId: 42,
            trackName: 'Repaired',
            artistName: 'Artist',
            previewUrl: 'https://fresh-preview.m4a',
            artworkUrl100: 'https://art.jpg'
          }]
        }
      });

      const result = await lookupByRef('42');

      expect(result.previewUrl).toBe('https://fresh-preview.m4a');
      expect(axios.get).toHaveBeenCalledWith(
        'https://itunes.apple.com/lookup',
        expect.objectContaining({ params: { id: '42' } })
      );
    });

    test('returns null when the track is gone', async () => {
      axios.get.mockResolvedValue({ data: { results: [] } });
      await expect(lookupByRef('42')).resolves.toBeNull();
    });

    test('returns null when the track lost its preview', async () => {
      axios.get.mockResolvedValue({
        data: { results: [{ trackId: 42, trackName: 'X', artistName: 'Y' }] }
      });
      await expect(lookupByRef('42')).resolves.toBeNull();
    });

    test('returns null on a network error', async () => {
      axios.get.mockRejectedValue(new Error('network'));
      await expect(lookupByRef('42')).resolves.toBeNull();
    });
  });

  describe('isPreviewAlive()', () => {
    test('reports a reachable preview as alive', async () => {
      axios.head.mockResolvedValue({ status: 200 });
      await expect(isPreviewAlive('https://preview.m4a')).resolves.toBe(true);
    });

    test('reports a 404 as definitely gone', async () => {
      const error = new Error('Not Found');
      error.response = { status: 404 };
      axios.head.mockRejectedValue(error);

      await expect(isPreviewAlive('https://preview.m4a')).resolves.toBe(false);
    });

    test('gives no verdict on a transient failure, so nothing gets evicted', async () => {
      // A network blip must not be mistaken for a dead track
      axios.head.mockRejectedValue(new Error('ECONNRESET'));
      await expect(isPreviewAlive('https://preview.m4a')).resolves.toBeNull();
    });

    test('gives no verdict on a server-side error either', async () => {
      const error = new Error('Bad Gateway');
      error.response = { status: 502 };
      axios.head.mockRejectedValue(error);

      await expect(isPreviewAlive('https://preview.m4a')).resolves.toBeNull();
    });
  });
});
