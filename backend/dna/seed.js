// Seed the dna_issuers table with fingerprints of historical malicious
// issuers. Pull the live list from StellarExpert when possible, otherwise
// fall back to a small curated list. Invalid / non-existent issuers are
// logged and skipped — we don't poison the DB with empty vectors.
const { fetchOperations, fetchAccount, fetchOffers, fetchTrades } = require('./harvester');
const { extractVector } = require('./extractor');
const { DNA_DB } = require('./db');

const FALLBACK_RUGS = [
  { asset: 'USDC', issuer: 'GAOHYSULIJGHZLPQLHJYFFJMLEXK7UGNV5IVWWV7Y7HK5PTDNOHMDACA' },
  { asset: 'ACA', issuer: 'GCAAHY5WXKIKS5S3BP277OSIJHLPKWQGW7JN6HACIBMPTT6JDUXWBACA' },
  { asset: 'ACA', issuer: 'GCJTDBRELMRYTIJJDYN4GNC6SM77N2NFOFYW4KHYHTSECJ7UCVWCJACA' },
];

const DIRECTORY_URL =
  'https://api.stellar.expert/explorer/directory?tag[]=scam&tag[]=malicious&limit=50';

async function fetchExpertDirectory() {
  try {
    const res = await fetch(DIRECTORY_URL);
    if (!res.ok) return [];
    const data = await res.json();
    const records = data?._embedded?.records ?? [];
    return records
      .filter((r) => r?.address && /^G[A-Z2-7]{55}$/.test(r.address))
      .map((r) => ({ asset: r.tag?.[0] || 'TOKEN', issuer: r.address }));
  } catch {
    return [];
  }
}

async function seed() {
  console.log('🧬 Seeding DNA fingerprints from historical scam issuers…');

  const expert = await fetchExpertDirectory();
  const seedSet = expert.length ? expert : FALLBACK_RUGS;
  console.log(
    `   source: ${expert.length ? `StellarExpert directory (${expert.length})` : `fallback list (${FALLBACK_RUGS.length})`}`,
  );

  let succeeded = 0;
  let skipped = 0;

  for (const entry of seedSet) {
    process.stdout.write(`   • ${entry.issuer.slice(0, 12)}… `);
    try {
      const ops = await fetchOperations(entry.issuer);
      if (!ops.length) {
        console.log('skip — no on-chain history');
        skipped += 1;
        continue;
      }
      const [account, offers, trades] = await Promise.all([
        fetchAccount(entry.issuer),
        fetchOffers(entry.issuer),
        fetchTrades(entry.asset, entry.issuer),
      ]);
      const extracted = extractVector(entry.issuer, ops, account, offers, trades);
      if (!extracted) {
        console.log('skip — empty fingerprint');
        skipped += 1;
        continue;
      }
      DNA_DB.upsertIssuer(entry.issuer, entry.asset, extracted.vector, extracted.raw);
      DNA_DB.confirmRug(entry.issuer, 0);
      succeeded += 1;
      console.log('✓ fingerprinted + confirmed rug');
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      skipped += 1;
      console.log(`error — ${err.message}`);
    }
  }

  const stats = DNA_DB.getStats();
  console.log(
    `\n🏁 seed complete · ${succeeded} added · ${skipped} skipped · DB now holds ${stats.total} issuers (${stats.rugs} confirmed rugs)`,
  );
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seed };
