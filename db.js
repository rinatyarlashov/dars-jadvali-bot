const Database = require('better-sqlite3');
const fs = require('fs');

function openDb(path) {
  const db = new Database(path);

  if (fs.existsSync('./init.sql')) {
    const initSql = fs.readFileSync('./init.sql', 'utf8');
    db.exec(initSql);
  }

  return db;
}

module.exports = { openDb };
