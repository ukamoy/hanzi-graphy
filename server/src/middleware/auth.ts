import { Request, Response, NextFunction } from 'express'
import { getDb } from '../db.js'

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录' })
    return
  }

  const token = auth.slice(7)
  const db = getDb()
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as { user_id: string; expires_at: number } | undefined

  if (!session || session.expires_at < Date.now()) {
    if (session) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    }
    res.status(401).json({ error: '登录已过期' })
    return
  }

  db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(Date.now() + SESSION_DURATION_MS, token)
  ;(req as any).userId = session.user_id
  next()
}
