const BASE = '/api'

function getToken() {
  return localStorage.getItem('hg_token')
}

function setToken(token: string | null) {
  if (token) localStorage.setItem('hg_token', token)
  else localStorage.removeItem('hg_token')
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }))
    throw new Error(err.error || '请求失败')
  }

  return res.json()
}

export const api = {
  // Auth
  login(name: string, password: string) {
    return request<{ token: string; user: { id: string; name: string; role: string; createdAt: number } }>('POST', '/auth/login', { name, password })
      .then((data) => { setToken(data.token); return data })
  },
  logout() {
    return request<{ ok: boolean }>('POST', '/auth/logout').then((data) => { setToken(null); return data })
  },
  getMe() {
    return request<{ user: { id: string; name: string; role: string; createdAt: number } | null }>('GET', '/auth/me')
  },
  isDefaultAdminPassword() {
    return request<{ isDefault: boolean }>('GET', '/auth/is-default-admin-password')
  },

  // Users
  getUsers() {
    return request<{ users: { id: string; name: string; role: string; createdAt: number }[] }>('GET', '/users')
  },
  addUser(name: string, password: string) {
    return request<{ user: { id: string; name: string; role: string; createdAt: number } }>('POST', '/users', { name, password })
  },
  deleteUser(id: string) {
    return request<{ ok: boolean }>('DELETE', `/users/${id}`)
  },
  updatePassword(id: string, password: string) {
    return request<{ ok: boolean }>('PUT', `/users/${id}/password`, { password })
  },

  // Courses
  getCourses(userId: string, page?: number, limit?: number) {
    if (page !== undefined && limit !== undefined) {
      return request<{ courses: any[]; total: number }>('GET', `/courses/${userId}?page=${page}&limit=${limit}`)
    }
    return request<{ courses: any[] }>('GET', `/courses/${userId}`)
  },
  generateCourse(userId: string, text?: string) {
    return request<{ courses: any[] }>('POST', `/courses/${userId}/generate`, { text })
  },
  addCustomCourse(userId: string, text: string) {
    return request<{ course: any }>('POST', `/courses/${userId}/custom`, { text })
  },
  // Update an existing course (overwrite chars). Server should accept PUT /courses/:courseId { chars: string[] }
  updateCourse(courseId: string, chars: string[]) {
    return request<{ course: any }>('PUT', `/courses/${courseId}`, { chars })
  },

  // Records
  getRecords(userId: string, courseIds?: string[]) {
    if (courseIds && courseIds.length > 0) {
      return request<{ records: Record<string, any> }>('GET', `/records/${userId}?courseIds=${courseIds.join(',')}`)
    }
    return request<{ records: Record<string, any> }>('GET', `/records/${userId}`)
  },
  getRecord(userId: string, practiceKey: string) {
    return request<{ record: any | null }>('GET', `/records/${userId}/${practiceKey}`)
  },
  saveRecord(userId: string, practiceKey: string, record: any) {
    return request<{ ok: boolean }>('PUT', `/records/${userId}/${practiceKey}`, { record })
  },

  // Grade texts
  getGradeTexts() {
    return request<{ gradeTexts: { id: string; name: string; chars: string }[] }>('GET', '/grade-texts')
  },
  saveGradeTexts(gradeTexts: { id: string; name: string; chars: string }[]) {
    return request<{ gradeTexts: { id: string; name: string; chars: string }[] }>('PUT', '/grade-texts', { gradeTexts })
  },
  updateDefaultText(defaultText: string) {
    return request<{ ok: boolean }>('PUT', '/grade-texts/default-text', { defaultText })
  }
}
