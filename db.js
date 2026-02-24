// db.js
const fs = require('fs');
const Database = require('better-sqlite3');

function openDb(dbPath) {
  // Railway'da write qilish mumkin bo‘lgan joy: /tmp
  // Agar siz DB_PATH bermasangiz, defaultni /tmp ga qo'yib yuborish ham mumkin:
  // const finalPath = dbPath || '/tmp/data.db';
  const finalPath = dbPath;
  return new Database(finalPath);
}

function initDb(db, initSqlPath) {
  // init.sql yo‘q bo‘lsa — yiqitmaymiz
  if (!initSqlPath || !fs.existsSync(initSqlPath)) {
    console.warn('⚠️ init.sql topilmadi:', initSqlPath);
    return;
  }
  const sql = fs.readFileSync(initSqlPath, 'utf8');
  db.exec(sql);
}

module.exports = { openDb, initDb };
