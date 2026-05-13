import { useEffect, useRef } from 'react'
import HanziWriter from 'hanzi-writer'
import { loadHanziCharacterData } from './loadHanziCharacterData'

export default function HanziGuide({ character }: { character: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host || !character) return

    host.innerHTML = ''

    const writer = HanziWriter.create(host, character, {
      width: 300,
      height: 300,
      padding: 0,
      showOutline: true,
      showCharacter: false,
      charDataLoader: loadHanziCharacterData
    })

    writer.animateCharacter()

    return () => {
      host.innerHTML = ''
    }
  }, [character])

  return <div ref={ref} />
}
