import session, { type SessionData } from "express-session";
import { db } from "./db.js";

type SessionRow = {
  data: string;
  expires_at: number;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_expires
    ON sessions(expires_at);
`);

function expirationFor(sessionData: SessionData) {
  const expires = sessionData.cookie.expires;
  if (expires) return new Date(expires).getTime();
  return Date.now() + (sessionData.cookie.maxAge ?? 30 * 24 * 60 * 60 * 1_000);
}

export class SQLiteSessionStore extends session.Store {
  get(
    sid: string,
    callback: (error: unknown, session?: SessionData | null) => void,
  ) {
    try {
      const row = db
        .prepare("SELECT data, expires_at FROM sessions WHERE sid = ?")
        .get(sid) as SessionRow | undefined;
      if (!row) {
        callback(null, null);
        return;
      }
      if (row.expires_at <= Date.now()) {
        db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.data) as SessionData);
    } catch (error) {
      callback(error);
    }
  }

  set(
    sid: string,
    sessionData: SessionData,
    callback?: (error?: unknown) => void,
  ) {
    try {
      db.prepare(
        `INSERT INTO sessions (sid, data, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET
           data = excluded.data,
           expires_at = excluded.expires_at`,
      ).run(sid, JSON.stringify(sessionData), expirationFor(sessionData));
      db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid: string, callback?: (error?: unknown) => void) {
    try {
      db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  touch(
    sid: string,
    sessionData: SessionData,
    callback?: (error?: unknown) => void,
  ) {
    try {
      db.prepare("UPDATE sessions SET expires_at = ? WHERE sid = ?").run(
        expirationFor(sessionData),
        sid,
      );
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }
}
