type Record = {
  paths: string[]
  score?: number
  quiz?: {
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
}

const KEY = 'writing_cache'

export function save(char: string, data: Record) {
  const db = JSON.parse(localStorage.getItem(KEY) || '{}')
  db[char] = data
  localStorage.setItem(KEY, JSON.stringify(db))
}

export function load(char: string): Record | null {
  const db = JSON.parse(localStorage.getItem(KEY) || '{}')
  return db[char] || null
}

export function clearAll() {
  localStorage.removeItem(KEY)
}

export function getAll(): Record {
  return JSON.parse(localStorage.getItem(KEY) || '{}')
}
