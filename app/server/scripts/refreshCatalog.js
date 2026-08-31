/**
 * Run one catalog refresh by hand, without booting the server.
 *
 * Useful locally where the AI usage limit is not a concern: pass a higher
 * --max-calls to grow the catalog faster than a single wake-up would.
 *
 * Usage: npm run catalog:refresh -- --max-calls 10
 */
require('dotenv').config();

const repo = require('../services/catalogRepo');
const builder = require('../services/catalogBuilder');

const arg = process.argv.indexOf('--max-calls');
const maxCalls = arg !== -1 ? Number(process.argv[arg + 1]) : undefined;

async function main() {
    repo.open();
    console.log('Before: ' + repo.stats().total + ' songs');

    const result = await builder.runRefresh(maxCalls ? { maxCalls } : {});
    await builder.runRevalidation();

    console.log('After:  ' + repo.stats().total + ' songs (outcome: ' + result.outcome + ')');
    repo.close();
}

main().catch(error => {
    console.error('Refresh failed:', error.message);
    repo.close();
    process.exit(1);
});
