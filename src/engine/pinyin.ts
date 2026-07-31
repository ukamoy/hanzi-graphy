import { cedictPinyin } from '../data/cedict-pinyin'

const TONE_VOWELS: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ']
}

// 把 CC-CEDICT 的声调数字拼音（如 ni3 hao3）转成韵母上的声调符号（如 nǐ hǎo）
function markSyllable(syllable: string) {
  const m = syllable.match(/^(.+?)([0-5]?)$/)
  const base = m ? m[1] : syllable
  const toneRaw = m ? m[2] : ''
  if (!toneRaw || toneRaw === '0' || toneRaw === '5') return base
  const tone = parseInt(toneRaw, 10)
  const normalized = base.toLowerCase().replace('u:', 'ü').replaceAll('v', 'ü')
  const chars = [...normalized]
  let target: string | undefined
  if (chars.includes('a')) target = 'a'
  else if (chars.includes('e')) target = 'e'
  else if (chars.includes('o')) target = 'o'
  else if (chars.includes('i') && chars.includes('u')) {
    target = chars.lastIndexOf('i') > chars.lastIndexOf('u') ? 'i' : 'u'
  } else if (chars.includes('i')) target = 'i'
  else if (chars.includes('u')) target = 'u'
  else if (chars.includes('ü')) target = 'ü'
  if (!target) return base
  const idx = chars.lastIndexOf(target)
  chars[idx] = TONE_VOWELS[target][tone - 1]
  return chars.join('')
}

export function convertCedictPinyin(pinyin: string) {
  return pinyin.split(' ').map(markSyllable).join(' ')
}

// 与 pinyin-pro 的 toneType:'symbol' 输出一致的逐字拼音
export function getPinyinText(value: string) {
  return Array.from(value)
    .map((ch) => cedictPinyin[ch])
    .filter((p): p is string => !!p)
    .map(convertCedictPinyin)
    .join(' ')
}

export interface WordHint {
  word: string
  pinyin: string
  meaning: string
}

let wordsCache: Record<string, [string, string, string][]> | null = null
let wordsPromise: Promise<Record<string, [string, string, string][]>> | null = null

function loadWords(): Promise<Record<string, [string, string, string][]>> {
  if (!wordsPromise) {
    wordsPromise = fetch('/data/cedict-words.json')
      .then((r) => {
        if (!r.ok) throw new Error(`加载词典失败: ${r.status}`)
        return r.json()
      })
      .then((data: Record<string, [string, string, string][]>) => {
        wordsCache = data
        return data
      })
      .catch((err) => {
        wordsPromise = null
        throw err
      })
  }
  return wordsPromise
}

// 根据汉字提示组词和英文含义
export async function getWordHints(character: string): Promise<WordHint[]> {
  if (wordsCache) return (wordsCache[character] || []).map(toHint)
  const data = await loadWords()
  return (data[character] || []).map(toHint)
}

function toHint(entry: [string, string, string]): WordHint {
  return {
    word: entry[0],
    pinyin: convertCedictPinyin(entry[1]),
    meaning: entry[2]
  }
}
