# Campus Lost & Found

This project keeps the existing HTML and CSS design and adds a local Express and SQLite backend. Public visitors can browse published items. Students can register, sign in, post reports, manage their own reports, and submit one private claim per item. Staff accounts can review reports and claims.

## Requirements

- Node.js 22.13 or newer (the server uses Node's built-in SQLite module)
- npm

## Start the app

From this folder, run:

```sh
npm install
npm start
```

Then open <http://localhost:3000>. SQLite data is stored in `data/campus.sqlite`; this folder is created automatically and is excluded from version control. To prepare a demo database before starting the server, run the sample account and sample data commands below.

## Deploy on Render

The included `render.yaml` describes a Render web service with a persistent disk mounted at `/var/data`. The app uses `CAMPUS_DATA_DIR` for both SQLite app data and login sessions, so the database is stored on that disk instead of Render's temporary filesystem. The service requires a paid Render web-service plan because Render does not provide persistent disks to free web services. A disk-backed service runs one instance at a time.

1. Push this project to a GitHub repository. Do not include `data/`, `.env`, or any passwords.
2. In Render, choose **New → Blueprint** and connect the repository containing `render.yaml`. Review the proposed service and disk, then apply it. The blueprint uses `npm ci`, `npm run start:production`, and `/api/health` for its health check.
3. When Render asks for the three `DEMO_*_PASSWORD` values, generate separate strong passwords (at least 16 characters) and enter them as secret environment values. Do not add them to the repository or publish them on the website. Render generates `SESSION_SECRET` privately. `NODE_ENV=production` enables secure HTTPS cookies and the trusted Render proxy.
4. Wait for the deploy to finish. `start:production` creates the three demo accounts and sample listings on the persistent disk before starting Express. It never prints production passwords. The account seed is safe to run again: existing accounts are left unchanged and sample listings/claims are added only if missing.
5. Send the professor the public `https://<service-name>.onrender.com` link and the student/staff demo passwords through a private channel. The passwords are deliberately not displayed publicly. The claimant account is available too if the professor wants to try the claims workflow.

Demo account emails are `demo.student@example.edu`, `demo.staff@example.edu`, and `demo.claimant@example.edu`. On later restarts the seed command will not change an existing account's password; changing an environment password alone does not reset it. Keep the original values safe. Do not run the production seeder against your local `data/campus.sqlite`.

## Test accounts

Generate sample student, claimant student, and staff accounts, then add four example items with photos and a pending claim:

```sh
npm run seed:demo
npm run seed:sample
```

The account command prints randomly generated passwords once. Save them privately. It leaves existing accounts unchanged. The sample-data command only adds missing demo listings/claims and is safe to run again. The student account owns the listings; the claimant account has a pending claim for a published item. Students can also register from the Sign in button; public registration always creates a student, never staff. Do not put generated passwords in source control.

## Tests

```sh
npm test
```

The automated tests cover visitor, student, and staff permissions; item add/edit/delete; claim approval/rejection and duplicate prevention; JPG/PNG validation, oversized/invalid uploads and photo replacement; search and no-result filters; rapid duplicate submissions; browser-back modal closing; persistence after refresh and server restart; secure production cookies and session persistence; expiration; and production demo setup without logging passwords. Test data and image fixtures use temporary directories.

## Security notes

Passwords are hashed with Node's scrypt and claim proof is only returned by a staff-only endpoint. Login sessions use HTTP-only, same-site cookies and are stored in SQLite. In production, the cookie is secure for HTTPS, the session secret must be at least 32 characters, and the app trusts Render's HTTPS proxy. Keep the Render disk and demo passwords private. Back up the database before changing or removing the disk.

The current browser-localStorage content is left untouched as a local backup; the server does not automatically import it because the backend cannot safely identify its owner. Existing records stored only in a browser must be re-entered after signing in.
