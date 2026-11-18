# Password Hackathon — prjK3

Complete static frontend and Node.js API, using only built-in Node modules. No npm dependencies to install. prjK3 is the instructor's example team: replace it with YOUR real team before submitting.

## 1. Run on your Mac

Install Node.js 22.9+ (24 LTS also works). Open two Terminal windows in the extracted folder.

Terminal 1:

```sh
cd backend
npm run setup
npm start
```

Terminal 2:

```sh
cd frontend
npm start
```

Open http://localhost:5500 (do not open index.html as a file).
Login: admin / BCIT12. You should see defaultSecret and your browser's current date/time. Test Page 1, Page 2, refresh, and Logout.

Local HTTP on different ports is for development ONLY. You must deploy BOTH applications to separate HTTPS origins for marks.

## 2. Put your real team number in these places

- backend/.env: TEAM_NAME
- frontend/config.js: team
- Both deployed URL hostnames or actual path prefixes
- Rename the submission ZIP to YOURTEAM_passwordHackathon.zip

Changing the backend team value changes API routes automatically. The frontend's configured team must match. Values are case-sensitive.

## 3. Deploy two separate applications

Use a static HTTPS host for frontend and a Node.js HTTPS service for backend. Keep the backend awake during class; a sleeping service or slow cold start can fail verification. External hosting is still required; this ZIP does not deploy anything for you.

Example architecture (replace example.com with a domain you control):

- Frontend: https://prjk3-web.example.com
- Backend: https://prjk3-api.example.com/prjK3

These are different origins (different hostnames) but the same site (same registrable domain and HTTPS). This is the most reliable cookie arrangement. The team appears in both URLs. Do not put frontend and API behind a single origin.

Backend service configuration:

- Root directory: backend
- Runtime: Node.js 22.9+ or 24
- Build command: no build needed (use npm install if your host requires one)
- Start command: npm start
- Health check: /prjK3/api/health
- Let the platform assign PORT. Its HTTPS reverse proxy must forward requests to Node.
- Configure the following environment variables on the host (NOT in frontend/config.js):

```text
TEAM_NAME=prjK3
FRONTEND_ORIGIN=https://prjk3-web.example.com
ADMIN_PASSWORD=BCIT12
APP_SECRET=defaultSecret
JWT_SIGNING_KEY=YOUR_64_CHARACTER_RANDOM_HEX_KEY
COOKIE_SECURE=true
COOKIE_SAMESITE=Lax
NODE_ENV=production
```

Generate the signing key ONCE with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep this key private and unchanged through every restart and Phase 2. Do not use the example test key. A separate persistent signing key is essential: password changes must not invalidate old JWTs.

Frontend service configuration:

- Root/publish directory: frontend
- No build command required; publish static files
- Before publishing, edit frontend/config.js:

```js
window.APP_CONFIG = Object.freeze({
  team: 'prjK3',
  apiOrigin: 'https://prjk3-api.example.com'
});
```

FRONTEND_ORIGIN is the exact frontend origin (scheme + hostname + optional port), with no path, hash, or trailing slash. apiOrigin is the backend origin, also without a path. The frontend appends /prjK3/api itself.

If your frontend and backend use DIFFERENT SITES, set COOKIE_SAMESITE=None and COOKIE_SECURE=true. Browsers may still block third-party cookies; this setting does not override privacy restrictions. Test on the actual browser before class, and prefer two subdomains of one registrable domain. Different origins do not require different sites.

Configure static-host headers if supported:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src https://prjk3-api.example.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'
```

Replace the API hostname above. CSP frame-ancestors must be an HTTP response header. Do not add inline scripts or secrets to the public frontend. Do not publish the backend directory as static files. The backend .env file is private and excluded from this ZIP.

## 4. Phase 1 verification checklist

1. Open the HTTPS frontend from a private window.
2. Confirm admin / BCIT12 works and defaultSecret is visible.
3. Confirm team number and browser date/time are readable.
4. Visit Page 1 and Page 2, then refresh each.
5. Logout, then try #/admin, #/page1, and #/page2: each redirects to Login.
6. In DevTools > Network, verify requests go to the separate HTTPS API origin.
7. In DevTools > Application/Storage > Cookies, inspect the API cookie: HttpOnly, Secure, Max-Age=10800 (three hours). A cookie may be visible in DevTools while inaccessible to page JavaScript.
8. Verify API /prjK3/api/admin returns 401 without a cookie.
9. Arrange another team's verification and screenshot before Phase 2.
10. Submit clickable HTTPS frontend AND backend URLs in Learning Hub.

## 5. Phase 2 — one controlled restart

Before class, learn how your host applies environment changes. Some platforms redeploy automatically on each save: use a single batch change and understand your platform's behavior before the five-minute window.

At the instructor's signal:

1. Change ADMIN_PASSWORD to 1–6 characters.
2. Change APP_SECRET to 1–19 characters, no spaces.
3. KEEP JWT_SIGNING_KEY, TEAM_NAME and FRONTEND_ORIGIN unchanged.
4. Apply BOTH changes together and restart the backend only once if needed. No frontend change is needed.
5. Test the old password fails, the new password works, and the new secret appears.
6. Post READY before the deadline. No more credential changes or restarts during attacks.

Locally, stop Node, edit backend/.env, then npm start once. Hosted environment variables usually override .env: change values in the host dashboard for production.

CRITICAL ASSIGNMENT BEHAVIOR: a JWT captured during initial verification remains valid for three hours and can read the NEW secret after the password changes. Logout only clears the browser cookie. This replay behavior is deliberately required by rule 2; the application does not claim to prevent it. HttpOnly prevents page JavaScript from reading the cookie but does not stop the cookie owner from copying it with DevTools. A password change does not protect the secret from teams holding previously issued valid JWTs.

## 6. API reference

All paths below start with /prjK3/api. CORS permits only the configured frontend origin.

| Method | Path | Behavior |
|---|---|---|
| GET | /health | Public health check; no secret |
| POST | /login | JSON username/password; issues HttpOnly JWT cookie |
| POST | /logout | Clears cookie; does not revoke JWT copies |
| GET | /admin | Requires valid cookie; returns team and current secret |
| GET | /page1 | Requires valid cookie; returns Page 1 |
| GET | /page2 | Requires valid cookie; returns Page 2 |
| OPTIONS | API routes | Browser CORS preflight |

POST requests require Origin exactly matching FRONTEND_ORIGIN. Login requires Content-Type: application/json. The frontend uses credentials: 'include'; it never reads or saves the JWT in localStorage. API authentication failure returns JSON 401; frontend code handles the required Login redirect.

## 7. Explain this verbally

- Architecture: static HTML/CSS/JavaScript frontend makes HTTPS requests to a separate Node API. The API alone knows the password, signing key and current secret.
- Login: POST /login verifies username and compares a salted scrypt password hash with timingSafeEqual. Password hashing uses Node crypto, not bcrypt or a JWT library.
- JWT format: base64url header.payload.signature. HS256 signs header.payload with HMAC-SHA256 and the private signing key. Encoding is not encryption; anyone holding a JWT can read its payload. Secret and password are excluded.
- Verification: reject malformed tokens, unexpected algorithms, bad signatures, wrong issuer/audience/user and expired timestamps. Merely decoding a payload is not authentication.
- Cookie: HttpOnly blocks document.cookie access, Secure limits sending to HTTPS, SameSite controls site context, Max-Age/Expires control browser retention. JWT exp independently controls server acceptance. Both lifetimes are three hours.
- Cross origin: credentials: 'include', exact Access-Control-Allow-Origin, Access-Control-Allow-Credentials and OPTIONS handling let the browser use API cookies. JSON content type causes preflight; credentials alone do not necessarily cause it.
- Refresh: browser retains cookie and sends it to API. Each protected route asks the server to verify it again. Page HTML is a public shell; sensitive data exists only behind server verification.
- CSRF: state-changing requests require the exact frontend Origin; login also requires JSON. CORS is not authentication: nonbrowser clients can forge Origin and still need valid credentials or a signed JWT.
- XSS: dynamic content uses textContent instead of HTML injection. HttpOnly reduces token theft but cannot prevent injected code from making requests as a logged-in user.
- Defenses: bounded input size, header/time limits, fixed JWT algorithm, generic login failures, rate limits, capped concurrent hashes, no-store responses. Hashes run asynchronously during login.
- Rate-limit caveat: remoteAddress may be the reverse proxy's IP on a hosted service. Then visitors can share a limit. Do not trust arbitrary X-Forwarded-For values; configure trusted-proxy IP handling only after checking your provider's documented proxy topology. The included limiter is process-local, not distributed protection.
- Availability: application limits cannot prevent saturation of a host or provider blocks. Measure actual hosting behavior before class; no code can guarantee the required five-second performance under all loads.

## 8. Authorized classroom checks

Only test your own app or applications explicitly registered for the hackathon. Never test unrelated sites or provider infrastructure.

- Unauthenticated access: remove the API cookie and request protected data; expect 401.
- Token tampering: on your own app, change payload bytes without resigning; expect 401. Try an unsigned/alg:none token; expect 401.
- Replay: on your own app, retain a test token, log out, and replay that cookie before expiration. It should still work under rule 2. After Phase 2 it should retrieve the new secret.
- Origin checks: test an unrelated Origin against your API; expect 403. Explain why this is not a replacement for JWT verification.
- Exposure: inspect public frontend files; there should be no password, signing key, or secret.
- Timing evidence: in browser DevTools > Network, select the API request and inspect Timing. Include actual API URL, readable time, browser date/time, and the response or connection failure in required screenshots. A slow total frontend page load is not by itself proof of a slow required API request.

Do not run unbounded load scripts. This package includes no infrastructure attack or flooding tools.

## 9. Tests and submission

```sh
cd backend
npm test
```

Tests cover JWT signature tampering, expiration, fixed algorithm, claims, CORS preflight/origin rejection, valid/invalid credentials, all protected endpoints, JSON errors, cookie expiry, logout replay and existing JWT validity after a password/secret change with a restart.

Before submitting, rename the team everywhere, deploy, perform the browser checklist, and zip separate frontend/ and backend/ folders plus this README. Do not include .env, real signing keys, node_modules, or credentials screenshots. Initial defaults are included intentionally; change them only when the instructor signals Phase 2.

## Reference documentation

- https://nodejs.org/api/crypto.html
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
- https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies

The project also follows the uploaded lecture's HttpOnly-cookie flow. The assignment's JWT and persistence rules take priority over simplified demonstration tokens.
