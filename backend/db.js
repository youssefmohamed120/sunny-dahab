// db.js
// طبقة قاعدة البيانات — بتستخدم موديول node:sqlite المدمج في Node.js
// مفيش أي مكتبات خارجية محتاجة (مفيش npm install)

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "event.db");
const db = new DatabaseSync(dbPath);

db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT NOT NULL UNIQUE,
        friendName TEXT,
        friendPhone TEXT,
        score INTEGER DEFAULT 0,
        prizes TEXT DEFAULT '[]',
        answers TEXT DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'registered',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
    );
`);

function rowToParticipant(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        friendName: row.friendName,
        friendPhone: row.friendPhone,
        score: row.score,
        prizes: JSON.parse(row.prizes || "[]"),
        answers: JSON.parse(row.answers || "[]"),
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

export function findByPhone(phone) {
    const stmt = db.prepare("SELECT * FROM participants WHERE phone = ?");
    return rowToParticipant(stmt.get(phone));
}

export function createParticipant({ name, email, phone }) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        INSERT INTO participants (name, email, phone, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name, email || "", phone, now, now);
    return findById(Number(info.lastInsertRowid));
}

export function findById(id) {
    const stmt = db.prepare("SELECT * FROM participants WHERE id = ?");
    return rowToParticipant(stmt.get(id));
}

export function completeParticipant(id, { friendName, friendPhone, score, prizes, answers }) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        UPDATE participants
        SET friendName = ?, friendPhone = ?, score = ?, prizes = ?, answers = ?, status = 'completed', updatedAt = ?
        WHERE id = ?
    `);
    stmt.run(
        friendName || "",
        friendPhone || "",
        Number(score) || 0,
        JSON.stringify(prizes || []),
        JSON.stringify(answers || []),
        now,
        id
    );
    return findById(id);
}

export function getAllParticipants() {
    const stmt = db.prepare("SELECT * FROM participants ORDER BY id DESC");
    return stmt.all().map(rowToParticipant);
}

export function deleteParticipant(id) {
    const stmt = db.prepare("DELETE FROM participants WHERE id = ?");
    const info = stmt.run(id);
    return info.changes > 0;
}

export function getStats() {
    const total = db.prepare("SELECT COUNT(*) AS c FROM participants").get().c;
    const completed = db.prepare("SELECT COUNT(*) AS c FROM participants WHERE status = 'completed'").get().c;
    const avgScoreRow = db.prepare("SELECT AVG(score) AS a FROM participants WHERE status = 'completed'").get();
    return {
        total,
        completed,
        registeredOnly: total - completed,
        avgScore: avgScoreRow.a ? Math.round(avgScoreRow.a * 100) / 100 : 0
    };
}

export default db;
