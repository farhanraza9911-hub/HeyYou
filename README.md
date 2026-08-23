# HeyYou Windows 8.1 Fix

This build removes `better-sqlite3` and uses a JSON database, avoiding node-gyp/Python native compilation.

1. Extract this folder over/replace your current HeyYou project.
2. Open CMD in C:\HeyYou
3. Run `npm install`
4. Run `npm start`
5. Open http://localhost:3000

Admin: admin@heyyou.local / Admin@12345
Admin page: http://localhost:3000/admin.html


## Render environment variables for the requested features

- `GMAIL_USER` — Gmail address used by HeyYou to send password-reset OTP emails.
- `GMAIL_APP_PASSWORD` — Google App Password for that Gmail account (do not use the normal Gmail password).
- `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` — recommended for reliable WebRTC calls, especially across mobile/NAT networks.
