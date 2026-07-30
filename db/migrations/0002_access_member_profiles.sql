CREATE TABLE access_member_profiles (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  display_name TEXT NOT NULL CHECK(length(display_name) <= 80),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
