# Campus Lost & Found Web App

## Current implementation status

The current project remains a plain HTML, CSS, and JavaScript site. It now uses a Node.js Express API and SQLite database for account, item, and claim records. Student passwords use scrypt hashes and login state uses server sessions. Public signup creates student accounts only; staff accounts are created with `npm run seed:demo`.

Implemented in this version: visitor browsing and search, student signup/login, item creation and owner management, staff report review, private claim submission and staff decisions, duplicate claim prevention, role checks on API routes, and expiration after 30 days. `README.md` documents local setup and generated sample accounts.

Still planned: campus SSO, email notifications, hosted persistent sessions, object storage for photos, pickup instructions and full pickup coordination, production deployment hardening, and broader accessibility/mobile upload testing. LocalStorage entries from before the backend are left in the browser and must be re-entered; the app does not trustingly import anonymous browser data.

## Summary

Build a responsive TypeScript web app where campus users post found items, browse/search listings, submit ownership claims with proof, and receive staff decisions before pickup. Visitors may browse listings but require campus SSO for posting and claiming.

## Key Changes

- Create found-item reports requiring:
  - Photo
  - Category
  - Found location
  - Found date
  - Description and optional identifying details
- Add listing search and filters by category and date.
- Implement item lifecycle:
  - `Pending review`
  - `Published`
  - `Claim under review`
  - `Claim approved`
  - `Claim rejected`
  - `Collected`
  - `Expired`
- Add private claim submissions containing proof of ownership. Hide proof and personal contact details from public listings.
- Create staff dashboard for:
  - Reviewing and publishing reports
  - Reviewing claims
  - Approving claims before pickup
  - Recording pickup/collection
  - Managing expired listings
- Automatically expire unclaimed items 30 days after posting, remove them from active search, and notify staff.
- Send email notifications for claim submissions, approvals/rejections, expiration warnings, and pickup instructions.
- Use campus SSO for campus users, relational storage for users/items/claims, object storage for photos, and role-based staff access.

## Interfaces and Data

Core entities:

- `User`: campus identity, role, email
- `FoundItem`: required photo, category, location, found date, description, status, timestamps
- `Claim`: item, claimant, proof details, status, staff reviewer, decision timestamps
- `Pickup`: approved claim, pickup status, location/instructions, completion timestamp

Public API behavior should support listing creation, paginated search/filtering, item detail retrieval, claim submission, staff review actions, pickup completion, and expiration processing. Public responses must exclude claim proof and private contact data.

## Test Plan

- Validate required fields and photo upload when posting an item.
- Search and filter by category, date range, and combined filters.
- Confirm visitors can browse but cannot post or claim.
- Confirm authenticated users can submit claims with proof.
- Verify staff approval is required before pickup status can be recorded.
- Verify rejected claims cannot proceed to pickup.
- Verify unclaimed items expire exactly 30 days after posting and disappear from active results.
- Test unauthorized access to staff actions, claim proof, and private user information.
- Test email notifications and photo upload failure handling across desktop and mobile layouts.

## Assumptions

- MVP covers found-item postings; user-submitted lost-item reports are out of scope.
- Campus SSO is the authentication provider.
- Staff approval is the authoritative ownership decision.
- Expiration is based on the item’s posting timestamp and is not automatically extended.
- Visitors have public read-only access.
