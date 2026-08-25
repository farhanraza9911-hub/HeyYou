const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const UPLOADS = path.join(ROOT, "uploads");
const DATA = process.env.HEYYOU_DATA_DIR
    ? path.resolve(process.env.HEYYOU_DATA_DIR)
    : path.join(ROOT, "data");

const DB_FILE = path.join(DATA, "heyyou.json");

try {
    fs.mkdirSync(DATA, { recursive: true });
} catch (error) {
    console.error("DATA DIRECTORY ERROR:", error);
    process.exit(1);
}

fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

/* =====================================================
   DATABASE
===================================================== */

function emptyDB() {
    return {
        users: [],
        messages: [],
        groups: [],
        group_messages: [],
        reports: [],
        statuses: [],
        status_views: [],
        settings: {
            status_ads_enabled: false,
            status_ads_frequency: 5
        },
        support_messages: [],
        seq: {
            users: 0,
            messages: 0,
            groups: 0,
            group_messages: 0,
            reports: 0,
            statuses: 0,
            status_views: 0
        }
    };
}

function loadDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            return emptyDB();
        }

        const data = JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );

        data.users = Array.isArray(data.users)
            ? data.users
            : [];

        data.messages = Array.isArray(data.messages)
            ? data.messages
            : [];

        data.groups = Array.isArray(data.groups) ? data.groups : [];
        data.group_messages = Array.isArray(data.group_messages) ? data.group_messages : [];

        data.reports = Array.isArray(data.reports)
            ? data.reports
            : [];

        data.statuses = Array.isArray(data.statuses)
            ? data.statuses
            : [];

        data.status_views = Array.isArray(data.status_views)
            ? data.status_views
            : [];

        data.settings = {
            status_ads_enabled: false,
            status_ads_frequency: 5,
            ...(data.settings || {})
        };
        data.settings.status_ads_enabled = Boolean(data.settings.status_ads_enabled);
        data.settings.status_ads_frequency = Math.max(1, Number(data.settings.status_ads_frequency || 5));

        data.support_messages = Array.isArray(data.support_messages)
            ? data.support_messages
            : [];

        data.seq = data.seq || {};

        data.seq.users = Number(data.seq.users || 0);
        data.seq.messages = Number(data.seq.messages || 0);
        data.seq.groups = Number(data.seq.groups || 0);
        data.seq.group_messages = Number(data.seq.group_messages || 0);
        data.seq.reports = Number(data.seq.reports || 0);
        data.seq.statuses = Number(data.seq.statuses || 0);
        data.seq.status_views =
            Number(data.seq.status_views || 0);
        data.seq.support_messages = Number(data.seq.support_messages || 0);

        /*
         * Make sure old users also receive the new
         * settings structure.
         */
        for (const user of data.users) {
            user.settings = normalizeSettings(
                user.settings
            );

            user.blocked_users =
                Array.isArray(user.blocked_users)
                    ? user.blocked_users
                    : [];
user.contacts =
    Array.isArray(user.contacts)
        ? user.contacts
        : [];
        }

        return data;

    } catch (error) {
        console.log(
            "DATABASE LOAD ERROR:",
            error.message
        );

        return emptyDB();
    }
}

let db = loadDB();
const passwordResetOtps = new Map();
const registrationOtps = new Map();
const rateBuckets = new Map();

function rateLimit(key, limit, windowMs) {
    const now = Date.now();
    const item = rateBuckets.get(key);
    if (!item || now - item.started >= windowMs) {
        rateBuckets.set(key, { started: now, count: 1 });
        return true;
    }
    if (item.count >= limit) return false;
    item.count += 1;
    return true;
}

function requestIp(req) {
    return String(req.ip || req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
}

function saveDB() {
    try {
        const json = JSON.stringify(db, null, 2);
        const tempFile = DB_FILE + ".tmp";
        fs.writeFileSync(tempFile, json, "utf8");
        fs.renameSync(tempFile, DB_FILE);
        return true;
    } catch (error) {
        console.error(
            "DATABASE SAVE ERROR:",
            error.message
        );
        return false;
    }
}

function nextId(type) {
    db.seq[type] = Number(db.seq[type] || 0) + 1;
    return db.seq[type];
}

/* =====================================================
   DEFAULT SETTINGS
===================================================== */

function defaultSettings() {
    return {
        theme: "light",

        notifications: true,
        message_notifications: true,
        call_notifications: true,

        sound: true,

        read_receipts: true,
        last_seen: true,

        online_status: true,

        allow_audio_calls: true,
        allow_video_calls: true
    };
}

function normalizeSettings(settings) {
    const defaults = defaultSettings();

    return {
        ...defaults,
        ...(settings || {})
    };
}

/*
 * Normalize all existing users.
 * This does NOT remove existing user records.
 */
for (const user of db.users) {
    user.settings =
        normalizeSettings(user.settings);

    user.blocked_users =
        Array.isArray(user.blocked_users)
            ? user.blocked_users
            : [];
}
   
/* =====================================================
   DEFAULT ADMIN
===================================================== */

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");

let adminUser = db.users.find(user => user.role === "admin");

if (!adminUser) {
    if (ADMIN_EMAIL && ADMIN_PASSWORD.length >= 8) {
        adminUser = {
            id: nextId("users"),
            name: "HeyYou Admin",
            email: ADMIN_EMAIL,
            password: bcrypt.hashSync(ADMIN_PASSWORD, 12),
            avatar: "",
            bio: "",
            role: "admin",
            status: "offline",
            created_at: new Date().toISOString(),
            settings: defaultSettings(),
            blocked_users: [],
            contacts: []
        };
        db.users.push(adminUser);
        saveDB();
        console.log("Admin created from ADMIN_EMAIL environment variable.");
    } else {
        console.log("WARNING: No admin account was created. Set ADMIN_EMAIL and ADMIN_PASSWORD in production.");
    }
} else {
    adminUser.settings = normalizeSettings(adminUser.settings);
    adminUser.blocked_users = Array.isArray(adminUser.blocked_users) ? adminUser.blocked_users : [];
    adminUser.contacts = Array.isArray(adminUser.contacts) ? adminUser.contacts : [];
    // Only change admin credentials when explicitly supplied via environment variables.
    if (ADMIN_EMAIL) adminUser.email = ADMIN_EMAIL;
    if (ADMIN_PASSWORD.length >= 8) adminUser.password = bcrypt.hashSync(ADMIN_PASSWORD, 12);
    adminUser.role = "admin";
    saveDB();
}

if (adminUser) console.log("Admin ready:", adminUser.email);

/*
 * Normalize all existing users.
 * This does NOT remove existing user records.
 */
for (const user of db.users) {

    user.settings =
        normalizeSettings(user.settings);

    user.blocked_users =
        Array.isArray(user.blocked_users)
            ? user.blocked_users
            : [];

    user.contacts =
        Array.isArray(user.contacts)
            ? user.contacts
            : [];
}

saveDB();

/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(
    express.json({
        limit: "20mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "20mb"
    })
);

app.set("trust proxy", 1);

const sessionMiddleware = session({
    secret:
        String(process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex")),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production" || process.env.RENDER === "true",
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
});

app.use(sessionMiddleware);

app.use(
    "/uploads",
    express.static(UPLOADS)
);

app.use(
    express.static(
        path.join(ROOT, "public")
    )
);

/* =====================================================
   MULTER
===================================================== */

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS);
    },

    filename: (req, file, cb) => {
        const ext = path
            .extname(file.originalname)
            .toLowerCase();

        const name =
            Date.now() +
            "-" +
            crypto
                .randomBytes(8)
                .toString("hex") +
            ext;

        cb(null, name);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        const allowedExt = /\.(jpg|jpeg|png|gif|webp|bmp|mp4|webm|mov|avi|mkv|mp3|wav|m4a|ogg|aac|pdf|doc|docx|xls|xlsx|xlsm|ods|odt|odp|ppt|pptx|txt|csv)$/i;
        const allowedMime = /^(image\/(jpeg|png|gif|webp|bmp)|video\/(mp4|webm|quicktime|x-msvideo)|audio\/(mpeg|wav|mp4|ogg|aac|x-m4a)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.oasis\.opendocument\.(spreadsheet|text|presentation)|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.presentationml\.presentation)|text\/(plain|csv))$/i;
        if (allowedExt.test(ext) && (allowedMime.test(file.mimetype || "") || /^application\/octet-stream$/i.test(file.mimetype || ""))) cb(null, true);
        else cb(new Error("File type not allowed."));
    }
});

app.get(
    "/api/ice-servers",
    requireAuth,
    async (req, res) => {
        try {
            const turnKeyId =
                process.env.CLOUDFLARE_TURN_KEY_ID;

            const turnApiToken =
                process.env.CLOUDFLARE_TURN_API_TOKEN;

            if (!turnKeyId || !turnApiToken) {
                console.log(
                    "ICE SERVER ERROR: Cloudflare TURN environment variables are missing"
                );

                return res.status(503).json({
                    ok: false,
                    error: "TURN service is not configured."
                });
            }

            const endpoint =
                "https://rtc.live.cloudflare.com/v1/turn/keys/" +
                encodeURIComponent(turnKeyId) +
                "/credentials/generate-ice-servers";

            const response = await fetch(
                endpoint,
                {
                    method: "POST",
                    headers: {
                        "Authorization":
                            "Bearer " + turnApiToken,
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        ttl: 86400
                    })
                }
            );

            const data = await response.json();

            if (!response.ok || !Array.isArray(data.iceServers)) {
                console.log(
                    "CLOUDFLARE ICE SERVER ERROR:",
                    response.status,
                    data
                );

                return res.status(502).json({
                    ok: false,
                    error: "Could not get TURN servers."
                });
            }

            return res.json({
                ok: true,
                source: "cloudflare",
                ice_servers: data.iceServers
            });
        } catch (error) {
            console.log(
                "ICE SERVER ERROR:",
                error
            );

            return res.status(502).json({
                ok: false,
                error: "TURN service unavailable."
            });
        }
    }
);

/* =====================================================
   HELPERS
===================================================== */

function publicUser(user) {
    if (!user) {
        return null;
    }

    return {
        id: user.id,

        name: user.name,

        email: user.email,
phone: user.phone || "",
        avatar:
            user.avatar || "",

        bio:
            user.bio || "",

        role:
            user.role || "user",

        status:
            user.status || "offline",

        created_at:
            user.created_at,

        settings:
            normalizeSettings(
                user.settings
            ),

        blocked_users:
            Array.isArray(
                user.blocked_users
            )
                ? user.blocked_users
                : []
    };
}

function requireAuth(
    req,
    res,
    next
) {
    if (!req.session.user) {
        return res.status(401).json({
            error: "Login required"
        });
    }

    const current = getCurrentUser(req);
    if (current?.is_blocked) {
        req.session.destroy(() => {});
        return res.status(403).json({
            error: "Your HeyYou account has been blocked by the administrator."
        });
    }

    next();
}

function requireAdmin(
    req,
    res,
    next
) {
    if (
        req.session.user?.role !==
        "admin"
    ) {
        return res.status(403).json({
            error: "Admin only"
        });
    }

    next();
}

function getCurrentUser(req) {
    if (!req.session.user?.id) {
        return null;
    }

    return db.users.find(
        user =>
            Number(user.id) ===
            Number(
                req.session.user.id
            )
    );
}

function deleteUploadedFile(url) {
    if (
        !url ||
        typeof url !== "string" ||
        !url.startsWith("/uploads/")
    ) {
        return;
    }

    const filename =
        path.basename(url);

    const filePath =
        path.join(
            UPLOADS,
            filename
        );

    try {
        if (
            fs.existsSync(filePath)
        ) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.log(
            "FILE DELETE ERROR:",
            error.message
        );
    }
}
function normalizePhone(phone) {
    return String(phone || "")
        .trim()
        .replace(/[^\d+]/g, "");
}

function isValidPhone(phone) {
    return /^\+?[1-9]\d{7,14}$/.test(
        normalizePhone(phone)
    );
}

/* Match phone-book numbers even when one side is stored with a country
 * code and the other side is stored in local format (for example
 * +9665xxxxxxxx vs 05xxxxxxxx). We still require a meaningful 9-digit
 * suffix so unrelated short values are not matched. */
function phonesMatch(a, b) {
    const da = normalizePhone(a).replace(/\D/g, "");
    const db = normalizePhone(b).replace(/\D/g, "");
    if (!da || !db) return false;
    if (da === db) return true;
    if (da.length >= 9 && db.length >= 9) {
        return da.slice(-9) === db.slice(-9);
    }
    return false;
}

function isBlocked(
    userA,
    userB
) {
    const a =
        db.users.find(
            user =>
                Number(user.id) ===
                Number(userA)
        );

    if (!a) {
        return false;
    }

    return (
        Array.isArray(
            a.blocked_users
        ) &&
        a.blocked_users.some(
            id =>
                Number(id) ===
                Number(userB)
        )
    );
}

/* =====================================================
   REGISTER EMAIL OTP
===================================================== */

app.post("/api/register/request-otp", async (req, res) => {
    try {
        const ip = requestIp(req);
        const name = String(req.body?.name || "").trim();
        const email = String(req.body?.email || "").trim().toLowerCase();
        const phone = normalizePhone(req.body?.phone || req.body?.mobile || "");
        const password = String(req.body?.password || "");
        if (!rateLimit("register:" + ip, 5, 15 * 60 * 1000)) return res.status(429).json({error:"Too many registration attempts. Please try again later."});
        if (!name || password.length < 6 || !email || !phone) return res.status(400).json({error:"Name, Gmail/email, mobile number and password are required."});
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Please enter a valid email address."});
        if (!isValidPhone(phone)) return res.status(400).json({error:"Please enter a valid mobile number with country code."});
        if (db.users.some(u => String(u.email || "").toLowerCase() === email)) return res.status(400).json({error:"Email already exists."});
        if (db.users.some(u => normalizePhone(u.phone || "") === phone)) return res.status(400).json({error:"Mobile number already exists."});
        const otp = String(crypto.randomInt(100000, 1000000));
        await sendEmailOtp(email, otp, "HeyYou registration OTP", `Your HeyYou registration OTP is ${otp}. It expires in 10 minutes.`);
        registrationOtps.set(email, { otp, expires: Date.now() + 10 * 60 * 1000, attempts: 0, name, phone, passwordHash: bcrypt.hashSync(password, 12) });
        res.json({ok:true, message:"OTP sent to your email."});
    } catch (error) {
        console.log("REGISTRATION OTP ERROR:", error);
        res.status(500).json({error:"Could not send registration OTP. Check your email service settings."});
    }
});

app.post("/api/register/verify", (req, res) => {
    try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        const otp = String(req.body?.otp || "").trim();

        if (!email || !otp) {
            return res.status(400).json({error:"Email and OTP are required."});
        }

        const record = registrationOtps.get(email);
        if (!record) {
            return res.status(400).json({error:"OTP expired or not requested."});
        }

        const expiresAt = Number(record.expires || record.expiresAt || 0);
        if (!expiresAt || Date.now() > expiresAt) {
            registrationOtps.delete(email);
            return res.status(400).json({error:"OTP expired. Please request a new OTP."});
        }

        if (Number(record.attempts || 0) >= 5) {
            registrationOtps.delete(email);
            return res.status(429).json({error:"Too many incorrect attempts. Request a new OTP."});
        }

        if (String(record.otp || "") !== otp) {
            record.attempts = Number(record.attempts || 0) + 1;
            registrationOtps.set(email, record);
            return res.status(400).json({error:"Invalid OTP."});
        }

        const registrationPhone = normalizePhone(record.phone || record.mobile || "");
        const duplicateEmail = db.users.some(
            u => String(u.email || "").trim().toLowerCase() === email
        );
        const duplicatePhone = registrationPhone && db.users.some(
            u => normalizePhone(u.phone || u.mobile || "") === registrationPhone
        );

        if (duplicateEmail || duplicatePhone) {
            registrationOtps.delete(email);
            return res.status(409).json({
                error: duplicateEmail
                    ? "An account with this email already exists."
                    : "An account with this mobile number already exists."
            });
        }

        // Store the bcrypt hash created when the registration OTP was requested.
        // Never store the user's plain-text password.
        const passwordHash = String(record.passwordHash || record.password || "");
        if (!passwordHash) {
            registrationOtps.delete(email);
            return res.status(400).json({error:"Registration session is invalid. Please register again."});
        }

        const user = {
            id: nextId("users"),
            name: String(record.name || "").trim(),
            email,
            phone: registrationPhone,
            mobile: registrationPhone,
            password: passwordHash,
            avatar: "",
            bio: "",
            profilePic: "",
            about: "",
            role: "user",
            is_blocked: false,
            status: "online",
            created_at: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            settings: defaultSettings(),
            blocked_users: [],
            contacts: []
        };

        db.users.push(user);

        // This is the critical persistence step. If the database cannot be written,
        // roll the in-memory user back so registration cannot appear successful.
        if (!saveDB()) {
            db.users.pop();
            db.seq.users = Math.max(0, Number(db.seq.users || 1) - 1);
            return res.status(500).json({
                error:"Account could not be saved permanently. Please try again."
            });
        }

        registrationOtps.delete(email);
        req.session.user = publicUser(user);

        return res.json({
            ok: true,
            success: true,
            message:"Registration successful.",
            user: publicUser(user)
        });
    } catch (error) {
        console.error("REGISTRATION OTP VERIFY ERROR:", error);
        return res.status(500).json({error:"Registration failed. Please try again."});
    }
});

/* =====================================================
   REGISTER
   Email/Gmail AND Mobile Number
===================================================== */

app.post(
    "/api/register",
    (req, res) => {
        return res.status(400).json({error:"Email verification is required. Please request and verify the registration OTP."});
    }
);

/* =====================================================
   PASSWORD RESET VIA EMAIL OTP
===================================================== */

async function sendEmailOtp(email, otp, subject, textContent) {
    const apiKey = String(process.env.BREVO_API_KEY || "").trim();
    const senderEmail = String(process.env.BREVO_SENDER_EMAIL || "").trim();
    const senderName = String(process.env.BREVO_SENDER_NAME || "HeyYou").trim();
    if (!apiKey || !senderEmail) throw new Error("BREVO_API_KEY or BREVO_SENDER_EMAIL is missing on Render.");
    const payload = { sender:{ email:senderEmail, name:senderName }, to:[{email}], subject, textContent };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "accept": "application/json",
            "api-key": apiKey,
            "content-type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let detail = "";
        try {
            detail = await response.text();
        } catch (_) {}

        console.log(
            "BREVO HTTPS OTP ATTEMPT FAILED:",
            response.status,
            detail
        );

        throw new Error(
            `Brevo email API failed (${response.status}). ${detail || "Check BREVO_API_KEY and BREVO_SENDER_EMAIL."}`
        );
    }

    return;
}

app.post("/api/password-reset/request", async (req, res) => {
    try {
        if (!rateLimit("reset-ip:" + requestIp(req), 5, 15 * 60 * 1000)) return res.status(429).json({error:"Too many OTP requests. Please try again later."});
        const email = String(req.body?.email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({error:"Enter a valid Gmail/email address."});
        }
        const matchingUsers = db.users.filter(
        u => String(u.email || "").toLowerCase() === email
    );
    const user = matchingUsers.length
        ? matchingUsers[matchingUsers.length - 1]
        : null;
        if (!user) return res.status(404).json({error:"No HeyYou account is registered with this email."});

        const otp = String(crypto.randomInt(100000, 1000000));
        const record = {otp, expires:Date.now()+10*60*1000, attempts:0};
        // Only create the reset session after Gmail accepts the message.
        // This prevents a failed SMTP send from leaving the UI waiting for an OTP.
        await sendEmailOtp(email, otp, "HeyYou password reset OTP", `Your HeyYou password reset OTP is ${otp}. It expires in 10 minutes.`);
        passwordResetOtps.set(email, record);
        res.json({ok:true, message:"OTP sent to your email."});
    } catch(error) {
        console.log("PASSWORD RESET OTP ERROR:", error);
        const detail = String(error && error.message || "");
        let message = "Could not send OTP. Check Gmail SMTP settings on Render.";
        if (/Invalid login|Username and Password not accepted|BadCredentials|authentication/i.test(detail)) {
            message = "Gmail rejected the login. Check GMAIL_USER and GMAIL_APP_PASSWORD on Render.";
        } else if (/ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(detail)) {
            message = "Gmail connection failed. Please try again in a moment.";
        }
        res.status(500).json({error:message});
    }
});

app.post("/api/password-reset/verify", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    const record = passwordResetOtps.get(email);
    if (!record || Date.now() > record.expires) {
        passwordResetOtps.delete(email);
        return res.status(400).json({error:"OTP expired. Request a new OTP."});
    }
    if (record.attempts >= 5) {
        passwordResetOtps.delete(email);
        return res.status(429).json({error:"Too many incorrect attempts. Request a new OTP."});
    }
    if (record.otp !== otp) {
        record.attempts += 1;
        return res.status(400).json({error:"Invalid OTP."});
    }
    const resetToken = crypto.randomBytes(32).toString("hex");
    record.resetToken = resetToken;
    record.verifiedUntil = Date.now()+10*60*1000;
    passwordResetOtps.set(email, record);
    res.json({ok:true, resetToken});
});

app.post("/api/password-reset/complete", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const token = String(req.body?.resetToken || "").trim();
    const password = String(req.body?.password || "");
    const record = passwordResetOtps.get(email);
    if (!record || record.resetToken !== token || Date.now() > (record.verifiedUntil || 0)) {
        return res.status(400).json({error:"Password reset session expired. Verify the OTP again."});
    }
    if (password.length < 6) return res.status(400).json({error:"Password must be at least 6 characters."});
    const user = db.users.find(u => String(u.email || "").toLowerCase() === email);
    if (!user) return res.status(404).json({error:"User not found."});
    user.password = bcrypt.hashSync(password, 10);
    passwordResetOtps.delete(email);
    saveDB();
    res.json({ok:true, message:"Password reset successfully."});
});

/* =====================================================
   SEPARATE ADMIN LOGIN + PASSWORD RESET
===================================================== */

app.post("/api/admin/login", (req, res) => {
    try {
        if (!rateLimit("admin-login:" + requestIp(req), 10, 15 * 60 * 1000)) {
            return res.status(429).json({error:"Too many admin login attempts. Please try again later."});
        }

        const email = String(req.body?.email || "").trim().toLowerCase();
        const password = String(req.body?.password || "");

        const admin = db.users.find(
            user =>
                user.role === "admin" &&
                String(user.email || "").trim().toLowerCase() === email
        );

        if (!admin || !bcrypt.compareSync(password, admin.password || "")) {
            return res.status(401).json({error:"Invalid admin email or password."});
        }

        admin.status = "online";
        saveDB();

        req.session.user = publicUser(admin);

        res.json({
            ok: true,
            user: publicUser(admin)
        });
    } catch (error) {
        console.error("ADMIN LOGIN ERROR:", error);
        res.status(500).json({error:"Admin login failed."});
    }
});

app.post("/api/admin/password-reset/request", async (req, res) => {
    try {
        if (!rateLimit("admin-reset:" + requestIp(req), 5, 15 * 60 * 1000)) {
            return res.status(429).json({error:"Too many admin password reset attempts. Please try again later."});
        }

        const email = String(req.body?.email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({error:"Enter a valid admin email address."});
        }

        const admin = db.users.find(
            user =>
                user.role === "admin" &&
                String(user.email || "").trim().toLowerCase() === email
        );

        if (!admin) {
            return res.status(404).json({error:"No admin account is registered with this email."});
        }

        const otp = String(crypto.randomInt(100000, 1000000));
        const record = {
            otp,
            expires: Date.now() + 10 * 60 * 1000,
            attempts: 0,
            admin: true
        };

        await sendEmailOtp(
            email,
            otp,
            "HeyYou admin password reset OTP",
            `Your HeyYou admin password reset OTP is ${otp}. It expires in 10 minutes.`
        );

        passwordResetOtps.set("admin:" + email, record);
        res.json({ok:true, message:"Admin reset OTP sent to your email."});
    } catch (error) {
        console.error("ADMIN PASSWORD RESET OTP ERROR:", error);
        const detail = String(error && error.message || "");
        let message = "Could not send admin OTP. Check Gmail SMTP settings on Render.";
        if (/Invalid login|Username and Password not accepted|BadCredentials|authentication/i.test(detail)) {
            message = "Gmail rejected the login. Check GMAIL_USER and GMAIL_APP_PASSWORD on Render.";
        } else if (/ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(detail)) {
            message = "Gmail connection failed. Please try again in a moment.";
        }
        res.status(500).json({error:message});
    }
});

app.post("/api/admin/password-reset/verify", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    const key = "admin:" + email;
    const record = passwordResetOtps.get(key);

    if (!record || !record.admin || Date.now() > record.expires) {
        passwordResetOtps.delete(key);
        return res.status(400).json({error:"OTP expired. Request a new admin OTP."});
    }

    if (record.attempts >= 5) {
        passwordResetOtps.delete(key);
        return res.status(429).json({error:"Too many incorrect attempts. Request a new OTP."});
    }

    if (record.otp !== otp) {
        record.attempts += 1;
        return res.status(400).json({error:"Invalid OTP."});
    }

    record.resetToken = crypto.randomBytes(32).toString("hex");
    record.verifiedUntil = Date.now() + 10 * 60 * 1000;
    passwordResetOtps.set(key, record);

    res.json({ok:true, resetToken:record.resetToken});
});

app.post("/api/admin/password-reset/complete", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const token = String(req.body?.resetToken || "").trim();
    const password = String(req.body?.password || "");
    const key = "admin:" + email;
    const record = passwordResetOtps.get(key);

    if (!record || !record.admin || record.resetToken !== token || Date.now() > (record.verifiedUntil || 0)) {
        return res.status(400).json({error:"Admin password reset session expired. Verify the OTP again."});
    }

    if (password.length < 8) {
        return res.status(400).json({error:"Admin password must be at least 8 characters."});
    }

    const admin = db.users.find(
        user =>
            user.role === "admin" &&
            String(user.email || "").trim().toLowerCase() === email
    );

    if (!admin) {
        passwordResetOtps.delete(key);
        return res.status(404).json({error:"Admin account not found."});
    }

    admin.password = bcrypt.hashSync(password, 12);
    passwordResetOtps.delete(key);
    saveDB();

    res.json({ok:true, message:"Admin password reset successfully."});
});


/* =====================================================
   LOGIN
===================================================== */

app.post(
    "/api/login",
    (req, res) => {
        try {
            if (!rateLimit("login:" + requestIp(req), 10, 15 * 60 * 1000)) return res.status(429).json({error:"Too many login attempts. Please try again later."});
            const loginValue =
    String(
        req.body.email ||
        req.body.phone ||
        req.body.mobile ||
        ""
    )
        .trim()
        .toLowerCase();

const normalizedLoginPhone =
    normalizePhone(loginValue);

            const password =
                String(
                    req.body.password || ""
                );

          const loginCandidates =
    db.users.filter(
        item =>
            (
                item.email &&
                String(item.email).toLowerCase() === loginValue
            ) ||
            (
                normalizedLoginPhone &&
                normalizePhone(item.phone || "") === normalizedLoginPhone
            )
    );

            let user = null;

            for (const candidate of loginCandidates) {
                if (!candidate.password) continue;
                try {
                    if (bcrypt.compareSync(password, candidate.password)) {
                        user = candidate;
                        break;
                    }
                } catch (e) {
                    // Ignore malformed legacy hashes and continue.
                }
            }

            if (!user) {
                return res.status(401).json({
                    error:
    "Invalid email/mobile or password"
                });
            }

            if (user.is_blocked) {
                return res.status(403).json({
                    error: "Your HeyYou account has been blocked by the administrator."
                });
            }

            user.settings =
                normalizeSettings(
                    user.settings
                );

            user.blocked_users =
                Array.isArray(
                    user.blocked_users
                )
                    ? user.blocked_users
                    : [];

            user.status = "online";

            saveDB();

            req.session.user =
                publicUser(user);

            res.json({
                ok: true,
                user:
                    publicUser(user)
            });

        } catch (error) {
            console.log(
                "LOGIN ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Login failed"
            });
        }
    }
);

/* =====================================================
   LOGOUT
===================================================== */

app.post(
    "/api/logout",
    requireAuth,
    (req, res) => {
        const user =
            getCurrentUser(req);

        if (user) {
            user.status =
                "offline";

            saveDB();
        }

        req.session.destroy(
            () => {
                res.json({
                    ok: true
                });
            }
        );
    }
);

/* =====================================================
   CURRENT USER
===================================================== */

app.get(
    "/api/me",
    requireAuth,
    (req, res) => {
        const user =
            getCurrentUser(req);

        if (!user) {
            return res.status(404).json({
                error:
                    "User not found"
            });
        }

        res.json(
            publicUser(user)
        );
    }
);
/* =====================================================
   CONTACTS
===================================================== */

app.post("/api/contacts/sync", requireAuth, (req, res) => {
    const user = getCurrentUser(req);
    if (!user) return res.status(404).json({error:"User not found"});

    const incoming = Array.isArray(req.body?.phones) ? req.body.phones : [];
    const phoneBook = incoming.map(normalizePhone).filter(isValidPhone);
    const matched = db.users.filter(u =>
        Number(u.id) !== Number(user.id) &&
        u.phone &&
        phoneBook.some(phone => phonesMatch(phone, u.phone))
    );

    const existing = Array.isArray(user.contacts) ? user.contacts.map(Number) : [];
    user.contacts = [...new Set([...existing, ...matched.map(u => Number(u.id))])];
    saveDB();
    res.json({
        ok: true,
        contacts: matched.map(publicUser),
        contactIds: user.contacts.map(Number)
    });
});

app.get(
    "/api/contacts",
    requireAuth,
    (req, res) => {
        const user = getCurrentUser(req);

        if (!user) {
            return res.status(404).json({
                error: "User not found"
            });
        }

        user.contacts =
            Array.isArray(user.contacts)
                ? user.contacts
                : [];

        const q = String(req.query.q || "").toLowerCase().trim();
        const contacts = user.contacts
            .map(id => db.users.find(u => Number(u.id) === Number(id)))
            .filter(Boolean)
            .filter(contact => !q || String(contact.name || "").toLowerCase().includes(q) || String(contact.email || "").toLowerCase().includes(q) || String(contact.phone || "").includes(q))
            .map(publicUser);

        res.json(contacts);
    }
);


app.post(
    "/api/contacts/:id",
    requireAuth,
    (req, res) => {
        const user = getCurrentUser(req);

        if (!user) {
            return res.status(404).json({
                error: "User not found"
            });
        }

        const contactId =
            Number(req.params.id);

        if (!contactId) {
            return res.status(400).json({
                error: "Invalid user"
            });
        }

        if (
            Number(user.id) ===
            contactId
        ) {
            return res.status(400).json({
                error: "You cannot add yourself"
            });
        }

        const contact =
            db.users.find(
                u =>
                    Number(u.id) ===
                    contactId
            );

        if (!contact) {
            return res.status(404).json({
                error: "User not found"
            });
        }

        user.contacts =
            Array.isArray(user.contacts)
                ? user.contacts
                : [];

        if (
            user.contacts.some(
                id =>
                    Number(id) ===
                    contactId
            )
        ) {
            return res.json({
                ok: true,
                message: "Already in contacts"
            });
        }

        user.contacts.push(contactId);

        saveDB();

        res.json({
            ok: true,
            user: publicUser(contact)
        });
    }
);
/* =====================================================
   USERS
===================================================== */

app.get(
    "/api/users",
    requireAuth,
    (req, res) => {
        const search =
            String(
                req.query.q || ""
            )
                .toLowerCase()
                .trim();

        const currentId =
            Number(
                req.session.user.id
            );

        const currentUser =
            getCurrentUser(req);

        const users =
            db.users
                .filter(user => {
                    if (
                        Number(user.id) ===
                        currentId
                    ) {
                        return false;
                    }

                    if (
                        currentUser &&
                        Array.isArray(
                            currentUser.blocked_users
                        ) &&
                        currentUser.blocked_users.includes(
                            Number(user.id)
                        )
                    ) {
                        return false;
                    }

                    if (!search) {
                        return true;
                    }

                    return (
                        String(
                            user.name || ""
                        )
                            .toLowerCase()
                            .includes(
                                search
                            ) ||
                        String(
                            user.email || ""
                        )
                            .toLowerCase()
                            .includes(
                                search
                            )
                    );
                })
                .map(
                    publicUser
                )
                .slice(0, 100);

        res.json(users);
    }
);


/* =====================================================
   GROUP CHAT
===================================================== */

function publicGroup(group) {
    if (!group) return null;
    return {
        id: Number(group.id),
        name: String(group.name || ""),
        owner_id: Number(group.owner_id),
        members: Array.isArray(group.members) ? group.members.map(Number) : [],
        created_at: group.created_at,
        created_by_name: group.created_by_name || ""
    };
}

function groupForUser(group, userId) {
    return group && Array.isArray(group.members) &&
        group.members.some(id => Number(id) === Number(userId));
}

app.get("/api/groups", requireAuth, (req, res) => {
    res.set("Cache-Control", "no-store");
    const userId = Number(req.session.user.id);
    const groups = (db.groups || [])
        .filter(g => groupForUser(g, userId))
        .map(publicGroup);
    res.json(groups);
});

app.post("/api/groups", requireAuth, (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = getCurrentUser(req);
    const name = String(req.body?.name || "").trim();
    let members = Array.isArray(req.body?.members) ? req.body.members.map(Number).filter(Boolean) : [];

    if (!user) return res.status(401).json({error:"Login required"});
    if (!name) return res.status(400).json({error:"Group name is required"});

    members = [...new Set(members)].filter(id => id !== Number(user.id));
    members = members.filter(id => db.users.some(u => Number(u.id) === id));
    if (!members.length) return res.status(400).json({error:"Select at least one contact"});

    // Only the user's existing saved contacts can be added.
    const saved = new Set((user.contacts || []).map(Number));
    members = members.filter(id => saved.has(id));
    if (!members.length) return res.status(400).json({error:"Select contacts saved in your HeyYou contacts"});

    const group = {
        id: nextId("groups"),
        name,
        owner_id: Number(user.id),
        members: [Number(user.id), ...members],
        created_by_name: user.name || "",
        created_at: new Date().toISOString()
    };
    db.groups.push(group);
    saveDB();

    const result = publicGroup(group);
    for (const memberId of group.members) {
        for (const sid of socketsFor(memberId)) io.to(sid).emit("group-created", result);
    }
    res.json({ok:true, group:result});
});

app.post("/api/groups/:id/members", requireAuth, (req, res) => {
    const user = getCurrentUser(req);
    const group = (db.groups || []).find(g => Number(g.id) === Number(req.params.id));
    if (!user || !group) return res.status(404).json({error:"Group not found"});
    if (Number(group.owner_id) !== Number(user.id)) return res.status(403).json({error:"Only the group owner can add members"});

    const saved = new Set((user.contacts || []).map(Number));
    let members = Array.isArray(req.body?.members) ? req.body.members.map(Number).filter(Boolean) : [];
    members = [...new Set(members)].filter(id => id !== Number(user.id) && saved.has(id));
    members = members.filter(id => db.users.some(u => Number(u.id) === id));
    if (!members.length) return res.status(400).json({error:"Select saved contacts to add"});

    group.members = [...new Set([...(group.members || []).map(Number), ...members])];
    saveDB();
    const result = publicGroup(group);
    for (const memberId of group.members) {
        for (const sid of socketsFor(memberId)) io.to(sid).emit("group-updated", result);
    }
    res.json({ok:true, group:result});
});

app.get("/api/groups/:id/messages", requireAuth, (req, res) => {
    res.set("Cache-Control", "no-store");
    const userId = Number(req.session.user.id);
    const group = (db.groups || []).find(g => Number(g.id) === Number(req.params.id));
    if (!group || !groupForUser(group, userId)) return res.status(404).json({error:"Group not found"});
    const messages = (db.group_messages || []).filter(m => Number(m.group_id) === Number(group.id)).slice(-500);
    res.json(messages);
});

/* =====================================================
   MESSAGES
===================================================== */

app.get(
    "/api/messages/:id",
    requireAuth,
    (req, res) => {
        const a =
            Number(
                req.session.user.id
            );

        const b =
            Number(
                req.params.id
            );

        if (
            isBlocked(a, b) ||
            isBlocked(b, a)
        ) {
            return res.json([]);
        }

        const messages =
            db.messages
                .filter(message => {
                    return (
                        (
                            Number(
                                message.sender_id
                            ) === a &&
                            Number(
                                message.receiver_id
                            ) === b
                        ) ||
                        (
                            Number(
                                message.sender_id
                            ) === b &&
                            Number(
                                message.receiver_id
                            ) === a
                        )
                    );
                })
                .sort(
                    (x, y) =>
                        Number(x.id) -
                        Number(y.id)
                )
                .slice(-500);

        res.json(messages);
    }
);

/* =====================================================
   PROFILE
===================================================== */

app.post(
    "/api/profile",
    requireAuth,
    upload.single("avatar"),
    (req, res) => {
        try {
            const user =
                getCurrentUser(req);

            if (!user) {
                if (req.file) {
                    deleteUploadedFile(
                        "/uploads/" +
                        req.file.filename
                    );
                }

                return res.status(404).json({
                    error:
                        "User not found"
                });
            }

            if (
                req.body.name !==
                undefined
            ) {
                user.name =
                    String(
                        req.body.name
                    ).trim() ||
                    user.name;
            }

            if (
                req.body.bio !==
                undefined
            ) {
                user.bio =
                    String(
                        req.body.bio
                    );
            }

            if (req.file) {
                if (
                    user.avatar
                ) {
                    deleteUploadedFile(
                        user.avatar
                    );
                }

                user.avatar =
                    "/uploads/" +
                    req.file.filename;
            }

            saveDB();

            req.session.user =
                publicUser(user);

            io.emit(
                "user-updated",
                publicUser(user)
            );

            res.json(
                publicUser(user)
            );

        } catch (error) {
            console.log(
                "PROFILE ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Could not update profile"
            });
        }
    }
);

/* =====================================================
   SETTINGS
===================================================== */

/*
 * GET SETTINGS
 */

app.get(
    "/api/settings",
    requireAuth,
    (req, res) => {
        try {
            const user =
                getCurrentUser(req);

            if (!user) {
                return res.status(404).json({
                    error:
                        "User not found"
                });
            }

            user.settings =
                normalizeSettings(
                    user.settings
                );

            saveDB();

            res.json({
                ok: true,

                settings:
                    user.settings,

                status_ads_enabled:
                    Boolean(db.settings?.status_ads_enabled),

                status_ads_frequency:
                    Math.max(1, Number(db.settings?.status_ads_frequency || 5)),

                user:
                    publicUser(user)
            });

        } catch (error) {
            console.log(
                "GET SETTINGS ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Could not load settings"
            });
        }
    }
);

/*
 * UPDATE SETTINGS
 *
 * Accepts either:
 *
 * {
 *   settings: {...}
 * }
 *
 * OR:
 *
 * {
 *   theme: "dark",
 *   notifications: false
 * }
 */

app.put(
    "/api/settings",
    requireAuth,
    (req, res) => {
        try {
            const user =
                getCurrentUser(req);

            if (!user) {
                return res.status(404).json({
                    error:
                        "User not found"
                });
            }

            const incoming =
                req.body.settings &&
                typeof req.body.settings ===
                    "object"
                    ? req.body.settings
                    : req.body;

            const current =
                normalizeSettings(
                    user.settings
                );

            const allowedKeys =
                [
                    "theme",
                    "notifications",
                    "message_notifications",
                    "call_notifications",
                    "sound",
                    "read_receipts",
                    "last_seen",
                    "online_status",
                    "allow_audio_calls",
                    "allow_video_calls"
                ];

            for (
                const key of allowedKeys
            ) {
                if (
                    Object.prototype.hasOwnProperty.call(
                        incoming,
                        key
                    )
                ) {
                    current[key] =
                        incoming[key];
                }
            }

            if (
                current.theme !==
                    "light" &&
                current.theme !==
                    "dark"
            ) {
                current.theme =
                    "light";
            }

            for (
                const key of [
                    "notifications",
                    "message_notifications",
                    "call_notifications",
                    "sound",
                    "read_receipts",
                    "last_seen",
                    "online_status",
                    "allow_audio_calls",
                    "allow_video_calls"
                ]
            ) {
                current[key] =
                    Boolean(
                        current[key]
                    );
            }

            user.settings =
                current;

            /*
             * Online status setting affects
             * public status immediately.
             */
            if (
                current.online_status ===
                false
            ) {
                user.status =
                    "offline";
            }

            saveDB();

            req.session.user =
                publicUser(user);

            io.emit(
                "user-settings-updated",
                {
                    user_id:
                        user.id,

                    settings:
                        user.settings
                }
            );

            res.json({
                ok: true,

                settings:
                    user.settings,

                status_ads_enabled:
                    Boolean(db.settings?.status_ads_enabled),

                status_ads_frequency:
                    Math.max(1, Number(db.settings?.status_ads_frequency || 5)),

                user:
                    publicUser(user)
            });

        } catch (error) {
            console.log(
                "UPDATE SETTINGS ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Could not save settings"
            });
        }
    }
);

/*
 * PATCH SETTINGS
 * Some frontends use PATCH instead of PUT.
 */

app.patch(
    "/api/settings",
    requireAuth,
    (req, res) => {
        req.url =
            "/api/settings";

        /*
         * Reuse the same logic by directly
         * performing the update.
         */

        try {
            const user =
                getCurrentUser(req);

            if (!user) {
                return res.status(404).json({
                    error:
                        "User not found"
                });
            }

            const incoming =
                req.body.settings &&
                typeof req.body.settings ===
                    "object"
                    ? req.body.settings
                    : req.body;

            const current =
                normalizeSettings(
                    user.settings
                );

            const allowedKeys =
                [
                    "theme",
                    "notifications",
                    "message_notifications",
                    "call_notifications",
                    "sound",
                    "read_receipts",
                    "last_seen",
                    "online_status",
                    "allow_audio_calls",
                    "allow_video_calls"
                ];

            for (
                const key of allowedKeys
            ) {
                if (
                    Object.prototype.hasOwnProperty.call(
                        incoming,
                        key
                    )
                ) {
                    current[key] =
                        incoming[key];
                }
            }

            if (
                current.theme !==
                    "light" &&
                current.theme !==
                    "dark"
            ) {
                current.theme =
                    "light";
            }

            for (
                const key of [
                    "notifications",
                    "message_notifications",
                    "call_notifications",
                    "sound",
                    "read_receipts",
                    "last_seen",
                    "online_status",
                    "allow_audio_calls",
                    "allow_video_calls"
                ]
            ) {
                current[key] =
                    Boolean(
                        current[key]
                    );
            }

            user.settings =
                current;

            saveDB();

            req.session.user =
                publicUser(user);

            io.emit(
                "user-settings-updated",
                {
                    user_id:
                        user.id,

                    settings:
                        user.settings
                }
            );

            res.json({
                ok: true,

                settings:
                    user.settings,

                user:
                    publicUser(user)
            });

        } catch (error) {
            console.log(
                "PATCH SETTINGS ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Could not save settings"
            });
        }
    }
);

/* =====================================================
   CHANGE PASSWORD
===================================================== */

app.post(
    "/api/change-password",
    requireAuth,
    async (req, res) => {
        try {
            const user =
                getCurrentUser(req);

            if (!user) {
                return res.status(404).json({
                    error:
                        "User not found"
                });
            }

            const currentPassword =
                String(
                    req.body.currentPassword ||
                    req.body.current_password ||
                    ""
                );

            const newPassword =
                String(
                    req.body.newPassword ||
                    req.body.new_password ||
                    ""
                );

            const confirmPassword =
                String(
                    req.body.confirmPassword ||
                    req.body.confirm_password ||
                    ""
                );

            if (
                !currentPassword ||
                !newPassword
            ) {
                return res.status(400).json({
                    error:
                        "Current password and new password are required"
                });
            }

            if (
                newPassword.length <
                6
            ) {
                return res.status(400).json({
                    error:
                        "New password must be at least 6 characters"
                });
            }

            if (
                confirmPassword &&
                newPassword !==
                    confirmPassword
            ) {
                return res.status(400).json({
                    error:
                        "New passwords do not match"
                });
            }

            const valid =
                await bcrypt.compare(
                    currentPassword,
                    user.password
                );

            if (!valid) {
                return res.status(400).json({
                    error:
                        "Current password is incorrect"
                });
            }

            user.password =
                await bcrypt.hash(
                    newPassword,
                    10
                );

            saveDB();

            res.json({
                ok: true,

                message:
                    "Password changed successfully"
            });

        } catch (error) {
            console.log(
                "CHANGE PASSWORD ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Could not change password"
            });
        }
    }
);

/* =====================================================
   BLOCKED USERS
===================================================== */

/*
 * GET BLOCKED USERS
 */

app.get(
    "/api/blocked-users",
    requireAuth,
    (req, res) => {
        try {
            const user =
                getCurrentUser(req);

            if (!user) {
                return res.status(404).json({
                    error:
                        "User not found"
                });
            }

            user.blocked_users =
                Array.isArray(
                    user.blocked_users
                )
                    ? user.blocked_users
                    : [];

            const blocked =
                user.blocked_users
                    .map(id =>
                        db.users.find(
                            item =>
                                Number(
                                    item.id
                                ) ===
                                Number(id)
                        )
                    )
                    .filter(Boolean)
                    .map(publicUser);

            res.json({
                ok: true,
                users: blocked
            });

        } catch (error) {
            console.log(
                "GET BLOCKED USERS ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Could not load blocked users"
            });
        }
    }
);

/*
 * BLOCK USER
 */

app.post(
    "/api/block/:id",
    requireAuth,
    (req, res) => {
        try {
            const user =
                getCurrentUser(req);

            const targetId =
                Number(
                    req.params.id
                );

            if (!user) {
                return res.status(404).json({
                    error:
                        "User not found"
                });
            }

            if (
                targetId ===
                Number(user.id)
            ) {
                return res.status(400).json({
                    error:
                        "You cannot block yourself"
                });
            }

            const target =
                db.users.find(
                    item =>
                        Number(
                            item.id
                        ) === targetId
                );

            if (!target) {
                return res.status(404).json({
                    error:
                        "User not found"
                });
            }

            user.blocked_users =
                Array.isArray(
                    user.blocked_users
                )
                    ? user.blocked_users
                    : [];

            if (
                !user.blocked_users.includes(
                    targetId
                )
            ) {
                user.blocked_users.push(
                    targetId
                );
            }

            saveDB();

            req.session.user =
                publicUser(user);

            io.emit(
                "user-blocked",
                {
                    user_id:
                        user.id,
                    blocked_id:
                        targetId
                }
            );

            res.json({
                ok: true,

                blocked_users:
                    user.blocked_users
            });

        } catch (error) {
            console.log(
                "BLOCK USER ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Could not block user"
            });
        }
    }
);

/*
 * UNBLOCK USER
 */

app.delete(
    "/api/block/:id",
    requireAuth,
    (req, res) => {
        try {
            const user =
                getCurrentUser(req);

            const targetId =
                Number(
                    req.params.id
                );

            if (!user) {
                return res.status(404).json({
                    error:
                        "User not found"
                });
            }

            user.blocked_users =
                Array.isArray(
                    user.blocked_users
                )
                    ? user.blocked_users
                    : [];

            user.blocked_users =
                user.blocked_users.filter(
                    id =>
                        Number(id) !==
                        targetId
                );

            saveDB();

            req.session.user =
                publicUser(user);

            io.emit(
                "user-unblocked",
                {
                    user_id:
                        user.id,
                    blocked_id:
                        targetId
                }
            );

            res.json({
                ok: true,

                blocked_users:
                    user.blocked_users
            });

        } catch (error) {
            console.log(
                "UNBLOCK USER ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Could not unblock user"
            });
        }
    }
);

/* =====================================================
   ABOUT HEYYOU
===================================================== */

app.get(
    "/api/about",
    (req, res) => {
        res.json({
            ok: true,

            app_name:
                "HeyYou",

            created_by:
                "Bashir Sons Group of Apps",

            version:
                "1.0.0",

            description:
                "HeyYou is a messaging and calling application."
        });
    }
);

/* =====================================================
   GENERAL FILE UPLOAD
===================================================== */

app.post(
    "/api/upload",
    requireAuth,
    upload.single("file"),
    (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                error:
                    "No file selected"
            });
        }

        res.json({
            ok: true,

            url:
                "/uploads/" +
                req.file.filename,

            name:
                req.file.originalname,

            type:
                req.file.mimetype,

            size:
                req.file.size
        });
    }
);

/* =====================================================
   STATUS SYSTEM — COMPLETE REPLACEMENT
===================================================== */

function normalizeStatus(status) {
    if (!status) return null;

    const fileUrl =
        status.file_url ||
        status.media_url ||
        "";

    const fileName =
        status.file_name ||
        status.media_name ||
        "";

    const fileType =
        status.file_type ||
        status.media_type ||
        "";

    return {
        id: Number(status.id),
        user_id: Number(status.user_id),

        user_name:
            status.user_name || "",

        user_avatar:
            status.user_avatar || "",

        type:
            status.type || "text",

        text:
            status.text || "",

        file_url: fileUrl,
        file_name: fileName,
        file_type: fileType,

        media_url: fileUrl,
        media_name: fileName,
        media_type: fileType,

        created_at:
            status.created_at,

        expires_at:
            status.expires_at,

        views:
            Number(status.views || 0),
        display_seconds:
            Math.min(30, Math.max(1, Number(status.display_seconds || 30)))
    };
}


/* =====================================================
   STATUS CLEANUP
===================================================== */

function cleanupStatuses() {
    const now = Date.now();

    const expiredStatuses =
        db.statuses.filter(status => {
            const expires =
                new Date(
                    status.expires_at
                ).getTime();

            return (
                Number.isFinite(expires) &&
                expires <= now
            );
        });

    if (!expiredStatuses.length) {
        return;
    }

    for (const status of expiredStatuses) {

        deleteUploadedFile(
            status.file_url ||
            status.media_url ||
            ""
        );

        db.status_views =
            db.status_views.filter(view => {
                return (
                    Number(view.status_id) !==
                    Number(status.id)
                );
            });
    }

    db.statuses =
        db.statuses.filter(status => {
            const expires =
                new Date(
                    status.expires_at
                ).getTime();

            return (
                !Number.isFinite(expires) ||
                expires > now
            );
        });

    saveDB();
}


/* =====================================================
   GET ACTIVE STATUSES
===================================================== */

function getActiveStatuses() {

    cleanupStatuses();

    const now = Date.now();

    return db.statuses
        .filter(status => {

            const expires =
                new Date(
                    status.expires_at
                ).getTime();

            return (
                Number.isFinite(expires) &&
                expires > now
            );
        })
        .sort((a, b) => {
            return (
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );
        })
        .map(normalizeStatus);
}


/* =====================================================
   GET STATUS LIST
   /api/status
   /api/statuses
===================================================== */

function statusListHandler(req, res) {

    try {

        const statuses =
            getActiveStatuses();

        const grouped = {};

        for (const status of statuses) {

            const uid =
                String(status.user_id);

            if (!grouped[uid]) {

                grouped[uid] = {
                    user_id:
                        status.user_id,

                    user_name:
                        status.user_name,

                    user_avatar:
                        status.user_avatar,

                    statuses: []
                };
            }

            grouped[uid].statuses.push(
                status
            );
        }

        return res.json({
            ok: true,

            statuses,

            groups:
                Object.values(grouped)
        });

    } catch (error) {

        console.log(
            "GET STATUS ERROR:",
            error
        );

        return res.status(500).json({
            error:
                "Could not load status"
        });
    }
}


app.get(
    "/api/status",
    requireAuth,
    statusListHandler
);


app.get(
    "/api/statuses",
    requireAuth,
    statusListHandler
);


/* =====================================================
   PUBLISH STATUS
   Supports:
   text
   image
   video
===================================================== */

function publishStatusHandler(
    req,
    res
) {

    try {

        const user =
            getCurrentUser(req);

        if (!user) {

            if (req.file) {
                deleteUploadedFile(
                    "/uploads/" +
                    req.file.filename
                );
            }

            return res.status(404).json({
                error:
                    "User not found"
            });
        }


        let type =
            String(
                req.body.type || ""
            )
                .trim()
                .toLowerCase();


        const text =
            String(
                req.body.text || ""
            ).trim();


        /*
         * Frontend compatibility
         */

        if (type === "photo") {
            type = "image";
        }

        if (type === "movie") {
            type = "video";
        }


        /*
         * Automatically detect type
         */

        if (!type && req.file) {

            if (
                req.file.mimetype &&
                req.file.mimetype.startsWith(
                    "image/"
                )
            ) {
                type = "image";
            }

            else if (
                req.file.mimetype &&
                req.file.mimetype.startsWith(
                    "video/"
                )
            ) {
                type = "video";
            }
        }


        if (!type && text) {
            type = "text";
        }


        /*
         * Validate type
         */

        if (
            ![
                "text",
                "image",
                "video"
            ].includes(type)
        ) {

            if (req.file) {
                deleteUploadedFile(
                    "/uploads/" +
                    req.file.filename
                );
            }

            return res.status(400).json({
                error:
                    "Status must contain text, image or video."
            });
        }


        /*
         * Text status validation
         */

        if (
            type === "text" &&
            !text
        ) {

            return res.status(400).json({
                error:
                    "Please enter status text."
            });
        }


        /*
         * Media status validation
         */

        if (
            (
                type === "image" ||
                type === "video"
            ) &&
            !req.file
        ) {

            return res.status(400).json({
                error:
                    "Please select an image or video."
            });
        }


        /*
         * Image validation
         */

        if (
            type === "image" &&
            req.file &&
            !(
                req.file.mimetype || ""
            ).startsWith("image/")
        ) {

            deleteUploadedFile(
                "/uploads/" +
                req.file.filename
            );

            return res.status(400).json({
                error:
                    "Selected file is not an image."
            });
        }


        /*
         * Video validation
         */

        if (
            type === "video" &&
            req.file &&
            !(
                req.file.mimetype || ""
            ).startsWith("video/")
        ) {

            deleteUploadedFile(
                "/uploads/" +
                req.file.filename
            );

            return res.status(400).json({
                error:
                    "Selected file is not a video."
            });
        }


        /*
         * Remove expired statuses first
         */

        cleanupStatuses();


        /*
         * Maximum 5 active statuses per user.
         * Each status remains visible for 30 seconds
         * while it is being viewed, and expires from
         * the feed after 24 hours.
         */

        let userStatuses =
            db.statuses.filter(status => {

                return (
                    Number(status.user_id) ===
                    Number(user.id)
                );
            });


        if (userStatuses.length >= 5) {

            userStatuses.sort((a, b) => {

                return (
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                );
            });


            const oldest =
                userStatuses[0];


            if (oldest) {

                deleteUploadedFile(
                    oldest.file_url ||
                    oldest.media_url ||
                    ""
                );


                db.status_views =
                    db.status_views.filter(
                        view => {

                            return (
                                Number(
                                    view.status_id
                                ) !==
                                Number(oldest.id)
                            );
                        }
                    );


                db.statuses =
                    db.statuses.filter(
                        status => {

                            return (
                                Number(status.id) !==
                                Number(oldest.id)
                            );
                        }
                    );
            }
        }


        /*
         * Dates
         */

        const createdAt =
            new Date();


        const expiresAt =
            new Date(
                createdAt.getTime() +
                (
                    24 *
                    60 *
                    60 *
                    1000
                )
            );


        /*
         * File information
         */

        const fileUrl =
            req.file
                ? "/uploads/" +
                  req.file.filename
                : "";


        const fileName =
            req.file
                ? req.file.originalname
                : "";


        const fileType =
            req.file
                ? req.file.mimetype
                : "";


        /*
         * Create status
         */

        const status = {

            id:
                nextId("statuses"),

            user_id:
                Number(user.id),

            user_name:
                user.name || "",

            user_avatar:
                user.avatar || "",

            type,

            text:
                type === "text"
                    ? text
                    : "",

            file_url:
                fileUrl,

            file_name:
                fileName,

            file_type:
                fileType,

            media_url:
                fileUrl,

            media_name:
                fileName,

            media_type:
                fileType,

            created_at:
                createdAt.toISOString(),

            expires_at:
                expiresAt.toISOString(),

            views: 0,
            display_seconds: 30
        };


        /*
         * Save status
         */

        db.statuses.push(
            status
        );

        saveDB();


        /*
         * Clean object for frontend
         */

        const cleanStatus =
            normalizeStatus(status);


        /*
         * Notify connected clients
         */

        io.emit(
            "status-created",
            cleanStatus
        );


        /*
         * Alternate event name
         */

        io.emit(
            "new-status",
            cleanStatus
        );


        console.log(
            "STATUS PUBLISHED:",
            cleanStatus.id,
            "user:",
            user.id,
            "type:",
            type
        );


        return res.json({

            ok: true,

            status:
                cleanStatus
        });

    } catch (error) {

        console.log(
            "PUBLISH STATUS ERROR:",
            error
        );


        if (req.file) {

            deleteUploadedFile(
                "/uploads/" +
                req.file.filename
            );
        }


        return res.status(500).json({

            error:
                "Could not publish status",

            details:
                process.env.NODE_ENV ===
                "development"
                    ? error.message
                    : undefined
        });
    }
}


/*
 * IMPORTANT:
 * These routes must come AFTER
 * publishStatusHandler.
 */

app.post(
    "/api/status",
    requireAuth,
    upload.single("file"),
    publishStatusHandler
);


app.post(
    "/api/statuses",
    requireAuth,
    upload.single("file"),
    publishStatusHandler
);


/* =====================================================
   VIEW STATUS
===================================================== */

function viewStatusHandler(
    req,
    res
) {

    try {

        cleanupStatuses();


        const statusId =
            Number(req.params.id);


        const viewerId =
            Number(
                req.session.user.id
            );


        const status =
            db.statuses.find(status => {

                return (
                    Number(status.id) ===
                    statusId
                );
            });


        if (!status) {

            return res.status(404).json({
                error:
                    "Status not found"
            });
        }


        /*
         * Owner does not count as a viewer
         */

        if (
            Number(status.user_id) ===
            viewerId
        ) {

            return res.json({
                ok: true,
                views:
                    Number(
                        status.views || 0
                    )
            });
        }


        const alreadyViewed =
            db.status_views.some(view => {

                return (
                    Number(
                        view.status_id
                    ) === statusId &&

                    Number(
                        view.viewer_id
                    ) === viewerId
                );
            });


        if (!alreadyViewed) {

            const view = {

                id:
                    nextId(
                        "status_views"
                    ),

                status_id:
                    statusId,

                viewer_id:
                    viewerId,

                created_at:
                    new Date()
                        .toISOString()
            };


            db.status_views.push(
                view
            );


            status.views =
                Number(
                    status.views || 0
                ) + 1;


            saveDB();
        }


        return res.json({

            ok: true,

            views:
                Number(
                    status.views || 0
                )
        });

    } catch (error) {

        console.log(
            "STATUS VIEW ERROR:",
            error
        );


        return res.status(500).json({
            error:
                "Could not view status"
        });
    }
}


app.post(
    "/api/status/:id/view",
    requireAuth,
    viewStatusHandler
);


app.post(
    "/api/statuses/:id/view",
    requireAuth,
    viewStatusHandler
);


/* =====================================================
   GET STATUS VIEWERS
===================================================== */

function statusViewersHandler(
    req,
    res
) {

    try {

        const statusId =
            Number(req.params.id);


        const status =
            db.statuses.find(status => {

                return (
                    Number(status.id) ===
                    statusId
                );
            });


        if (!status) {

            return res.status(404).json({
                error:
                    "Status not found"
            });
        }


        /*
         * Only owner can see viewers
         */

        if (
            Number(status.user_id) !==
            Number(req.session.user.id)
        ) {

            return res.status(403).json({
                error:
                    "Only status owner can see viewers"
            });
        }


        const viewers =
            db.status_views
                .filter(view => {

                    return (
                        Number(
                            view.status_id
                        ) === statusId
                    );
                })
                .map(view => {

                    const user =
                        db.users.find(u => {

                            return (
                                Number(u.id) ===
                                Number(
                                    view.viewer_id
                                )
                            );
                        });


                    return {

                        id:
                            user?.id ||
                            view.viewer_id,

                        name:
                            user?.name ||
                            "Unknown",

                        avatar:
                            user?.avatar ||
                            "",

                        viewed_at:
                            view.created_at
                    };
                });


        return res.json({

            ok: true,

            viewers
        });

    } catch (error) {

        console.log(
            "STATUS VIEWERS ERROR:",
            error
        );


        return res.status(500).json({
            error:
                "Could not load viewers"
        });
    }
}


app.get(
    "/api/status/:id/viewers",
    requireAuth,
    statusViewersHandler
);


app.get(
    "/api/statuses/:id/viewers",
    requireAuth,
    statusViewersHandler
);


/* =====================================================
   DELETE STATUS
===================================================== */

function deleteStatusHandler(
    req,
    res
) {

    try {

        const statusId =
            Number(req.params.id);


        const userId =
            Number(
                req.session.user.id
            );


        const index =
            db.statuses.findIndex(
                status => {

                    return (
                        Number(status.id) ===
                        statusId &&

                        Number(status.user_id) ===
                        userId
                    );
                }
            );


        if (index === -1) {

            return res.status(404).json({
                error:
                    "Status not found or you are not the owner"
            });
        }


        const status =
            db.statuses[index];


        /*
         * Delete uploaded media
         */

        deleteUploadedFile(
            status.file_url ||
            status.media_url ||
            ""
        );


        /*
         * Remove status
         */

        db.statuses.splice(
            index,
            1
        );


        /*
         * Remove viewers
         */

        db.status_views =
            db.status_views.filter(
                view => {

                    return (
                        Number(
                            view.status_id
                        ) !==
                        statusId
                    );
                }
            );


        saveDB();


        /*
         * Notify all clients
         */

        io.emit(
            "status-deleted",
            {
                id:
                    statusId
            }
        );


        io.emit(
            "status-removed",
            {
                id:
                    statusId
            }
        );


        console.log(
            "STATUS DELETED:",
            statusId,
            "by user:",
            userId
        );


        return res.json({

            ok: true,

            id:
                statusId
        });

    } catch (error) {

        console.log(
            "DELETE STATUS ERROR:",
            error
        );


        return res.status(500).json({
            error:
                "Could not delete status"
        });
    }
}


app.delete(
    "/api/status/:id",
    requireAuth,
    deleteStatusHandler
);


app.delete(
    "/api/statuses/:id",
    requireAuth,
    deleteStatusHandler
);


/* =====================================================
   STATUS CLEANUP TIMER
===================================================== */

setInterval(
    () => {

        try {

            cleanupStatuses();

        } catch (error) {

            console.log(
                "STATUS CLEANUP ERROR:",
                error.message
            );
        }

    },
    5 * 60 * 1000
);
/* =====================================================
   REPORT
===================================================== */

app.post(
    "/api/report",
    requireAuth,
    (req, res) => {
        try {
            const targetId =
                Number(
                    req.body.target_id ||
                    req.body.targetId
                );

            const report = {
                id:
                    nextId(
                        "reports"
                    ),

                reporter_id:
                    Number(
                        req.session.user.id
                    ),

                target_id:
                    targetId,

                reason:
                    String(
                        req.body.reason ||
                        "No reason"
                    ),

                status:
                    "open",

                created_at:
                    new Date()
                        .toISOString()
            };

            db.reports.push(
                report
            );

            saveDB();

            res.json({
                ok: true,
                report
            });

        } catch (error) {
            console.log(
                "REPORT ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Could not create report"
            });
        }
    }
);

/* =====================================================
   ADMIN
===================================================== */

app.get(
    "/api/admin/reports",
    requireAuth,
    requireAdmin,
    (req, res) => {
        res.json(
            db.reports
        );
    }
);

app.get(
    "/api/admin/users",
    requireAuth,
    requireAdmin,
    (req, res) => {
        res.json(
            db.users.map(user => ({
                ...publicUser(user),
                is_blocked: Boolean(user.is_blocked)
            }))
        );
    }
);

app.get("/api/admin/settings", requireAuth, requireAdmin, (req, res) => {
    res.json({
        status_ads_enabled: Boolean(db.settings?.status_ads_enabled),
        status_ads_frequency: Math.max(1, Number(db.settings?.status_ads_frequency || 5))
    });
});

app.put("/api/admin/settings", requireAuth, requireAdmin, (req, res) => {
    const enabled = req.body?.status_ads_enabled;
    const frequency = Number(req.body?.status_ads_frequency || 5);
    if (typeof enabled === "boolean") db.settings.status_ads_enabled = enabled;
    if (Number.isFinite(frequency) && frequency >= 1) db.settings.status_ads_frequency = Math.min(50, Math.floor(frequency));
    saveDB();
    res.json({ ok: true, settings: db.settings });
});

app.post("/api/admin/users/:id/block", requireAuth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const user = db.users.find(u => Number(u.id) === id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role === "admin") return res.status(400).json({ error: "Admin accounts cannot be blocked." });
    user.is_blocked = true;
    user.status = "offline";
    saveDB();
    res.json({ ok: true, user: publicUser(user) });
});

app.post("/api/admin/users/:id/unblock", requireAuth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const user = db.users.find(u => Number(u.id) === id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.is_blocked = false;
    saveDB();
    res.json({ ok: true, user: publicUser(user) });
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const user = db.users.find(u => Number(u.id) === id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role === "admin") return res.status(400).json({ error: "Admin accounts cannot be deleted." });
    if (user.avatar) deleteUploadedFile(user.avatar);
    db.users = db.users.filter(u => Number(u.id) !== id);
    db.messages = db.messages.filter(m => Number(m.sender_id) !== id && Number(m.receiver_id) !== id);
    db.status_views = db.status_views.filter(v => Number(v.viewer_id) !== id);
    db.statuses = db.statuses.filter(st => {
        if (Number(st.user_id) !== id) return true;
        deleteUploadedFile(st.file_url || st.media_url || "");
        return false;
    });
    db.users.forEach(u => {
        u.contacts = Array.isArray(u.contacts) ? u.contacts.filter(cid => Number(cid) !== id) : [];
        u.blocked_users = Array.isArray(u.blocked_users) ? u.blocked_users.filter(cid => Number(cid) !== id) : [];
    });
    db.groups = (db.groups || []).map(g => ({ ...g, members: (g.members || []).filter(mid => Number(mid) !== id) })).filter(g => Number(g.owner_id) !== id && (g.members || []).length);
    db.group_messages = (db.group_messages || []).filter(m => Number(m.sender_id) !== id);
    db.support_messages = (db.support_messages || []).filter(m => Number(m.user_id) !== id);
    saveDB();
    res.json({ ok: true });
});

app.get("/api/admin/support", requireAuth, requireAdmin, (req, res) => {
    const messages = (db.support_messages || []).map(m => ({
        ...m,
        user: publicUser(db.users.find(u => Number(u.id) === Number(m.user_id)))
    }));
    res.json(messages);
});

app.post("/api/admin/support/:id/reply", requireAuth, requireAdmin, (req, res) => {
    const threadId = String(req.params.id || "");
    const text = String(req.body?.message || "").trim();
    if (!threadId || !text) return res.status(400).json({ error: "Message is required" });
    const thread = (db.support_messages || []).find(m => String(m.thread_id) === threadId);
    if (!thread) return res.status(404).json({ error: "Conversation not found" });
    const msg = { id: nextId("support_messages"), thread_id: threadId, user_id: Number(thread.user_id), sender_id: Number(req.session.user.id), sender_role: "admin", message: text, created_at: new Date().toISOString() };
    db.support_messages.push(msg);
    saveDB();
    res.json({ ok: true, message: msg });
});

app.get("/api/support/messages", requireAuth, (req, res) => {
    const userId = Number(req.session.user.id);
    res.json((db.support_messages || []).filter(m => Number(m.user_id) === userId));
});

app.post("/api/support/messages", requireAuth, (req, res) => {
    const userId = Number(req.session.user.id);
    const text = String(req.body?.message || "").trim();
    if (!text) return res.status(400).json({ error: "Message is required" });
    const existing = (db.support_messages || []).find(m => Number(m.user_id) === userId);
    const threadId = existing ? String(existing.thread_id) : `support-${userId}`;
    const msg = { id: nextId("support_messages"), thread_id: threadId, user_id: userId, sender_id: userId, sender_role: "user", message: text, created_at: new Date().toISOString() };
    db.support_messages.push(msg);
    saveDB();
    res.json({ ok: true, message: msg });
});

/* =====================================================
   ONLINE USERS
===================================================== */

const onlineUsers =
    new Map();

function addSocket(
    userId,
    socketId
) {
    const id =
        Number(userId);

    if (!id) {
        return;
    }

    if (
        !onlineUsers.has(id)
    ) {
        onlineUsers.set(
            id,
            new Set()
        );
    }

    onlineUsers
        .get(id)
        .add(socketId);

    const user =
        db.users.find(
            item =>
                Number(
                    item.id
                ) === id
        );

    if (user) {
        user.settings =
            normalizeSettings(
                user.settings
            );

        if (
            user.settings.online_status !==
            false
        ) {
            user.status =
                "online";
        }

        saveDB();

        io.emit(
            "user-status",
            {
                user_id:
                    id,

                status:
                    user.settings.online_status !==
                    false
                        ? "online"
                        : "offline"
            }
        );
    }
}

function removeSocket(
    userId,
    socketId
) {
    const id =
        Number(userId);

    const sockets =
        onlineUsers.get(id);

    if (!sockets) {
        return;
    }

    sockets.delete(
        socketId
    );

    if (
        sockets.size ===
        0
    ) {
        onlineUsers.delete(
            id
        );

        const user =
            db.users.find(
                item =>
                    Number(
                        item.id
                    ) === id
            );

        if (user) {
            user.settings =
                normalizeSettings(
                    user.settings
                );

            user.status =
                "offline";

            saveDB();
        }

        io.emit(
            "user-status",
            {
                user_id:
                    id,

                status:
                    "offline"
            }
        );
    }
}

function socketsFor(
    userId
) {
    return (
        onlineUsers.get(
            Number(userId)
        ) ||
        new Set()
    );
}

/* =====================================================
   SOCKET.IO
===================================================== */

// Bind the same authenticated Express session to Socket.IO so a client
// cannot impersonate another user's ID by emitting a forged auth event.
io.engine.use(sessionMiddleware);
io.use((socket, next) => {
    const sessionUser = socket.request?.session?.user;
    if (!sessionUser?.id) return next(new Error("Authentication required"));
    const user = db.users.find(u => Number(u.id) === Number(sessionUser.id));
    if (!user || user.is_blocked) return next(new Error("Authentication rejected"));
    socket.userId = Number(user.id);
    next();
});

io.on(
    "connection",
    socket => {
        console.log(
            "SOCKET CONNECTED:",
            socket.id
        );

        /* ---------------------------------------------
           AUTH
        --------------------------------------------- */

        socket.on(
            "auth",
            userId => {
                const sessionId = Number(socket.request?.session?.user?.id || 0);
                const requestedId = Number(userId || 0);
                if (!sessionId || (requestedId && requestedId !== sessionId)) {
                    socket.emit("auth-error", {error:"Socket authentication rejected."});
                    return;
                }
                if (socket.userId && socket.userId !== sessionId) removeSocket(socket.userId, socket.id);
                socket.userId = sessionId;
                addSocket(sessionId, socket.id);
            }
        );

        /* ---------------------------------------------
           MESSAGE
        --------------------------------------------- */

        socket.on(
            "message",
            data => {
                if (
                    !socket.userId
                ) {
                    return;
                }

                const to =
                    Number(
                        data?.to
                    );

                const text =
                    String(
                        data?.text ||
                        ""
                    ).trim();

                const fileUrl =
                    data?.file_url ||
                    data?.fileUrl ||
                    "";

                const hasSharedContact =
                    Boolean(
                        String(data?.contact_phone || "").trim()
                    );

                if (
                    !to ||
                    (
                        !text &&
                        !fileUrl &&
                        !Number(data?.contact_id || data?.contactId || 0) &&
                        !hasSharedContact
                    )
                ) {
                    return;
                }

                if (
                    isBlocked(
                        socket.userId,
                        to
                    ) ||
                    isBlocked(
                        to,
                        socket.userId
                    )
                ) {
                    socket.emit(
                        "message-error",
                        {
                            error:
                                "Messaging is blocked."
                        }
                    );

                    return;
                }

                const sender =
                    db.users.find(
                        user =>
                            Number(
                                user.id
                            ) ===
                            Number(
                                socket.userId
                            )
                    );

                const contactId = Number(data?.contact_id || data?.contactId || 0);
                const senderContacts = db.users.find(u => Number(u.id) === Number(socket.userId))?.contacts || [];
                if (contactId && !senderContacts.some(id => Number(id) === contactId)) {
                    socket.emit("message-error", {error:"Only saved contacts can be shared."});
                    return;
                }
                const sharedContact = contactId ? db.users.find(u => Number(u.id) === contactId) : null;
                if (contactId && !sharedContact) {
                    socket.emit("message-error", {error:"Contact not found."});
                    return;
                }

                const phonebookContact =
                    !contactId && String(data?.contact_phone || "").trim()
                        ? {
                            name: String(data?.contact_name || "Contact").trim().slice(0,120),
                            phone: String(data?.contact_phone || "").trim().slice(0,80)
                        }
                        : null;
                const message = {
                    id:
                        nextId(
                            "messages"
                        ),

                    sender_id:
                        Number(
                            socket.userId
                        ),

                    receiver_id:
                        to,

                    text,
                    contact_id: sharedContact ? Number(sharedContact.id) : 0,
                    contact_name: sharedContact?.name || phonebookContact?.name || "",
                    contact_email: sharedContact?.email || "",
                    contact_phone: sharedContact?.phone || phonebookContact?.phone || "",
                    contact_avatar: sharedContact?.avatar || "",

                    file_url:
                        fileUrl,

                    file_name:
                        data?.file_name ||
                        data?.fileName ||
                        "",

                    file_type:
                        data?.file_type ||
                        data?.fileType ||
                        "",

                    sender_name:
                        sender?.name ||
                        "",

                    created_at:
                        new Date()
                            .toISOString()
                };

                db.messages.push(
                    message
                );

                saveDB();

                socket.emit(
                    "message",
                    message
                );

                for (
                    const socketId of
                    socketsFor(to)
                ) {
                    io.to(
                        socketId
                    ).emit(
                        "message",
                        message
                    );
                }
            }
        );

        /* ---------------------------------------------
           GROUP MESSAGE
        --------------------------------------------- */

        socket.on("group-message", data => {
            if (!socket.userId) return;
            const groupId = Number(data?.group_id);
            const text = String(data?.text || "").trim();
            const contactId = Number(data?.contact_id || data?.contactId || 0);
            const group = (db.groups || []).find(g => Number(g.id) === groupId);
            if (!group || !groupForUser(group, socket.userId)) return;
            const senderContacts = db.users.find(u => Number(u.id) === Number(socket.userId))?.contacts || [];
            if (contactId && !senderContacts.some(id => Number(id) === contactId)) return;
            const sharedContact = contactId ? db.users.find(u => Number(u.id) === contactId) : null;
            const phonebookContact =
                !contactId && String(data?.contact_phone || "").trim()
                    ? {
                        name: String(data?.contact_name || "Contact").trim().slice(0,120),
                        phone: String(data?.contact_phone || "").trim().slice(0,80)
                    }
                    : null;
            if (!text && !sharedContact && !phonebookContact) return;

            const sender = db.users.find(u => Number(u.id) === Number(socket.userId));
            const message = {
                id: nextId("group_messages"),
                group_id: groupId,
                sender_id: Number(socket.userId),
                sender_name: sender?.name || "",
                text,
                contact_id: sharedContact ? Number(sharedContact.id) : 0,
                contact_name: sharedContact?.name || phonebookContact?.name || "",
                contact_email: sharedContact?.email || "",
                contact_phone: sharedContact?.phone || phonebookContact?.phone || "",
                contact_avatar: sharedContact?.avatar || "",
                created_at: new Date().toISOString()
            };
            db.group_messages.push(message);
            saveDB();

            for (const memberId of group.members) {
                for (const sid of socketsFor(memberId)) {
                    io.to(sid).emit("group-message", message);
                }
            }
        });

        /* ---------------------------------------------
           CALL USER
        --------------------------------------------- */

        socket.on(
            "call-user",
            data => {
                if (
                    !socket.userId
                ) {
                    return;
                }

                const target =
                    Number(
                        data?.to
                    );

                if (!target) {
                    return;
                }

                if (
                    isBlocked(
                        socket.userId,
                        target
                    ) ||
                    isBlocked(
                        target,
                        socket.userId
                    )
                ) {
                    socket.emit(
                        "call-failed",
                        {
                            reason:
                                "Calling is blocked."
                        }
                    );

                    return;
                }

                const targetUser =
                    db.users.find(
                        user =>
                            Number(
                                user.id
                            ) ===
                            target
                    );

                if (!targetUser) {
                    socket.emit(
                        "call-failed",
                        {
                            reason:
                                "User not found."
                        }
                    );

                    return;
                }

                targetUser.settings =
                    normalizeSettings(
                        targetUser.settings
                    );

                const mode =
                    data?.mode ||
                    "video";

                if (
                    mode === "audio" &&
                    targetUser.settings
                        .allow_audio_calls ===
                        false
                ) {
                    socket.emit(
                        "call-failed",
                        {
                            reason:
                                "This user does not allow audio calls."
                        }
                    );

                    return;
                }

                if (
                    mode === "video" &&
                    targetUser.settings
                        .allow_video_calls ===
                        false
                ) {
                    socket.emit(
                        "call-failed",
                        {
                            reason:
                                "This user does not allow video calls."
                        }
                    );

                    return;
                }

                const offer =
                    data?.offer;

                if (!offer) {
                    socket.emit(
                        "call-failed",
                        {
                            reason:
                                "Call offer missing."
                        }
                    );

                    return;
                }

                const targets =
                    socketsFor(
                        target
                    );

                if (
                    !targets.size
                ) {
                    socket.emit(
                        "call-failed",
                        {
                            reason:
                                "User is offline."
                        }
                    );

                    return;
                }

                for (
                    const socketId of
                    targets
                ) {
                    io.to(
                        socketId
                    ).emit(
                        "incoming-call",
                        {
                            from:
                                socket.userId,

                            offer,

                            mode
                        }
                    );
                }
            }
        );

        /* ---------------------------------------------
           ANSWER CALL
        --------------------------------------------- */

        socket.on(
            "answer-call",
            data => {
                if (
                    !socket.userId
                ) {
                    return;
                }

                const target =
                    Number(
                        data?.to
                    );

                const answer =
                    data?.answer;

                if (
                    !target ||
                    !answer
                ) {
                    return;
                }

                for (
                    const socketId of
                    socketsFor(
                        target
                    )
                ) {
                    io.to(
                        socketId
                    ).emit(
                        "call-answered",
                        {
                            from:
                                socket.userId,

                            answer
                        }
                    );
                }
            }
        );

        /* ---------------------------------------------
           ICE CANDIDATE
        --------------------------------------------- */

        socket.on(
            "ice-candidate",
            data => {
                if (
                    !socket.userId
                ) {
                    return;
                }

                const target =
                    Number(
                        data?.to
                    );

                const candidate =
                    data?.candidate;

                if (
                    !target ||
                    !candidate
                ) {
                    return;
                }

                for (
                    const socketId of
                    socketsFor(
                        target
                    )
                ) {
                    io.to(
                        socketId
                    ).emit(
                        "ice-candidate",
                        {
                            from:
                                socket.userId,

                            candidate
                        }
                    );
                }
            }
        );

        /* ---------------------------------------------
           HANGUP
        --------------------------------------------- */

        socket.on(
            "hangup",
            data => {
                if (
                    !socket.userId
                ) {
                    return;
                }

                const target =
                    Number(
                        data?.to
                    );

                if (!target) {
                    return;
                }

                for (
                    const socketId of
                    socketsFor(
                        target
                    )
                ) {
                    io.to(
                        socketId
                    ).emit(
                        "call-ended",
                        {
                            from:
                                socket.userId
                        }
                    );
                }
            }
        );

        /* ---------------------------------------------
           DISCONNECT
        --------------------------------------------- */

        socket.on(
            "disconnect",
            reason => {
                console.log(
                    "SOCKET DISCONNECTED:",
                    socket.id,
                    reason
                );

                if (
                    socket.userId
                ) {
                    removeSocket(
                        socket.userId,
                        socket.id
                    );
                }
            }
        );
    }
);

/* =====================================================
   STATUS CLEANUP
===================================================== */

setInterval(
    () => {
        try {
            cleanupStatuses();
        } catch (error) {
            console.log(
                "STATUS CLEANUP ERROR:",
                error.message
            );
        }
    },
    5 *
        60 *
        1000
);

/* =====================================================
   MULTER / SERVER ERROR
===================================================== */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {
        console.log(
            "SERVER ERROR:",
            error.message
        );

        if (
            error instanceof
            multer.MulterError
        ) {
            return res.status(400).json({
                error:
                    "Upload error: " +
                    error.message
            });
        }

        res.status(400).json({
            error:
                error.message ||
                "Request error"
        });
    }
);
/* =====================================================
   ADMIN DASHBOARD PAGE
===================================================== */

app.get("/admin", (req, res) => {
    if (req.session.user?.role === "admin") {
        return res.sendFile(path.join(ROOT, "public", "admin.html"));
    }
    res.sendFile(path.join(ROOT, "public", "admin-login.html"));
});

/* =====================================================
   START SERVER
===================================================== */

server.listen(
    PORT,
    () => {
        console.log(
            "======================================"
        );

        console.log(
            "HeyYou Server Started Successfully"
        );

        console.log(
            "http://localhost:" +
            PORT
        );

        console.log(
            "--------------------------------------"
        );

        console.log(
            "Status GET: /api/status"
        );

        console.log(
            "Status POST: /api/status"
        );

        console.log(
            "Settings GET: /api/settings"
        );

        console.log(
            "Settings PUT: /api/settings"
        );

        console.log(
            "Password POST: /api/change-password"
        );

        console.log(
            "About GET: /api/about"
        );

        console.log(
            "======================================"
        );
    }
);