/**
 * Build the committed seed catalog.
 *
 * The seed is what lets a fresh deploy (or a wiped volume) start a game before
 * the incremental builder has done any work. It is generated rather than
 * hand-written because a song is only useful with a real, playable preview URL
 * from the provider.
 *
 * Usage:  npm run catalog:seed
 */

const fs = require('fs');
const path = require('path');

const musicService = require('../services/musicService');
const { toEntries } = require('../services/catalogBuilder');
const { slug } = require('../utils/catalogTags');

const OUTPUT = path.join(__dirname, '..', 'db', 'catalog.seed.json');

// A deliberately broad starter set: every genre the lobby offers, spread over
// decades and the three supported languages.
const CURATED = [
    ['pop', '80s', 'en', 'easy', 'Michael Jackson', 'Billie Jean'],
    ['pop', '70s', 'en', 'easy', 'ABBA', 'Dancing Queen'],
    ['pop', '80s', 'en', 'easy', 'Madonna', 'Like a Prayer'],
    ['pop', '2020s', 'en', 'easy', 'Dua Lipa', 'Levitating'],
    ['pop', '90s', 'it', 'easy', 'Laura Pausini', 'La solitudine'],
    ['pop', '2000s', 'es', 'easy', 'Shakira', 'La Tortura'],
    ['pop', '2010s', 'es', 'easy', 'Luis Fonsi', 'Despacito'],
    ['pop', '2010s', 'es', 'easy', 'Enrique Iglesias', 'Bailando'],
    ['pop', '80s', 'es', 'easy', 'Gipsy Kings', 'Bamboleo'],

    ['rock', '70s', 'en', 'easy', 'Queen', 'Bohemian Rhapsody'],
    ['rock', '90s', 'en', 'easy', 'Nirvana', 'Smells Like Teen Spirit'],
    ['rock', '60s', 'en', 'easy', 'The Beatles', 'Hey Jude'],
    ['rock', '80s', 'en', 'easy', 'AC/DC', 'Back in Black'],
    ['rock', '70s', 'it', 'easy', 'Lucio Battisti', 'Il mio canto libero'],
    ['rock', '2020s', 'it', 'easy', 'Maneskin', 'Zitti e buoni'],

    ['hiphop', '90s', 'en', 'easy', 'The Notorious B.I.G.', 'Juicy'],
    ['hiphop', '2000s', 'en', 'easy', 'Kanye West', 'Stronger'],
    ['hiphop', '80s', 'en', 'hard', 'Grandmaster Flash', 'The Message'],

    ['rap', '2000s', 'en', 'easy', 'Eminem', 'Lose Yourself'],
    ['rap', '2010s', 'en', 'easy', 'Kendrick Lamar', 'HUMBLE.'],
    ['rap', '90s', 'it', 'hard', 'Articolo 31', 'Ohi Maria'],

    ['trap', '2010s', 'en', 'easy', 'Migos', 'Bad and Boujee'],
    ['trap', '2010s', 'en', 'easy', 'Travis Scott', 'SICKO MODE'],
    ['trap', '2010s', 'it', 'hard', 'Sfera Ebbasta', 'Visiera a becco'],
    ['trap', '2010s', 'it', 'hard', 'Capo Plaza', 'Giovane Fuoriclasse'],

    ['dance', '2000s', 'en', 'easy', 'Daft Punk', 'One More Time'],
    ['dance', '90s', 'en', 'hard', 'Robin S', 'Show Me Love'],
    ['dance', '90s', 'en', 'easy', 'Gala', 'Freed from Desire'],

    ['jazz', '50s', 'en', 'hard', 'Miles Davis', 'So What'],
    ['jazz', '50s', 'en', 'easy', 'Dave Brubeck', 'Take Five'],
    ['jazz', '60s', 'en', 'easy', 'Louis Armstrong', 'What a Wonderful World'],
    ['jazz', '60s', 'en', 'hard', 'John Coltrane', 'My Favorite Things'],

    ['metal', '90s', 'en', 'easy', 'Metallica', 'Enter Sandman'],
    ['metal', '70s', 'en', 'easy', 'Black Sabbath', 'Paranoid'],
    ['metal', '80s', 'en', 'hard', 'Iron Maiden', 'The Trooper'],

    ['indie', '2010s', 'en', 'easy', 'Arctic Monkeys', 'Do I Wanna Know?'],
    ['indie', '2000s', 'en', 'hard', 'The Strokes', 'Last Nite'],
    ['indie', '90s', 'en', 'easy', 'Radiohead', 'Creep'],
    ['indie', '70s', 'it', 'hard', 'Pino Daniele', 'Je so pazzo'],

    ['electronic', '90s', 'en', 'hard', 'The Chemical Brothers', 'Block Rockin Beats'],
    ['electronic', '70s', 'en', 'hard', 'Kraftwerk', 'The Model'],
    ['electronic', '2000s', 'en', 'easy', 'Moby', 'Porcelain'],
    ['electronic', '2010s', 'en', 'easy', 'Avicii', 'Wake Me Up'],

    ['rnb', '80s', 'en', 'easy', 'Whitney Houston', 'I Wanna Dance with Somebody'],
    ['rnb', '2000s', 'en', 'easy', 'Beyonce', 'Crazy in Love'],
    ['rnb', '70s', 'en', 'easy', 'Marvin Gaye', 'Lets Get It On'],
    ['rnb', '2000s', 'en', 'easy', 'Alicia Keys', 'Fallin']
];

async function main() {
    console.log(`Resolving ${CURATED.length} curated songs...`);

    const resolved = await musicService.searchAndGetPreviewMany(
        CURATED.map(([, , , , artist, title]) => ({ artist, title })),
        { concurrency: 3, minIntervalMs: 200 }
    );

    const entries = [];
    const missing = [];
    const suspicious = [];

    resolved.forEach((record, index) => {
        const [genre, decade, language, difficulty, artist, title] = CURATED[index];
        if (!record) {
            missing.push(`${artist} - ${title}`);
            return;
        }

        // The provider search is fuzzy and happily returns a different song for
        // an ambiguous title ("Rockstar" matches half the charts). Check both
        // artist and title: a wrong song in the seed is worse than a smaller
        // seed. The artist alone is not enough, since a collaboration credit
        // makes an unrelated track look like a match.
        const matches = (want, have) => have.includes(want) || want.includes(have);
        if (!matches(slug(artist), slug(record.artist))
            || !matches(slug(title), slug(record.title))) {
            suspicious.push(`${artist} - ${title}  ->  ${record.artist} - ${record.title}`);
            return;
        }

        entries.push(toEntries([record], { genre, decade, language, difficulty }, 'seed')[0]);
    });

    // Drop the volatile play statistics: a seed carries songs, not history.
    const clean = entries.map(({ origin, ...entry }) => entry);

    fs.writeFileSync(OUTPUT, JSON.stringify(clean, null, 2) + '\n');

    console.log(`Wrote ${clean.length} songs to ${path.relative(process.cwd(), OUTPUT)}`);
    if (missing.length > 0) {
        console.warn(`Could not resolve ${missing.length}:\n  ${missing.join('\n  ')}`);
    }
    if (suspicious.length > 0) {
        console.warn(`Rejected ${suspicious.length} wrong match(es):\n  ${suspicious.join('\n  ')}`);
    }
}

main().catch(error => {
    console.error('Seed build failed:', error.message);
    process.exit(1);
});
