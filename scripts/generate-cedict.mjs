// 从 CC-CEDICT 数据生成前端使用的精简词典
// 产物：
//   src/data/cedict-pinyin.ts    —— 单字拼音表（每字全部读音，主音在前；打包进 bundle，替换 pinyin-pro）
//   public/data/cedict-words.json —— 每字组词 + 英文释义（覆盖每个读音，按需懒加载）
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const entries = require('cedict')

const PINYIN_CAP = 3
const WORD_MAX_LEN = 3
const WORDS_PER_READING = 2
const TOTAL_WORDS_CAP = 6

const wordIndex = new Map()
const readingCounts = new Map()
const readingsForChar = new Map()

function getCharWords(ch) {
  let arr = wordIndex.get(ch)
  if (!arr) {
    arr = []
    wordIndex.set(ch, arr)
  }
  return arr
}

function isSecondary(translation) {
  return /^(surname |variant of |old variant of |abbr\. for )/.test(translation)
}

const VULGAR = /\b(fuck|shit|dick|damn|arse|ass|piss|whore|bitch|妓|肏|操|屎|屄)\b/i

function isVulgar(translation) {
  return VULGAR.test(translation)
}

// 只保留 CJK 统一表意文字区段，避免把其它文字系统的单字（如婆罗米文）写进对象键
function isCJKChar(ch) {
  const cp = ch.codePointAt(0)
  return (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff)
}

function isCJKWord(w) {
  return [...w].every(isCJKChar)
}

// 完整音节键（含声调数字），如 "bu3"、"hao4"，用于区分声调不同的多音字（好 hǎo/hào）
function syllKeyOf(syllable) {
  return syllable.toLowerCase().replace(/^(.+?)([0-5]?)$/, '$1$2')
}

for (const e of entries) {
  const w = e.simplified || e.traditional
  if (!w) continue
  const chars = [...w]
  const len = chars.length
  if (len === 1) {
    const ch = chars[0]
    if (!isCJKChar(ch)) continue
    const defs = e.definitions
      .map((d) => ({ pinyin: d.pinyin.split(' ')[0], secondary: isSecondary(d.translations[0]) }))
      .filter((d) => d.pinyin)
    // 收集单字条目的所有读音；非姓氏/异体等派生义优先
    for (const d of defs) {
      const key = syllKeyOf(d.pinyin)
      let readings = readingsForChar.get(ch)
      if (!readings) {
        readings = new Map()
        readingsForChar.set(ch, readings)
      }
      const existing = readings.get(key)
      if (!existing || (!d.secondary && existing.secondary)) {
        readings.set(key, { syl: d.pinyin.toLowerCase(), secondary: d.secondary })
      }
    }
  } else if (len >= 2 && len <= WORD_MAX_LEN) {
    if (!isCJKWord(w)) continue
    const p = e.definitions[0].pinyin
    const syllables = p.split(' ')
    let t = e.definitions[0].translations[0]
    t = t.split('[')[0].split('CL:')[0].split(',')[0].trim()
    if (t.length > 40) t = t.slice(0, 40) + '…'
    const vulgar = isVulgar(e.definitions[0].translations[0])
    // 统计该词里每个汉字读音的使用频次，用于给多音字的主音排序
    for (let i = 0; i < chars.length; i++) {
      const syllable = syllables[i]
      if (syllable) {
        const ch = chars[i]
        const key = syllKeyOf(syllable)
        const countKey = ch + '|' + key
        readingCounts.set(countKey, (readingCounts.get(countKey) || 0) + 1)
        let readings = readingsForChar.get(ch)
        if (!readings) {
          readings = new Map()
          readingsForChar.set(ch, readings)
        }
        // 组词中的实际读音可靠，直接采信
        if (!readings.has(key)) readings.set(key, { syl: syllable.toLowerCase(), secondary: false })
      }
    }
    for (const ch of chars) {
      getCharWords(ch).push({ w, hsk: e.hsk || 0, p, t, vulgar })
    }
  }
}

// 每字读音列表：优先非姓氏/异体音，按组词出现次数排序，主音在前
const pinyinList = new Map()
for (const [ch, readings] of readingsForChar) {
  const counts = new Map()
  for (const [key, count] of readingCounts) {
    if (key.startsWith(ch + '|')) {
      const syll = key.slice(ch.length + 1)
      counts.set(syll, (counts.get(syll) || 0) + count)
    }
  }
  const entries = [...readings.entries()]
  const hasNonSecondary = entries.some(([, r]) => !r.secondary)
  const filtered = hasNonSecondary ? entries.filter(([, r]) => !r.secondary) : entries
  const ordered = filtered
    .sort((a, b) => (counts.get(b[0]) || 0) - (counts.get(a[0]) || 0))
  pinyinList.set(ch, ordered.map(([, r]) => r.syl))
}

const wordsOut = {}
for (const [ch, pinyins] of pinyinList) {
  const arr = (wordIndex.get(ch) || []).filter((x) => !x.vulgar)
  const multi = pinyins.length > 1

  // 把组词按"该字在词中的读音"分组，确保每个读音都有示例词
  const byReading = new Map()
  for (const item of arr) {
    const syllables = item.p.split(' ')
    const idx = [...item.w].indexOf(ch)
    const syl = idx >= 0 ? syllables[idx] : undefined
    if (!syl) continue
    const key = syllKeyOf(syl)
    let list = byReading.get(key)
    if (!list) {
      list = []
      byReading.set(key, list)
    }
    list.push(item)
  }

  const sortWords = (items) => [...items].sort((a, b) => {
    const ha = a.hsk > 0 ? a.hsk : 99
    const hb = b.hsk > 0 ? b.hsk : 99
    if (ha !== hb) return ha - hb
    // 词长短的更基础常用；字头只作最后决胜（避免次要读音被"以字开头"的生僻词抢走，如 萝卜 vs 卜卜米）
    if (a.w.length !== b.w.length) return a.w.length - b.w.length
    const leadA = a.w.startsWith(ch) ? 0 : 1
    const leadB = b.w.startsWith(ch) ? 0 : 1
    if (leadA !== leadB) return leadA - leadB
    return 0
  })

  const selected = []
  for (const syl of pinyins) {
    const cap = multi ? WORDS_PER_READING : PINYIN_CAP
    selected.push(...sortWords(byReading.get(syllKeyOf(syl)) || []).slice(0, cap))
  }

  const seen = new Set()
  const unique = selected.filter((item) => {
    const k = `${item.w}|${item.p}|${item.t}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  wordsOut[ch] = {
    pinyin: pinyins,
    words: unique.slice(0, TOTAL_WORDS_CAP).map((x) => [x.w, x.p, x.t])
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'src', 'data')
mkdirSync(dataDir, { recursive: true })
mkdirSync(join(root, 'public', 'data'), { recursive: true })

const lines = Object.entries(wordsOut).map(([ch, { pinyin }]) => `${JSON.stringify(ch)}: ${JSON.stringify(pinyin)}`)
writeFileSync(join(dataDir, 'cedict-pinyin.ts'), `export const cedictPinyin: Record<string, string[]> = {\n${lines.join(',\n')}\n}\n`)

const wordsJson = {}
for (const [ch, { words }] of Object.entries(wordsOut)) {
  if (words.length) wordsJson[ch] = words
}
writeFileSync(join(root, 'public', 'data', 'cedict-words.json'), JSON.stringify(wordsJson))

const chars = Object.keys(wordsOut).length
const withWords = Object.keys(wordsJson).length
console.log(`生成完成：${chars} 个汉字，其中 ${withWords} 个有组词数据。`)