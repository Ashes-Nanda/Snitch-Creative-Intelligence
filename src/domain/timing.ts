import type { Outcome, Storage } from './experiments'
import { distribution, type Distribution, type Origin } from './telemetry'

/**
 * A timed task for the time-saved study. Durations a person can't be observed doing are self-reported at the end
 * of the task; nothing here infers attention from page activity.
 */
export interface TimedTask {
  taskId: string
  /** Manual: done without the system's analysis or proposals. Assisted: done with them. */
  mode: 'manual' | 'assisted'
  /** What the task must produce. Only tasks with the same deliverable and creative count are compared. */
  deliverable: 'experiment_proposal'
  creatives: number
  origin: Origin
  startedAt: string
  endedAt: string | null
  /** Self-reported minutes of hands-on work, converted to seconds. */
  activeHumanSeconds: number | null
  /** Assisted only: self-reported time checking, correcting and redoing the system's output. */
  reviewSeconds: number | null
  status: 'in_progress' | 'completed' | 'abandoned'
  /** Links to the proposal the task produced and the LLM runs it triggered, when there are any. */
  proposalId: string | null
  runIds: string[]
  notes: string
}

export function createTimingStore(storage: Storage, { now = () => new Date() }: { now?: () => Date } = {}) {
  let tasks: TimedTask[] = []
  let loadError: string | null = null
  try {
    const raw = storage.load()
    if (raw !== null) tasks = JSON.parse(raw)
  } catch {
    loadError = 'Saved task timings could not be read, so they were reset.'
  }

  function commit(next: TimedTask[]): Outcome {
    try {
      storage.save(JSON.stringify(next))
    } catch {
      return { ok: false, error: 'The timing could not be saved, so nothing changed. Try again.' }
    }
    tasks = next
    return { ok: true }
  }

  return {
    loadError,
    list: (): TimedTask[] => tasks,
    start(input: { taskId: string; mode: TimedTask['mode']; creatives: number; origin: Origin }): Outcome {
      if (!Number.isInteger(input.creatives) || input.creatives < 1) return { ok: false, error: 'Say how many creatives the task covers.' }
      if (tasks.some((t) => t.taskId === input.taskId)) return { ok: true }
      return commit([
        ...tasks,
        { ...input, deliverable: 'experiment_proposal', startedAt: now().toISOString(), endedAt: null, activeHumanSeconds: null, reviewSeconds: null, status: 'in_progress', proposalId: null, runIds: [], notes: '' },
      ])
    },
    finish(
      taskId: string,
      input: { status: 'completed' | 'abandoned'; activeMinutes: number | null; reviewMinutes: number | null; proposalId?: string | null; runIds?: string[]; notes?: string },
    ): Outcome {
      const task = tasks.find((t) => t.taskId === taskId)
      if (!task || task.status !== 'in_progress') return { ok: false, error: 'Only a task in progress can be finished.' }
      if (input.status === 'completed') {
        if (input.activeMinutes === null || input.activeMinutes <= 0) return { ok: false, error: 'Enter your hands-on minutes.' }
        if (task.mode === 'assisted' && (input.reviewMinutes === null || input.reviewMinutes < 0)) return { ok: false, error: 'Enter review and correction minutes (0 if none).' }
      }
      const toSeconds = (m: number | null) => (m === null ? null : Math.round(m * 60))
      return commit(
        tasks.map((t) =>
          t === task
            ? {
                ...t,
                status: input.status,
                endedAt: now().toISOString(),
                activeHumanSeconds: toSeconds(input.activeMinutes),
                reviewSeconds: task.mode === 'assisted' ? toSeconds(input.reviewMinutes) : null,
                proposalId: input.proposalId ?? null,
                runIds: input.runIds ?? [],
                notes: input.notes ?? '',
              }
            : t,
        ),
      )
    },
  }
}

/** Below this many completed tasks of each mode in a scope, time saved is not established. */
export const MIN_TASKS_PER_MODE = 3

/** Human time on a completed task: hands-on work, plus review and correction when assisted. */
export function humanSeconds(t: TimedTask): number | null {
  if (t.status !== 'completed' || t.activeHumanSeconds === null) return null
  if (t.mode === 'manual') return t.activeHumanSeconds
  return t.reviewSeconds === null ? null : t.activeHumanSeconds + t.reviewSeconds
}

const elapsedSeconds = (t: TimedTask) => (t.endedAt ? (Date.parse(t.endedAt) - Date.parse(t.startedAt)) / 1000 : null)

export interface TimeSavedScope {
  deliverable: TimedTask['deliverable']
  creatives: number
  manual: Distribution
  /** Assisted human time includes review and correction. */
  assisted: Distribution
  /** Wall-clock time of assisted tasks, including waiting on the system. Shown for context; not human time. */
  assistedElapsed: Distribution
  abandoned: { manual: number; assisted: number }
  result:
    | { status: 'established'; savedSeconds: number; savedPercent: number }
    | { status: 'not_established'; reason: string }
}

/** Compares median human time of manual and assisted tasks with the same deliverable and creative count. */
export function timeSaved(all: TimedTask[], origin: Origin, minTasks = MIN_TASKS_PER_MODE): TimeSavedScope[] {
  const tasks = all.filter((t) => t.origin === origin && t.status !== 'in_progress')
  const scopes = new Map<string, TimedTask[]>()
  for (const t of tasks) scopes.set(`${t.deliverable}:${t.creatives}`, [...(scopes.get(`${t.deliverable}:${t.creatives}`) ?? []), t])

  return [...scopes.values()].map((group) => {
    const of = (mode: TimedTask['mode']) => group.filter((t) => t.mode === mode)
    const manual = distribution(of('manual').map(humanSeconds).filter((s): s is number => s !== null))
    const assisted = distribution(of('assisted').map(humanSeconds).filter((s): s is number => s !== null))
    const assistedElapsed = distribution(of('assisted').filter((t) => t.status === 'completed').map(elapsedSeconds).filter((s): s is number => s !== null))
    const base = {
      deliverable: group[0].deliverable,
      creatives: group[0].creatives,
      manual,
      assisted,
      assistedElapsed,
      abandoned: { manual: of('manual').filter((t) => t.status === 'abandoned').length, assisted: of('assisted').filter((t) => t.status === 'abandoned').length },
    }
    if (manual.n < minTasks || assisted.n < minTasks) {
      return { ...base, result: { status: 'not_established' as const, reason: `Needs at least ${minTasks} completed manual and ${minTasks} assisted tasks; have ${manual.n} and ${assisted.n}.` } }
    }
    if (!manual.median || manual.median <= 0) return { ...base, result: { status: 'not_established' as const, reason: 'The manual median duration is zero.' } }
    const savedSeconds = manual.median - assisted.median!
    return { ...base, result: { status: 'established' as const, savedSeconds, savedPercent: (savedSeconds / manual.median) * 100 } }
  })
}
