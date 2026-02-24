const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database("database.db");

function initDb() {

  // init.sql ni to‘g‘ri topish uchun
  const initPath = path.join(__dirname, "init.sql");

  console.log("SQL path:", initPath);

  if (!fs.existsSync(initPath)) {
    console.error("init.sql topilmadi!");
    return;
  }

  const sql = fs.readFileSync(initPath, "utf8");

  db.exec(sql);

  console.log("Database initialized");
}

module.exports = { db, initDb };
