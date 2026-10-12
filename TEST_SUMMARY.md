# Automated Test Summary

## Expiration tests (`expiration.test.js`)

These tests check `isExpired(item, today)` using a fixed reference date so the results are repeatable.

| Test | What it verifies | Result |
|---|---|---|
| 29 days old | An item younger than 30 days is not expired. | Pass |
| 30 days old | An item at the 30-day threshold is expired. | Pass |
| 31 days old | An item older than 30 days is expired. | Pass |
| Future posting date | A future-dated item is not expired. | Pass |
| Missing posting date | An item without a posting date is not expired. | Pass |
| Empty item | A null item is handled without throwing and is not expired. | Pass |
| Invalid posting date | An unparseable item date is handled without throwing and is not expired. | Pass |
| Invalid current date | An unparseable `today` value does not mark the item expired. | Pass |

**Expiration suite result:** 8 passed, 0 failed.

## Duplicate claim test (`claim.test.js`)

| Test | What it verifies | Result |
|---|---|---|
| Claim the same item twice | Submits a claim twice through the Express API and confirms the second request is rejected and only one claim is stored. | Pass |

## Role permissions (`permissions.test.js`)

| Test | What it verifies | Result |
|---|---|---|
| Visitor access | Visitors can browse but cannot post or claim. | Pass |
| Student permissions | Students can post but cannot edit another student's item or use staff review routes. | Pass |
| Staff permissions and privacy | Staff can publish; claim proof is omitted from public item results and returned to staff only. | Pass |

**Final run:** `npm test` — 17 passed, 0 failed. The final suite was run three consecutive times: 51 passing test executions, 0 failures. Tests use temporary SQLite databases and upload fixtures and do not modify the app's persistent database.

## Expanded professor requirement checks

The automated suite now also checks item creation, owner-only edits and deletion, staff claim approval and rejection, approved pickup, JPG and PNG data uploads, invalid and oversized image rejection, photo replacement, search/filter/no-results, private claims data, account seeding, browser-back modal closing, rapid item submissions, and persistence after page refresh and a full server restart.

Each complete expanded run contains 17 checks. The final three consecutive runs each passed all 17 checks (51 passing test executions total). Every run uses a temporary SQLite database and temporary upload fixtures; it does not touch `data/campus.sqlite`.

## Submission checks (October 12, 2026)

- Demo seeder created student, claimant-student, and staff accounts with randomly generated passwords. Passwords were not copied into project files.
- Sample database check: four demo items, all four have photo data, and one pending claim. Running `npm run seed:sample` again reports zero new items.
- README startup check: `npm start` launched with a temporary database and `/api/health` returned HTTP 200. Existing database rows were not used for that startup check.
- Packaging/security check: `data/campus.sqlite` is excluded by `.gitignore` and was absent from `npm pack --dry-run`; no `.env` file is present. Generated passwords and session secrets are not present in submitted source files.
- A full desktop browser session was not tested. The modal Back behavior was verified with the jsdom frontend test.

## Render deployment checks (October 11, 2026)

- Added a Render Blueprint for a paid web service with a persistent disk at `/var/data` and `CAMPUS_DATA_DIR=/var/data`.
- Added SQLite-backed login sessions. A production-mode test confirmed the secure cookie settings and that a signed-in session remains valid after a server restart when the persistent database and session secret remain available.
- Added production demo seeding from private environment variables. Automated tests confirmed generated production passwords are not printed and sample data is added.
- Latest `npm test` run: **18 passed, 0 failed**. It used temporary test databases and did not write to `data/campus.sqlite`.
- Deployment is prepared but not live yet; a Render account, Git-connected repository, and private demo password values still need to be supplied by the project owner.
