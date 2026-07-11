// server.js
// باك اند Sunny Dahab Event
// سيرفر Node.js بسيط (من غير مكتبات خارجية) بيعمل:
//  - Serve للموقع العام (public/)
//  - Serve لصفحة الأدمن (admin/)
//  - API لتسجيل المشتركين وحفظ نتائج المسابقة
//  - API محمي بباسورد لصفحة الأدمن (عرض / حذف / تصدير CSV)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
    findByPhone,
    createParticipant,
    findById,
    completeParticipant,
    getAllParticipants,
    deleteParticipant,
    getStats
} from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const ADMIN_DIR = path.join(__dirname, "..", "admin");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme123";

if (ADMIN_PASSWORD === "SG1998") {
    console.warn(
        "\n⚠️  تحذير: بتستخدم باسورد الأدمن الافتراضي (changeme123).\n" +
        "   غيّره عن طريق متغير البيئة ADMIN_PASSWORD قبل ما ترفع الموقع فعلياً.\n"
    );
}

// ===========================
// إدارة الجلسات (Sessions) البسيطة في الذاكرة
// ===========================
const sessions = new Map(); // token -> expiry timestamp
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 ساعة

function createSession() {
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    return token;
}

function isValidSession(token) {
    if (!token) return false;
    const expiry = sessions.get(token);
    if (!expiry) return false;
    if (Date.now() > expiry) {
        sessions.delete(token);
        return false;
    }
    return true;
}

// ===========================
// حماية بسيطة ضد محاولات تخمين الباسورد
// ===========================
const loginAttempts = new Map(); // ip -> { count, lockUntil }
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 دقيقة

function isLocked(ip) {
    const entry = loginAttempts.get(ip);
    if (!entry) return false;
    if (entry.lockUntil && Date.now() < entry.lockUntil) return true;
    if (entry.lockUntil && Date.now() >= entry.lockUntil) {
        loginAttempts.delete(ip);
    }
    return false;
}

function registerFailedAttempt(ip) {
    const entry = loginAttempts.get(ip) || { count: 0, lockUntil: null };
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) {
        entry.lockUntil = Date.now() + LOCK_MS;
        entry.count = 0;
    }
    loginAttempts.set(ip, entry);
}

function clearAttempts(ip) {
    loginAttempts.delete(ip);
}

// ===========================
// أدوات مساعدة
// ===========================
function sendJSON(res, statusCode, data, extraHeaders = {}) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        ...extraHeaders
    });
    res.end(body);
}

function parseCookies(req) {
    const header = req.headers.cookie;
    const cookies = {};
    if (!header) return cookies;
    header.split(";").forEach((pair) => {
        const idx = pair.indexOf("=");
        if (idx === -1) return;
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        cookies[key] = decodeURIComponent(val);
    });
    return cookies;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        let size = 0;
        const MAX_SIZE = 1024 * 1024; // 1MB كحد أقصى
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_SIZE) {
                reject(new Error("PAYLOAD_TOO_LARGE"));
                req.destroy();
                return;
            }
            data += chunk;
        });
        req.on("end", () => {
            if (!data) return resolve({});
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                reject(new Error("INVALID_JSON"));
            }
        });
        req.on("error", reject);
    });
}

function getClientIp(req) {
    return req.socket.remoteAddress || "unknown";
}

//  
function sanitizeText(value, maxLen = 200) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLen);
}

function isValidPhone(phone) {
    // بيقبل أرقام، مسافات، +، - بطول معقول
    return /^[0-9+\-\s]{6,20}$/.test(phone);
}

function isValidEmail(email) {
    if (!email) return true; // الإيميل مش دايماً إجباري في كل الحالات
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

function serveStatic(res, rootDir, urlPath) {
    // امنع أي محاولة للخروج بره المجلد (path traversal)
    const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    let filePath = path.join(rootDir, safePath);

    if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("404 -error");
            return;
        }
        if (stats.isDirectory()) {
            filePath = path.join(filePath, "index.html");
        }
        fs.readFile(filePath, (err2, content) => {
            if (err2) {
                res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("404 -error");
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
            res.end(content);
        });
    });
}

function toCSV(rows) {
    const headers = ["id", "name", "email", "phone", "friendName", "friendPhone", "score", "prizes", "status", "createdAt"];
    const escape = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.join(",")];
    rows.forEach((r) => {
        lines.push(headers.map((h) => escape(h === "prizes" ? r.prizes.join(" | ") : r[h])).join(","));
    });
    return "\uFEFF" + lines.join("\r\n"); 
}

// ===========================
// السيرفر
// ===========================
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    // CORS   
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        // ===== API: تسجيل مشترك جديد =====
        if (pathname === "/api/register" && req.method === "POST") {
            const body = await readBody(req);
            const name = sanitizeText(body.name, 100);
            const email = sanitizeText(body.email, 150);
            const phone = sanitizeText(body.phone, 30);

            if (!name) return sendJSON(res, 400, { error: "الاسم مطلوب" });
            if (!phone || !isValidPhone(phone)) return sendJSON(res, 400, { error: "رقم الهاتف غير صحيح" });
            if (email && !isValidEmail(email)) return sendJSON(res, 400, { error: "الإيميل غير صحيح" });

            const existing = findByPhone(phone);
            if (existing) {
                return sendJSON(res, 409, { error: "هذا الرقم شارك من قبل" });
            }

            const participant = createParticipant({ name, email, phone });
            return sendJSON(res, 201, { id: participant.id });
        }

        // ===== API: فحص رقم الهاتف (اختياري، لو حبيت تستخدمه بشكل منفصل) =====
        if (pathname === "/api/check-phone" && req.method === "POST") {
            const body = await readBody(req);
            const phone = sanitizeText(body.phone, 30);
            if (!phone) return sendJSON(res, 400, { error: "رقم الهاتف مطلوب" });
            const existing = findByPhone(phone);
            return sendJSON(res, 200, { exists: !!existing });
        }

        // ===== API: حفظ نتيجة المسابقة عند الانتهاء =====
        const completeMatch = pathname.match(/^\/api\/participants\/(\d+)\/complete$/);
        if (completeMatch && req.method === "PUT") {
            const id = Number(completeMatch[1]);
            const existing = findById(id);
            if (!existing) return sendJSON(res, 404, { error: "المشترك غير موجود" });

            const body = await readBody(req);
            const friendName = sanitizeText(body.friendName, 100);
            const friendPhone = sanitizeText(body.friendPhone, 30);
            const score = Number.isFinite(Number(body.score)) ? Number(body.score) : 0;
            const prizes = Array.isArray(body.prizes) ? body.prizes.map((p) => sanitizeText(String(p), 100)) : [];
            const answers = Array.isArray(body.answers) ? body.answers : [];

            const updated = completeParticipant(id, { friendName, friendPhone, score, prizes, answers });
            return sendJSON(res, 200, { ok: true, participant: updated });
        }

        // ===== API: تسجيل دخول الأدمن =====
        if (pathname === "/api/admin/login" && req.method === "POST") {
            const ip = getClientIp(req);
            if (isLocked(ip)) {
                return sendJSON(res, 429, { error: "محاولات كتير خاطئة، حاول تاني بعد 15 دقيقة" });
            }
            const body = await readBody(req);
            const password = String(body.password || "");

            const a = Buffer.from(password);
            const b = Buffer.from(ADMIN_PASSWORD);
            const match = a.length === b.length && crypto.timingSafeEqual(a, b);

            if (!match) {
                registerFailedAttempt(ip);
                return sendJSON(res, 401, { error: "باسورد غلط" });
            }

            clearAttempts(ip);
            const token = createSession();
            return sendJSON(res, 200, { ok: true }, {
                "Set-Cookie": `admin_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Strict`
            });
        }

        if (pathname === "/api/admin/logout" && req.method === "POST") {
            const cookies = parseCookies(req);
            if (cookies.admin_session) sessions.delete(cookies.admin_session);
            return sendJSON(res, 200, { ok: true }, {
                "Set-Cookie": "admin_session=; HttpOnly; Path=/; Max-Age=0"
            });
        }

        // ===== كل مسارات الأدمن التانية محمية =====
        if (pathname.startsWith("/api/admin/")) {
            const cookies = parseCookies(req);
            if (!isValidSession(cookies.admin_session)) {
                return sendJSON(res, 401, { error: "غير مصرح، سجل دخول الأدمن الأول" });
            }

            if (pathname === "/api/admin/participants" && req.method === "GET") {
                return sendJSON(res, 200, { participants: getAllParticipants(), stats: getStats() });
            }

            if (pathname === "/api/admin/export.csv" && req.method === "GET") {
                const csv = toCSV(getAllParticipants());
                res.writeHead(200, {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": "attachment; filename=participants.csv"
                });
                res.end(csv);
                return;
            }

            const delMatch = pathname.match(/^\/api\/admin\/participants\/(\d+)$/);
            if (delMatch && req.method === "DELETE") {
                const ok = deleteParticipant(Number(delMatch[1]));
                return sendJSON(res, ok ? 200 : 404, { ok });
            }

            return sendJSON(res, 404, { error: "غير موجود" });
        }

        // ===== ملفات الأدمن الثابتة =====
        if (pathname === "/admin" || pathname === "/admin/") {
            return serveStatic(res, ADMIN_DIR, "/index.html");
        }
        if (pathname.startsWith("/admin/")) {
            return serveStatic(res, ADMIN_DIR, pathname.replace("/admin", ""));
        }

        // ===== الموقع العام (public/) =====
        return serveStatic(res, PUBLIC_DIR, pathname === "/" ? "/index.html" : pathname);
    } catch (err) {
        if (err.message === "INVALID_JSON") {
            return sendJSON(res, 400, { error: "بيانات غير صحيحة" });
        }
        if (err.message === "PAYLOAD_TOO_LARGE") {
            return sendJSON(res, 413, { error: "البيانات كبيرة جداً" });
        }
        console.error(err);
        return sendJSON(res, 500, { error: "خطأ في السيرفر" });
    }
});

server.listen(PORT, () => {
    console.log(`\n✅ Sunny Dahab Event server شغال على http://localhost:${PORT}`);
    console.log(`   صفحة الأدمن: http://localhost:${PORT}/admin\n`);
});
