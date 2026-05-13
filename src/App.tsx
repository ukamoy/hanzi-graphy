import { useState } from 'react'
import CharacterInput from './components/CharacterInput'
import CharacterBar from './components/CharacterBar'
import PracticeBoard from './components/PracticeBoard'
import { getChineseChars } from './engine/chinese'
import { generateRandomChineseChars } from './engine/randomHanzi'
import { clearAll } from './engine/storage'

export default function App() {
  const [text, setText] = useState('')
  const [chars, setChars] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [resetSignal, setResetSignal] = useState(0)

  const active = chars[index] || ''

  const applyChars = (nextChars: string[]) => {
    clearAll()
    setChars(nextChars)
    setIndex(0)
  }

  const generate = () => {
    applyChars(getChineseChars(text, 20))
  }

  const generateRandom = () => {
    const nextChars = generateRandomChineseChars(20)
    setText(nextChars.join(''))
    applyChars(nextChars)
  }

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f5ecd7'
    }}>
      <div style={{
        minHeight: 64,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        background: '#fff',
        borderBottom: '1px solid #ddd',
        flexWrap: 'wrap'
      }}>
        <CharacterInput value={text} onChange={setText} />

        <button onClick={generate}>
          生成
        </button>

        <button
          onClick={generateRandom}
          style={{
            background: '#2f6f8f'
          }}
        >
          随机20字
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <PracticeBoard
          key={active}
          character={active}
          resetKey={resetSignal}
          onReset={() => setResetSignal((key) => key + 1)}
        />
      </div>

      <div style={{
        // minHeight: 200,
        height: 'auto',
        minHeight: chars.length > 0 ? 72 : 0,
        maxHeight: 'min(36vh, 248px)',
        flexShrink: 1,
        background: '#fff',
        borderTop: '1px solid #ddd',
        display: 'flex',
        alignItems: 'flex-start',
        padding: 8,
        overflowY: 'auto',
        overflowX: 'hidden',
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain'
      }}>
        <CharacterBar
          list={chars}
          active={active}
          onSelect={(char: string) => {
            const nextIndex = chars.indexOf(char)
            if (nextIndex >= 0) setIndex(nextIndex)
          }}
        />
      </div>
    </div>
  )
}
