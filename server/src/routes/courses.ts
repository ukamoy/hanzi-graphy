import { Router } from 'express'
import crypto from 'crypto'
import { getDb } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { DEFAULT_HANZI_TEXT } from '../defaultText.js'

const router = Router()

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`
}

function getChineseChars(value: string) {
  return Array.from(value).filter((ch) => ch >= '\u4e00' && ch <= '\u9fff').join('')
}

function uniqueChars(value: string, limit = 400) {
  return Array.from(new Set(getChineseChars(value).slice(0, limit)))
}

function getCharCounts(userId: string, db: any): Map<string, number> {
  const counts = new Map<string, number>()

  // 1. 统计已完成的练习记录
  const rows = db.prepare('SELECT practice_key, quiz FROM practice_records WHERE user_id = ?').all(userId) as { practice_key: string; quiz: string }[]
  for (const r of rows) {
    const parts = r.practice_key.split(':')
    const char = parts[2]
    if (!char) continue
    try {
      const quiz = JSON.parse(r.quiz)
      if (quiz?.completed) {
        counts.set(char, (counts.get(char) || 0) + 1)
      }
    } catch {}
  }

  // 2. 统计已有课程里的字（无论是否完成），避免重复
  const courses = db.prepare('SELECT chars FROM courses WHERE user_id = ?').all(userId) as { chars: string }[]
  for (const c of courses) {
    try {
      const courseChars = JSON.parse(c.chars) as string[]
      for (const char of courseChars) {
        counts.set(char, (counts.get(char) || 0) + 1)
      }
    } catch {}
  }

  return counts
}

router.get('/:userId', requireAuth, (req, res) => {
  const db = getDb()
  const { page, limit } = req.query

  if (page !== undefined && limit !== undefined) {
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 5))
    const offset = (pageNum - 1) * limitNum

    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM courses WHERE user_id = ?').get(req.params.userId) as { cnt: number }
    const total = countRow.cnt

    const courses = db.prepare('SELECT * FROM courses WHERE user_id = ? ORDER BY completed_at IS NULL DESC, created_at ASC LIMIT ? OFFSET ?')
      .all(req.params.userId, limitNum, offset) as any[]

    res.json({
      courses: courses.map((c) => ({
        id: c.id,
        number: c.number,
        chars: JSON.parse(c.chars),
        source: c.source,
        createdAt: c.created_at,
        completedAt: c.completed_at
      })),
      total
    })
  } else {
    const courses = db.prepare('SELECT * FROM courses WHERE user_id = ? ORDER BY completed_at IS NULL DESC, created_at ASC').all(req.params.userId) as any[]
    res.json({
      courses: courses.map((c) => ({
        id: c.id,
        number: c.number,
        chars: JSON.parse(c.chars),
        source: c.source,
        createdAt: c.created_at,
        completedAt: c.completed_at
      }))
    })
  }
})

router.post('/:userId/generate', requireAuth, (req, res) => {
  const { text } = req.body
  const db = getDb()

  let pool: string
  if (text) {
    pool = text
  } else {
    const grades = db.prepare('SELECT chars FROM grade_texts').all() as { chars: string }[]
    const config = db.prepare("SELECT value FROM app_config WHERE key = 'default_text'").get() as { value: string } | undefined
    pool = [...grades.map((g) => g.chars), config?.value || DEFAULT_HANZI_TEXT].filter(Boolean).join('')
  }

  const chars = uniqueChars(pool)

  // 查询用户各字的总出现次数（已完成练习 + 已有课程）
  const charCounts = getCharCounts(req.params.userId as string, db)

  // 所有字按出现次数升序（没出现过=0，自然排前面），同次数随机打乱
  const selected = [...chars]
    .sort((a, b) => {
      const ca = charCounts.get(a) || 0
      const cb = charCounts.get(b) || 0
      if (ca !== cb) return ca - cb
      return Math.random() - 0.5
    })
    .slice(0, Math.min(20, Math.max(1, chars.length)))

  const maxNum = db.prepare('SELECT MAX(number) as max FROM courses WHERE user_id = ?').get(req.params.userId) as { max: number | null }
  const number = (maxNum.max || 0) + 1
  const id = createId('course')

  db.prepare(`INSERT INTO courses (id, user_id, number, chars, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, req.params.userId, number, JSON.stringify(selected), 'default', Date.now())

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as any
  res.json({
    courses: [{
      id: course.id,
      number: course.number,
      chars: JSON.parse(course.chars),
      source: course.source,
      createdAt: course.created_at,
      completedAt: course.completed_at
    }]
  })
})

router.post('/:userId/custom', requireAuth, (req, res) => {
  const { text } = req.body
  if (!text) {
    res.status(400).json({ error: '请输入汉字' })
    return
  }

  const db = getDb()
  const chars = uniqueChars(text).slice(0, 20)

  if (chars.length === 0) {
    res.status(400).json({ error: '没有有效的汉字' })
    return
  }

  const maxNum = db.prepare('SELECT MAX(number) as max FROM courses WHERE user_id = ?').get(req.params.userId) as { max: number | null }
  const number = (maxNum.max || 0) + 1
  const id = createId('course')

  db.prepare(`INSERT INTO courses (id, user_id, number, chars, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, req.params.userId, number, JSON.stringify(chars), 'custom', Date.now())

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as any
  res.json({
    course: {
      id: course.id,
      number: course.number,
      chars: JSON.parse(course.chars),
      source: course.source,
      createdAt: course.created_at,
      completedAt: course.completed_at
    }
  })
})

router.put('/:courseId', requireAuth, (req, res) => {
  const db = getDb()
  const { chars } = req.body
  if (!Array.isArray(chars) || chars.length === 0) {
    res.status(400).json({ error: 'chars 不能为空' })
    return
  }
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.courseId) as any
  if (!course) {
    res.status(404).json({ error: '课程不存在' })
    return
  }
  db.prepare('UPDATE courses SET chars = ?, completed_at = NULL WHERE id = ?')
    .run(JSON.stringify(chars), req.params.courseId)
  const updated = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.courseId) as any
  res.json({
    course: {
      id: updated.id,
      number: updated.number,
      chars: JSON.parse(updated.chars),
      source: updated.source,
      createdAt: updated.created_at,
      completedAt: updated.completed_at
    }
  })
})

export default router
