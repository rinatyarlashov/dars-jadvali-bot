PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  day TEXT NOT NULL,          -- Dushanba, Seshanba...
  start_time TEXT NOT NULL,   -- 08:30
  end_time TEXT NOT NULL,     -- 09:50
  subject TEXT NOT NULL,
  direction TEXT,
  course TEXT,
  group_name TEXT,
  room TEXT,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);
