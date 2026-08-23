HeyYou targeted fix based on HeyYou(3).zip

ONLY THESE TWO FILES WERE CHANGED:
1. server.js.txt
   - Gmail OTP sending only.
   - Uses Gmail SMTP directly on 465, with 587/STARTTLS fallback.
   - Does not change Socket.IO, calling, groups, contacts, chat, or other server settings.

2. home.html.txt
   - Call audio/ICE reliability only.
   - Keeps the existing STUN servers when Cloudflare TURN credentials are returned.
   - Keeps the remote audio element available to mobile browser audio routing.
   - Retries remote audio playback after the WebRTC audio track arrives.

reset-password.html was NOT changed because its OTP-step flow already opens the OTP box after a successful server response.

IMPORTANT:
Do not use the previous broad "render_otp_call_fixed" files. These two files are the narrow fix made from HeyYou(3).zip.
