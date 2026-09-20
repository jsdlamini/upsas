# Running UPSAS locally in VS Code

## What runs today

Ten working screens, backed by an in-memory store — no database needed to run it.
Sign in at http://localhost:3000 with any demo account listed on the login page;
the password is `upsas-demo-passphrase`.

Start with `tmahlalela` (supervisor and assessor). `coordinator` sees the whole
cohort and can run every report, and will ask for a six-digit code — any six
digits work, because the TOTP verifier is not wired up yet.

Students sign in with their student number — try `209900105`, or `209900109` who has no
supervisor yet and can therefore rank topics and propose one. They confirm their own
consultations and see a result once it is released, but cannot yet book a session or
upload work.

`coordinator` signs in in two steps: password first, then a six-digit code on a second
screen. You do not retype the password.

A worked loop to try: sign in as `tmahlalela`, add a session on `/consultations` and
attest it; sign in as that student and confirm it; sign in as `coordinator`, clear the
moderation queue on `/publish` and release a result; sign back in as the student to see it.

Another: sign in as `209900109`, rank three topics and propose one to Dr Mahlalela; sign
in as `tmahlalela` and accept the proposal from `/topics`.

State resets when you restart the server. Topic allocation, nomination and
documentation marking are specified but not built.

## 1. Prerequisites

- **Node.js 22 or newer** — `node --version`. Earlier versions lack the built-in
  test runner flags this project uses.
- **VS Code** with the recommended extensions. Open the folder and VS Code will
  offer them from `.vscode/extensions.json`; Prisma is the one that matters, for
  schema syntax and formatting.
- **Docker Desktop** — only needed once you want a database. Everything below
  except migrations runs without it.

## 2. Open and install

```bash
git clone <your-repo> upsas && cd upsas
code .
npm install
```

`npm install` builds a native argon2 binding, so it takes a minute on first run.

Then in VS Code press <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> →
**TypeScript: Select TypeScript Version** → **Use Workspace Version**. Without
this, VS Code type-checks with its own bundled TypeScript and you will see
phantom errors that `npm run typecheck` does not report.

## 3. Prove it works before changing anything

```bash
npm test          # 68 tests
npm run typecheck # strict mode, should print nothing
```

If both are clean, the engine is behaving. `npm test` is the fastest way to know
you have not broken a mark calculation — run it before every commit.

## 4. Start the app

```bash
npm run dev
```

Open http://localhost:3000. You should see the two policy profiles computing
67.1% and 69.4% from identical inputs, the report catalogue, and resolved
permissions per role. http://localhost:3000/api/health returns `status: "ok"`
and an empty `configErrors` array — it returns 503 if a shipped policy profile
fails its own invariants, which is also what the container health check uses.

## 5. Generate the sample exports

```bash
npm run reports:samples
```

Writes the mark schedule, its manifest and the consultation register into
`samples/`. Run it twice and diff the CSVs — they are byte-identical, which is
what makes the manifest hash meaningful.

## 6. Add a database when you need one

Nothing above touches Postgres. You need it once you start writing persistence.

```bash
cp .env.example .env
```

Fill in three values, generating each with `openssl rand -base64 48`:
`POSTGRES_PASSWORD`, `SESSION_SECRET`, `TOTP_ENC_KEY`. Then set
`DATABASE_URL=postgresql://upsas:<that password>@localhost:5432/upsas`.

Start only the database, and keep running the app from your terminal so you keep
hot reload:

```bash
docker compose up -d db
npx prisma migrate dev --name init
npx prisma studio          # browse the tables at localhost:5555
```

`docker compose up --build` runs the whole stack in containers, but for
day-to-day work the database-only setup is faster.

## Debugging in VS Code

Three launch configurations are in `.vscode/launch.json`:

- **Debug the test file I'm looking at** — breakpoints in a test, F5, steps into
  the engine. This is the useful one when a mark comes out wrong.
- **Debug all tests**
- **Debug the dev server**

## Things that will trip you up

**Imports have no file extension.** `import { x } from './math'`, not
`'./math.js'`. Next's bundler will not resolve the explicit extension, and mixing
the two styles breaks the build rather than failing loudly at the import.

**`isolatedModules` is on**, because Next requires it. You cannot read an ambient
`const enum` from a dependency — `src/lib/auth/password.ts` inlines the argon2id
identifier for this reason, with a test pinning the value.

**The strict flags are deliberate.** `noUncheckedIndexedAccess` means
`array[0]` is possibly undefined and `exactOptionalPropertyTypes` means you
cannot assign `undefined` to an optional property. Both are noisy at first and
both have caught real bugs in the mark calculations. Please do not relax them.

**Native modules must be declared external.** `@node-rs/argon2` is a native addon;
if webpack bundles it the server process dies on the first password hash with
nothing in the log. It is listed in `serverExternalPackages` — add any other native
dependency there too.

**Dev-server state must be pinned to `globalThis`.** Next re-evaluates server
modules on hot reload, so an un-pinned module-level Map gets a fresh empty copy per
compiled route: you would be signed out on navigation and saved marks would vanish.
See the session table in `src/lib/auth/current.ts` for the pattern.

**Never edit a rubric's criteria or maxima in code.** They are transcribed from
the departmental forms. Rubrics change by forking a version through the admin
path, which leaves historical marks untouched.

## Where to start reading

1. `src/lib/assessment/compute.ts` — how a final mark is produced
2. `tests/engine.test.ts` — the two fixtures, and what the engine guarantees
3. `prisma/schema.prisma` — the domain model
4. `docs/agent-brief.md` — the specification this was built from
