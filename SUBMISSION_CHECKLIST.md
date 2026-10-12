# Final Submission Checklist

## Files to submit

Include the existing website, backend, install files, instructions, seed scripts, and tests:

- `index.html`, `app.js`, `styles.css`, `polish.css`
- `server.js`, `expiration.js`
- `package.json`, `package-lock.json`
- `seed-demo.js`, `seed-sample-data.js`
- `README.md`, `PLAN.md`, `TEST_SUMMARY.md`, this checklist
- `expiration.test.js`, `claim.test.js`, `permissions.test.js`, `workflow.test.js`, `persistence.test.js`, `seed.test.js`, `frontend.test.js`

Do not include `node_modules/`, `data/campus.sqlite`, `.env`, or any file that contains the generated demo passwords. The database is intentionally ignored by Git and npm packaging; the professor can create a fresh one with the steps below. Source and test files use generated test passwords and contain no real account passwords or session secrets.

## Before handing it in

1. Use Node.js 22.13 or newer.
2. In the project folder, run `npm install`.
3. Run `npm run seed:demo`. Save the printed passwords privately for grading; the command will not print a password again for an account that already exists.
4. Run `npm run seed:sample`. It adds four sample items with photos and one pending claim. It is safe to run again.
5. Run `npm test` and confirm all tests pass.
6. Run `npm start`, then open <http://localhost:3000>.
7. Keep the generated passwords out of the submitted folder and any screenshots or public posts.

## Suggested professor walkthrough

1. Open the site before signing in. Browse the published sample items, search for “bottle,” try a category/date filter, and try a search with no matches.
2. Sign in as `demo.student@example.edu`. Confirm the student can add an item, edit/delete their own item, and submit a claim on an item they do not own.
3. Sign in as `demo.staff@example.edu`. Open Staff desk, publish the pending sample report, and approve or reject the pending sample claim. Approved claims can be marked collected.
4. Sign in as `demo.claimant@example.edu` to see a separate student account for claims. Claim proof and email are visible only in the staff review view.
5. Restart the server and refresh the page to confirm database records remain.

Use the passwords printed by `npm run seed:demo` for those accounts. If a seeded account already exists and its password is unknown, use a fresh empty database folder for the demo commands rather than replacing an existing account.

## Grading coverage and known gaps

The supplied automated tests cover role permissions, item workflows, claims, duplicate submissions, image validation and replacement, search/no-results, private claim data, browser-back modal handling, account/sample seeding, and SQLite persistence after restart.

The project is a local class demo. Campus SSO, email alerts, object storage, persistent production sessions, pagination/item-detail routes, claim-under-review item status, staff expiration alerts, and pickup instructions are not implemented. Live testing in a full desktop browser was not completed; the browser-back and rapid-submit check runs in jsdom. Review the instructor's exact 100-point rubric against these gaps because no separate point-by-point rubric is included in the project files.
