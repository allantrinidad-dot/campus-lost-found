const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEA8VFhUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AqgA//9k=';
const item = (id, overrides = {}) => ({ id, title: `Item ${id}`, category: 'Books', location: 'Main library', date: '2026-10-10', description: 'Green notebook with a cloth cover.', photo, emoji: '📦', status: 'published', canEdit: false, ...overrides });

async function loadPage({ user = null, itemRows = [item(1)], studentClaims = [], staffClaims = [] } = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only' });
  const window = dom.window;
  window.fetch = async url => {
    let data = {};
    if (url === '/api/me') data = { user, canInviteStaff: false };
    else if (url === '/api/items') data = itemRows;
    else if (url === '/api/my/claims') data = studentClaims;
    else if (url === '/api/staff/claims') data = staffClaims;
    return { ok: true, status: 200, json: async () => data };
  };
  window.eval(script);
  await new Promise(resolve => setTimeout(resolve, 30));
  return { dom, window, document: window.document };
}

async function closeDetails(window, document) {
  const closed = new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
  document.querySelector('#itemDetailsModal [data-close]').click();
  await closed;
}

test('item cards open accessible details with public listing fields for visitors', async () => {
  const { dom, document } = await loadPage({ itemRows: [item(1, { description: 'A notebook <script>bad()</script> with a green cover.' })] });
  const trigger = document.querySelector('[data-item-details="1"]');
  assert.equal(trigger.tagName, 'BUTTON');
  assert.equal(trigger.type, 'button');
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(trigger.getAttribute('aria-label'), 'View details for Item 1');
  trigger.focus();
  trigger.click();
  assert.equal(document.getElementById('itemDetailsModal').classList.contains('hidden'), false);
  assert.equal(document.getElementById('itemDetailsHeading').textContent, 'Item 1');
  assert.equal(document.querySelector('.details-photo').getAttribute('alt'), 'Item 1');
  assert.match(document.getElementById('itemDetailsContent').textContent, /Books/);
  assert.match(document.getElementById('itemDetailsContent').textContent, /Main library/);
  assert.match(document.getElementById('itemDetailsContent').textContent, /Date found/);
  assert.match(document.getElementById('itemDetailsContent').textContent, /Available for claims/);
  assert.equal(document.querySelector('[data-details-sign-in]') !== null, true);
  assert.equal(document.querySelector('.details-description script'), null, 'listing text is inserted as escaped text');
  await closeDetails(dom.window, document);
  assert.equal(document.getElementById('itemDetailsModal').classList.contains('hidden'), true);
  dom.window.close();
});

test('students see only their own claim status and claim actions respect eligibility', async () => {
  const { dom, document } = await loadPage({
    user: { id: 7, email: 'student@example.edu', role: 'student' },
    itemRows: [item(1), item(2, { canEdit: true }), item(3)],
    studentClaims: [{ id: 11, item_id: 1, status: 'pending', title: 'Item 1', proof: 'PRIVATE EVIDENCE MUST NOT APPEAR' }]
  });
  const claimed = document.querySelector('[data-item-details="1"]');
  assert.equal(claimed.parentElement.querySelector('[data-edit]'), null);
  claimed.click();
  assert.match(document.getElementById('itemDetailsContent').textContent, /Your claim: pending/);
  assert.equal(document.querySelector('[data-details-claim]'), null);
  assert.equal(document.getElementById('itemDetailsContent').textContent.includes('PRIVATE EVIDENCE'), false);
  assert.equal(document.getElementById('itemDetailsContent').textContent.includes('student@example.edu'), false);

  await closeDetails(dom.window, document);
  const owned = document.querySelector('[data-item-details="2"]');
  assert.ok(owned.parentElement.querySelector('[data-edit]'), 'owner edit controls remain outside the details button');
  assert.equal(owned.parentElement.querySelector('[data-delete]') !== null, true);
  owned.click();
  assert.equal(document.querySelector('[data-details-claim]'), null, 'owners cannot claim their own listing');

  await closeDetails(dom.window, document);
  document.querySelector('[data-item-details="3"]').click();
  document.querySelector('[data-details-claim]').click();
  assert.equal(document.getElementById('itemDetailsModal').classList.contains('hidden'), true);
  assert.equal(document.getElementById('claimModal').classList.contains('hidden'), false);
  assert.equal(document.getElementById('claimItemName').textContent.includes('Item 3'), true);
  dom.window.close();
});

test('staff can see safe claim states and retain publish controls', async () => {
  const { dom, document } = await loadPage({
    user: { id: 8, email: 'staff@example.edu', role: 'staff' },
    itemRows: [item(4, { status: 'pending' })],
    staffClaims: [{ id: 12, item_id: 4, status: 'pending', proof: 'PRIVATE STAFF EVIDENCE', email: 'claimant@example.edu' }]
  });
  const trigger = document.querySelector('[data-item-details="4"]');
  assert.ok(trigger.parentElement.querySelector('[data-publish]'));
  trigger.click();
  assert.match(document.getElementById('itemDetailsContent').textContent, /Claim status: pending/);
  assert.equal(document.getElementById('itemDetailsContent').textContent.includes('PRIVATE STAFF EVIDENCE'), false);
  assert.equal(document.getElementById('itemDetailsContent').textContent.includes('claimant@example.edu'), false);
  assert.equal(document.querySelector('[data-details-claim]'), null, 'staff accounts do not receive the student claim action');
  dom.window.close();
});
