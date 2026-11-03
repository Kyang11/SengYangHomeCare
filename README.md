# Seng Yang Home Care

A new sample home care site based on the supplied local reference architecture. The same six public pages, shared navigation/footer, service sections, training cards/quiz, employment/intake layouts and admin dashboard are retained. Its sage, mulberry and linen theme, sample copy and original SVG holders belong to this project. The reference repository and its media were not modified or committed here.

## Pages and editing

- Home (`index.html`): hero, photo holder, service overview, mission, values, consultation CTA.
- About: story, mission, values, team photo holder.
- Services: the reference service inventory and comparison layouts, with sample descriptions.
- Training: example resource cards, eleven configurable video holders and a sample practice quiz.
- Employment: employee/client tabs, demo forms and editable document link holders.
- Contact: fictional contact details, example hours and a demo message form.
- Admin: dashboard, page editing, media library, user roles, account settings, and inherited browser-only demo tools.

Admins/editors can open any public page through **Edit Website**, click text, change links, insert/upload images, reset a block, and **Save**. Header and footer edits are shared across pages. The **Media Library** controls the shared logo, home/team photos, image descriptions, and eleven video sources. Image uploads accept JPG/PNG/WebP/GIF up to 3 MB. Videos accept a YouTube watch/share URL or a hosted HTTPS MP4/WebM URL; upload large videos with your video hosting provider, then paste their URL. Empty fields restore placeholders. Uploaded but unused images remain in the dedicated store; there is no destructive media-delete control.

All displayed business claims, services, credentials, hours, offers, contact details and links are placeholders and must be reviewed by the owner. The intended admin email is **yangseng93@gmail.com**; the fictional public email is separate. No live account, password, invite or access grant has been created. Forms deliberately do not save or send data. Quiz results, custom quiz drafts, documents and dashboard activity inherited from the reference are browser-local demonstrations, not shared staff records or official certifications.

## Local development and checks

Use Node.js 22.16+ (or 24+) and npm.

```powershell
npm ci
npm run dev
# http://127.0.0.1:5501
npm run lint
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

The local server supports the same API handlers as Vercel and binds only to localhost. Unconfigured sites show static sample content and holders. Saving requires the owner-supplied environment and a dedicated private Blob store. `dist/` contains only the seven static pages and allowed public assets; never serve the repository root with a generic file server. Type checking covers server/media/build modules and their imported helpers; inherited browser scripts receive ESLint parsing, runtime and browser workflow checks. Tests use randomly generated, process-only credentials for a fictional identity and in-memory private storage. They never create a persistent account or contact the intended administrator.

## First administrator activation — owner action required

Only do this when you are ready to authorize the first admin. This repository contains no default login. An email configuration alone grants no access.

1. Run `npm run bootstrap` yourself in an interactive terminal. At the action-time prompt type `ACTIVATE` to confirm preparing access for **yangseng93@gmail.com**. Choose and confirm your own unique passphrase of 14–200 characters; input is hidden.
2. The script creates a new ignored `.bootstrap.env` containing only the email, a salted scrypt password hash, an independent random session signing key and the private-store setting. It does not print the password/hash/key, create a server account, or transmit anything. It refuses to overwrite an existing file. Keep this file protected with your OS account permissions/secret manager, particularly on Windows where POSIX mode bits are not an ACL.
3. For your eventual hosting setup, create a **new private Vercel Blob store dedicated to this project** and connect it. Do not reuse the reference site's store or token. Set `BLOB_ACCESS=private`, the supplied `BLOB_READ_WRITE_TOKEN`, and the three bootstrap values through your protected hosting environment. [Vercel private storage documentation](https://vercel.com/docs/vercel-blob/private-storage).
4. For local authenticated use, create ignored `.env.local` yourself with these values. For hosting, activate them only during a separately authorized deployment. Never commit local environment files. Remove the temporary bootstrap file once the values are safely stored.
5. Open `/admin`, sign in with **yangseng93@gmail.com** and the passphrase you chose, then edit the placeholders and media. The bootstrap identity has admin permissions only while the valid hash and signing key are configured. Re-run the script manually to prepare a rotated hash/key after removing or securing the previous bootstrap file; changing the hash invalidates old sessions. The bootstrap password is managed in the environment, not the dashboard.

Additional users can be created by an authenticated admin with admin/editor/viewer roles and hashed passwords stored privately. Reset/removal invalidates existing sessions on the next request. The project does not have an email delivery integration: no email invite/reset delivery is implied. Use the owner-run secure bootstrap flow for first activation/recovery. Account provisioning/reset should be confirmed with the owner at the time it is performed.

## Architecture and operating limits

- Plain HTML/CSS/JS; Node Vercel functions in `api/`; versioned JSON content/media in private Vercel Blob. No reference credentials, environment files, videos, photographs or Git history were copied.
- Signed HttpOnly, SameSite cookies (Secure behind HTTPS), independent signing key, CSRF custom header and origin checks, role checks, HTML sanitization, URL validation, image signature checks and bounded uploads.
- Private account JSON cannot be fetched through the media proxy; only `cms/images/` paths are served. The proxy intentionally makes selected website images public, never account records.
- Versioned storage retains twenty recent versions per document. The inherited retry strategy reduces overlapping-save losses but is not a transactional database; avoid simultaneous edits to the same field. Cloud storage integration must be verified with the owner's new store after configuration.
- Login includes a per-request guessing delay; for a public launch configure platform rate limiting/WAF rules for `/api/login`. No deployment is performed by this task or by CI.
- GitHub Actions runs lint, type checks, build, security/API tests and Chromium workflow tests; screenshots are uploaded as CI artifacts.

## Hosting configuration (future, only when separately authorized)

The checked-in Vercel configuration uses `npm run build`, `dist/` as public output, and root `api/` functions. Do not deploy until the owner authorizes it, configures private storage and secrets, replaces sample content and wires real form handling if needed. Builds and GitHub checks require no production secrets.
