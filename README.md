# Campus Lost & Found

This project keeps its existing HTML and CSS design. The Node.js and Express server now uses Turso's SQLite-compatible cloud database through the asynchronous `@libsql/client` package. Visitors can browse public listings; students can create and manage their own listings and submit claims; staff can manage listings and review claims. Claim proof and account details are restricted by server-side permissions. Item photos are saved in the database as image data.

## Requirements

- Node.js 22.13 or newer
- npm
- A free Turso account and database for a shared/deployed instance

## Create a free Turso database

1. Create or sign in to a Turso account at <https://turso.tech> and stay on the Free plan. No paid plan is needed for this class demo.
2. Install and sign in to the Turso CLI using Turso's [CLI installation guide](https://docs.turso.tech/cli/installation).
3. Create a new, empty database for this website:

   ```sh
   turso db create campus-lost-found
   ```

4. Get the database URL and create a database access token:

   ```sh
   turso db show --url campus-lost-found
   turso db tokens create campus-lost-found
   ```

5. Copy the URL and token somewhere private temporarily. The token is a secret. Do not paste it into source code, README files, GitHub, screenshots, or class materials.

The application creates its tables the first time it connects. It does not import or alter `data/campus.sqlite`; the hosted database is a separate empty database. The production startup process then adds hosted demo users and sample records to that remote database only.

## Deploy on Render Free

The checked-in `render.yaml` configures a Free Node web service with no persistent disk. Render's local filesystem is temporary, so all app data, sessions, and photos are kept in Turso instead.

1. Push the reviewed project to GitHub when you are ready. `node_modules/`, `.env`, and local SQLite files must stay out of Git.
2. In Render, select **New → Blueprint**, connect the GitHub repository, and apply the Blueprint. Confirm that the web service plan is **Free**.
3. In the Render service's **Environment** settings, add these values:
   - `TURSO_DATABASE_URL`: the value from `turso db show --url campus-lost-found`.
   - `TURSO_AUTH_TOKEN`: the token from `turso db tokens create campus-lost-found`.
   - `DEMO_STUDENT_PASSWORD` and `DEMO_CLAIMANT_PASSWORD`: separate strong passwords, at least 16 characters each. Store them as private environment values. `STAFF_INVITE_ADMIN_EMAIL`: set this to the email of the existing staff account authorized to create invitations (for the demo account, `demo.staff@example.edu`). The staff account also needs a strong password configured with `DEMO_STAFF_PASSWORD`.
   - `SESSION_SECRET`: a random secret at least 32 characters long. Render's Blueprint generates this automatically; keep it private.
4. Save the environment settings and deploy. The startup command initializes the remote schema, creates the demo accounts when missing, adds four sample items with photos and one pending claim, then starts the server.
5. Open the Render URL (for example, `https://campus-lost-found.onrender.com`) and check `/api/health`. Send the public URL and demo student email to your professor. Do not share a staff password; create a private invitation instead.

Demo emails are `demo.student@example.edu`, `demo.staff@example.edu`, and `demo.claimant@example.edu`. Existing accounts are left unchanged on restart. Changing a Render demo password will not change a password already stored in Turso; use a new empty demo database if you need fresh test accounts.

### Free service limits

Render Free services sleep after 15 minutes without visitors and can take about a minute to wake up. Their filesystem is temporary, which is why the SQLite database is not stored there. Turso's current Free plan lists 5 GB database storage, 500 million row reads and 10 million row writes each month. Photos count toward database storage. Keep the Turso account on Free and leave paid upgrades or usage overages disabled. For this class demo, the sample photos are small; user-uploaded photos use more space. Render Free services also have monthly usage limits and can be suspended if those limits are reached.

## Invite a staff member

Set `STAFF_INVITE_ADMIN_EMAIL` in the service environment to the email of an existing staff account. Only that signed-in staff account can create invitations. For a fresh demo deployment, use `demo.staff@example.edu` and sign in with its privately stored `DEMO_STAFF_PASSWORD`. Existing database rows and content are preserved by startup.

After deployment, sign in as that administrator, open **Staff desk**, and choose **Create invitation**. The private link is copied to the clipboard. Send it directly to your professor through a private channel. It expires after seven days and can create one account; your professor enters his own email and chooses a password of at least 10 characters. The server stores only a SHA-256 hash of each invitation token. Ordinary public Sign Up always creates a student account, even if a caller submits a `role` field.

For local use, set `STAFF_INVITE_ADMIN_EMAIL` in the same shell as the Turso connection values before starting `npm start`. Never paste invitation links or passwords into GitHub, issue trackers, screenshots, or logs.

## Run locally

Local server commands connect to the same Turso database whose credentials you set. To keep the local SQLite database completely separate, set the two connection variables in your shell (or use a private local `.env` loader that is excluded from Git):

```sh
export TURSO_DATABASE_URL='libsql://your-database-your-account.turso.io'
export TURSO_AUTH_TOKEN='your-private-database-token'
npm ci
npm start
```

Open <http://localhost:3000>. Do not run the hosted demo seed commands against a database containing personal or real user data. Use a separate empty Turso database for demonstrations.

## Tests

```sh
npm test
```

The automated tests cover visitor, student, and staff permissions; adding/editing/deleting items; claim submission, review, and duplicate prevention; photos and upload validation; search and filters; private claim proof; idempotent rapid submissions; persistence across refresh and server restart; sessions; demo-data setup, and staff invitation authorization, expiry, one-time use, and registration. Test runs use disposable SQLite files in temporary folders, never `data/campus.sqlite` or your Turso database.

## Security and data notes

- Passwords are hashed with Node's scrypt. Staff demo passwords are only read from private environment variables and are not printed by the production seeder.
- Production sessions use secure, HTTP-only, same-site cookies. Session rows live in Turso and require `SESSION_SECRET`.
- Visitors and students cannot read claim proof. The staff-only claims endpoint returns proof and claimant contact email.
- Photos and sessions are stored in the remote Turso database, not in Render files.
- This migration does not copy existing browser localStorage data or the local SQLite database into Turso. Local data remains as-is and is not opened by the production app.
