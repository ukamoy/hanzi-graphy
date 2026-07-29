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

import defaultGradeTexts from './defaultGradeTexts'

export async function loadAppState(): Promise<AppState> {
  const [me, gradeResult] = await Promise.all([
    api.getMe(),
    api.getGradeTexts()
  ])

  // If backend has no grade texts, or has fewer than the built-in defaults, seed defaults on startup
  let gradeTexts = gradeResult.gradeTexts || []
  const needSeed = !gradeTexts || gradeTexts.length === 0 || (defaultGradeTexts && Array.isArray(defaultGradeTexts) && gradeTexts.length < defaultGradeTexts.length)
  if (needSeed) {
    try {
      await api.saveGradeTexts(defaultGradeTexts)
      gradeTexts = defaultGradeTexts
    } catch (e) {
      // ignore seed errors and fall back to empty
      gradeTexts = []
    }
  }

  const loggedInUserId = me.user?.id || null

  let users: UserProfile[] = []
  if (loggedInUserId) {
    const userResult = await api.getUsers()
    users = userResult.users as UserProfile[]
  }

  return { gradeTexts, users, loggedInUserId }
}

export { api }

/* ---- Auth ---- */

export async function loginUserByName(name: string, password: string) {
  try {
    await api.login(name, password)
    return true
  } catch {
    return false
  }
}

export async function logoutUser() {
  await api.logout()
}

export async function isDefaultAdminPassword() {
  const result = await api.isDefaultAdminPassword()
  return result.isDefault
}

/* ---- Users ---- */

export async function addUser(name: string, password: string) {
  const result = await api.addUser(name, password)
  return result.user as UserProfile
}

export async function deleteUser(userId: string) {
  if (userId === 'admin') return false
  await api.deleteUser(userId)
  return true
}

export async function updateUserPassword(userId: string, password: string) {
  if (password.trim().length === 0) return false
  await api.updatePassword(userId, password)
  return true
}

/* ---- Courses ---- */

export async function loadCourses(userId: string): Promise<Course[]> {
  const result = await api.getCourses(userId)
  return result.courses as Course[]
}

export async function loadCoursesPaginated(userId: string, page: number, limit: number): Promise<{ courses: Course[]; total: number }> {
  const result = await api.getCourses(userId, page, limit)
  return { courses: result.courses as Course[], total: (result as { courses: any[]; total: number }).total }
}

export async function generateDefaultCourses(userId: string, text?: string) {
  const result = await api.generateCourse(userId, text)
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

export async function loadPracticeRecord(userId: string, practiceKey: string): Promise<PracticeRecord | null> {
  const result = await api.getRecord(userId, practiceKey)
  return result.record as PracticeRecord | null
}

export async function savePracticeRecord(userId: string, practiceKey: string, record: PracticeRecord) {
  await api.saveRecord(userId, practiceKey, record)
}

/* ---- Grade Texts ---- */

export async function getGradeTexts() {
  const result = await api.getGradeTexts()
  return result.gradeTexts as GradeText[]
}

export async function saveGradeTexts(grades: GradeText[]) {
  await api.saveGradeTexts(grades)
}
