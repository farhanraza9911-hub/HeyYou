HeyYou(5) targeted audio/video call fix

ONLY home.html was changed.

Exact fix: removed the pendingIceCandidates reset inside answerCall(). Incoming ICE candidates that arrive before the callee sets the remote description are now preserved and flushed by the existing flushPendingIceCandidates() call.

No server.js, Socket.IO, TURN/Cloudflare, Gmail, UI, contacts, groups, chat, profile, or other settings were changed.
Replace only public/home.html with home.html.txt, then deploy.
