import { supabase } from '../lib/supabase'

export type UserProfile = {
  id: string
  name: string
  role: 'admin' | 'student'
  createdAt: number
}

export type QuizRecord = {
  totalStrokes: number
  correctStrokes: number
  totalMistakes: number
  qualityPenalty: number
  currentStroke: number
  mistakesOnStroke: number
  strokesRemaining: number
  completed: boolean
  lastResult: 'correct' | 'mistake' | null
}

export type PracticeRecord = {
  character: string
  courseId: string
  paths: string[]
  score?: number
  quiz?: QuizRecord
  updatedAt: number
}

export type Course = {
  id: string
  number: number
  chars: string[]
  source: 'default' | 'custom' | 'legacy'
  libraryName?: string
  createdAt: number
  completedAt?: number
}

export type GradeText = {
  id: string
  name: string
  chars: string
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`
}

function getChineseChars(value: string) {
  return Array.from(value).filter((ch) => ch >= '\u4e00' && ch <= '\u9fff').join('')
}

function uniqueChars(value: string, limit = 400) {
  return Array.from(new Set(getChineseChars(value).slice(0, limit)))
}

type ProfileRow = { id: string; name: string; role: 'admin' | 'student'; created_at: number }
type CourseRow = {
  id: string
  user_id: string
  number: number
  chars: unknown
  source: string
  library_name: string | null
  created_at: number
  completed_at: number | null
}
type RecordRow = {
  practice_key: string
  user_id: string
  course_id: string
  character: string
  paths: unknown
  score: number | null
  quiz: unknown
  updated_at: number
}

function mapCourse(row: CourseRow): Course {
  return {
    id: row.id,
    number: row.number,
    chars: Array.isArray(row.chars) ? row.chars : [],
    source: row.source as Course['source'],
    libraryName: row.library_name ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined
  }
}

function mapProfile(row: ProfileRow): UserProfile {
  return { id: row.id, name: row.name, role: row.role, createdAt: row.created_at }
}

function mapRecord(row: RecordRow): PracticeRecord {
  return {
    character: row.character,
    courseId: row.course_id,
    paths: Array.isArray(row.paths) ? row.paths : [],
    score: row.score ?? undefined,
    quiz: row.quiz as QuizRecord | undefined,
    updatedAt: row.updated_at
  }
}

function mapAuthError(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return '邮箱或密码不正确'
  if (lower.includes('already registered')) return '该邮箱已注册'
  if (lower.includes('not confirmed')) return '邮箱尚未验证，请先查收验证邮件'
  return message
}

async function getProfile(id: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return mapProfile(data)
}

async function currentUser(): Promise<UserProfile | null> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  return getProfile(data.user.id)
}

async function getCharCounts(userId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>()

  const { data: records } = await supabase
    .from('practice_records')
    .select('practice_key, quiz')
    .eq('user_id', userId)
  for (const r of records || []) {
    const parts = r.practice_key.split(':')
    const char = parts[2]
    if (!char) continue
    if (r.quiz?.completed) {
      counts.set(char, (counts.get(char) || 0) + 1)
    }
  }

  const { data: courses } = await supabase
    .from('courses')
    .select('chars')
    .eq('user_id', userId)
  for (const c of courses || []) {
    const courseChars: string[] = Array.isArray(c.chars) ? c.chars : []
    for (const char of courseChars) {
      counts.set(char, (counts.get(char) || 0) + 1)
    }
  }

  return counts
}

async function maybeCompleteCourse(userId: string, courseId: string) {
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!course || course.completed_at) return

  const chars: string[] = Array.isArray(course.chars) ? course.chars : []
  if (chars.length === 0) return

  const { data: records } = await supabase
    .from('practice_records')
    .select('practice_key, quiz')
    .eq('user_id', userId)
    .eq('course_id', courseId)
  const recordMap = new Map((records || []).map((r) => [r.practice_key, r.quiz]))

  const allCompleted = chars.every((char, index) => {
    const quiz = recordMap.get(`${courseId}:${index}:${char}`)
    return quiz?.completed === true
  })

  if (allCompleted) {
    await supabase
      .from('courses')
      .update({ completed_at: Date.now() })
      .eq('id', courseId)
      .eq('user_id', userId)
  }
}

async function userHasIncompleteCourse(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('courses')
    .select('id')
    .eq('user_id', userId)
    .is('completed_at', null)
    .limit(1)
  if (error) throw new Error(error.message)
  return (data || []).length > 0
}

export const api = {
  // ---- Auth（Supabase Auth：邮箱 + 密码）----
  async login(email: string, password: string): Promise<{ user: UserProfile | null }> {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(mapAuthError(error.message))
    return { user: await currentUser() }
  },

  async register(
    email: string,
    password: string,
    name?: string
  ): Promise<{ user: UserProfile | null; needsConfirmation: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name?.trim() || undefined } }
    })
    if (error) throw new Error(mapAuthError(error.message))
    const needsConfirmation = !data.session
    return { user: needsConfirmation ? null : await currentUser(), needsConfirmation }
  },

  async logout() {
    await supabase.auth.signOut()
  },

  getMe() {
    return currentUser().then((user) => ({ user }))
  },

  async updateMyPassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  // ---- Users ----
  async getUsers(): Promise<{ users: UserProfile[] }> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role, created_at')
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return { users: (data || []).map(mapProfile) }
  },

  // ---- Courses ----
  async getCourses(userId: string, page?: number, limit?: number) {
    if (page !== undefined && limit !== undefined) {
      const pageNum = Math.max(1, page)
      const limitNum = Math.min(100, Math.max(1, limit))
      const from = (pageNum - 1) * limitNum
      const to = from + limitNum - 1

      const { count } = await supabase
        .from('courses')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)

      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('user_id', userId)
        .order('completed_at', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: false })
        .range(from, to)
      if (error) throw new Error(error.message)

      return { courses: (data || []).map(mapCourse), total: count ?? 0 }
    }

    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return { courses: (data || []).map(mapCourse) }
  },

  async hasIncompleteCourse(userId: string): Promise<{ hasIncomplete: boolean }> {
    return { hasIncomplete: await userHasIncompleteCourse(userId) }
  },

  async generateCourse(userId: string, text?: string, libraryName?: string) {
    if (await userHasIncompleteCourse(userId)) {
      throw new Error('还有未完成的课程，请先完成当前课程')
    }
    let pool: string
    if (text) {
      pool = text
    } else {
      const { data: grades } = await supabase.from('grade_texts').select('chars')
      const { data: config } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'default_text')
        .maybeSingle()
      pool = [...(grades || []).map((g) => g.chars), config?.value || ''].filter(Boolean).join('')
    }

    const chars = uniqueChars(pool)

    const charCounts = await getCharCounts(userId)

    const selected = [...chars]
      .sort((a, b) => {
        const ca = charCounts.get(a) || 0
        const cb = charCounts.get(b) || 0
        if (ca !== cb) return ca - cb
        return Math.random() - 0.5
      })
      .slice(0, Math.min(20, Math.max(1, chars.length)))

    const { data: maxRow } = await supabase
      .from('courses')
      .select('number')
      .eq('user_id', userId)
      .order('number', { ascending: false })
      .limit(1)
      .maybeSingle()
    const number = (maxRow?.number || 0) + 1
    const id = createId('course')

    const { data, error } = await supabase
      .from('courses')
      .insert({
        id,
        user_id: userId,
        number,
        chars: selected,
        source: 'default',
        library_name: libraryName || null,
        created_at: Date.now()
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return { courses: [mapCourse(data)] }
  },

  async addCustomCourse(userId: string, text: string) {
    if (!text) throw new Error('请输入汉字')
    if (await userHasIncompleteCourse(userId)) {
      throw new Error('还有未完成的课程，请先完成当前课程')
    }
    const chars = uniqueChars(text).slice(0, 20)
    if (chars.length === 0) throw new Error('没有有效的汉字')

    const { data: maxRow } = await supabase
      .from('courses')
      .select('number')
      .eq('user_id', userId)
      .order('number', { ascending: false })
      .limit(1)
      .maybeSingle()
    const number = (maxRow?.number || 0) + 1
    const id = createId('course')

    const { data, error } = await supabase
      .from('courses')
      .insert({
        id,
        user_id: userId,
        number,
        chars,
        source: 'custom',
        library_name: '自定义',
        created_at: Date.now()
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return { course: mapCourse(data) }
  },

  async updateCourse(courseId: string, chars: string[]) {
    if (!Array.isArray(chars) || chars.length === 0) throw new Error('chars 不能为空')
    const { data, error } = await supabase
      .from('courses')
      .update({ chars, completed_at: null })
      .eq('id', courseId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('课程不存在')
    return { course: mapCourse(data) }
  },

  // ---- Records ----
  async getRecords(userId: string, courseIds?: string[]) {
    let query = supabase.from('practice_records').select('*').eq('user_id', userId)
    if (courseIds && courseIds.length > 0) {
      query = query.in('course_id', courseIds)
    }
    const { data, error } = await query
    if (error) throw new Error(error.message)

    const records: Record<string, PracticeRecord> = {}
    for (const row of data || []) {
      records[row.practice_key] = mapRecord(row)
    }
    return { records }
  },

  async saveRecord(userId: string, practiceKey: string, record: PracticeRecord) {
    const courseId = practiceKey.split(':')[0]

    const { data: course } = await supabase
      .from('courses')
      .select('id, completed_at')
      .eq('id', courseId)
      .eq('user_id', userId)
      .maybeSingle()
    if (course?.completed_at) return { ok: true }

    const { error } = await supabase.from('practice_records').upsert({
      practice_key: practiceKey,
      user_id: userId,
      course_id: courseId,
      character: record.character,
      paths: record.paths || [],
      score: record.score ?? null,
      quiz: record.quiz ?? null,
      updated_at: Date.now()
    })
    if (error) throw new Error(error.message)

    if (course && !course.completed_at) {
      await maybeCompleteCourse(userId, courseId)
    }
    return { ok: true }
  },

  // ---- Grade texts ----
  async getGradeTexts(): Promise<{ gradeTexts: GradeText[] }> {
    const { data, error } = await supabase.from('grade_texts').select('*').order('id')
    if (error) throw new Error(error.message)
    return { gradeTexts: (data || []).map((g) => ({ id: g.id, name: g.name, chars: g.chars })) }
  },

  async saveGradeTexts(gradeTexts: GradeText[]): Promise<{ gradeTexts: GradeText[] }> {
    const { error } = await supabase.rpc('replace_grade_texts', { texts: gradeTexts })
    if (error) throw new Error(error.message)
    return this.getGradeTexts()
  },

  async updateDefaultText(defaultText: string) {
    const { error } = await supabase
      .from('app_config')
      .upsert({ key: 'default_text', value: defaultText })
    if (error) throw new Error(error.message)
    return { ok: true }
  }
}