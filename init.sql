PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS directions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction_id INTEGER NOT NULL,
  course INTEGER NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(direction_id, course, name),
  FOREIGN KEY(direction_id) REFERENCES directions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  weekday INTEGER NOT NULL,         -- 1..7
  start_time TEXT NOT NULL,         -- "09:00"
  end_time TEXT NOT NULL,           -- "10:20"
  subject TEXT NOT NULL,
  teacher TEXT,
  room TEXT,
  note TEXT,
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lessons_group_day
ON lessons(group_id, weekday, start_time);
