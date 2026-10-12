const crypto = require('node:crypto');
const { client: db, ready, q, get, passwordHash } = require('./server');

const accounts = [
  { email: 'demo.student@example.edu', role: 'student', env: 'DEMO_STUDENT_PASSWORD' },
  { email: 'demo.staff@example.edu', role: 'staff', env: 'DEMO_STAFF_PASSWORD' },
  { email: 'demo.claimant@example.edu', role: 'student', env: 'DEMO_CLAIMANT_PASSWORD' }
];

async function seedDemo() {
  await ready;
  if (process.env.NODE_ENV === 'production') {
    const missing = accounts.filter(account => !process.env[account.env] || process.env[account.env].length < 16);
    if (missing.length) throw new Error(`Set private environment values of at least 16 characters for: ${missing.map(account => account.env).join(', ')}.`);
  }
  for (const account of accounts) {
    const password = process.env.NODE_ENV === 'production' ? process.env[account.env] : crypto.randomBytes(24).toString('base64url');
    const result = await q('INSERT INTO users(email,password_hash,role) VALUES(?,?,?) ON CONFLICT(email) DO NOTHING', [account.email, passwordHash(password), account.role]);
    if (process.env.NODE_ENV === 'production') console.log(result.rowsAffected ? `${account.role}: ${account.email} created.` : `${account.role}: ${account.email} already exists; left unchanged.`);
    else console.log(result.rowsAffected ? `${account.role}: ${account.email} / ${password}` : `${account.role}: ${account.email} already exists; left unchanged.`);
  }
  if (process.env.NODE_ENV !== 'production') console.log('Save these generated passwords somewhere private. Existing accounts were left unchanged.');
  else console.log('Production demo passwords were read from private environment variables and were not printed. Existing accounts were left unchanged.');
}

if (require.main === module) seedDemo().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { seedDemo };
