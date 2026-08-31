/**
 * Print a summary of the catalog. Usage: npm run catalog:stats
 */
// Without this the script ignores CATALOG_DB_PATH and reports on a different
// database than the server uses.
require('dotenv').config();

const repo = require('../services/catalogRepo');

// Same view the server has, seed included
repo.open();
const stats = repo.stats();

console.log('Catalog: ' + stats.total + ' songs (persistent: ' + stats.persistent + ')');
console.log('  played:   ' + stats.played);
console.log('  measured: ' + stats.measured + ' (difficulty corrected by real play data)');
console.log('\nBy genre:');
stats.byGenre.forEach(row => console.log('  ' + row.value.padEnd(12) + row.n));
console.log('\nBy decade:');
stats.byDecade.forEach(row => console.log('  ' + row.value.padEnd(12) + row.n));

const outcome = repo.getMeta('last_run_outcome');
if (outcome) console.log('\nLast refresh: ' + outcome + ' at ' + repo.getMeta('last_run_at'));

repo.close();
