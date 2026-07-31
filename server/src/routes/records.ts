import { Router } from 'express'
import { getDb } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/:userId', requireAuth, (req, res) => {
  const db = getDb()
  const { courseIds } = req.query

  let rows: any[]
  if (courseIds) {
    const ids = (courseIds as string).split(',').filter(Boolean)
    if (ids.length === 0) {
      res.json({ records: {} })
      return
    }
    const placeholders = ids.map(() => '?').join(',')
    rows = db.prepare(`SELECT * FROM practice_records WHERE user_id = ? AND course_id IN (${placeholders})`)
      .all(req.params.userId, ...ids) as any[]
  } else {
    rows = db.prepare('SELECT * FROM practice_records WHERE user_id = ?').all(req.params.userId) as any[]
  }

  const records: Record<string, any> = {}
  for (const r of rows) {
    records[r.practice_key] = {
      character: r.character,
      courseId: r.course_id,
      paths: JSON.parse(r.paths),
      score: r.score,
      quiz: r.quiz ? JSON.parse(r.quiz) : null,
      updatedAt: r.updated_at
    }
  }

  res.json({ records })
})

router.get('/:userId/:practiceKey', requireAuth, (req, res) => {
  const db = getDb()
  const record = db.prepare('SELECT * FROM practice_records WHERE user_id = ? AND practice_key = ?')
    .get(req.params.userId, req.params.practiceKey) as any

  if (!record) {
    res.json({ record: null })
    return
  }

  res.json({
    record: {
      character: record.character,
      courseId: record.course_id,
      paths: JSON.parse(record.paths),
      score: record.score,
      quiz: record.quiz ? JSON.parse(record.quiz) : null,
      updatedAt: record.updated_at
    }
  })
})

router.put('/:userId/:practiceKey', requireAuth, (req, res) => {
  const { record } = req.body
  if (!record) {
    res.status(400).json({ error: '缺少记录数据' })
    return
  }

  const db = getDb()
  const key = req.params.practiceKey

  // Check if course is already completed
  const courseId = (key as string).split(':')[0]
  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(courseId, req.params.userId) as any

  if (course?.completed_at) {
    res.json({ ok: true })
    return
  }

  db.prepare(`INSERT OR REPLACE INTO practice_records (practice_key, user_id, course_id, character, paths, score, quiz, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      key,
      req.params.userId,
      courseId,
      record.character,
      JSON.stringify(record.paths || []),
      record.score ?? null,
      record.quiz ? JSON.stringify(record.quiz) : null,
      Date.now()
    )

  // Check if course is now completed
  if (course && !course.completed_at) {
    const chars: string[] = JSON.parse(course.chars)
    const allCompleted = chars.every((_, index) => {
      const pk = `${courseId}:${index}:${chars[index]}`
      const r = db.prepare('SELECT * FROM practice_records WHERE practice_key = ?').get(pk) as any
      if (!r || !r.quiz) return false
      const quiz = JSON.parse(r.quiz)
      return quiz.completed === true
    })

    if (allCompleted) {
      db.prepare('UPDATE courses SET completed_at = ? WHERE id = ?').run(Date.now(), courseId)
    }
  }

  res.json({ ok: true })
})

export default router
