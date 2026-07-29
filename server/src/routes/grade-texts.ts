import { Router } from 'express'
import { getDb } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', (_req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM grade_texts').all() as any[]
  res.json({ gradeTexts: rows.map((r) => ({ id: r.id, name: r.name, chars: r.chars })) })
})

router.put('/', requireAuth, (req, res) => {
  const { gradeTexts } = req.body
  if (!Array.isArray(gradeTexts)) {
    res.status(400).json({ error: '参数错误' })
    return
  }

  const db = getDb()
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM grade_texts').run()
    const insert = db.prepare('INSERT INTO grade_texts (id, name, chars) VALUES (?, ?, ?)')
    for (const g of gradeTexts) {
      insert.run(g.id, g.name, g.chars || '')
    }
  })
  txn()

  res.json({
    gradeTexts: db.prepare('SELECT * FROM grade_texts').all()
  })
})

router.put('/default-text', requireAuth, (req, res) => {
  const { defaultText } = req.body
  if (typeof defaultText !== 'string') {
    res.status(400).json({ error: '参数错误' })
    return
  }
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES ('default_text', ?)").run(defaultText)
  res.json({ ok: true })
})

export default router
