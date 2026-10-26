import { describe, expect, test } from 'vitest'
import { memoryStorage } from './experiments'
import { createTimingStore, timeSaved, type TimedTask } from './timing'

function task(mode: TimedTask['mode'], minutes: number, over: Partial<TimedTask> = {}): TimedTask {
  return {
    taskId: `${mode}-${minutes}-${Math.random()}`,
    mode,
    deliverable: 'experiment_proposal',
    creatives: 6,
    origin: 'live',
    startedAt: '2026-10-26T10:00:00.000Z',
    endedAt: '2026-10-26T10:30:00.000Z',
    activeHumanSeconds: minutes * 60,
    reviewSeconds: mode === 'assisted' ? 0 : null,
    status: 'completed',
    proposalId: null,
    runIds: [],
    notes: '',
    ...over,
  }
}

describe('timeSaved', () => {
  test('compares median human time, including review, for tasks of the same scope', () => {
    const tasks = [
      task('manual', 40),
      task('manual', 50),
      task('manual', 60),
      task('assisted', 10, { reviewSeconds: 5 * 60 }),
      task('assisted', 15, { reviewSeconds: 5 * 60 }),
      task('assisted', 20, { reviewSeconds: 10 * 60 }),
    ]
    const [scope] = timeSaved(tasks, 'live')
    expect(scope.manual).toMatchObject({ n: 3, median: 3000 })
    expect(scope.assisted).toMatchObject({ n: 3, median: 1200 }) // 15 + 5 minutes
    expect(scope.result).toEqual({ status: 'established', savedSeconds: 1800, savedPercent: 60 })
  })

  test('is not established without a manual baseline', () => {
    const [scope] = timeSaved([task('assisted', 10), task('assisted', 12), task('assisted', 14)], 'live')
    expect(scope.result).toMatchObject({ status: 'not_established' })
  })

  test('is not established when the manual median is zero', () => {
    const tasks = [...[0, 0, 0].map((m) => task('manual', m)), ...[1, 1, 1].map((m) => task('assisted', m))]
    expect(timeSaved(tasks, 'live')[0].result).toEqual({ status: 'not_established', reason: 'The manual median duration is zero.' })
  })

  test('never compares tasks of different sizes', () => {
    const tasks = [...[40, 50, 60].map((m) => task('manual', m, { creatives: 6 })), ...[10, 10, 10].map((m) => task('assisted', m, { creatives: 20 }))]
    expect(timeSaved(tasks, 'live').map((s) => s.result.status)).toEqual(['not_established', 'not_established'])
  })

  test('leaves abandoned and in-progress tasks out of the medians but reports abandonments', () => {
    const tasks = [task('manual', 40), task('manual', 99, { status: 'abandoned', activeHumanSeconds: null }), task('assisted', 1, { status: 'in_progress', endedAt: null })]
    const [scope] = timeSaved(tasks, 'live')
    expect(scope.manual.n).toBe(1)
    expect(scope.assisted.n).toBe(0)
    expect(scope.abandoned).toEqual({ manual: 1, assisted: 0 })
  })

  test('keeps practice runs out of live results', () => {
    expect(timeSaved([task('manual', 40, { origin: 'test' })], 'live')).toEqual([])
  })
})

describe('timing store', () => {
  const clock = (times: string[]) => {
    let i = 0
    return () => new Date(times[Math.min(i++, times.length - 1)])
  }

  test('records start and end times, and self-reported minutes as seconds', () => {
    const s = createTimingStore(memoryStorage(), { now: clock(['2026-10-26T10:00:00Z', '2026-10-26T10:25:00Z']) })
    s.start({ taskId: 't1', mode: 'assisted', creatives: 6, origin: 'live' })
    expect(s.finish('t1', { status: 'completed', activeMinutes: 12, reviewMinutes: 4, proposalId: 'exp:x', runIds: ['run-1'] })).toEqual({ ok: true })
    expect(s.list()[0]).toMatchObject({ endedAt: '2026-10-26T10:25:00.000Z', activeHumanSeconds: 720, reviewSeconds: 240, proposalId: 'exp:x', runIds: ['run-1'] })
  })

  test('an assisted task needs review minutes, even if zero', () => {
    const s = createTimingStore(memoryStorage())
    s.start({ taskId: 't1', mode: 'assisted', creatives: 6, origin: 'live' })
    expect(s.finish('t1', { status: 'completed', activeMinutes: 12, reviewMinutes: null })).toMatchObject({ ok: false })
  })

  test('does not record time it was not given', () => {
    const s = createTimingStore(memoryStorage())
    s.start({ taskId: 't1', mode: 'manual', creatives: 6, origin: 'live' })
    expect(s.finish('t1', { status: 'completed', activeMinutes: null, reviewMinutes: null })).toMatchObject({ ok: false })
    expect(s.finish('t1', { status: 'abandoned', activeMinutes: null, reviewMinutes: null })).toEqual({ ok: true })
    expect(s.list()[0].activeHumanSeconds).toBeNull()
  })

  test('a failed save changes nothing', () => {
    const s = createTimingStore({ load: () => null, save: () => { throw new Error('quota') } })
    expect(s.start({ taskId: 't1', mode: 'manual', creatives: 6, origin: 'live' })).toMatchObject({ ok: false })
    expect(s.list()).toEqual([])
  })
})
