import { api } from './api'

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

export type UserRole = 'admin' | 'student'

export type UserProfile = {
  id: string
  name: string
  role: UserRole
  createdAt: number
}

export type CourseSource = 'default' | 'custom' | 'legacy'

export type Course = {
  id: string
  number: number
  chars: string[]
  source: CourseSource
  libraryName?: string
  createdAt: number
  completedAt?: number
}

export type GradeText = {
  id: string
  name: string
  chars: string
}

export type AppState = {
  gradeTexts: GradeText[]
  users: UserProfile[]
  loggedInUserId: string | null
}

export function getPracticeKey(courseId: string, index: number, character: string) {
  return `${courseId}:${index}:${character}`
}

export async function loadAppState(): Promise<AppState> {
  const [me, gradeResult] = await Promise.all([
    api.getMe(),
    api.getGradeTexts()
  ])

  const gradeTexts = gradeResult.gradeTexts || []
  const loggedInUserId = me.user?.id || null

  let users: UserProfile[] = []
  if (me.user) users = [me.user]
  if (me.user?.role === 'admin') {
    const userResult = await api.getUsers()
    const all = userResult.users as UserProfile[]
    users = [...all.filter((u) => u.id !== me.user!.id), me.user]
  }

  return { gradeTexts, users, loggedInUserId }
}

/* ---- Auth ---- */

export async function loginByEmail(email: string, password: string) {
  try {
    const result = await api.login(email, password)
    return result.user
  } catch {
    return null
  }
}

export async function registerUser(email: string, password: string, name?: string) {
  return api.register(email, password, name)
}

export async function logoutUser() {
  await api.logout()
}

export async function updateMyPassword(password: string) {
  if (password.trim().length === 0) return false
  try {
    await api.updateMyPassword(password)
    return true
  } catch {
    return false
  }
}

/* ---- Courses ---- */

export async function loadCourses(userId: string): Promise<Course[]> {
  const result = await api.getCourses(userId)
  return result.courses as Course[]
}

export async function loadCoursesPaginated(userId: string, page: number, limit: number): Promise<{ courses: Course[]; total: number }> {
  const result = await api.getCourses(userId, page, limit)
  return { courses: result.courses as Course[], total: (result as { courses: Course[]; total: number }).total }
}

export async function hasIncompleteCourse(userId: string): Promise<boolean> {
  try {
    const result = await api.hasIncompleteCourse(userId)
    return result.hasIncomplete
  } catch {
    return false
  }
}

export async function generateDefaultCourses(userId: string, text?: string, libraryName?: string) {
  const result = await api.generateCourse(userId, text, libraryName)
  return result.courses as Course[]
}

export async function addCustomCourse(userId: string, text: string) {
  try {
    const result = await api.addCustomCourse(userId, text)
    return result.course as Course
  } catch {
    return null
  }
}

// Update an existing course's chars. Returns updated Course or null on failure.
export async function updateCourse(courseId: string, chars: string[]) {
  try {
    const result = await api.updateCourse(courseId, chars)
    return result.course as Course
  } catch {
    return null
  }
}

/* ---- Records ---- */

export async function loadRecords(userId: string): Promise<Record<string, PracticeRecord>> {
  const result = await api.getRecords(userId)
  return result.records as Record<string, PracticeRecord>
}

export async function loadRecordsForCourses(userId: string, courseIds: string[]): Promise<Record<string, PracticeRecord>> {
  const result = await api.getRecords(userId, courseIds)
  return result.records as Record<string, PracticeRecord>
}

export async function savePracticeRecord(userId: string, practiceKey: string, record: PracticeRecord) {
  await api.saveRecord(userId, practiceKey, record)
}

/* ---- Grade Texts ---- */

export async function saveGradeTexts(grades: GradeText[]) {
  await api.saveGradeTexts(grades)
}