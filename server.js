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
const DATA = path.join(ROOT, "data");
const DB_FILE = path.join(DATA, "heyyou.json");

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

        data.seq = data.seq || {};

        data.seq.users = Number(data.seq.users || 0);
        data.seq.messages = Number(data.seq.messages || 0);
        data.seq.groups = Number(data.seq.groups || 0);
        data.seq.group_messages = Number(data.seq.group_messages || 0);
        data.seq.reports = Number(data.seq.reports || 0);
        data.seq.statuses = Number(data.seq.statuses || 0);
        data.seq.status_views =
            Number(data.seq.status_views || 0);

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

function saveDB() {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2),
            "utf8"
        );
    } catch (error) {
        console.log(
            "DATABASE SAVE ERROR:",
            error.message
        );
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

/* =====================================================
   DEFAULT ADMIN
===================================================== */

if (
    !db.users.some(
        user =>
            user.email === "farhanraza9911@gmail.com"
    )
) {
    const admin = {
        id: nextId("users"),

        name: "HeyYou Admin",

        email: "farhanraza9911@gmail.com",

        password: bcrypt.hashSync(
            "344655farhan",
            10
        ),

        avatar: "",

        bio: "",

        role: "admin",

        status: "offline",

        created_at:
            new Date().toISOString(),

        settings:
            defaultSettings(),

        blocked_users: []

    };

    db.users.push(admin);

    saveDB();

    console.log(
        "Default admin created: farhanraza9911@gmail.com / 344655farhan"
    );
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

const ADMIN_EMAIL =
    "farhanraza9911@gmail.com";

const ADMIN_PASSWORD =
    "344655farhan";

let adminUser =
    db.users.find(
        user =>
            user.role === "admin"
    );

if (!adminUser) {

    adminUser = {
        id: nextId("users"),

        name: "HeyYou Admin",

        email:
            ADMIN_EMAIL,

        password:
            bcrypt.hashSync(
                ADMIN_PASSWORD,
                10
            ),

        avatar: "",

        bio: "",

        role: "admin",

        status: "offline",

        created_at:
            new Date().toISOString(),

        settings:
            defaultSettings(),

        blocked_users: []
    };

    db.users.push(
        adminUser
    );

} else {

    /*
     * Update existing admin
     * to the new credentials.
     */

    adminUser.name =
        "HeyYou Admin";

    adminUser.email =
        ADMIN_EMAIL;

    adminUser.password =
        bcrypt.hashSync(
            ADMIN_PASSWORD,
            10
        );

    adminUser.role =
        "admin";

    adminUser.settings =
        normalizeSettings(
            adminUser.settings
        );

    adminUser.blocked_users =
        Array.isArray(
            adminUser.blocked_users
        )
            ? adminUser.blocked_users
            : [];
}

saveDB();

console.log(
    "Admin ready:",
    ADMIN_EMAIL
);

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

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "heyyou-super-secret-change-this",

        resave: false,

        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            maxAge:
                7 *
                24 *
                60 *
                60 *
                1000
        }
    })
);

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

    limits: {
        fileSize:
            100 *
            1024 *
            1024
    },

    fileFilter: (
        req,
        file,
        cb
    ) => {
        const allowed =
            /\.(jpg|jpeg|png|gif|webp|bmp|svg|mp4|webm|mov|avi|mkv|mp3|wav|m4a|ogg|aac|pdf|doc|docx|xls|xlsx|xlsm|ods|odt|odp|ppt|pptx|txt|csv|zip|rar|7z)$/i;

        if (
            allowed.test(
                file.originalname
            )
        ) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    "File type not allowed."
                )
            );
        }
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
   REGISTER
   Email/Gmail OR Mobile Number
===================================================== */

app.post(
    "/api/register",
    (req, res) => {
        try {
            const name =
                String(
                    req.body.name || ""
                ).trim();

            const email =
                String(
                    req.body.email || ""
                )
                    .trim()
                    .toLowerCase();

            const phone =
                normalizePhone(
                    req.body.phone ||
                    req.body.mobile ||
                    ""
                );

            const password =
                String(
                    req.body.password || ""
                );

            /*
             * User must provide either
             * email OR phone number.
             */
            if (
                !name ||
                password.length < 6 ||
                (!email && !phone)
            ) {
                return res.status(400).json({
                    error:
                        "Name, email or mobile number, and 6+ character password required"
                });
            }

            /*
             * Basic email validation
             * only when email is provided.
             */
            if (
                email &&
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                    email
                )
            ) {
                return res.status(400).json({
                    error:
                        "Please enter a valid email address"
                });
            }

            /*
             * Phone validation
             * only when phone is provided.
             */
            if (
                phone &&
                !isValidPhone(phone)
            ) {
                return res.status(400).json({
                    error:
                        "Please enter a valid mobile number with country code"
                });
            }

            /*
             * Check duplicate email.
             */
            if (
                email &&
                db.users.some(
                    user =>
                        String(
                            user.email || ""
                        )
                            .toLowerCase() ===
                        email
                )
            ) {
                return res.status(400).json({
                    error:
                        "Email already exists"
                });
            }

            /*
             * Check duplicate phone.
             */
            if (
                phone &&
                db.users.some(
                    user =>
                        normalizePhone(
                            user.phone || ""
                        ) === phone
                )
            ) {
                return res.status(400).json({
                    error:
                        "Mobile number already exists"
                });
            }

            const user = {
                id: nextId("users"),

                name,

                email:
                    email || "",

                phone:
                    phone || "",

                password:
                    bcrypt.hashSync(
                        password,
                        10
                    ),

                avatar: "",

                bio: "",

                role: "user",

                status: "online",

                created_at:
                    new Date().toISOString(),

                settings:
                    defaultSettings(),

                blocked_users: []
            };

            db.users.push(user);

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
                "REGISTER ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Registration failed"
            });
        }
    }
);

/* =====================================================
   PASSWORD RESET VIA EMAIL OTP
===================================================== */

async function sendPasswordResetOtp(email, otp) {
    const user = String(process.env.GMAIL_USER || "").trim();
    const pass = String(process.env.GMAIL_APP_PASSWORD || "").trim();
    if (!user || !pass) throw new Error("Gmail SMTP is not configured on the server.");

    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass }
    });

    await transporter.sendMail({
        from: user,
        to: email,
        subject: "HeyYou password reset OTP",
        text: `Your HeyYou password reset OTP is ${otp}. It expires in 10 minutes.`
    });
}

app.post("/api/password-reset/request", async (req, res) => {
    try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({error:"Enter a valid Gmail/email address."});
        }
        const user = db.users.find(u => String(u.email || "").toLowerCase() === email);
        if (!user) return res.status(404).json({error:"No HeyYou account is registered with this email."});

        const otp = String(crypto.randomInt(100000, 1000000));
        passwordResetOtps.set(email, {otp, expires:Date.now()+10*60*1000, attempts:0});
        await sendPasswordResetOtp(email, otp);
        res.json({ok:true, message:"OTP sent to your email."});
    } catch(error) {
        console.log("PASSWORD RESET OTP ERROR:", error.message);
        res.status(500).json({error:"Could not send OTP. Check Gmail SMTP settings on Render."});
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
   LOGIN
===================================================== */

app.post(
    "/api/login",
    (req, res) => {
        try {
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

          const user =
    db.users.find(
        item =>
            (
                item.email &&
                String(
                    item.email
                )
                    .toLowerCase() ===
                loginValue
            ) ||
            (
                normalizedLoginPhone &&
                normalizePhone(
                    item.phone || ""
                ) ===
                normalizedLoginPhone
            )
    );

            if (
                !user ||
                !bcrypt.compareSync(
                    password,
                    user.password
                )
            ) {
                return res.status(401).json({
                  error:
    "Invalid email/mobile or password"
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
    const normalized = new Set(incoming.map(normalizePhone).filter(isValidPhone));
    const matched = db.users.filter(u =>
        Number(u.id) !== Number(user.id) &&
        u.phone &&
        normalized.has(normalizePhone(u.phone))
    );

    user.contacts = [...new Set(matched.map(u => Number(u.id)))];
    saveDB();
    res.json({ok:true, contacts:matched.map(publicUser)});
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
    const userId = Number(req.session.user.id);
    const groups = (db.groups || [])
        .filter(g => groupForUser(g, userId))
        .map(publicGroup);
    res.json(groups);
});

app.post("/api/groups", requireAuth, (req, res) => {
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
            Number(status.views || 0)
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
         * Maximum 10 active statuses
         * per user
         */

        let userStatuses =
            db.statuses.filter(status => {

                return (
                    Number(status.user_id) ===
                    Number(user.id)
                );
            });


        if (userStatuses.length >= 10) {

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

            views: 0
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
            db.users.map(
                publicUser
            )
        );
    }
);

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
                const id =
                    Number(userId);

                if (!id) {
                    return;
                }

                if (
                    socket.userId
                ) {
                    removeSocket(
                        socket.userId,
                        socket.id
                    );
                }

                socket.userId =
                    id;

                addSocket(
                    id,
                    socket.id
                );
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

                if (
                    !to ||
                    (
                        !text &&
                        !fileUrl
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
            const group = (db.groups || []).find(g => Number(g.id) === groupId);
            if (!group || !groupForUser(group, socket.userId) || !text) return;

            const sender = db.users.find(u => Number(u.id) === Number(socket.userId));
            const message = {
                id: nextId("group_messages"),
                group_id: groupId,
                sender_id: Number(socket.userId),
                sender_name: sender?.name || "",
                text,
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

app.get(
    "/admin",
    requireAuth,
    requireAdmin,
    (req, res) => {

        res.sendFile(
            path.join(
                ROOT,
                "public",
                "admin.html"
            )
        );

    }
);

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