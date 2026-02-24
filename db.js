const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

function initDb(db, initSqlPath) {
  const sql = fs.readFileSync(initSqlPath, 'utf8');
  db.exec(sql);
}

module.exports = { openDb, initDb };
