import { useEffect, useMemo, useRef, useState } from 'react'
import HanziWriter from 'hanzi-writer'
import type { Point, StrokeData } from 'hanzi-writer'
import GridLayer from './GridLayer'
import { getPinyinText } from '../engine/pinyin'
import { load, save } from '../engine/storage'
import { loadHanziCharacterData } from '../hanzi/loadHanziCharacterData'

interface Props {
  character: string
  resetKey?: number
  onReset?: () => void
}

type QuizStats = {
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

type HanziCharacterData = {
  strokes: Array<{
    points: Point[]
  }>
}

const emptyStats: QuizStats = {
  totalStrokes: 0,
  correctStrokes: 0,
  totalMistakes: 0,
  qualityPenalty: 0,
  currentStroke: 0,
  mistakesOnStroke: 0,
  strokesRemaining: 0,
  completed: false,
  lastResult: null
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score))
}

function calculateScore(stats: QuizStats) {
  if (stats.totalStrokes <= 0) return null

  const progress = stats.correctStrokes / stats.totalStrokes
  const mistakePenalty = Math.max(3, Math.round(35 / stats.totalStrokes))

  return clampScore(Math.round(
    progress * 100 - stats.totalMistakes * mistakePenalty - stats.qualityPenalty
  ))
}

function statsFromStroke(
  data: StrokeData,
  isCorrect: boolean,
  mistakeOffset: number,
  qualityPenalty: number
): QuizStats {
  const totalStrokes = data.strokeNum + data.strokesRemaining + (isCorrect ? 1 : 0)

  return {
    totalStrokes,
    correctStrokes: isCorrect ? data.strokeNum + 1 : data.strokeNum,
    totalMistakes: mistakeOffset + data.totalMistakes,
    qualityPenalty,
    currentStroke: data.strokeNum,
    mistakesOnStroke: data.mistakesOnStroke,
    strokesRemaining: data.strokesRemaining,
    completed: false,
    lastResult: isCorrect ? 'correct' : 'mistake'
  }
}

function isFilledBrushPath(path: string) {
  return /\bQ\b/.test(path) || path.trim().endsWith('Z')
}

function normalizeStats(stats: Partial<QuizStats> | undefined): QuizStats {
  return {
    ...emptyStats,
    ...stats,
    qualityPenalty: stats?.qualityPenalty ?? 0
  }
}

function getPathLength(points: Point[]) {
  let length = 0

  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }

  return length
}

function getTortuosity(points: Point[]) {
  if (points.length < 2) return 1

  const direct = Math.hypot(
    points[points.length - 1].x - points[0].x,
    points[points.length - 1].y - points[0].y
  )

  return getPathLength(points) / Math.max(1, direct)
}

function calculateStrokeQualityPenalty(
  drawnPoints: Point[],
  refPoints: Point[] | undefined
) {
  if (!refPoints || drawnPoints.length < 2) return 0

  const drawnLength = getPathLength(drawnPoints)
  const refLength = getPathLength(refPoints)
  const lengthRatio = drawnLength / Math.max(1, refLength)
  const lengthPenalty = Math.max(0, Math.abs(lengthRatio - 1) - 0.25) * 18

  const drawnCurve = getTortuosity(drawnPoints)
  const refCurve = getTortuosity(refPoints)
  const curveRatio = drawnCurve / Math.max(1, refCurve)
  const curvePenalty = Math.max(0, curveRatio - 1.5) * 8

  return Math.min(18, Math.round(lengthPenalty + curvePenalty))
}

export default function PracticeBoard({
  character,
  resetKey,
  onReset
}: Props) {
  const writerHostRef = useRef<HTMLDivElement>(null)
  const writerRef = useRef<any>(null)
  const replayIntroRef = useRef<(startStroke?: number, showCompleted?: boolean) => void>(() => {})
  const mounted = useRef(false)
  const quizMistakeOffsetRef = useRef(0)
  const characterDataRef = useRef<HanziCharacterData | null>(null)
  // const [brushSize, setBrushSize] = useState(8)
  const brushSize = 8
  const [paths, setPaths] = useState<string[]>([])
  const pathsRef = useRef<string[]>([])
  const [score, setScore] = useState<number | null>(null)
  const [stats, setStats] = useState<QuizStats>(emptyStats)
  const statsRef = useRef<QuizStats>(emptyStats)
  const [isIntroPlaying, setIsIntroPlaying] = useState(false)

  const pinyinText = useMemo(() => getPinyinText(character), [character])
  const hasStartedWriting = paths.length > 0 || score !== null || stats.totalMistakes > 0

  const commitPracticeState = (
    nextPaths: string[],
    nextStats: QuizStats,
    nextScore: number | null
  ) => {
    pathsRef.current = nextPaths
    statsRef.current = nextStats
    setPaths(nextPaths)
    setStats(nextStats)
    setScore(nextScore)
    save(character, {
      paths: nextPaths,
      score: nextScore ?? undefined,
      quiz: nextStats
    })
  }

  const recordStroke = (strokeData: StrokeData, isCorrect: boolean) => {
    const drawnPath = strokeData.drawnPath?.pathString
    const nextPaths = drawnPath ? [...pathsRef.current, drawnPath] : pathsRef.current
    const nextQualityPenalty = statsRef.current.qualityPenalty + (
      isCorrect
        ? calculateStrokeQualityPenalty(
          strokeData.drawnPath?.points || [],
          characterDataRef.current?.strokes[strokeData.strokeNum]?.points
        )
        : 0
    )
    const nextStats = statsFromStroke(
      strokeData,
      isCorrect,
      quizMistakeOffsetRef.current,
      nextQualityPenalty
    )
    const nextScore = calculateScore(nextStats)

    commitPracticeState(nextPaths, nextStats, nextScore)
  }

  useEffect(() => {
    const history = load(character)
    const loadedPaths = history?.paths || []
    const loadedStats = normalizeStats(history?.quiz)

    setPaths(loadedPaths)
    pathsRef.current = loadedPaths
    setScore(history?.score ?? null)
    setStats(loadedStats)
    statsRef.current = loadedStats
    setIsIntroPlaying(false)
    quizMistakeOffsetRef.current = loadedStats.totalMistakes
    characterDataRef.current = null
    mounted.current = false
  }, [character])

  useEffect(() => {
    if (resetKey !== undefined && resetKey > 0 && mounted.current) {
      const nextStats = {
        ...emptyStats,
        totalStrokes: statsRef.current.totalStrokes
      }

      quizMistakeOffsetRef.current = 0
      commitPracticeState([], nextStats, null)
      replayIntroRef.current(0, false)
    }

    mounted.current = true
  }, [resetKey, character])

  useEffect(() => {
    const host = writerHostRef.current
    if (!host || !character) return

    setIsIntroPlaying(true)

    while (host.firstChild) {
      host.removeChild(host.firstChild)
    }

    const writer = HanziWriter.create(host, character, {
      width: 300,
      height: 300,
      padding: 0,
      showOutline: true,
      showCharacter: false,
      outlineColor: '#b7aa96',
      drawingColor: '#111',
      highlightColor: '#2d7dd2',
      highlightCompleteColor: '#248f5a',
      drawingWidth: brushSize,
      strokeAnimationSpeed: 1.3,
      delayBetweenStrokes: 150,
      leniency: 1.05,
      showHintAfterMisses: 2,
      charDataLoader: loadHanziCharacterData
    })

    writerRef.current = writer

    let cancelled = false

    writer.getCharacterData().then((data) => {
      if (cancelled) return

      characterDataRef.current = data
      const totalStrokes = data.strokes.length
      const savedStats = statsRef.current
      const hasCompleted = savedStats.completed && savedStats.totalStrokes === totalStrokes
      const startStroke = Math.min(
        hasCompleted ? totalStrokes : savedStats.correctStrokes,
        Math.max(0, totalStrokes - 1)
      )
      const hydratedStats = {
        ...savedStats,
        totalStrokes,
        completed: hasCompleted
      }

      statsRef.current = hydratedStats
      setStats(hydratedStats)

      const startQuiz = (quizStartStrokeNum = startStroke) => {
        quizMistakeOffsetRef.current = statsRef.current.totalMistakes

        writer.quiz({
          quizStartStrokeNum,
          leniency: 1.05,
          showHintAfterMisses: 2,
          onMistake: (strokeData) => {
            recordStroke(strokeData, false)
          },
          onCorrectStroke: (strokeData) => {
            recordStroke(strokeData, true)
          },
          onComplete: (summaryData) => {
            const currentStats = statsRef.current
            const totalMistakes = quizMistakeOffsetRef.current + summaryData.totalMistakes
            const completedStats = {
              ...currentStats,
              totalMistakes,
              correctStrokes: currentStats.totalStrokes,
              currentStroke: Math.max(0, currentStats.totalStrokes - 1),
              strokesRemaining: 0,
              completed: true,
              lastResult: 'correct' as const
            }
            const finalScore = calculateScore(completedStats)

            commitPracticeState(pathsRef.current, completedStats, finalScore)
          }
        })
      }

      const replayIntro = (
        quizStartStrokeNum = startStroke,
        showCompleted = hasCompleted
      ) => {
        writer.cancelQuiz()
        setIsIntroPlaying(true)

        writer.animateCharacter({
          onComplete: () => {
            if (cancelled) return

            setIsIntroPlaying(false)

            if (showCompleted) {
              writer.showCharacter()
              return
            }

            startQuiz(quizStartStrokeNum)
          }
        })
      }

      replayIntroRef.current = replayIntro
      replayIntro(startStroke, hasCompleted)
    })

    return () => {
      cancelled = true
      writer.cancelQuiz()
      writerRef.current = null
      replayIntroRef.current = () => {}
      characterDataRef.current = null

      while (host.firstChild) {
        host.removeChild(host.firstChild)
      }
    }
  }, [character])

  // useEffect(() => {
  //   const writer = writerRef.current
  //   if (!writer) return
  //
  //   writer._options.drawingWidth = brushSize
  //   writer._renderState?.updateState?.({
  //     options: {
  //       drawingWidth: brushSize
  //     }
  //   })
  // }, [brushSize])

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      {character && (
        <div style={{
          height: 42,
          marginBottom: 6,
          textAlign: 'center',
          color: '#2d2a25'
        }}>
          {/* <div style={{
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1
          }}>
            {character}
          </div> */}
          <div style={{
            marginTop: 3,
            fontSize: 18,
            fontWeight: 'bold',
            color: '#756d61'
          }}>
            {pinyinText}
          </div>
        </div>
      )}

      <div style={{
        width: 300,
        height: 300,
        position: 'relative'
      }}>
        <GridLayer />

        <div
          ref={writerHostRef}
          style={{
            position: 'absolute',
            inset: 0,
            touchAction: 'none',
            zIndex: 2
          }}
        />

        <svg
          width={300}
          height={300}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 3
          }}
        >
          {!isIntroPlaying && paths.map((path, index) => {
            if (isFilledBrushPath(path)) {
              return <path key={index} d={path} fill="#111" opacity={0.88} />
            }

            return (
              <path
                key={index}
                d={path}
                fill="none"
                stroke="#111"
                strokeWidth={brushSize}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.88}
              />
            )
          })}
        </svg>
      </div>

      <div style={{
        minHeight: 112,
        marginTop: 8,
        textAlign: 'center',
        color: '#333',
        fontSize: 14,
        lineHeight: 1.5
      }}>
        {/* <label style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 6,
          color: '#444'
        }}>
          <span>粗细</span>
          <input
            type="range"
            min={4}
            max={14}
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            style={{
              width: 150,
              accentColor: '#222'
            }}
          />
          <span style={{
            width: 24,
            textAlign: 'right'
          }}>
            {brushSize}
          </span>
        </label> */}

        {hasStartedWriting && (
          <div style={{ marginTop: 8 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              minHeight: 36
            }}>
              <div style={{
                minWidth: 56,
                fontSize: 18,
                fontWeight: 'bold'
              }}>
                {score !== null ? `${score}分` : '--分'}
              </div>
              <button
                onClick={onReset}
                style={{
                  background: '#c33',
                  color: '#fff',
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: 14,
                  lineHeight: 1
                }}
              >
                重写
              </button>
            </div>
            {stats.totalStrokes > 0 && (
              <div>
                {stats.completed
                  ? `完成：共错 ${stats.totalMistakes} 次`
                  : `笔画 ${stats.correctStrokes}/${stats.totalStrokes}，错笔 ${stats.totalMistakes} 次`}
              </div>
            )}
            {stats.qualityPenalty > 0 && (
              <div>
                笔画质量扣分 {stats.qualityPenalty}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
