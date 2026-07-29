import { useEffect, useRef } from 'react'
import HanziWriter from 'hanzi-writer'

interface Props {
  character: string
}

export default function HanziCharacter({
  character
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const writerRef = useRef<HanziWriter | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // 防止重复初始化
    if (writerRef.current) {
      writerRef.current = null
    }

    // 清空旧内容（安全方式）
    while (el.firstChild) {
      el.removeChild(el.firstChild)
    }

    const writer = HanziWriter.create(el, character, {
      width: 400,
      height: 400,
      padding: 20,
      showOutline: true,
      showCharacter: true,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 200
    })

    writerRef.current = writer

    writer.animateCharacter()

    return () => {
      // 不直接操作 innerHTML
      while (el.firstChild) {
        el.removeChild(el.firstChild)
      }

      writerRef.current = null
    }
  }, [character])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    />
  )
}
