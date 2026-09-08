const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const repo = require('../services/catalogRepo');
const daily = require('../services/catalogDaily');

async function main() {
    const options = { target: 200, maxCalls: 20 };
    let dryRun = false;
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--target') options.target = Number(args[++i]);
        else if (args[i] === '--max-calls') options.maxCalls = Number(args[++i]);
        else if (args[i] === '--force') options.force = true;
        else if (args[i] === '--dry-run') dryRun = true;
        else throw new Error(`Unknown argument: ${args[i]}`);
    }
    if (!Number.isInteger(options.target) || options.target < 1 || options.target > 10000 ||
        !Number.isInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > 100) {
        throw new Error('Use --target 1..10000 and --max-calls 1..100');
    }
    if (!dryRun && !process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');
    repo.open();
    try {
        if (!repo.isPersistent()) throw new Error('Persistent catalog storage is required');
        const result = dryRun ? { outcome: 'dry-run', target: options.target, genres: daily.progress(repo, options.target) }
            : await daily.run(options);
        console.log(JSON.stringify(result, null, 2));
        if (result.outcome === 'error') process.exitCode = 1;
    } finally { repo.close(); }
}
main().catch(error => { console.error('Daily catalog failed:', error.message); process.exitCode = 1; });
