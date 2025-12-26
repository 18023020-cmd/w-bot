const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/finance.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        amount REAL,
        description TEXT,
        date TEXT
    )`);
});

const addTransaction = (type, amount, desc) => {
    return new Promise((resolve, reject) => {
        // Kita simpan waktu lengkap (ISO) biar akurat
        const date = new Date().toISOString();
        db.run("INSERT INTO transactions (type, amount, description, date) VALUES (?, ?, ?, ?)", 
            [type, amount, desc, date], 
            function(err) { if (err) reject(err); else resolve(this.lastID); }
        );
    });
};

const getBalance = () => {
    return new Promise((resolve, reject) => {
        db.get(`SELECT 
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) - 
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as balance 
            FROM transactions`, (err, row) => {
            if (err) reject(err); else resolve(row.balance || 0);
        });
    });
};

const getRecap = (days) => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM transactions WHERE date >= date('now', '-${days} days') ORDER BY date ASC`, 
            (err, rows) => { if (err) reject(err); else resolve(rows); }
        );
    });
};

// --- FITUR BARU: HAPUS SPESIFIK ---
const deleteById = (id) => {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM transactions WHERE id = ?`, [id], function(err) {
            if (err) reject(err); else resolve(this.changes);
        });
    });
};

module.exports = { addTransaction, getBalance, getRecap, deleteById };