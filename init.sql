PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT,
  course TEXT,
  group_name TEXT,
  day TEXT,
  lesson_num INTEGER,
  subject TEXT,
  teacher TEXT,
  room TEXT
);
