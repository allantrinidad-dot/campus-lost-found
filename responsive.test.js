const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

test('desktop layout defines a wide navigation, hero, and three-column listing grid', () => {
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1\.0"/);
  assert.match(css, /\.hero\{display:grid;grid-template-columns:1\.05fr \.95fr/);
  assert.match(css, /\.item-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.topbar nav\{display:flex;align-items:center/);
});

test('mobile breakpoints collapse navigation, filters, cards, and workflow steps', () => {
  assert.ok(css.includes('@media(max-width:760px)'));
  assert.ok(css.includes('.menu-toggle{display:flex;'));
  assert.ok(css.includes('.topbar nav{position:absolute;'));
  assert.ok(css.includes('@media(max-width:520px)'));
  assert.ok(css.includes('.item-grid{grid-template-columns:1fr;'));
  assert.ok(css.includes('.steps{grid-template-columns:1fr;'));
  assert.ok(css.includes('.form-row{grid-template-columns:1fr;'));
});

test('keyboard focus and reduced motion preferences have explicit styles', () => {
  assert.match(css, /:focus-visible\{outline:3px solid/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html, /class="skip-link" href="#mainContent"/);
});
