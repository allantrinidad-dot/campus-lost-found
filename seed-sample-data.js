const { ready, q, get } = require('./server');

async function seedSampleData() {
  await ready;
  const owner = await get("SELECT id FROM users WHERE email='demo.student@example.edu' AND role='student'");
  const claimant = await get("SELECT id FROM users WHERE email='demo.claimant@example.edu' AND role='student'");
  if (!owner || !claimant) throw new Error('Run npm run seed:demo first.');
  const jpg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEA8VFhUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AqgA//9k=';
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
  const examples = [
    ['Demo blue water bottle', 'Other', 'Student Union café', '2026-10-10', 'Blue insulated bottle with a mountain sticker.', jpg, 'published'],
    ['Demo wireless headphones', 'Electronics', 'North Library · 2nd floor', '2026-10-09', 'Black over-ear headphones in a gray case.', png, 'published'],
    ['Demo green scarf', 'Clothing', 'Arts Building', '2026-10-08', 'Forest-green knit scarf left on a bench.', jpg, 'published'],
    ['Demo calculator', 'Other', 'West Hall · Room 204', '2026-10-07', 'Scientific calculator with initials on the back.', png, 'pending']
  ];
  let added = 0;
  for (const [title, category, location, date, description, photo, status] of examples) {
    const prior = await get('SELECT id FROM items WHERE owner_id=? AND title=?', [owner.id, title]);
    if (!prior) {
      await q('INSERT INTO items(owner_id,title,category,location,date,description,photo,status) VALUES(?,?,?,?,?,?,?,?)', [owner.id, title, category, location, date, description, photo, status]);
      added++;
    }
  }
  const target = await get("SELECT id FROM items WHERE owner_id=? AND title='Demo blue water bottle'", [owner.id]);
  const priorClaim = await get('SELECT id FROM claims WHERE item_id=? AND claimant_id=?', [target.id, claimant.id]);
  if (!priorClaim) await q('INSERT INTO claims(item_id,claimant_id,proof) VALUES(?,?,?)', [target.id, claimant.id, 'The sticker on the base is a small red mountain.']);
  const stats = await get("SELECT COUNT(*) AS items,SUM(CASE WHEN photo IS NOT NULL AND length(photo)>0 THEN 1 ELSE 0 END) AS photos FROM items WHERE title LIKE 'Demo %'");
  const pending = await get("SELECT COUNT(*) AS count FROM claims c JOIN items i ON i.id=c.item_id WHERE i.title LIKE 'Demo %' AND c.status='pending'");
  console.log(`Added ${added} demo items. A pending private claim is available in the staff desk.`);
  console.log(`Sample data check: ${stats.items} items, ${stats.photos} with photos, ${pending.count} pending claims.`);
}

if (require.main === module) seedSampleData().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { seedSampleData };
