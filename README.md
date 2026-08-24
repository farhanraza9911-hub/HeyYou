HeyYou(6) — OTP HTTPS-only change

ONLY the sendPasswordResetOtp() function in server.js was changed.
No other application code/settings were changed.

Old:
Gmail SMTP via smtp.gmail.com ports 465/587.

New:
Brevo HTTPS API:
https://api.brevo.com/v3/smtp/email

Node 18's built-in fetch is used, so no npm package change is required.

Render Environment Variables required:
BREVO_API_KEY = your Brevo API key
BREVO_SENDER_EMAIL = your verified sender email in Brevo
BREVO_SENDER_NAME = HeyYou

After confirming OTP works, the old GMAIL_USER and GMAIL_APP_PASSWORD
variables are no longer used by the OTP code and can be removed.

Important:
The BREVO_SENDER_EMAIL must be a sender/address that Brevo has verified.
Do not put the Brevo API key in frontend code or in Git.
