# OAuth Setup Guide — Google, GitHub & Microsoft

A complete, beginner-friendly, end-to-end guide for enabling social sign-in on this
project's **custom OAuth implementation** (not Supabase, not Auth0 — the code already
lives in `backend/auth/`).

You do **not** need to change any code. Everything in this guide is configuration:
you register an app with each provider, copy two values (a Client ID and a Client
Secret) into an `.env` file, and restart the backend.

> **Assumed local URLs** (used throughout this guide):
> - Frontend: `http://localhost:5173`
> - Backend:  `http://localhost:8000`

---

## Table of contents

- [Part 1 — Overview (read this first)](#part-1--overview-read-this-first)
- [Part 2 — Google OAuth](#part-2--google-oauth)
- [Part 3 — GitHub OAuth](#part-3--github-oauth)
- [Part 4 — Microsoft OAuth](#part-4--microsoft-oauth)
- [Part 5 — Local Development reference](#part-5--local-development-reference)
- [Part 8 — Final Checklist](#part-8--final-checklist)

---

# Part 1 — Overview (read this first)

## 1.1 Why do I need to register an OAuth application?

When a user clicks **"Continue with Google"**, your backend sends them to Google to log
in. But Google will only talk to applications it *recognizes*. Registering an "OAuth
application" is how you tell Google (or GitHub, or Microsoft):

- *"This app named X is allowed to ask my users to log in."*
- *"After login, only send users back to these exact URLs"* (the **redirect URI**) — this
  prevents an attacker from hijacking the login flow.

In return, the provider gives you two secrets:

| Value | What it is | Secret? |
|-------|-----------|---------|
| **Client ID** | A public identifier for your app | No (visible in URLs) |
| **Client Secret** | A password proving requests really come from your server | **YES — never commit it** |

You must register **separately** with each provider you want to enable. There is no way
around this step — these IDs/secrets do not exist until you create them.

## 1.2 How does *this* implementation use the Client ID and Client Secret?

The flow is **OAuth 2.0 Authorization Code + PKCE**. Here is exactly what happens, mapped
to the real code:

```
1. User clicks "Continue with Google" in the browser.
   → Frontend links to:  GET http://localhost:8000/auth/oauth/google/start
        (frontend/src/api/client.ts  →  oauthStartUrl())

2. Backend /start builds the Google authorize URL using your CLIENT_ID + scopes,
   generates a PKCE verifier + signed `state`, stores them in a short-lived
   httpOnly cookie (`oauth_tx`), and 302-redirects the browser to Google.
        (backend/auth/router.py  →  oauth_start())
        (backend/auth/oauth.py   →  authorize_url())

3. User logs in at Google and approves. Google redirects the browser back to:
        http://localhost:8000/auth/oauth/google/callback?code=...&state=...

4. Backend /callback verifies the `state`, then exchanges the `code` for an access
   token. THIS is the step that uses your CLIENT_SECRET — it is sent server-to-server,
   never exposed to the browser.
        (backend/auth/oauth.py  →  _exchange_code()  →  uses client_id + client_secret)

5. Backend calls the provider's "userinfo" endpoint to get the user's email/name,
   creates (or links) a user + a personal organization, opens a server-side session,
   and 302-redirects the browser to:
        http://localhost:5173/auth/callback#token=<session-token>
        (backend/auth/router.py  →  oauth_callback())

6. The frontend reads the token from the URL fragment and logs the user in.
        (frontend/src/pages/AuthCallbackPage.tsx)
```

**Key rule baked into the code:** a provider's sign-in button only appears if **BOTH**
its Client ID and Client Secret are present in the environment. This is decided in
`backend/config.py → oauth_provider_config()`:

```python
def oauth_provider_config(provider: str) -> dict | None:
    p = provider.upper()
    cid    = os.getenv(f"{p}_CLIENT_ID")
    secret = os.getenv(f"{p}_CLIENT_SECRET")
    if cid and secret:
        return {"client_id": cid, "client_secret": secret}
    return None   # ← provider stays hidden if either value is missing
```

So if you set only the ID but not the secret, **nothing happens and no error shows** —
the provider is simply treated as "not configured." This is the #1 cause of "my button
isn't appearing."

## 1.3 What redirect URI does the backend expect?

The redirect URI is **built automatically** from the `APP_BASE_URL` environment variable
in `backend/auth/oauth.py`:

```python
def redirect_uri(provider: str) -> str:
    return f"{config.APP_BASE_URL}/auth/oauth/{provider}/callback"
```

`APP_BASE_URL` defaults to `http://localhost:8000`. So for local development the exact
redirect URIs you must register are:

| Provider  | Redirect URI to register (copy exactly) |
|-----------|------------------------------------------|
| Google    | `http://localhost:8000/auth/oauth/google/callback` |
| GitHub    | `http://localhost:8000/auth/oauth/github/callback` |
| Microsoft | `http://localhost:8000/auth/oauth/microsoft/callback` |

> ⚠️ These must match **character-for-character** in the provider console — including the
> scheme (`http` vs `https`), the host, the port, and no trailing slash. A single
> mismatch produces `redirect_uri_mismatch`.

## 1.4 Where in the code are these values used? (quick map)

| Concern | File | Symbol |
|---|---|---|
| Reads `*_CLIENT_ID` / `*_CLIENT_SECRET` from env | `backend/config.py` | `oauth_provider_config()` |
| Builds the redirect URI from `APP_BASE_URL` | `backend/auth/oauth.py` | `redirect_uri()` |
| Provider endpoints + scopes (Google/GitHub/Microsoft) | `backend/auth/oauth.py` | `_PROVIDERS` |
| Lists which providers are enabled | `backend/auth/oauth.py` | `enabled_providers()` |
| `/auth/providers` API (frontend reads this) | `backend/auth/router.py` | `providers()` |
| `/auth/oauth/{provider}/start` | `backend/auth/router.py` | `oauth_start()` |
| `/auth/oauth/{provider}/callback` | `backend/auth/router.py` | `oauth_callback()` |
| Exchanges code using the secret | `backend/auth/oauth.py` | `_exchange_code()` |
| Redirect back to the frontend | `backend/config.py` | `FRONTEND_URL` |
| Renders the sign-in buttons | `frontend/src/pages/SignInPage.tsx` | `OAuthButtons` |
| Completes login on return | `frontend/src/pages/AuthCallbackPage.tsx` | `AuthCallbackPage` |

## 1.5 Where do the values go? (the `.env` file)

The backend loads environment variables from a `.env` file via `load_dotenv()` (called in
`backend/database.py`). `load_dotenv()` searches from the **current working directory** you
start the backend in, walking upward. So:

- **If you start the backend from inside `backend/`** (e.g. `uvicorn main:app ...`), put the
  values in **`backend/.env`**.
- **If you run via `docker-compose` from the repo root**, compose reads the **repo-root
  `.env`** (see `.env.example` at the project root, which is already templated for you).

This guide uses **`backend/.env`** because that's what you asked for. Create the file if it
doesn't exist:

```bash
# from the backend/ folder
cp ../.env.example .env     # optional starting point; or create an empty backend/.env
```

A complete `backend/.env` for all three providers looks like this (fill in real values as
you complete Parts 2–4):

```dotenv
# ── OAuth providers (a button appears only when BOTH id and secret are set) ──
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# ── URLs used to build redirect/callback (defaults are fine for local dev) ──
APP_BASE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173

# ── CORS: the browser origins allowed to call the backend ──
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

> 🔒 `backend/.env` must **never** be committed to git. Confirm it's git-ignored (it should
> be already). Treat every `*_CLIENT_SECRET` like a password.

---

# Part 2 — Google OAuth

We'll start completely from scratch. Total time: ~10 minutes.

### Step 1 — Create a Google Cloud project

1. Go to **https://console.cloud.google.com/**.
2. Sign in with the Google account you want to own this app.
3. At the very top of the page, click the **project dropdown** (it may say "Select a
   project").
4. Click **New Project** (top-right of the dialog).
5. **Name:** e.g. `GenAI Test Automation` (this is internal; users won't necessarily see
   it). Leave Organization/Location as-is if you're an individual.
6. Click **Create**, then wait a few seconds and make sure the new project is **selected**
   in the top dropdown before continuing.

### Step 2 — Enable the required APIs

For "Sign in with Google" you mainly need the OAuth consent + the userinfo endpoints,
which are part of the core identity APIs. To be safe:

1. Left menu → **APIs & Services → Library**.
2. Search for **"Google People API"** → open it → click **Enable**. (This backs the
   profile/email userinfo lookup.)
3. (You do **not** need Gmail, Drive, etc. This implementation only reads basic profile +
   email.)

> Note: modern "Sign in with Google" using the OpenID Connect `userinfo` endpoint
> (which this app uses — see `_PROVIDERS["google"]["userinfo"]`) generally works once the
> consent screen + credentials exist. Enabling the People API removes a common edge-case
> 403 on the userinfo call.

### Step 3 — Configure the OAuth Consent Screen

1. Left menu → **APIs & Services → OAuth consent screen**.
2. You'll be asked to choose a **User Type** — see Step 4 for what to pick.
3. Fill in:
   - **App name:** what users see on the Google login screen (e.g. `GenAI Test Automation`).
   - **User support email:** your email.
   - **App logo:** optional for testing.
   - **Developer contact email:** your email (required).
4. Click **Save and Continue** through the Scopes and Test Users steps (configured below).

### Step 4 — Internal vs External (what to choose)

When prompted for **User Type**:

| Option | Choose it when | Effect |
|--------|----------------|--------|
| **Internal** | Your Google account belongs to a **Google Workspace organization** AND only people in that org will log in | No verification needed; only org members can sign in |
| **External** | You're using a personal `@gmail.com`, OR users outside your org must log in | Available to any Google user, but starts in "Testing" mode (see Step 5) |

**For most people developing locally with a personal Gmail account: choose `External`.**
(`Internal` is simply not offered to personal accounts.)

### Step 5 — Publishing Status (Testing vs In production)

After creating the consent screen, it has a **Publishing status**:

- **Testing** (default): Only accounts you explicitly add as **Test Users** can log in.
  Tokens behave normally. This is perfect for local development — **leave it in Testing.**
- **In production**: Anyone with a Google account can log in, but if you request sensitive
  scopes Google may require an app verification/review. We don't need this for local dev.

> ✅ **For this guide, keep Publishing status = Testing.** You only "Publish" when you
> deploy a real product to real external users.

### Step 6 — Test Users

Because an External app in "Testing" only allows approved accounts:

1. On the **OAuth consent screen** page, find the **Test users** section.
2. Click **+ Add Users**.
3. Add the Gmail address(es) you'll actually use to test login (including your own).
4. Click **Save**.

> ❗ If you try to log in with an email that is **not** in this list while in Testing mode,
> Google shows **"Access blocked: App has not completed verification"** / `access_denied`.
> The fix is simply to add that email as a Test User. This is **expected** in development.

### Step 7 — Create OAuth Client Credentials

1. Left menu → **APIs & Services → Credentials**.
2. Click **+ Create Credentials** (top) → **OAuth client ID**.

### Step 8 — Application type (exactly which one)

When asked for **Application type**, choose:

> **Web application**

(Do **not** choose "Desktop", "Android", "iOS", or "TVs". Our backend is a server that
holds the Client Secret, which is a confidential **Web application**.)

Give it a **Name** like `GenAI backend (local)`.

### Step 9 — Authorized redirect URI (exactly what to enter)

Under **Authorized redirect URIs**, click **+ Add URI** and enter **exactly**:

```
http://localhost:8000/auth/oauth/google/callback
```

> Copy/paste this. No trailing slash. `http` (not `https`) for local. Port `8000`.

### Step 10 — Authorized JavaScript origins (which origins to enter)

Under **Authorized JavaScript origins**, add your **frontend** origin:

```
http://localhost:5173
```

> Why the frontend and not the backend? "JavaScript origins" is where browser-side calls
> may originate. Our redirect is server-side, but adding the frontend origin here is the
> safe, conventional choice and avoids origin-related warnings. You may also add
> `http://localhost:8000` if you wish; it does no harm.

Click **Create**.

### Step 11 — Required scopes

This implementation hard-codes the Google scopes (you do **not** type these in the console
unless you go through the "Add or remove scopes" screen, where the basic ones are usually
preselected):

```
openid email profile
```

These are the standard OpenID Connect scopes — they give the app the user's stable ID,
email address, and basic profile (name + avatar). No sensitive scopes are requested, which
is why no Google verification is required for testing.

### Step 12 — Which values become GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET

After clicking Create, a dialog shows two values:

| Dialog label | Goes into |
|--------------|-----------|
| **Your Client ID** (ends in `.apps.googleusercontent.com`) | `GOOGLE_CLIENT_ID` |
| **Your Client Secret** (random string, often starts `GOCSPX-`) | `GOOGLE_CLIENT_SECRET` |

Click **Download JSON** if you want a backup, then **OK**. (You can re-open the client
later from Credentials to view these again.)

### Step 13 — Put them in backend/.env

Open (or create) `backend/.env` and set:

```dotenv
GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_secret_here
```

(No quotes needed. No spaces around `=`.)

### Step 14 — Restart the backend

Environment variables are read at **startup**, so you must restart for the change to take
effect.

```bash
# from the backend/ folder, stop the running server (Ctrl+C) then:
uvicorn main:app --reload --port 8000
# (or however you normally launch it — e.g. ./venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000 on Windows)
```

> `--reload` restarts on **code** changes but **not** on `.env` changes — always do a full
> stop/start after editing `.env`.

### Step 15 — Verify `/auth/providers` now returns Google

In a terminal:

```bash
curl http://localhost:8000/auth/providers
```

Expected response (note `"google"` is now present):

```json
{"oauth":["google"],"legacy_password":true}
```

If `oauth` is empty `[]`, then either the env vars aren't set, only one of the two is set,
or the backend wasn't restarted. Re-check Step 13 + Step 14.

### Step 16 — Verify the Google button appears

1. Open the frontend: **http://localhost:5173/signin**.
2. You should now see a **"Continue with Google"** button above the email/password form.
   (The buttons are rendered by `OAuthButtons` in `SignInPage.tsx`, which calls
   `/auth/providers`.)

If the button doesn't appear: hard-refresh the page (Ctrl+Shift+R), confirm Step 15
returned `"google"`, and check the browser console for a failed `/auth/providers` call
(usually a CORS or backend-not-running issue — see Part 5).

### Step 17 — Test login

1. Click **Continue with Google**.
2. You're sent to Google → pick/enter a **Test User** account → approve the consent screen.
3. Google redirects back to `http://localhost:8000/auth/oauth/google/callback`, the backend
   exchanges the code, and then forwards you to
   `http://localhost:5173/auth/callback#token=...`.
4. You should land logged-in on **`/app/dashboard`**.

### Step 18 — Common Google errors

| Error | Meaning | Fix |
|-------|---------|-----|
| **`redirect_uri_mismatch`** | The redirect URI the app sent doesn't exactly match what's registered | Make the Authorized redirect URI **exactly** `http://localhost:8000/auth/oauth/google/callback`. Check scheme/host/port/no trailing slash. Also confirm `APP_BASE_URL` in `.env` is `http://localhost:8000`. |
| **`invalid_client`** | Wrong/empty Client ID or Secret, or secret mismatched to ID | Re-copy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, ensure they're from the **same** OAuth client, restart backend. |
| **`invalid_scope`** | A requested scope isn't allowed/recognized | Our scopes (`openid email profile`) are standard; this usually means the consent screen wasn't fully configured. Re-complete Step 3. |
| **`access_blocked` / "Access blocked: this app's request is invalid"** | Consent screen misconfig OR you're using a non-test account in Testing mode | Add your email as a **Test User** (Step 6), and ensure the consent screen has app name + support email set. |
| **"app not verified" / "Google hasn't verified this app"** | App is External + Testing and requests non-trivial scopes | **Expected in development.** Click **Advanced → Go to {app} (unsafe)** to proceed, or just use a Test User. Only matters for public production launch. |
| **`403` on userinfo / People API** | The People API isn't enabled | Enable **Google People API** (Step 2), wait ~1 min, retry. |

### Step 19 — Which Google errors are *expected* during local development?

These are **normal** and do **not** indicate a broken setup:

- **"Google hasn't verified this app"** warning screen → expected for External+Testing.
  Click through with **Advanced → Go to … (unsafe)**.
- **`access_denied` when using a non-test account** → expected; only Test Users may log in
  while in Testing mode.
- The app **not** being publicly searchable/usable by arbitrary Google accounts → expected;
  that requires Publishing + (sometimes) verification, which you do later for production.

---

# Part 3 — GitHub OAuth

GitHub is the simplest of the three. Total time: ~5 minutes.

### Step 1 — Open the OAuth Apps page

1. Go to **https://github.com/settings/developers** (or: your avatar → **Settings** →
   **Developer settings** in the left sidebar).
2. Click **OAuth Apps** → **New OAuth App**.

> Note: choose **"OAuth Apps"**, *not* "GitHub Apps." This implementation uses the classic
> OAuth App flow.

### Step 2 — Fill in the registration form

| Field | Value to enter |
|-------|----------------|
| **Application name** | `GenAI Test Automation` (users see this on the authorize screen) |
| **Homepage URL** | `http://localhost:5173` |
| **Application description** | Optional |
| **Authorization callback URL** | `http://localhost:8000/auth/oauth/github/callback` ← **must be exact** |

> The **callback URL** is the single most important field — it must match
> `http://localhost:8000/auth/oauth/github/callback` exactly (no trailing slash).

Leave **"Enable Device Flow"** unchecked. Click **Register application**.

### Step 3 — Get the Client ID and create the Client Secret

After registering, you land on the app's page:

1. **Client ID** is shown immediately → this is `GITHUB_CLIENT_ID`.
2. Click **Generate a new client secret** → GitHub shows the secret **once**.
3. Copy it immediately → this is `GITHUB_CLIENT_SECRET`. (If you lose it, generate a new
   one and update `.env`.)

### Step 4 — Which values to copy

| GitHub label | Goes into |
|--------------|-----------|
| **Client ID** | `GITHUB_CLIENT_ID` |
| **Client secret** (the value shown after "Generate a new client secret") | `GITHUB_CLIENT_SECRET` |

### Step 5 — Where to configure them

In `backend/.env`:

```dotenv
GITHUB_CLIENT_ID=Iv1.abc123def456
GITHUB_CLIENT_SECRET=your_github_secret_here
```

Then **restart the backend** (same as Part 2, Step 14).

### Step 6 — Scopes (already handled by the code)

This implementation requests these GitHub scopes automatically (you don't enter them in the
GitHub UI):

```
read:user user:email
```

`user:email` is important: many GitHub users keep their email private, so the backend makes
an extra call to `https://api.github.com/user/emails` to fetch the **primary, verified**
email (see `fetch_identity()` in `backend/auth/oauth.py`). Without `user:email`, login can
fail with "Provider did not return an email."

### Step 7 — Test

1. `curl http://localhost:8000/auth/providers` → should now include `"github"`.
2. Open **http://localhost:5173/signin** → a **"Continue with GitHub"** button appears.
3. Click it → authorize on GitHub → you should be redirected back and logged in.

### Step 8 — Common GitHub OAuth errors

| Error | Meaning | Fix |
|-------|---------|-----|
| **"The redirect_uri MUST match the registered callback URL"** | Callback URL mismatch | Set **Authorization callback URL** to exactly `http://localhost:8000/auth/oauth/github/callback`. |
| **`bad_verification_code`** | The auth code was reused/expired, or clock/secret mismatch | Don't reload the callback URL manually; start a fresh login. Confirm the secret is correct. |
| **`incorrect_client_credentials`** | Wrong Client ID/Secret pair | Re-copy both values; regenerate the secret if unsure; restart backend. |
| **"Provider did not return an email"** (400 from our callback) | The GitHub account's email is private and/or unverified | Add and **verify** an email in GitHub → Settings → Emails, and mark one as **primary**. The `user:email` scope (already requested) then returns it. |
| **Button doesn't appear** | Only one of ID/secret set, or backend not restarted | Set both `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`; restart; re-check `/auth/providers`. |

> Note: GitHub OAuth Apps don't implement PKCE, but they safely ignore the extra PKCE
> parameters our backend sends and authenticate with the Client Secret instead — so login
> works without any change.

---

# Part 4 — Microsoft OAuth

Microsoft uses **Microsoft Entra ID** (the new name for "Azure Active Directory") in the
**Azure Portal**. Total time: ~10 minutes. The terminology is the most confusing of the
three, so follow carefully.

### Step 1 — Open the Azure Portal / Entra ID

1. Go to **https://portal.azure.com/** and sign in with a Microsoft account.
   (A free personal Microsoft account works; you don't need a paid Azure subscription to
   register an app.)
2. In the top search bar, type **"Microsoft Entra ID"** and open it.
   (If you see the older name "Azure Active Directory," that's the same thing.)

### Step 2 — Create an App Registration

1. In the left menu of Entra ID, click **App registrations**.
2. Click **+ New registration** (top).

### Step 3 — Fill in the registration

| Field | Value |
|-------|-------|
| **Name** | `GenAI Test Automation` (users may see this) |
| **Supported account types** | See Step 4 below |
| **Redirect URI** | Platform = **Web**; value = `http://localhost:8000/auth/oauth/microsoft/callback` |

> For the Redirect URI dropdown, you **must** pick the **Web** platform (not "SPA", not
> "Public client"). Our backend is a confidential web app holding a secret.

### Step 4 — Supported account types (which to choose)

| Option | Choose it when |
|--------|----------------|
| **Accounts in this organizational directory only** (single tenant) | Only your company's Entra users will log in |
| **Accounts in any organizational directory** (multi-tenant) | Any company's Entra users, but not personal accounts |
| **Accounts in any org directory AND personal Microsoft accounts** | **Recommended for general use** — lets both work/school accounts and personal `@outlook.com`/`@hotmail.com` accounts log in |

**Recommended: "Accounts in any organizational directory and personal Microsoft accounts."**

> Why it matters: this implementation uses the **`common`** authority endpoint
> (`https://login.microsoftonline.com/common/...` — see `_PROVIDERS["microsoft"]` in
> `backend/auth/oauth.py`). The `common` endpoint expects the app to allow **both** org and
> personal accounts. If you register the app as *single-tenant only* but the code uses
> `common`, some users get **`AADSTS50194`** / **`AADSTS700016`** errors. Picking the
> "any org + personal accounts" option keeps it consistent with the `common` endpoint.

Click **Register**.

### Step 5 — Copy the Client ID (Application ID)

On the app's **Overview** page after registration:

| Azure label | Goes into |
|-------------|-----------|
| **Application (client) ID** | `MICROSOFT_CLIENT_ID` |

(You can ignore "Directory (tenant) ID" — the code uses `common`, not your tenant ID.)

### Step 6 — Create a Client Secret

1. In the app's left menu, click **Certificates & secrets**.
2. Under **Client secrets**, click **+ New client secret**.
3. **Description:** e.g. `local-dev`. **Expires:** pick a duration (e.g. 6 months — note
   that it **will** expire and you'll need to create a new one later).
4. Click **Add**.
5. **Immediately copy the `Value` column** (not the "Secret ID"). This is shown **once**.

| Azure label | Goes into |
|-------------|-----------|
| Client secret **Value** (a long string) | `MICROSOFT_CLIENT_SECRET` |

> ⚠️ Copy the **Value**, NOT the **Secret ID**. The Secret ID is a GUID that looks
> important but is useless for OAuth. Mixing these up causes `invalid_client`.

### Step 7 — API permissions

1. Left menu → **API permissions**.
2. By default you'll see **Microsoft Graph → User.Read** (Delegated). That's enough — it
   lets the app read the signed-in user's basic profile.
3. If `User.Read` is missing: **+ Add a permission → Microsoft Graph → Delegated
   permissions →** search **`User.Read`** → check it → **Add permissions**.
4. The scopes our code requests (`openid email profile`) are standard OIDC scopes and are
   granted by user consent at login — no admin consent is required for personal/standard
   accounts.

> You do **not** need to click "Grant admin consent" for local development with personal
> accounts. (You might for a locked-down corporate tenant.)

### Step 8 — Confirm the Redirect URI

Go to **Authentication** in the left menu and confirm under **Web → Redirect URIs** that
this exact value is present:

```
http://localhost:8000/auth/oauth/microsoft/callback
```

If you need to add it: **+ Add a platform → Web →** enter the URI → **Configure**.

### Step 9 — Which values map to MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET

| Source in Azure | `.env` variable |
|-----------------|-----------------|
| Overview → **Application (client) ID** | `MICROSOFT_CLIENT_ID` |
| Certificates & secrets → client secret **Value** | `MICROSOFT_CLIENT_SECRET` |

In `backend/.env`:

```dotenv
MICROSOFT_CLIENT_ID=00000000-1111-2222-3333-444444444444
MICROSOFT_CLIENT_SECRET=your_secret_VALUE_here
```

Then **restart the backend**.

### Step 10 — Test

1. `curl http://localhost:8000/auth/providers` → should now include `"microsoft"`.
2. Open **http://localhost:5173/signin** → **"Continue with Microsoft"** button appears.
3. Click it → sign in with a Microsoft account → approve → you should land logged-in.

### Step 11 — Common Azure/Microsoft mistakes

| Error / mistake | Meaning | Fix |
|-----------------|---------|-----|
| **Copied the Secret ID instead of the Value** | `invalid_client` at token exchange | Re-open Certificates & secrets, copy the **Value** (create a new secret if the value is no longer visible). |
| **`AADSTS50011` redirect URI mismatch** | Registered redirect URI ≠ what the app sends | Add exactly `http://localhost:8000/auth/oauth/microsoft/callback` under **Authentication → Web**. |
| **`AADSTS700016` / `AADSTS50194` (app not found in directory / not multi-tenant)** | App registered as single-tenant but code uses the `common` endpoint | Set **Supported account types** to "any org directory **and** personal Microsoft accounts" (Step 4). |
| **Chose platform "SPA" or "Public client"** | Token exchange with a secret is rejected | The redirect URI must be under the **Web** platform. Remove the SPA entry; add it under Web. |
| **Secret expired** | Login suddenly breaks weeks later with `invalid_client` | Create a new client secret and update `MICROSOFT_CLIENT_SECRET`; restart. |
| **`AADSTS65001` consent required** | User/admin hasn't consented | For a corporate tenant, an admin may need to **Grant admin consent** on API permissions; for personal accounts, just approve at login. |

---

# Part 5 — Local Development reference

Everything you need for `http://localhost:5173` (frontend) + `http://localhost:8000`
(backend) in one place.

### 5.1 Redirect / Callback URLs to register (per provider)

These are all the **same shape**: `http://localhost:8000/auth/oauth/<provider>/callback`.

| Provider  | Where you register it | Exact value |
|-----------|------------------------|-------------|
| Google    | Cloud Console → Credentials → *Authorized redirect URIs* | `http://localhost:8000/auth/oauth/google/callback` |
| GitHub    | OAuth App → *Authorization callback URL* | `http://localhost:8000/auth/oauth/github/callback` |
| Microsoft | Entra app → Authentication → Web → *Redirect URIs* | `http://localhost:8000/auth/oauth/microsoft/callback` |

### 5.2 Origins to register

| Where | Value | Notes |
|-------|-------|-------|
| Google → *Authorized JavaScript origins* | `http://localhost:5173` | Frontend origin (optionally also add `http://localhost:8000`) |
| GitHub → *Homepage URL* | `http://localhost:5173` | Informational |
| Microsoft | (no separate origins field for Web platform) | — |

### 5.3 The `.env` values that drive the URLs

In `backend/.env`:

```dotenv
APP_BASE_URL=http://localhost:8000     # → builds the redirect URI sent to providers
FRONTEND_URL=http://localhost:5173     # → where the callback sends the user back with a token
```

- Change `APP_BASE_URL` ⇒ you **must** update the registered redirect URI in **every**
  provider console to match.
- Change `FRONTEND_URL` ⇒ the post-login redirect target changes (no provider update
  needed).

### 5.4 CORS settings

The backend only accepts browser calls from origins in `ALLOWED_ORIGINS`
(`backend/main.py`). The default already includes the local frontend:

```
http://localhost:5173, http://localhost:3000, http://127.0.0.1:5173
```

To be explicit in `backend/.env`:

```dotenv
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

> Pick **one** address style and use it consistently. `localhost` and `127.0.0.1` are
> treated as **different origins** by the browser. If your frontend runs on
> `http://localhost:5173`, browse to it via `localhost` (not `127.0.0.1`) so cookies and
> CORS line up. The OAuth `oauth_tx` state cookie (set on the backend during `/start`) is
> `SameSite=Lax` and, in dev, **not** `Secure` — so plain `http://localhost` works.

### 5.5 Browser / firewall gotchas

- **Both servers must be running:** backend on `:8000`, frontend on `:5173`. If the
  sign-in page can't reach `/auth/providers`, no buttons render.
- **Hard refresh** the sign-in page after enabling a provider (Ctrl+Shift+R) — the provider
  list is fetched on page load.
- **Ad/privacy blockers** that block third-party cookies are usually fine here because the
  `oauth_tx` cookie is **first-party to the backend** (`localhost:8000`). But aggressive
  "block all cookies" settings can break the `state` check → "Invalid or expired OAuth
  state." Allow cookies for `localhost`.
- **Corporate firewall/VPN** may block `login.microsoftonline.com` or
  `accounts.google.com`. If the provider page itself won't load, try off-VPN.
- **Windows Firewall prompt** the first time you start uvicorn — allow it for local
  networking.
- **Don't open the callback URL by hand.** Authorization `code`s are single-use; manually
  refreshing `/auth/oauth/.../callback` yields code-reuse errors. Always start from the
  sign-in button.

---

# Part 8 — Final Checklist

Tick every box. If login fails, the failing box is almost always the cause.

### ✅ Google

- [ ] Google Cloud **project** created and selected.
- [ ] **Google People API** enabled.
- [ ] **OAuth consent screen** configured (app name + support email + developer email).
- [ ] User type = **External** (or Internal for Workspace-only).
- [ ] Publishing status = **Testing** (fine for dev).
- [ ] Your login email added under **Test users**.
- [ ] OAuth client created with type = **Web application**.
- [ ] Redirect URI = `http://localhost:8000/auth/oauth/google/callback` (exact).
- [ ] JavaScript origin = `http://localhost:5173`.
- [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` set in `backend/.env`.
- [ ] Backend restarted.
- [ ] `curl http://localhost:8000/auth/providers` includes `"google"`.
- [ ] "Continue with Google" button visible at `/signin`.
- [ ] Full login round-trip lands on `/app/dashboard`.

### ✅ GitHub

- [ ] **OAuth App** created (Settings → Developer settings → OAuth Apps).
- [ ] Homepage URL = `http://localhost:5173`.
- [ ] Authorization callback URL = `http://localhost:8000/auth/oauth/github/callback` (exact).
- [ ] **Client secret** generated and copied.
- [ ] `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` set in `backend/.env`.
- [ ] Backend restarted.
- [ ] `curl http://localhost:8000/auth/providers` includes `"github"`.
- [ ] "Continue with GitHub" button visible at `/signin`.
- [ ] Test account has a **verified primary email** (so login returns an email).
- [ ] Full login round-trip lands on `/app/dashboard`.

### ✅ Microsoft

- [ ] **App registration** created in Microsoft Entra ID.
- [ ] Supported account types = **any org directory + personal Microsoft accounts**.
- [ ] Platform = **Web**, Redirect URI = `http://localhost:8000/auth/oauth/microsoft/callback` (exact).
- [ ] **Application (client) ID** copied → `MICROSOFT_CLIENT_ID`.
- [ ] Client secret **Value** (not Secret ID) copied → `MICROSOFT_CLIENT_SECRET`.
- [ ] API permission **Microsoft Graph → User.Read** present.
- [ ] `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` set in `backend/.env`.
- [ ] Backend restarted.
- [ ] `curl http://localhost:8000/auth/providers` includes `"microsoft"`.
- [ ] "Continue with Microsoft" button visible at `/signin`.
- [ ] Full login round-trip lands on `/app/dashboard`.

### ✅ Shared / environment

- [ ] `backend/.env` exists and is **git-ignored** (secrets never committed).
- [ ] `APP_BASE_URL=http://localhost:8000` and `FRONTEND_URL=http://localhost:5173`.
- [ ] `ALLOWED_ORIGINS` includes `http://localhost:5173`.
- [ ] Backend running on `:8000`, frontend on `:5173`.
- [ ] You browse the app via the **same** host style (`localhost`) you registered.

### Final "all three working" check

```bash
curl http://localhost:8000/auth/providers
# Expected when all three are configured:
# {"oauth":["google","github","microsoft"],"legacy_password":true}
```

If all three appear in that list **and** each button completes a login round-trip to
`/app/dashboard`, your OAuth setup is fully working. 🎉

---

## Appendix — Production notes (when you deploy beyond localhost)

Not required for local dev, but for later:

1. Set `APP_BASE_URL=https://api.yourdomain.com` and `FRONTEND_URL=https://app.yourdomain.com`
   in the deployed environment.
2. In **each** provider console, **add** the production redirect URI
   (`https://api.yourdomain.com/auth/oauth/<provider>/callback`) alongside the localhost one.
3. Set `ALLOWED_ORIGINS=https://app.yourdomain.com` (no wildcards — the backend refuses to
   boot in production with `*` or unset; see `backend/config.py`).
4. Google: **Publish** the consent screen (and complete verification if you request
   sensitive scopes). Microsoft: ensure the client secret hasn't expired. GitHub: consider a
   separate OAuth App per environment.
5. Over HTTPS in production, the `oauth_tx` state cookie automatically becomes `Secure`
   (the code keys this off `is_production()`).
