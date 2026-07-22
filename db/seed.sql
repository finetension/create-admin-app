INSERT INTO users (id, email, created_at, updated_at)
VALUES (lower(hex(randomblob(16))), __ALLOWED_EMAIL_SQL__, datetime('now'), datetime('now'))
ON CONFLICT(email) DO UPDATE SET updated_at = datetime('now');
