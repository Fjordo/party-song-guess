const harness = require('../fixtures/serverHarness');

describe('Public catalog statistics', () => {
    test('returns current aggregate counts and includes empty genres without internal fields', () => {
        const h = harness();
        h.repo.stats = () => ({ total: 3, byGenre: [{ value: 'rock', n: 3 }, { value: 'pop', n: 2 }], persistent: true });
        const reply = jest.fn();
        h.alice.send('get_catalog_stats', reply);
        const data = reply.mock.calls[0][0];
        expect(Object.keys(data).sort()).toEqual(['byGenre', 'total']);
        expect(data.total).toBe(3);
        expect(data.byGenre).toHaveLength(11);
        expect(data.byGenre).toEqual(expect.arrayContaining([
            { genre: 'rock', count: 3 }, { genre: 'pop', count: 2 }, { genre: 'jazz', count: 0 }
        ]));
        h.repo.stats = () => ({ total: 4, byGenre: [{ value: 'rock', n: 4 }] });
        h.alice.send('get_catalog_stats', reply);
        expect(reply.mock.calls[1][0].total).toBe(4);
    });

    test('contains catalog errors and ignores requests without acknowledgement', () => {
        const h = harness();
        h.repo.stats = () => { throw new Error('Database unavailable'); };
        expect(() => h.alice.send('get_catalog_stats')).not.toThrow();
        const reply = jest.fn();
        h.alice.send('get_catalog_stats', reply);
        expect(reply).toHaveBeenCalledWith({ error: 'CATALOG_UNAVAILABLE' });
    });

    test('rate limits repeated statistics requests', () => {
        const h = harness();
        const reply = jest.fn();
        for (let i = 0; i < 31; i++) h.alice.send('get_catalog_stats', reply);
        expect(reply).toHaveBeenLastCalledWith({ error: 'RATE_LIMIT_EXCEEDED' });
    });
});
