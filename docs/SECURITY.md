# Security notes

What's hardened in the repo, why each exception exists, and what has to be set by hand in GitHub. Keep this file the
same on `main` and `world`.

## In the repo

**GitHub Actions** (`.github/workflows/deploy.yml`, identical on both branches)
- Every third-party action is pinned to a full commit SHA, with its version in a comment. Dependabot
  (`.github/dependabot.yml`) opens a weekly PR to bump them, for both branches.
- The top-level token is `contents: read`. Only the `deploy` job gets `pages: write` and `id-token: write`
  (it needs both to publish to Pages).
- Triggers are `push` to main/world and `workflow_dispatch`. Nothing uses `pull_request_target`, so a fork's PR
  never runs with secrets or a write token. Don't add `pull_request_target` without a very good reason.
- `actions/checkout` runs with `persist-credentials: false`, so the token isn't left in `.git/config` for the
  build steps.
- Installs use `npm ci` against the committed `package-lock.json`.

**Content-Security-Policy** (a `<meta>` tag in `index.html`)
- The panel build (`main`) uses exactly
  `default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self'`,
  plus `object-src 'none'; base-uri 'self'`. Those two only tighten it: no plugins, and an injected `<base>` tag
  can't move script URLs off-site.
- The 3D build (`world`) has the same policy with one exception: **Google Analytics**. `src/analytics.ts` loads
  `gtag.js` from `https://www.googletagmanager.com` and sends hits to `*.google-analytics.com` and
  `*.analytics.google.com`. These are the hosts Google documents for GA4. If GA is ever removed, take them out
  and the policy matches the panel's.
- `'unsafe-inline'` for styles is needed for the inline `<style>` in `index.html`, the HUD's `el.style`, and
  Phaser's canvas sizing. Scripts don't get `'unsafe-inline'` or `'unsafe-eval'`.
- `world`'s `public/404.html` and `public/preview/index.html` each have a tiny inline redirect script. Each page
  allows only that script, by its SHA-256 hash. **If you edit one of those scripts, update its hash** or the
  redirect stops working. To get the new hash:
  `python3 -c "import re,hashlib,base64,sys;s=re.search(r'<script>(.*?)</script>',open(sys.argv[1]).read(),re.S).group(1);print(base64.b64encode(hashlib.sha256(s.encode()).digest()).decode())" public/404.html`
- A `<meta>` CSP can't set `frame-ancestors`, so other sites can still frame the game. GitHub Pages can't send
  headers. If that ever matters, put the site behind a CDN that can (Cloudflare, for example).

**External resources.** The panel has none. The 3D build loads one: `gtag.js`. It can't be self-hosted or given
an SRI hash, because Google changes its contents without changing its URL. The CSP limits what it can reach, and
`analytics.ts` makes sure a blocked or failed load never breaks the game. There are no web fonts; text uses system
monospace.

**Service worker** (`world` only, from vite-plugin-pwa)
- Each build's precache is named after its commit (`kir-<commit>-precache-…`). A new worker installs into a fresh
  cache, takes over at once (`skipWaiting` + `clientsClaim`) and deletes older precaches
  (`cleanupOutdatedCaches`). The page asks for an update on load and whenever the app comes back to the
  foreground (`src/serviceWorker.ts`). The game isn't reloaded mid-shift; the next launch runs the new build.
- **Kill switch:** deploy a file at `/sw-kill.txt` (any content). Only the worker looks for it
  (`public/sw-kill.js`), and there's no timer. It checks:
  - when a new worker activates, and
  - on page loads and reloads anywhere on the site (`/panel/` included), at most once a minute per running worker.
    Browsers stop idle workers after about 30 seconds, so in practice nearly every launch checks.

  When the file is there, the worker deletes every cache and unregisters itself. A worker that was serving the page
  also reloads its open tabs once, so they come from the network. A worker that finds the file as it activates
  doesn't reload anything, which is what prevents a reload loop. While the file stays deployed, each visit installs
  the worker and it removes itself straight away, so the precache download happens on every visit; it's for
  emergencies. Remove the file and the next visit brings the worker back.
- The page never requests `sw-kill.txt` itself. The file is normally missing, and the browser would log the 404 as
  a console error on every load.
- `tests/sw.test.mjs` (world) builds the production site, serves it from `127.0.0.1` so the service worker really
  runs, and checks that `/`, `?safe=1` and `?safe=2` load with no console errors or CSP violations, that the cache
  is named for the build's commit, and that the kill switch works without a reload loop.

**Saved data** (`world` only; the panel stores nothing)
- Every key is under `kir:` (`src/storage.ts`). The old `kir-…` keys are moved across on the first load, so
  existing saves carry over.
- Loading a save (`src/world/save.ts`) never trusts it:
  - Any field of the wrong type gets a fresh game's value.
  - Numbers are clamped (day, minute, cash, rapport, competence, wear).
  - References to things that don't exist (an unknown fault, an upgrade, the current job) are dropped.
  - `__proto__`/`constructor` keys are ignored.
  - Finally, a throwaway copy of the loaded game plays on to the next morning. If that crashes, the save is
    refused and a fresh game starts.
- `tests/save.test.mjs` fuzzes every field and checks that the game still loads and plays.
- The streak, past leases, hints and settings are validated the same way when they're read.

## By hand in GitHub settings

These can't be set from the repo.

1. **Your account: two-factor authentication.** github.com → Settings → Password and authentication → enable 2FA.
   Use a passkey or an authenticator app rather than SMS, and save the recovery codes somewhere safe.
2. **Branch protection for `main` and `world`.** Repo → Settings → Rules → Rulesets → New branch ruleset, targeting
   both branches:
   - Restrict deletions; block force pushes.
   - Require a pull request before merging. Working solo, you can set 0 required approvals and still get the PR
     trail, or allow yourself as a bypass actor.
   - Require status checks to pass, if you add a CI check later.
   - Optional: require signed commits, and require linear history.
3. **Actions settings.** Repo → Settings → Actions → General:
   - *Actions permissions*: "Allow … actions and reusable workflows" limited to GitHub-authored actions (the
     workflow only uses `actions/*`). Also tick "Require actions to be pinned to a full-length commit SHA" if
     your plan offers it.
   - *Fork pull request workflows from outside collaborators*: "Require approval for all external contributors".
   - *Workflow permissions*: "Read repository contents and packages permissions" (the default token is
     read-only; the workflow asks for more where it needs it). Leave "Allow GitHub Actions to create and approve
     pull requests" **unticked**.
4. **Pages.** Repo → Settings → Pages:
   - Source: GitHub Actions.
   - Tick **Enforce HTTPS** for keepitrunning.fyi.
   - Verify the custom domain (account Settings → Pages → Add a domain), so nobody can take it over if the repo's
     Pages is ever turned off.
5. **Environment.** Repo → Settings → Environments → `github-pages` → Deployment branches: "Selected branches",
   `main` and `world` only.
6. **Security features.** Repo → Settings → Code security: turn on Dependabot alerts, Dependabot security updates,
   secret scanning, and push protection.
7. **Who has access.** Repo → Settings → Collaborators: check the list. Also review the GitHub Apps installed on the
   account (Settings → Applications) and remove any you no longer use.
