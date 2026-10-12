const { db } = require('./server');

const owner = db.prepare("SELECT id FROM users WHERE email='demo.student@example.edu' AND role='student'").get();
const claimant = db.prepare("SELECT id FROM users WHERE email='demo.claimant@example.edu' AND role='student'").get();
if (!owner || !claimant) {
  console.error('Run npm run seed:demo first and save the generated passwords.');
  process.exitCode = 1;
} else {
  const jpg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEA8VFhUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AqgA//9k=';
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
  const examples = [
    ['Demo blue water bottle', 'Other', 'Student Union café', '2026-10-10', 'Blue insulated bottle with a mountain sticker.', jpg, 'published'],
    ['Demo wireless headphones', 'Electronics', 'North Library · 2nd floor', '2026-10-09', 'Black over-ear headphones in a gray case.', png, 'published'],
    ['Demo green scarf', 'Clothing', 'Arts Building', '2026-10-08', 'Forest-green knit scarf left on a bench.', jpg, 'published'],
    ['Demo calculator', 'Other', 'West Hall · Room 204', '2026-10-07', 'Scientific calculator with initials on the back.', png, 'pending']
  ];
  const find = db.prepare('SELECT id FROM items WHERE owner_id=? AND title=?');
  const add = db.prepare('INSERT INTO items(owner_id,title,category,location,date,description,photo,status) VALUES(?,?,?,?,?,?,?,?)');
  let added = 0;
  for (const [title, category, location, date, description, photo, status] of examples) {
    if (!find.get(owner.id, title)) { add.run(owner.id, title, category, location, date, description, photo, status); added++; }
  }
  const target = find.get(owner.id, 'Demo blue water bottle');
  const priorClaim = db.prepare('SELECT id FROM claims WHERE item_id=? AND claimant_id=?').get(target.id, claimant.id);
  if (!priorClaim) db.prepare('INSERT INTO claims(item_id,claimant_id,proof) VALUES(?,?,?)').run(target.id, claimant.id, 'The sticker on the base is a small red mountain.');
  console.log(`Added ${added} demo items. A pending private claim is available in the staff desk.`);
  const stats=db.prepare("SELECT COUNT(*) AS items,SUM(CASE WHEN photo IS NOT NULL AND length(photo)>0 THEN 1 ELSE 0 END) AS photos FROM items WHERE title LIKE 'Demo %'").get();
  const pending=db.prepare("SELECT COUNT(*) AS count FROM claims c JOIN items i ON i.id=c.item_id WHERE i.title LIKE 'Demo %' AND c.status='pending'").get().count;
  console.log(`Sample data check: ${stats.items} items, ${stats.photos} with photos, ${pending} pending claims.`);
}
