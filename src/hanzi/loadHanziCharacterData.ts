import type { CharacterJson } from 'hanzi-writer'

const HANZI_WRITER_DATA_BASE_URL =
  'https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest'

export function loadHanziCharacterData(char: string): Promise<CharacterJson> {
  return fetch(`${HANZI_WRITER_DATA_BASE_URL}/${char}.json`).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to load Hanzi data for ${char}`)
    }

    return res.json()
  })
}
