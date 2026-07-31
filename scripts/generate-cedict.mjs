// 从 CC-CEDICT 数据生成前端使用的精简词典
// 产物：
//   src/data/cedict-pinyin.ts    —— 单字拼音表（打包进 bundle，替换 pinyin-pro）
//   public/data/cedict-words.json —— 每字组词 + 英文释义（按需懒加载）
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const entries = require('cedict')

const PINYIN_CAP = 3
const WORD_MAX_LEN = 3

const pinyinMap = new Map()
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
    let best = pinyinMap.get(ch)
    if (!best) {
      best = defs.find((d) => !d.secondary) || defs[0]
      pinyinMap.set(ch, best)
    }
  } else if (len >= 2 && len <= WORD_MAX_LEN) {
    if (!isCJKWord(w)) continue
    const p = e.definitions[0].pinyin
    const syllables = p.split(' ')
    let t = e.definitions[0].translations[0]
    t = t.split('[')[0].split('CL:')[0].split(',')[0].trim()
    if (t.length > 40) t = t.slice(0, 40) + '…'
    const vulgar = isVulgar(e.definitions[0].translations[0])
    // 统计该词里每个汉字读音的使用频次，用于给多音字选最常用读音
    for (let i = 0; i < chars.length; i++) {
      const syllable = syllables[i]
      if (syllable) {
        const ch = chars[i]
        const base = syllable.toLowerCase().replace(/[0-5]$/, '')
        const key = ch + '|' + base
        readingCounts.set(key, (readingCounts.get(key) || 0) + 1)
        let readings = readingsForChar.get(ch)
        if (!readings) {
          readings = new Map()
          readingsForChar.set(ch, readings)
        }
        if (!readings.has(base)) readings.set(base, syllable)
      }
    }
    for (const ch of chars) {
      getCharWords(ch).push({ w, hsk: e.hsk || 0, p, t, vulgar })
    }
  }
}

// 多音字：选择在组词中出现次数最多的读音；无组词数据时退回第一个非姓氏读音
for (const [ch, best] of pinyinMap) {
  const readingCountsForChar = new Map()
  for (const [key, count] of readingCounts) {
    if (key.startsWith(ch + '|')) {
      const reading = key.slice(ch.length + 1)
      readingCountsForChar.set(reading, (readingCountsForChar.get(reading) || 0) + count)
    }
  }
  if (readingCountsForChar.size > 0) {
    let top = null
    let topCount = -1
    for (const [reading, count] of readingCountsForChar) {
      if (count > topCount) {
        top = reading
        topCount = count
      }
    }
    const readings = readingsForChar.get(ch)
    pinyinMap.set(ch, { pinyin: (readings && readings.get(top)) || top, secondary: false })
  } else if (best.secondary) {
    pinyinMap.set(ch, { pinyin: best.pinyin, secondary: false })
  }
}

const wordsOut = {}
for (const [ch, { pinyin }] of pinyinMap) {
  const arr = (wordIndex.get(ch) || [])
    .filter((x) => !x.vulgar)
    .sort((a, b) => {
      const ha = a.hsk > 0 ? a.hsk : 99
      const hb = b.hsk > 0 ? b.hsk : 99
      if (ha !== hb) return ha - hb
      const leadA = a.w.startsWith(ch) ? 0 : 1
      const leadB = b.w.startsWith(ch) ? 0 : 1
      if (leadA !== leadB) return leadA - leadB
      return a.w.length - b.w.length
    })
    .slice(0, PINYIN_CAP)
  wordsOut[ch] = {
    pinyin,
    words: arr.map((x) => [x.w, x.p, x.t])
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'src', 'data')
mkdirSync(dataDir, { recursive: true })
mkdirSync(join(root, 'public', 'data'), { recursive: true })

const lines = Object.entries(wordsOut).map(([ch, { pinyin }]) => `${JSON.stringify(ch)}: ${JSON.stringify(pinyin)}`)
writeFileSync(join(dataDir, 'cedict-pinyin.ts'), `export const cedictPinyin: Record<string, string> = {\n${lines.join(',\n')}\n}\n`)

const wordsJson = {}
for (const [ch, { words }] of Object.entries(wordsOut)) {
  if (words.length) wordsJson[ch] = words
}
writeFileSync(join(root, 'public', 'data', 'cedict-words.json'), JSON.stringify(wordsJson))

const chars = Object.keys(wordsOut).length
const withWords = Object.keys(wordsJson).length
console.log(`生成完成：${chars} 个汉字，其中 ${withWords} 个有组词数据。`)
