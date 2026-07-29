import { Router } from 'express'
import crypto from 'crypto'
import { getDb } from '../db.js'
import { hashPassword, createSalt } from '../hash.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`
}

router.get('/', requireAuth, (req, res) => {
  const db = getDb()
  const users = db.prepare('SELECT id, name, role, created_at FROM users ORDER BY created_at ASC').all() as any[]
  res.json({ users: users.map((u) => ({ id: u.id, name: u.name, role: u.role, createdAt: u.created_at })) })
})

router.post('/', requireAuth, (req, res) => {
  const { name, password } = req.body
  const db = getDb()
  const id = createId('user')
  const studentCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get() as { count: number }
  const userName = (name || '').trim() || `学生 ${studentCount.count + 1}`
  const userPassword = (password || '').trim() || '123456'
  const salt = createSalt(id)
  const hash = hashPassword(userPassword, salt)

  db.prepare(`INSERT INTO users (id, name, role, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, userName, 'student', salt, hash, Date.now())

  res.json({ user: { id, name: userName, role: 'student', createdAt: Date.now() } })
})

router.delete('/:id', requireAuth, (req, res) => {
  if (req.params.id === 'admin') {
    res.status(400).json({ error: '不能删除管理员' })
    return
  }
  const db = getDb()
  db.prepare('DELETE FROM practice_records WHERE user_id = ?').run(req.params.id)
  db.prepare('DELETE FROM courses WHERE user_id = ?').run(req.params.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id)
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

router.put('/:id/password', requireAuth, (req, res) => {
  const { password } = req.body
  if (!password || password.trim().length === 0) {
    res.status(400).json({ error: '密码不能为空' })
    return
  }

  const db = getDb()
  const salt = createSalt(req.params.id as string)
  const hash = hashPassword(password, salt)
  db.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?').run(salt, hash, req.params.id)
  res.json({ ok: true })
})

export default router
