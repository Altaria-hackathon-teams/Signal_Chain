const { getDb } = require('./db');
const path = require('path');

const db = getDb();
console.log('✓ Database initialized at', path.join(__dirname, 'trustproof.db'));
db.close();
process.exit(0);
