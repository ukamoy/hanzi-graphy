import { Router } from 'express'
import crypto from 'crypto'
import { getDb } from '../db.js'
import { hashPassword, createSalt } from '../hash.js'

const router = Router()
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000

router.post('/login', (req, res) => {
  const { name, password } = req.body
  if (!name || !password) {
    res.status(400).json({ error: '用户名和密码不能为空' })
    return
  }

  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name.trim()) as any

  if (!user || hashPassword(password, user.password_salt) !== user.password_hash) {
    res.status(401).json({ error: '用户名或密码不正确' })
    return
  }

  const token = crypto.randomUUID()
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, Date.now() + SESSION_DURATION_MS)

  res.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, createdAt: user.created_at }
  })
})

router.post('/logout', (req, res) => {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7)
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token)
  }
  res.json({ ok: true })
})

router.get('/me', (req, res) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.json({ user: null })
    return
  }

  const token = auth.slice(7)
  const db = getDb()
  const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, Date.now()) as any

  if (!session) {
    res.json({ user: null })
    return
  }

  const user = db.prepare('SELECT id, name, role, created_at FROM users WHERE id = ?').get(session.user_id) as any
  res.json({ user: user ? { id: user.id, name: user.name, role: user.role, createdAt: user.created_at } : null })
})

router.get('/is-default-admin-password', (req, res) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.json({ isDefault: false })
    return
  }

  const token = auth.slice(7)
  const db = getDb()
  const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, Date.now()) as any
  if (!session || session.user_id !== 'admin') {
    res.json({ isDefault: false })
    return
  }

  const admin = db.prepare('SELECT * FROM users WHERE id = ?').get('admin') as any
  const defaultHash = hashPassword('n9RzWpQYNnZw', createSalt('admin'))
  res.json({ isDefault: admin?.password_hash === defaultHash })
})

export default router
