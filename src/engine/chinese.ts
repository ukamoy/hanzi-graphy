const HAN_CHARACTER_PATTERN = /\p{Script=Han}/gu

export function getChineseChars(value: string, limit = 20) {
  return Array.from(value.matchAll(HAN_CHARACTER_PATTERN), (match) => match[0])
    .slice(0, limit)
}
