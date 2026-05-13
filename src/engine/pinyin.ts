import { pinyin } from 'pinyin-pro'

export function getPinyinText(value: string) {
  return pinyin(value, {
    toneType: 'symbol',
    type: 'array',
    nonZh: 'removed'
  }).join(' ')
}
