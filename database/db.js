import Database from 'better-sqlite3';

const db = new Database('bot_data.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS action_counts (
    user1_id TEXT,
    user2_id TEXT,
    action_type TEXT,
    count INTEGER,
    PRIMARY KEY (user1_id, user2_id, action_type)
  )
`);

export const getCount = db.prepare('SELECT count FROM action_counts WHERE user1_id = ? AND user2_id = ? AND action_type = ?');
export const updateCount = db.prepare('INSERT INTO action_counts (user1_id, user2_id, action_type, count) VALUES (@u1, @u2, @action, 1) ON CONFLICT(user1_id, user2_id, action_type) DO UPDATE SET count = count + 1 RETURNING count');

export default db;