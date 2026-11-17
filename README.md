# THE LAST JERSEY

**84 PEOPLE. ONE BATCH. A LIFETIME OF MEMORIES.**

Private graduation-memory archive built with Next.js 16, React 19, Payload 4,
Three.js and Tailwind CSS 4 in Figma Make.

## Experiences

- **Batch Wall** — exactly 84 roll-number profiles sourced from `pins.csv`.
- **The Last Jersey** — procedural 3D cotton T-shirt, 360° inspection, UV-attached
  ink drawing, permanent artwork layers and typed message cards.
- **Signature Walls** — one independent handwriting notebook for each of the 84
  roll numbers.
- **Memory Wall** — a 16,000 × 10,000 world-coordinate scrapbook with free pan,
  zoom, drag placement, rotation and immutable Polaroid submissions.
- **My Profile** — student-owned profile photograph setup/replacement with a 4:5
  crop, persistent optimized image and private original.
- **Administrator Dashboard** — roster/profile management, attribution,
  moderation, logs, uploads, CSV import and backups.

## Authentication

Student login uses the exact `roll_number,pin` pairs in `pins.csv`. PINs are
stored as Payload PBKDF2-SHA256 hashes. Because the supplied CSV contains PINs
shorter than Payload's three-character minimum, student credentials are
internally namespaced as `pin:<exact CSV value>` before hashing and verification;
students still enter the exact PIN from the CSV.

App sessions use the HTTP-only `__Host-app-session` cookie with
`Secure; SameSite=None; Partitioned` so they work in the Figma Make preview
iframe. CMS/Figma SSO and app-user sessions remain separate.

The app administrator is:

- Username: `HEMANTHHK.7`
- Password source: server-only `ADMIN_PASSWORD`

The password is synced into Payload's app-user collection and hashed there. It
is never included in browser code, logs or documents.

## Roster import

Use **Administrator → Profiles & roster → Logs & backups → Roster import**.

The importer:

1. detects the roll-number and PIN headers;
2. requires exactly 84 valid rows;
3. rejects missing values, malformed rows, duplicate rolls and conflicting
   mappings;
4. previews the result before applying;
5. never deletes existing student accounts;
6. resets existing PINs only when the explicit checkbox is selected.

The CSV is parsed in memory and is never uploaded to public storage.

## Profile photographs

Students are sent to `/profile/setup` after first login until they upload a
portrait. `/api/lj/profile` accepts no target roll number: it derives the owner
exclusively from the authenticated session. Payload collection hooks preserve
the account's username, roll number, role, PIN and ordering even if a crafted
request includes those fields.

The administrator can upload, replace and remove any portrait by explicit roll
number from `/hq/roster`.

## Storage and data

Structured data lives in Figma-managed Payload storage. All uploads use the
Figma cloud-storage adapter with local disk disabled:

- optimized profile portraits and private originals;
- jersey PNG ink layers;
- signature PNGs;
- Memory Wall 4:5 display versions, full-size metadata-stripped images and
  private originals;
- private JSON backups.

Student-facing queries use explicit field allow-lists and never return
`contributor`, `uploader`, original-file or operational metadata.

## Backup and recovery

Use `/hq/system` to create a private JSON record snapshot. Backups exclude PIN
hashes and active sessions; credentials must be restored from `pins.csv`.
Uploaded files remain in managed object storage and are referenced by the
snapshot.

The Figma-managed Content API adapter enforces unique constraints but does not
provide multi-document transactions. Multi-file upload flows therefore use
idempotency keys and compensating cleanup on partial failure.

## Local verification

The Figma Make development server is platform-supervised; do not start another
one.

```sh
pnpm exec tsc --noEmit -p tsconfig.json
figma make verify-bootstrap --force
figma make verify-deploy
```

`verify-deploy` should report `/login` and `/hq/login` as static. All
authenticated application and admin pages are intentionally request-time
dynamic because they resolve secure sessions and high-churn operational data.

## Deployment

Use Figma Make **Publish**. The platform supplies the database, object storage,
Payload/Figma secrets and deployment runtime. `ADMIN_PASSWORD` must remain
configured in Make settings → Environment variables.

## Operational limitations

- Figma's plan-specific document/storage quotas are enforced by the platform
  but are not exposed to application code. Limit failures are reported and
  stored in upload logs.
- A backup snapshot records file references; bulk automated restore is not
  exposed in the UI. Moderation removal is soft and reversible.
- The permanent archive ultimately depends on the retention and availability of
  the connected Figma-managed Payload environment. Export backups regularly.

**MADE BY ft.middlebenchers**
