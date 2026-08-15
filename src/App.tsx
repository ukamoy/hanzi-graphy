import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CharacterBar from './components/CharacterBar'
import PracticeBoard from './components/PracticeBoard'
import {
  addCustomCourse,
  generateDefaultCourses,
  getPracticeKey,
  hasIncompleteCourse,
  loadAppState,
  loadCourses,
  loadCoursesPaginated,
  loadRecords,
  loadRecordsForCourses,
  loginByEmail,
  logoutUser,
  registerUser,
  saveGradeTexts,
  type AppState,
  type Course,
  type GradeText,
  type PracticeRecord,
  updateMyPassword,
  updateCourse,
} from './engine/storage'

type CourseStats = {
  course: Course
  records: Array<PracticeRecord | null>
  completedChars: number
  totalChars: number
  isCompleted: boolean
  average: number | null
  completedAt: number | null
}

const pageSize = 5
const adminPageSize = 5

const buttonStyle: Record<string, unknown> = {
  minHeight: 40,
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer'
}

const editButtonStyle: Record<string, unknown> = {
  padding: '4px 8px',
  fontSize: 12,
  borderRadius: 6,
  cursor: 'pointer',
  background: '#f0f0f0',
  color: '#241f18',
  border: '1px solid #d8d0c3',
  whiteSpace: 'nowrap'
}

function tabStyle(active: boolean): Record<string, unknown> {
  return {
    ...buttonStyle,
    minHeight: 36,
    padding: '6px 14px',
    fontSize: 14,
    background: active ? '#287a55' : 'transparent',
    color: active ? '#fff' : '#5e5548',
    border: active ? '2px solid #1d5d41' : '2px solid transparent',
    borderRadius: 8
  }
}

function formatTime(value: number | null | undefined) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(value))
}

// 手机端竖屏时提示横屏使用
function RotatePrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const isTouch = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 0
    const isTablet = Math.min(window.innerWidth, window.innerHeight) >= 768
    if (!isTouch || isTablet) return
    const mq = window.matchMedia('(orientation: portrait)')
    const update = () => setShow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#f4efe4', display: 'grid', placeItems: 'center',
      padding: 24, color: '#241f18', textAlign: 'center'
    }}>
      <div>
        <div style={{
          width: 64, height: 34, border: '3px solid #287a55', borderRadius: 6,
          transform: 'rotate(90deg)', margin: '0 auto 28px', position: 'relative', boxSizing: 'border-box'
        }}>
          <div style={{ position: 'absolute', right: -20, top: '50%', transform: 'translateY(-50%)', width: 22, height: 2, background: '#287a55' }} />
          <div style={{ position: 'absolute', left: -20, top: '50%', transform: 'translateY(-50%)', width: 22, height: 2, background: '#287a55' }} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>请横屏使用</div>
        <div style={{ marginTop: 8, color: '#756d61', fontSize: 15 }}>请将手机旋转至横向方向，以获得最佳书写体验</div>
      </div>
    </div>
  )
}

function getUniqueChineseChars(value: string) {
  return Array.from(new Set(Array.from(value).filter((ch) => ch >= '\u4e00' && ch <= '\u9fff')))
}

function getHighestGradeId(courses: Course[], gradeTexts: GradeText[]): string {
  let bestIndex = -1
  let bestId = ''
  for (const course of courses) {
    if (!course.libraryName) continue
    const idx = gradeTexts.findIndex((g) => g.name === course.libraryName)
    if (idx > bestIndex) {
      bestIndex = idx
      bestId = idx >= 0 ? gradeTexts[idx].id : ''
    }
  }
  return bestId || (gradeTexts[0]?.id || '')
}

function findRecordForChar(records: Record<string, PracticeRecord>, courseId: string, character: string): PracticeRecord | null {
  const prefix = `${courseId}:`
  let fallback: PracticeRecord | null = null
  for (const key of Object.keys(records)) {
    if (key.startsWith(prefix) && key.endsWith(`:${character}`)) {
      const rec = records[key]
      if (rec?.quiz?.completed) return rec
      if (!fallback) fallback = rec
    }
  }
  return fallback
}

function getCourseStats(course: Course, records: Record<string, PracticeRecord>): CourseStats {
  const courseRecords = course.chars.map((character, index) =>
    records[getPracticeKey(course.id, index, character)] ?? findRecordForChar(records, course.id, character)
  )
  const completedChars = courseRecords.filter((r) => r?.quiz?.completed).length
  const scored = courseRecords.map((r) => r?.score).filter((s): s is number => typeof s === 'number')
  return {
    course,
    records: courseRecords,
    completedChars,
    totalChars: course.chars.length,
    isCompleted: course.chars.length > 0 && completedChars === course.chars.length,
    average: scored.length > 0 ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
    completedAt: course.completedAt || null
  }
}

function summarizeUser(courses: Course[], records: Record<string, PracticeRecord>) {
  const stats = courses.map((c) => getCourseStats(c, records))
  const completed = stats.filter((s) => s.isCompleted).length
  const scored = stats.map((s) => s.average).filter((s): s is number => s !== null)
  return { courses, stats, completedCourses: completed, average: scored.length > 0 ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null }
}

function Pager({ page, total, onPage, size = pageSize }: { page: number; total: number; onPage: (p: number) => void; size?: number }) {
  const maxPage = Math.max(0, Math.ceil(total / size) - 1)
  if (maxPage === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
      <button onClick={() => onPage(Math.max(0, page - 1))} disabled={page <= 0}
        style={{ ...buttonStyle, minHeight: 34, padding: '6px 10px', background: page <= 0 ? '#d7d0c6' : '#6d4c2f', color: '#fff' }}>上一页</button>
      <span style={{ color: '#756d61', fontSize: 13 }}>{page + 1}/{maxPage + 1}</span>
      <button onClick={() => onPage(Math.min(maxPage, page + 1))} disabled={page >= maxPage}
        style={{ ...buttonStyle, minHeight: 34, padding: '6px 10px', background: page >= maxPage ? '#d7d0c6' : '#6d4c2f', color: '#fff' }}>下一页</button>
    </div>
  )
}

function CourseButton({ stats, selected, onClick, onEdit }: { stats: CourseStats; selected: boolean; onClick: () => void; onEdit?: (c: import('./engine/storage').Course) => void }) {
  const statusText = stats.isCompleted
    ? `已完成 ${stats.completedChars}/${stats.totalChars}${stats.average !== null ? `，平均 ${stats.average}` : ''}${stats.completedAt ? `，完成于 ${formatTime(stats.completedAt)}` : ''}`
    : `完成 ${stats.completedChars}/${stats.totalChars}`
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={onClick} style={{
        textAlign: 'left', color: selected ? '#fff' : '#241f18',
        background: selected ? '#287a55' : '#fff',
        border: selected ? '2px solid #1d5d41' : '1px solid #ddd3c4',
        borderRadius: 8, padding: 10, cursor: 'pointer', width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 1 }}>
            <strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>课程 {stats.course.number}</strong>
            {(stats.course.libraryName || stats.course.source === 'custom') && (
              <span style={{
                fontSize: 11, color: selected ? '#eef8ef' : '#756d61',
                background: selected ? 'rgba(255,255,255,0.18)' : '#f0e9dc',
                borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap'
              }}>{stats.course.libraryName || '自定义'}</span>
            )}
            {onEdit && !stats.isCompleted && (
              <button onClick={(e) => { e.stopPropagation(); onEdit(stats.course) }}
                style={editButtonStyle}>编辑</button>
            )}
          </div>
          <span style={{ fontSize: 13, color: selected ? '#eef8ef' : '#6a5f50' }}>{statusText}</span>
        </div>
        <div style={{ marginTop: 6, color: selected ? '#eef8ef' : '#6a5f50', fontSize: 13 }}>
          {stats.course.chars.join('')}
        </div>
      </button>
    </div>
  )
}

// Simple Modal portal to render modals into document.body and avoid DOM/focus interference
function Modal({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  const [host] = useState<HTMLDivElement | null>(() =>
    typeof document !== 'undefined' ? document.createElement('div') : null
  )

  useEffect(() => {
    const h = host
    if (!h) return
    document.body.appendChild(h)
    return () => { if (h.parentNode) h.parentNode.removeChild(h) }
  }, [host])

  // Prevent immediate backdrop click (from the same click that opened the modal) closing it.
  // allowCloseRef becomes true on the next macrotask.
  const allowCloseRef = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => { allowCloseRef.current = true }, 0)
    return () => { clearTimeout(t); allowCloseRef.current = false }
  }, [])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClose && allowCloseRef.current) onClose()
  }

  const node = (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'grid', placeItems: 'center', zIndex: 1000 }}
      onClick={handleBackdropClick}>
      {children}
    </div>
  )

  return host ? createPortal(node, host) : null
}


function PwdModal({ userId, draft, setDraft, confirm, setConfirm, onClose, onSubmit }: { userId: string | null; draft: string; setDraft: (v: string) => void; confirm: string; setConfirm: (v: string) => void; onClose: () => void; onSubmit: () => Promise<void> }) {
  const pwdModalRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (userId) setTimeout(() => pwdModalRef.current?.focus(), 0)
  }, [userId])
  if (!userId) return null
  const pwdOk = draft.trim().length > 0 && draft === confirm
  return (
    <Modal onClose={onClose}>
      <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: 300 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>修改密码</h3>
        <input ref={pwdModalRef} value={draft} onChange={(e) => setDraft(e.target.value)} type="password" placeholder="新密码" autoComplete="new-password"
          style={{ width: '100%', height: 40, border: '1px solid #bfb5a5', borderRadius: 6, padding: '0 10px', fontSize: 15 }} />
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" placeholder="确认新密码" autoComplete="new-password"
          onKeyDown={(e) => { if (e.key === 'Enter' && pwdOk) onSubmit() }}
          style={{ width: '100%', height: 40, border: '1px solid #bfb5a5', borderRadius: 6, padding: '0 10px', fontSize: 15, marginTop: 8 }} />
        {draft && confirm && draft !== confirm && (
          <div style={{ marginTop: 6, color: '#b53b35', fontSize: 13 }}>两次输入的密码不一致</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={onSubmit}
            disabled={!pwdOk}
            style={{ ...buttonStyle, flex: 1, background: pwdOk ? '#287a55' : '#d7d0c6', color: '#fff' }}>确认修改</button>
          <button onClick={onClose}
            style={{ ...buttonStyle, flex: 1, background: '#d7d0c6', color: '#241f18' }}>取消</button>
        </div>
      </div>
    </Modal>
  )
}

function EditCourseModal({ open, course, text, setText, onClose, onSave }: { open: boolean; course: Course | null; text: string; setText: (v: string) => void; onClose: () => void; onSave: () => Promise<void> }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => { if (open) setTimeout(() => textareaRef.current?.focus(), 0) }, [open])
  if (!open || !course) return null
  return (
    <Modal onClose={onClose}>
      <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>编辑课程 {course.number}</h3>
        <textarea ref={textareaRef} value={text} onChange={(e) => setText(e.target.value)} rows={6}
          placeholder="输入汉字（会覆盖原课程）" style={{ width: '100%', border: '1px solid #bfb5a5', borderRadius: 6, padding: '8px 10px', fontSize: 15 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={onSave} style={{ ...buttonStyle, flex: 1, background: '#287a55', color: '#fff' }}>保存</button>
          <button onClick={onClose} style={{ ...buttonStyle, flex: 1, background: '#d7d0c6', color: '#241f18' }}>取消</button>
        </div>
      </div>
    </Modal>
  )
}

export default function App() {
  const [appState, setAppState] = useState<AppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regName, setRegName] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirm, setRegConfirm] = useState('')
  const [regMessage, setRegMessage] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [index, setIndex] = useState(0)
  const [resetSignal, setResetSignal] = useState(0)
  const [customCourseText, setCustomCourseText] = useState('')
  const [coursePage, setCoursePage] = useState(0)

  const [adminTab, setAdminTab] = useState<'chars' | 'users'>('users')
  const [viewedUserId, setViewedUserId] = useState('')
  const [adminCoursePage, setAdminCoursePage] = useState(0)
  const [gradeTexts, setGradeTexts] = useState<GradeText[]>([])
  const [selectedGradeId, setSelectedGradeId] = useState('')

  const [pwdModalUserId, setPwdModalUserId] = useState<string | null>(null)
  const [pwdDraft, setPwdDraft] = useState('')
  const [pwdConfirm, setPwdConfirm] = useState('')
  const [selectedStudentGradeId, setSelectedStudentGradeId] = useState('')
  const [studentGenTab, setStudentGenTab] = useState<'auto' | 'custom'>('auto')

  // Admin add-course modal state
  const [adminAddCourseOpen, setAdminAddCourseOpen] = useState(false)
  const [adminAddCourseMode, setAdminAddCourseMode] = useState<'auto' | 'custom'>('auto')
  const [adminAddCourseText, setAdminAddCourseText] = useState('')
  const [adminSelectedGradeId, setAdminSelectedGradeId] = useState('')


  // Student data
  const [userCourses, setUserCourses] = useState<Course[]>([])
  const [courseRecords, setCourseRecords] = useState<Record<string, PracticeRecord>>({})
  const [totalCourses, setTotalCourses] = useState(0)
  const [completedCharSet, setCompletedCharSet] = useState<Set<string>>(new Set())
  const [studentHasUnfinished, setStudentHasUnfinished] = useState(false)

  // Admin viewed user data
  const [viewedUserCourses, setViewedUserCourses] = useState<Course[]>([])
  const [viewedUserRecords, setViewedUserRecords] = useState<Record<string, PracticeRecord>>({})
  const [viewedUserAllCourses, setViewedUserAllCourses] = useState<Course[]>([])
  const [viewedUserAllRecords, setViewedUserAllRecords] = useState<Record<string, PracticeRecord>>({})
  const [totalAdminCourses, setTotalAdminCourses] = useState(0)
  const [adminTargetHasUnfinished, setAdminTargetHasUnfinished] = useState(false)

  // Edit course modal state
  const [editCourseOpen, setEditCourseOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [editCourseText, setEditCourseText] = useState('')

  const refreshCompletedChars = useCallback(async (userId: string) => {
    try {
      const recs = await loadRecords(userId)
      const set = new Set<string>()
      for (const rec of Object.values(recs)) {
        if (rec?.quiz?.completed) set.add(rec.character)
      }
      setCompletedCharSet(set)
    } catch {
      // ignore
    }
  }, [])

  const refreshAppState = useCallback(async () => {
    const state = await loadAppState()
    setAppState(state)
    setGradeTexts(state.gradeTexts || [])

    if (state.loggedInUserId) {
      const me = state.users.find((u) => u.id === state.loggedInUserId)
      const { courses, total } = await loadCoursesPaginated(state.loggedInUserId, 1, pageSize)
      setUserCourses(courses)
      setTotalCourses(total)
      setCoursePage(0)
      if (courses.length > 0) {
        const recs = await loadRecordsForCourses(state.loggedInUserId, courses.map((c) => c.id))
        setCourseRecords(recs)
      } else {
        setCourseRecords({})
      }
      try {
        setStudentHasUnfinished(await hasIncompleteCourse(state.loggedInUserId))
      } catch {
        // ignore
      }
      if (me?.role === 'student') {
        // 记住学生已用的最高年级，避免默认到一年级上册
        try {
          const allCourses = await loadCourses(state.loggedInUserId)
          setSelectedStudentGradeId(getHighestGradeId(allCourses, state.gradeTexts || []))
        } catch {
          // ignore
        }
      }
      await refreshCompletedChars(state.loggedInUserId)
    }
  }, [refreshCompletedChars])

  const loadStudentPage = useCallback(async (page: number) => {
    if (!appState?.loggedInUserId) return
    const { courses, total } = await loadCoursesPaginated(appState.loggedInUserId, page + 1, pageSize)
    setUserCourses(courses)
    setTotalCourses(total)
    if (courses.length > 0) {
      const recs = await loadRecordsForCourses(appState.loggedInUserId, courses.map((c) => c.id))
      setCourseRecords(recs)
    } else {
      setCourseRecords({})
    }
    try {
      setStudentHasUnfinished(await hasIncompleteCourse(appState.loggedInUserId))
    } catch {
      // ignore
    }
  }, [appState])

  const loadAdminPage = useCallback(async (page: number, userId: string) => {
    const { courses, total } = await loadCoursesPaginated(userId, page + 1, adminPageSize)
    setViewedUserCourses(courses)
    setTotalAdminCourses(total)
    if (courses.length > 0) {
      const recs = await loadRecordsForCourses(userId, courses.map((c) => c.id))
      setViewedUserRecords(recs)
    } else {
      setViewedUserRecords({})
    }
  }, [])

  // Load ALL courses + records for a viewed user, used for accurate summary stats (不受分页影响)
  const loadAdminSummary = useCallback(async (userId: string) => {
    const allCourses = await loadCourses(userId)
    setViewedUserAllCourses(allCourses)
    if (allCourses.length > 0) {
      const recs = await loadRecordsForCourses(userId, allCourses.map((c) => c.id))
      setViewedUserAllRecords(recs)
    } else {
      setViewedUserAllRecords({})
    }
    try {
      setAdminTargetHasUnfinished(await hasIncompleteCourse(userId))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        await refreshAppState()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [refreshAppState])

  const loggedInUser = appState?.users.find((u) => u.id === appState?.loggedInUserId) || null
  const studentUsers = useMemo(() => appState?.users.filter((u) => u.role === 'student') || [], [appState?.users])

  const regOk = regEmail.trim().length > 0 && regPassword.trim().length > 0 && regPassword === regConfirm
  const doRegister = async () => {
    if (!regOk) return
    try {
      const { user, needsConfirmation } = await registerUser(regEmail, regPassword, regName)
      if (needsConfirmation) {
        setRegMessage('注册成功，请查收邮箱中的确认链接后再登录')
        return
      }
      setRegEmail(''); setRegName(''); setRegPassword(''); setRegConfirm('')
      setAuthMode('login')
      if (user) {
        resetPracticeSelection()
        await refreshAppState()
      }
    } catch (e) {
      setRegMessage(e instanceof Error ? e.message : '注册失败')
    }
  }

  const resetPracticeSelection = () => {
    setSelectedCourseId('')
    setIndex(0)
    setResetSignal((k) => k + 1)
  }

  const handleLogout = async () => {
    await logoutUser()
    resetPracticeSelection()
    await refreshAppState()
  }

  // Load data for admin viewed user (only when viewedUserId changes)
  const adminTargetId = loggedInUser?.role === 'admin' ? (viewedUserId || studentUsers[0]?.id || '') : ''
  const prevViewedUserIdRef = useRef('')
  useEffect(() => {
    if (!adminTargetId || adminTargetId === prevViewedUserIdRef.current) return
    prevViewedUserIdRef.current = adminTargetId
    setAdminCoursePage(0)
    loadAdminPage(0, adminTargetId)
    loadAdminSummary(adminTargetId)
  }, [adminTargetId, loadAdminPage, loadAdminSummary])

  if (loading) return <div style={{ height: '100dvh', display: 'grid', placeItems: 'center', background: '#f4efe4', color: '#756d61', fontSize: 18 }}>加载中...</div>




  if (!loggedInUser) {
    return (
      <div style={{ height: '100dvh', display: 'grid', placeItems: 'center', background: '#f4efe4', color: '#241f18', padding: 16 }}>
        <section style={{ width: 'min(420px, 100%)', background: '#fff', border: '1px solid #d8d0c3', borderRadius: 8, padding: 18 }}>
          <h1 style={{ margin: '0 0 14px', fontSize: 24, lineHeight: 1.2, color: '#241f18', fontWeight: 800, letterSpacing: 0 }}>汉字书写练习</h1>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button onClick={() => { setAuthMode('login'); setLoginError(''); setRegMessage('') }}
              style={tabStyle(authMode === 'login')}>登录</button>
            <button onClick={() => { setAuthMode('register'); setLoginError(''); setRegMessage('') }}
              style={tabStyle(authMode === 'register')}>注册</button>
          </div>
          {authMode === 'login' ? (
            <>
              <input value={loginEmail} onChange={(e) => { setLoginEmail(e.target.value); setLoginError('') }}
                placeholder="邮箱" type="email" autoComplete="email" autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('login-btn')?.click() }}
                style={{ width: '100%', height: 44, border: '1px solid #bfb5a5', borderRadius: 8, padding: '0 10px', background: '#fff', color: '#241f18', fontSize: 16 }} />
              <input value={loginPassword} onChange={(e) => { setLoginPassword(e.target.value); setLoginError('') }}
                type="password" placeholder="密码" autoComplete="current-password"
                onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('login-btn')?.click() }}
                style={{ width: '100%', height: 44, border: '1px solid #bfb5a5', fontSize: 16, marginTop: 10 }} />
              {loginError && <div style={{ marginTop: 8, color: '#b53b35', fontSize: 14 }}>{loginError}</div>}
              <button id="login-btn" onClick={async () => {
                const user = await loginByEmail(loginEmail, loginPassword)
                if (!user) { setLoginError('邮箱或密码不正确'); return }
                setLoginPassword(''); setLoginError(''); resetPracticeSelection(); await refreshAppState()
              }} style={{ ...buttonStyle, width: '100%', marginTop: 12, background: '#287a55', color: '#fff' }}>登录</button>
            </>
          ) : (
            <>
              <input value={regEmail} onChange={(e) => { setRegEmail(e.target.value); setRegMessage('') }}
                placeholder="邮箱（登录账号）" type="email" autoComplete="email" autoFocus
                style={{ width: '100%', height: 44, border: '1px solid #bfb5a5', borderRadius: 8, padding: '0 10px', background: '#fff', color: '#241f18', fontSize: 16 }} />
              <input value={regName} onChange={(e) => { setRegName(e.target.value); setRegMessage('') }}
                placeholder="姓名（选填）" type="text" autoComplete="name"
                style={{ width: '100%', height: 44, border: '1px solid #bfb5a5', borderRadius: 8, padding: '0 10px', background: '#fff', color: '#241f18', fontSize: 16, marginTop: 10 }} />
              <input value={regPassword} onChange={(e) => { setRegPassword(e.target.value); setRegMessage('') }}
                type="password" placeholder="密码" autoComplete="new-password"
                style={{ width: '100%', height: 44, border: '1px solid #bfb5a5', fontSize: 16, marginTop: 10 }} />
              <input value={regConfirm} onChange={(e) => { setRegConfirm(e.target.value); setRegMessage('') }}
                type="password" placeholder="确认密码" autoComplete="new-password"
                onKeyDown={(e) => { if (e.key === 'Enter' && regOk) doRegister() }}
                style={{ width: '100%', height: 44, border: '1px solid #bfb5a5', fontSize: 16, marginTop: 10 }} />
              {regMessage && <div style={{ marginTop: 8, color: regMessage.startsWith('注册成功') ? '#287a55' : '#b53b35', fontSize: 14 }}>{regMessage}</div>}
              <button id="register-btn" onClick={doRegister}
                disabled={!regOk}
                style={{ ...buttonStyle, width: '100%', marginTop: 12, background: regOk ? '#2f6f8f' : '#d7d0c6', color: '#fff' }}>注册并登录</button>
            </>
          )}
        </section>
      </div>
    )
  }

  if (loggedInUser.role === 'admin') {
    const viewedUser = studentUsers.find((u) => u.id === viewedUserId) || studentUsers[0] || null
    const viewedSummary = viewedUser ? summarizeUser(viewedUserAllCourses, viewedUserAllRecords) : null
    const listSummary = summarizeUser(viewedUserCourses, viewedUserRecords)
    const allStats = listSummary.stats ?? []
    const visibleStats = allStats
    const selectedGradeItem = gradeTexts.find((g) => g.id === selectedGradeId) || gradeTexts[0]
    const viewedCompletedChars = new Set<string>()
    for (const rec of Object.values(viewedUserAllRecords)) {
      if (rec?.quiz?.completed) viewedCompletedChars.add(rec.character)
    }

    return (
      <div style={{ height: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr', background: '#f4efe4', color: '#241f18', overflow: 'hidden' }}>
        <RotatePrompt />
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#fff', borderBottom: '1px solid #d8d0c3', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 20, marginRight: 8 }}>管理员</strong>
          <button onClick={() => setAdminTab('users')} style={tabStyle(adminTab === 'users')}>用户管理</button>
          <button onClick={() => setAdminTab('chars')} style={tabStyle(adminTab === 'chars')}>字库管理</button>
          <button onClick={() => setPwdModalUserId('admin')}
            style={{ ...buttonStyle, minHeight: 34, padding: '6px 12px', marginLeft: 'auto', background: '#7a6a5a', color: '#fff' }}>改密码</button>
          <button onClick={handleLogout}
            style={{ ...buttonStyle, minHeight: 34, padding: '6px 12px', background: '#6d4c2f', color: '#fff' }}>退出登录</button>
        </header>
        <main style={{ minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {adminTab === 'chars' ? (
            <section style={{ background: '#fff', border: '1px solid #d8d0c3', borderRadius: 8, padding: 14 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 18, color: '#241f18', fontWeight: 800 }}>年级汉字预设</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {gradeTexts.map((g) => (
                  <button key={g.id} onClick={() => setSelectedGradeId(g.id)}
                    style={{ ...buttonStyle, minHeight: 34, padding: '6px 14px', borderRadius: 8,
                      background: g.id === selectedGradeItem?.id ? '#287a55' : '#fff',
                      color: g.id === selectedGradeItem?.id ? '#fff' : '#241f18',
                      border: g.id === selectedGradeItem?.id ? '2px solid #1d5d41' : '1px solid #ddd3c4' }}>
                    {g.name}
                  </button>
                ))}
                <button onClick={() => { const id = 'grade-' + Date.now(); setGradeTexts([...gradeTexts, { id, name: '新班级', chars: '' }]); setSelectedGradeId(id) }}
                  style={{ ...buttonStyle, minHeight: 34, padding: '6px 14px', background: '#2f6f8f', color: '#fff', borderRadius: 8 }}>+ 新增年级</button>
              </div>
              {selectedGradeItem && (
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <input value={selectedGradeItem.name} onChange={(e) => setGradeTexts(gradeTexts.map((g) => g.id === selectedGradeItem.id ? { ...g, name: e.target.value } : g))}
                      placeholder="年级名称" style={{ width: 160, height: 38, border: '1px solid #bfb5a5', borderRadius: 6, padding: '0 10px', fontSize: 15 }} />
                    {gradeTexts.length > 1 && (
                      <button onClick={() => { const next = gradeTexts.filter((g) => g.id !== selectedGradeItem.id); setGradeTexts(next); setSelectedGradeId(next[0]?.id || '') }}
                        style={{ ...buttonStyle, minHeight: 34, padding: '4px 10px', fontSize: 13, background: '#b53b35', color: '#fff' }}>删除</button>
                    )}
                  </div>
                  <textarea value={selectedGradeItem.chars} onChange={(e) => setGradeTexts(gradeTexts.map((g) => g.id === selectedGradeItem.id ? { ...g, chars: e.target.value } : g))}
                    rows={5} placeholder="输入汉字"
                    style={{ width: '100%', resize: 'vertical', border: '1px solid #bfb5a5', borderRadius: 8, padding: 10, fontSize: 18, lineHeight: 1.4, background: '#fff', color: '#241f18' }} />
                  <button onClick={async () => { await saveGradeTexts(gradeTexts); setGradeTexts(gradeTexts); await refreshAppState() }}
                    style={{ ...buttonStyle, marginTop: 8, background: '#2f6f8f', color: '#fff' }}>保存预设</button>
                </div>
              )}
            </section>
          ) : (
            <div style={{ minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16, height: '100%' }}>
              <aside style={{ minHeight: 0, overflowY: 'auto', background: '#fffaf1', border: '1px solid #d8d0c3', borderRadius: 8, padding: 12 }}>
                <section style={{ marginBottom: 14 }}>
                  <h2 style={{ margin: 0, fontSize: 17, lineHeight: 1.2, color: '#241f18', fontWeight: 800 }}>用户列表</h2>
                </section>
                <section>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {studentUsers.map((u) => {
                      const selected = u.id === viewedUser?.id
                      return (
                        <div key={u.id} style={{ padding: 10, background: selected ? '#e7f3ea' : '#fff', border: selected ? '2px solid #287a55' : '1px solid #ddd3c4', borderRadius: 8 }}>
                          <button onClick={() => { setViewedUserId(u.id); setAdminCoursePage(0) }}
                            style={{ textAlign: 'left', display: 'block', width: '100%', padding: 0, background: 'transparent', color: '#241f18', borderRadius: 0 }}>
                            <strong>{u.name}</strong>
                          </button>
                        </div>
                      )
                    })}
                    {studentUsers.length === 0 && <div style={{ color: '#756d61', fontSize: 14 }}>还没有学生用户</div>}
                  </div>
                </section>
              </aside>
              <section style={{ minHeight: 0, overflowY: 'auto', background: '#fff', border: '1px solid #d8d0c3', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2 style={{ margin: '0 0 10px', fontSize: 18, color: '#241f18', fontWeight: 800 }}>用户数据</h2>
                  <div>
                    <button onClick={() => {
                      if (adminTargetHasUnfinished) {
                        alert('该学生还有未完成的课程，请先完成后再新增')
                        return
                      }
                      setAdminAddCourseOpen(true); setAdminAddCourseMode('auto'); setAdminSelectedGradeId(selectedGradeId || gradeTexts[0]?.id || '')
                    }}
                      style={{ ...buttonStyle, minHeight: 34, padding: '6px 12px', background: '#2f6f8f', color: '#fff' }}>新增课程</button>
                  </div>
                </div>
                {viewedUser && viewedSummary ? (
                  <>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12, color: '#5e5548', fontSize: 14 }}>
                      <strong style={{ color: '#241f18' }}>{viewedUser.name}</strong>
                      <span>课程 {viewedSummary.courses.length}</span>
                      <span>完成 {viewedSummary.completedCourses}</span>
                      <span>平均 {viewedSummary.average ?? '--'}分</span>
                    </div>
                    {allStats.length > 0 ? (
                      <>
                        <div style={{ display: 'grid', gap: 8 }}>
                          {visibleStats.map((item) => (
                            <div key={item.course.id} style={{ border: '1px solid #e5dacb', borderRadius: 8, padding: 10, background: '#fffaf1' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <strong style={{ whiteSpace: 'nowrap' }}>课程 {item.course.number}</strong>
                                  {(item.course.libraryName || item.course.source === 'custom') && (
                                    <span style={{ fontSize: 12, color: '#756d61', background: '#f0e9dc', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>{item.course.libraryName || '自定义'}</span>
                                  )}
                                  {!item.isCompleted && (
                                    <button onClick={() => { setEditingCourse(item.course); setEditCourseText(item.course.chars.join('')); setEditCourseOpen(true) }} style={editButtonStyle}>编辑</button>
                                  )}
                                </div>
                                <span style={{ fontSize: 12, color: item.isCompleted ? '#287a55' : '#b53b35', whiteSpace: 'nowrap' }}>{item.isCompleted ? '已完成' : '进行中'}</span>
                              </div>
                              <div style={{ marginTop: 4, color: '#6a5f50', fontSize: 13 }}>{item.course.chars.join('')}</div>
                              <div style={{ marginTop: 4, color: '#6a5f50', fontSize: 13 }}>
                                完成 {item.completedChars}/{item.totalChars}
                                {item.average !== null ? `，平均${item.average}分` : ''}
                                {item.completedAt ? `，完成于 ${formatTime(item.completedAt)}` : `，创建于 ${formatTime(item.course.createdAt)}`}
                              </div>
                            </div>
                          ))}
                        </div>
                        <Pager page={adminCoursePage} total={totalAdminCourses} onPage={(p) => { setAdminCoursePage(p); loadAdminPage(p, viewedUserId || studentUsers[0]?.id || '') }} size={adminPageSize} />
                      </>
                    ) : (
                      <div style={{ color: '#756d61', fontSize: 14 }}>该用户还没有课程数据</div>
                    )}
                  </>
                ) : (
                  <div style={{ color: '#756d61', fontSize: 14 }}>请选择一个学生用户</div>
                )}
              </section>
            </div>
          )}
        </main>
        <PwdModal userId={pwdModalUserId} draft={pwdDraft} setDraft={setPwdDraft} confirm={pwdConfirm} setConfirm={setPwdConfirm}
          onClose={() => { setPwdModalUserId(null); setPwdDraft(''); setPwdConfirm('') }}
          onSubmit={async () => {
            if (!pwdModalUserId) return
            if (pwdDraft.trim().length === 0 || pwdDraft !== pwdConfirm) return
            await updateMyPassword(pwdDraft)
            setPwdModalUserId(null); setPwdDraft(''); setPwdConfirm('')
            await refreshAppState()
          }} />

        <EditCourseModal open={editCourseOpen} course={editingCourse} text={editCourseText} setText={setEditCourseText}
          onClose={() => { setEditCourseOpen(false); setEditingCourse(null); setEditCourseText('') }}
          onSave={async () => {
            if (!editingCourse) return
            const chars = editCourseText.split('').filter((c) => c.trim().length > 0)
            const updated = await updateCourse(editingCourse.id, chars)
            if (updated) {
              setCoursePage(0)
              await loadStudentPage(0)
              if (viewedUserId) {
                setAdminCoursePage(0)
                await loadAdminPage(0, viewedUserId)
                await loadAdminSummary(viewedUserId)
              }
              setEditCourseOpen(false); setEditingCourse(null); setEditCourseText('')
            } else {
              alert('更新课程失败')
            }
          }} />

      {adminAddCourseOpen && (
        <Modal onClose={() => setAdminAddCourseOpen(false)}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>为 {viewedUser?.name || '学生'} 新增课程</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => setAdminAddCourseMode('auto')} style={tabStyle(adminAddCourseMode === 'auto')}>自动生成</button>
              <button onClick={() => setAdminAddCourseMode('custom')} style={tabStyle(adminAddCourseMode === 'custom')}>自定义</button>
            </div>
            {adminAddCourseMode === 'auto' ? (
              <>
                <select value={adminSelectedGradeId} onChange={(e) => setAdminSelectedGradeId(e.target.value)}
                  style={{ width: '100%', height: 40, border: '1px solid #bfb5a5', borderRadius: 8, padding: '0 10px', background: '#fff', color: '#241f18', fontSize: 14, marginBottom: 8 }}>
                  {gradeTexts.map((g) => {
                    const chars = getUniqueChineseChars(g.chars)
                    const done = chars.filter((c) => viewedCompletedChars.has(c)).length
                    return <option key={g.id} value={g.id}>{g.name}（共 {chars.length} 字，已完成 {done}）</option>
                  })}
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={async () => {
                    if (!viewedUser) return
                    if (adminTargetHasUnfinished) {
                      alert('该学生还有未完成的课程，请先完成后再新增')
                      return
                    }
                    try {
                      const grade = gradeTexts.find((g) => g.id === adminSelectedGradeId) || gradeTexts[0]
                      const courses = await generateDefaultCourses(viewedUser.id, grade?.chars, grade?.name)
                      if (courses[0]) {
                        await loadAdminPage(adminCoursePage, viewedUser.id)
                        await loadAdminSummary(viewedUser.id)
                      }
                      setAdminAddCourseOpen(false); setAdminAddCourseText('')
                    } catch (e) {
                      alert(e instanceof Error ? e.message : String(e))
                    }
                  }} style={{ ...buttonStyle, flex: 1, background: '#287a55', color: '#fff' }}>生成课程</button>
                  <button onClick={() => { setAdminAddCourseOpen(false); setAdminAddCourseText('') }} style={{ ...buttonStyle, flex: 1, background: '#d7d0c6', color: '#241f18' }}>取消</button>
                </div>
              </>
            ) : (
              <>
                <textarea value={adminAddCourseText} onChange={(e) => setAdminAddCourseText(e.target.value)} rows={4}
                  placeholder="输入要练习的汉字" style={{ width: '100%', border: '1px solid #bfb5a5', borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={async () => {
                    if (!viewedUser) return
                    if (adminTargetHasUnfinished) {
                      alert('该学生还有未完成的课程，请先完成后再新增')
                      return
                    }
                    try {
                      const course = await addCustomCourse(viewedUser.id, adminAddCourseText)
                      if (course) {
                        await loadAdminPage(adminCoursePage, viewedUser.id)
                        await loadAdminSummary(viewedUser.id)
                      }
                      setAdminAddCourseOpen(false); setAdminAddCourseText('')
                    } catch (e) {
                      alert(e instanceof Error ? e.message : String(e))
                    }
                  }} style={{ ...buttonStyle, flex: 1, background: '#287a55', color: '#fff' }}>添加课程</button>
                  <button onClick={() => { setAdminAddCourseOpen(false); setAdminAddCourseText('') }} style={{ ...buttonStyle, flex: 1, background: '#d7d0c6', color: '#241f18' }}>取消</button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
      </div>
    )
  }

  const courseStats = userCourses.map((c) => getCourseStats(c, courseRecords))
  const sortedCourses = courseStats
  const visibleCourses = sortedCourses

  const activeCourse = userCourses.find((c) => c.id === selectedCourseId)
    || courseStats.find((s) => !s.isCompleted)?.course
    || courseStats[0]?.course
    || null
  const activeStats = activeCourse ? getCourseStats(activeCourse, courseRecords) : null
  const safeIndex = activeCourse ? Math.min(index, Math.max(0, activeCourse.chars.length - 1)) : 0
  const active = activeCourse?.chars[safeIndex] || ''
  const activePracticeKey = activeCourse && active ? getPracticeKey(activeCourse.id, safeIndex, active) : ''

  // 当前课程中尚未完成的字（按课程顺序），用于"下一个/完成"按钮
  const remainingIndices = activeCourse && activeStats
    ? activeCourse.chars.map((_, i) => i).filter((i) => !activeStats.records[i]?.quiz?.completed)
    : []
  const isLastRemaining = remainingIndices.length === 1 && remainingIndices[0] === safeIndex
  const allCompleted = remainingIndices.length === 0
  const nextButtonLabel = allCompleted || isLastRemaining ? '完成' : '下一个'

  const handleNextOrComplete = async () => {
    if (!activeCourse || !activeStats) return
    // 全部完成或正在写最后一个字：点击后刷新课程统计
    if (allCompleted || isLastRemaining) {
      await loadStudentPage(coursePage)
      await refreshCompletedChars(loggedInUser.id)
      return
    }
    // 否则定位到第一个未完成的字
    const target = remainingIndices[0]
    if (target >= 0 && target !== safeIndex) setIndex(target)
  }

  return (
    <div style={{ height: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr', background: '#f4efe4', color: '#241f18', overflow: 'hidden' }}>
      <RotatePrompt />
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fff', borderBottom: '1px solid #d8d0c3', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 20 }}>{loggedInUser.name}</strong>
        <span style={{ color: '#756d61', fontSize: 14 }}>
          {activeCourse ? `课程 ${activeCourse.number}` : '还没有课程'}
          {activeStats?.average !== null && activeStats?.average !== undefined ? ` · ${activeStats.average}分` : ''}
        </span>
        <button onClick={() => setPwdModalUserId(loggedInUser.id)}
          style={{ ...buttonStyle, marginLeft: 'auto', background: '#7a6a5a', color: '#fff' }}>改密码</button>
        <button onClick={handleLogout}
          style={{ ...buttonStyle, background: '#6d4c2f', color: '#fff' }}>退出登录</button>
      </header>

      <main style={{ minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', overflow: 'hidden' }}>
        <aside style={{ minHeight: 0, overflowY: 'auto', borderRight: '1px solid #d8d0c3', background: '#fffaf1', padding: 12 }}>
          <section style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              <button onClick={() => setStudentGenTab('auto')} style={tabStyle(studentGenTab === 'auto')}>自动生成</button>
              <button onClick={() => setStudentGenTab('custom')} style={tabStyle(studentGenTab === 'custom')}>自定义</button>
            </div>
            {studentGenTab === 'auto' ? (
              <>
                <select value={selectedStudentGradeId} onChange={(e) => setSelectedStudentGradeId(e.target.value)}
                  style={{ width: '100%', height: 40, border: '1px solid #bfb5a5', borderRadius: 8, padding: '0 10px', background: '#fff', color: '#241f18', fontSize: 14, marginBottom: 8 }}>
                  {gradeTexts.map((g) => {
                    const chars = getUniqueChineseChars(g.chars)
                    const done = chars.filter((c) => completedCharSet.has(c)).length
                    return <option key={g.id} value={g.id}>{g.name}（共 {chars.length} 字，已完成 {done}）</option>
                  })}
                </select>
                <button onClick={async () => {
                  if (studentHasUnfinished) {
                    alert('请先完成当前课程，再新增新课程')
                    return
                  }
                  try {
                    const grade = gradeTexts.find((g) => g.id === selectedStudentGradeId) || gradeTexts[0]
                    const courses = await generateDefaultCourses(loggedInUser.id, grade?.chars, grade?.name)
                    if (courses[0]) {
                      setSelectedCourseId(courses[0].id); setIndex(0)
                      await loadStudentPage(coursePage)
                      await refreshCompletedChars(loggedInUser.id)
                    }
                  } catch (e) {
                    alert(e instanceof Error ? e.message : String(e))
                  }
                }} style={{ ...buttonStyle, width: '100%', background: '#2f6f8f', color: '#fff' }}>新增课程</button>
              </>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <textarea value={customCourseText} onChange={(e) => setCustomCourseText(e.target.value)}
                    placeholder="输入要练习的汉字" rows={3}
                    style={{ width: '100%', resize: 'vertical', border: '1px solid #bfb5a5', borderRadius: 8, padding: '10px 30px 28px 10px', fontSize: 18, lineHeight: 1.4, background: '#fff', color: '#241f18', boxSizing: 'border-box' }} />
                  <div style={{ position: 'absolute', right: 8, bottom: 6, fontSize: 12, color: '#756d61', pointerEvents: 'none' }}>{customCourseText.length} 字</div>
                </div>
                <button onClick={async () => {
                  if (studentHasUnfinished) {
                    alert('请先完成当前课程，再新增新课程')
                    return
                  }
                  try {
                    const course = await addCustomCourse(loggedInUser.id, customCourseText)
                    if (!course) return
                    setSelectedCourseId(course.id); setCustomCourseText(''); setIndex(0)
                    await loadStudentPage(coursePage)
                    await refreshCompletedChars(loggedInUser.id)
                  } catch (e) {
                    alert(e instanceof Error ? e.message : String(e))
                  }
                }} style={{ ...buttonStyle, width: '100%', marginTop: 8, background: '#2f6f8f', color: '#fff' }}>新增课程</button>
              </>
            )}
          </section>

          <section style={{ borderTop: '1px solid #e5dacb', paddingTop: 12 }}>
            {totalCourses === 0 ? (
              <div style={{ color: '#756d61', fontSize: 14, textAlign: 'center', padding: 20 }}>
                点击上方的"新增课程"开始练习
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {visibleCourses.map((item) => (
                  <CourseButton key={item.course.id} stats={item}
                    selected={item.course.id === activeCourse?.id}
                    onClick={() => { setSelectedCourseId(item.course.id); setIndex(0) }}
                    onEdit={(c) => { setEditingCourse(c); setEditCourseText(c.chars.join('')); setEditCourseOpen(true) }} />
                ))}
              </div>
            )}
            <Pager page={coursePage} total={totalCourses} onPage={(p) => { setCoursePage(p); loadStudentPage(p) }} />
          </section>
        </aside>

        <section style={{ minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: '1fr auto', overflow: 'hidden' }}>
          <div style={{ minHeight: 0, position: 'relative', background: '#f5ecd7' }}>
            {activeCourse && active && activeStats ? (
              <PracticeBoard
                key={`${loggedInUser.id}:${activePracticeKey}`}
                character={active} userId={loggedInUser.id} courseId={activeCourse.id}
                practiceKey={activePracticeKey} resetKey={resetSignal}
                initialRecord={courseRecords[activePracticeKey]}
                nextLabel={nextButtonLabel}
                onNext={handleNextOrComplete}
                onReset={() => setResetSignal((k) => k + 1)}
                onSaved={async () => {
                  // Reload records for current page courses
                  if (loggedInUser.id) {
                    const recs = await loadRecordsForCourses(loggedInUser.id, userCourses.map((c) => c.id))
                    setCourseRecords(recs)
                    await refreshCompletedChars(loggedInUser.id)
                  }
                }}
              />
            ) : (
              <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#756d61', fontSize: 18 }}>
                点击左侧"新增课程"开始练习
              </div>
            )}
          </div>
          <div style={{ minHeight: activeCourse ? 86 : 0, maxHeight: 'min(36vh, 260px)', background: '#fff', borderTop: '1px solid #ddd', display: 'flex', alignItems: 'flex-start', padding: 8, overflowY: 'auto', overflowX: 'hidden', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
            {activeCourse && activeStats && (
              <CharacterBar list={activeCourse.chars} active={active} records={activeStats.records}
                onSelect={(char: string) => { const ni = activeCourse.chars.indexOf(char); if (ni >= 0) setIndex(ni) }} />
            )}
          </div>
        </section>
      </main>
      <PwdModal userId={pwdModalUserId} draft={pwdDraft} setDraft={setPwdDraft} confirm={pwdConfirm} setConfirm={setPwdConfirm}
        onClose={() => { setPwdModalUserId(null); setPwdDraft(''); setPwdConfirm('') }}
        onSubmit={async () => {
          if (!pwdModalUserId) return
          if (pwdDraft.trim().length === 0 || pwdDraft !== pwdConfirm) return
          await updateMyPassword(pwdDraft)
          setPwdModalUserId(null); setPwdDraft(''); setPwdConfirm('')
          await refreshAppState()
        }} />

      <EditCourseModal open={editCourseOpen} course={editingCourse} text={editCourseText} setText={setEditCourseText}
        onClose={() => { setEditCourseOpen(false); setEditingCourse(null); setEditCourseText('') }}
        onSave={async () => {
          if (!editingCourse) return
          const chars = editCourseText.split('').filter((c) => c.trim().length > 0)
          const updated = await updateCourse(editingCourse.id, chars)
          if (updated) {
            setCoursePage(0)
            await loadStudentPage(0)
            if (viewedUserId) {
              setAdminCoursePage(0)
              await loadAdminPage(0, viewedUserId)
            }
            setEditCourseOpen(false); setEditingCourse(null); setEditCourseText('')
          } else {
            alert('更新课程失败')
          }
        }} />

    </div>
  )

}
