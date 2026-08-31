/**
 * Unit tests for catalogScheduler - the single wake-up driven catalog run
 *
 * Timers are injected rather than faked globally, so the scheduled callback can
 * be awaited deterministically.
 */

const scheduler = require('../../services/catalogScheduler');

describe('catalogScheduler', () => {
    let scheduled;
    let handle;
    let deps;

    beforeEach(() => {
        scheduled = null;
        handle = { unref: jest.fn() };

        deps = {
            runRefresh: jest.fn().mockResolvedValue({ calls: 1, added: 3, outcome: 'ok' }),
            runRevalidation: jest.fn().mockResolvedValue({ checked: 5 }),
            delayMs: 20000,
            setTimeout: jest.fn((fn, ms) => {
                scheduled = { fn, ms };
                return handle;
            }),
            clearTimeout: jest.fn()
        };

        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        scheduler.stop(deps);
        jest.restoreAllMocks();
    });

    test('does not run anything before the boot delay elapses', () => {
        scheduler.start(deps);

        expect(deps.setTimeout).toHaveBeenCalledWith(expect.any(Function), 20000);
        expect(deps.runRefresh).not.toHaveBeenCalled();
        expect(deps.runRevalidation).not.toHaveBeenCalled();
    });

    test('refreshes and then revalidates when the delay elapses', async () => {
        scheduler.start(deps);
        await scheduled.fn();

        expect(deps.runRefresh).toHaveBeenCalledTimes(1);
        expect(deps.runRevalidation).toHaveBeenCalledTimes(1);
    });

    test('never keeps the process alive on its own', () => {
        scheduler.start(deps);
        expect(handle.unref).toHaveBeenCalled();
    });

    test('starting twice schedules a single run', () => {
        scheduler.start(deps);
        scheduler.start(deps);
        expect(deps.setTimeout).toHaveBeenCalledTimes(1);
    });

    test('stop() cancels a run that has not happened yet', () => {
        scheduler.start(deps);
        scheduler.stop(deps);

        expect(deps.clearTimeout).toHaveBeenCalledWith(handle);
        expect(deps.runRefresh).not.toHaveBeenCalled();
    });

    test('stop() without a pending run is harmless', () => {
        expect(() => scheduler.stop(deps)).not.toThrow();
        expect(deps.clearTimeout).not.toHaveBeenCalled();
    });

    test('a failing refresh still lets the free upkeep pass run', async () => {
        deps.runRefresh.mockRejectedValue(new Error('AI unreachable'));

        scheduler.start(deps);
        await scheduled.fn();

        expect(deps.runRevalidation).toHaveBeenCalledTimes(1);
    });

    test('a failing revalidation does not bring the process down', async () => {
        deps.runRevalidation.mockRejectedValue(new Error('provider down'));

        scheduler.start(deps);
        await expect(scheduled.fn()).resolves.toBeUndefined();
    });

    test('can be started again after the scheduled run completed', async () => {
        scheduler.start(deps);
        await scheduled.fn();

        scheduler.start(deps);
        expect(deps.setTimeout).toHaveBeenCalledTimes(2);
    });
});
