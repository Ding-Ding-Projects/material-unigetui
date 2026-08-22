import { randomUUID, randomInt } from 'crypto'

/**
 * The unlock ladder.
 *
 * A lockout is the one moment a product has nothing to offer: a countdown, and
 * a person watching it. The ladder replaces the watching with something to do,
 * escalating as it goes:
 *
 *   1. Dim sum — one dish, four choices.
 *   2. Ten easy sums, after five wrong dishes. Every one must be right.
 *   3. Whack-a-mole, after a single wrong sum.
 *   4. The clock, after a lost round. The ladder is not offered again.
 *
 * Falling to the bottom leaves the user exactly where they started, so the
 * ladder can only ever improve a locked-out afternoon.
 *
 * ## What it must never do
 *
 * These are the whole safety of the feature. An implementation that keeps the
 * games and drops any one of them has built a second, far weaker password.
 *
 * - **It clears the WAITING, never the CREDENTIAL.** Winning returns the user
 *   to the ordinary prompt still needing to know their password. Guessing a
 *   dumpling is not an authentication factor.
 * - **It never refunds the attempt budget.** Serving the clock returns some
 *   number of attempts; the ladder returns exactly the same number. The moment
 *   solving it beats waiting, brute force gets cheaper.
 * - **It is budgeted, because a machine can play it.** Four choices is one in
 *   four; ten small sums are trivial to compute; a mole schedule is arithmetic.
 *   At most three waits may be skipped per rolling hour. This cap is what makes
 *   the ladder safe rather than clever.
 * - **It never slows the escalation it skips.** The underlying lockout still
 *   lengthens with each consecutive lockout, and clearing the ladder leaves
 *   that untouched.
 * - **Every answer is generated and graded here, against a single-use nonce.**
 *   A ladder marked in the renderer is a ladder skipped with one call.
 */

export type LadderRung = 'dimsum' | 'sums' | 'moles' | 'clock'

export const LADDER_SKIP_BUDGET = 3
export const LADDER_BUDGET_WINDOW_MS = 60 * 60 * 1000

/** How long a challenge stays answerable before it must be reissued. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000

const MOLE_ROUND_MS = 12_000
const MOLE_TARGET_HITS = 8
const MOLE_CELLS = 9
const SUMS_REQUIRED = 10
const WRONG_DISHES_BEFORE_SUMS = 5

export interface DimSumChallenge {
  readonly rung: 'dimsum'
  readonly nonce: string
  readonly prompt: string
  readonly choices: readonly string[]
}

export interface SumsChallenge {
  readonly rung: 'sums'
  readonly nonce: string
  readonly questions: ReadonlyArray<{ readonly a: number; readonly b: number; readonly op: '+' | '-' }>
}

export interface MolesChallenge {
  readonly rung: 'moles'
  readonly nonce: string
  readonly durationMs: number
  readonly targetHits: number
  readonly cells: number
  /** Each mole: which cell, when it appears, how long it stays. */
  readonly schedule: ReadonlyArray<{
    readonly index: number
    readonly cell: number
    readonly atMs: number
    readonly forMs: number
  }>
}

export interface ClockChallenge {
  readonly rung: 'clock'
  readonly reason: string
}

export type LadderChallenge =
  | DimSumChallenge
  | SumsChallenge
  | MolesChallenge
  | ClockChallenge

interface PendingChallenge {
  readonly nonce: string
  readonly rung: LadderRung
  readonly issuedAt: number
  readonly answer: unknown
}

export interface LadderVerdict {
  /** True only when the wait is cleared. Never grants a session. */
  readonly cleared: boolean
  readonly nextRung: LadderRung
  readonly message: string
  /** Attempts returned. Always exactly what the clock would have returned. */
  readonly attemptsReturned: number
}

export interface LadderState {
  wrongDishes: number
  sumsFailed: boolean
  molesLost: boolean
  /** Timestamps of skips granted, for the rolling-hour budget. */
  skips: number[]
}

export function newLadderState(): LadderState {
  return { wrongDishes: 0, sumsFailed: false, molesLost: false, skips: [] }
}

/** The dishes the first rung asks about, and their decoys. */
const DISHES = [
  'Har gow',
  'Siu mai',
  'Char siu bao',
  'Cheung fun',
  'Lo mai gai',
  'Egg tart',
  'Turnip cake',
  'Phoenix claws',
  'Malay sponge cake',
  'Beef ball',
] as const

const DISH_HINTS: Readonly<Record<string, string>> = {
  'Har gow': 'a translucent steamed shrimp dumpling',
  'Siu mai': 'an open-topped pork and shrimp dumpling',
  'Char siu bao': 'a bun filled with barbecued pork',
  'Cheung fun': 'a rolled rice noodle sheet',
  'Lo mai gai': 'sticky rice steamed in a lotus leaf',
  'Egg tart': 'a custard tart in flaky pastry',
  'Turnip cake': 'a pan-fried radish cake',
  'Phoenix claws': 'braised chicken feet',
  'Malay sponge cake': 'a steamed brown sponge cake',
  'Beef ball': 'a bouncy steamed beef meatball',
}

export class UnlockLadder {
  private readonly pending = new Map<string, PendingChallenge>()

  /**
   * The rung to offer.
   *
   * School mode requires every dim-sum capability to behave as though it is not
   * installed, and rung one is a dim sum question — so under School mode the
   * ladder STARTS at the sums. The rung is absent, not skipped with a message,
   * because a message naming the hidden thing is what School mode forbids.
   *
   * One function decides this, so no surface can get it wrong locally.
   */
  public rungFor(state: LadderState, schoolMode: boolean): LadderRung {
    if (state.molesLost) {
      return 'clock'
    }
    if (state.sumsFailed) {
      return 'moles'
    }
    if (schoolMode) {
      return 'sums'
    }
    if (state.wrongDishes >= WRONG_DISHES_BEFORE_SUMS) {
      return 'sums'
    }
    return 'dimsum'
  }

  /** Skips remaining in the rolling window. */
  public skipsRemaining(state: LadderState, now: number): number {
    const fresh = state.skips.filter(at => now - at < LADDER_BUDGET_WINDOW_MS)
    state.skips = fresh
    return Math.max(0, LADDER_SKIP_BUDGET - fresh.length)
  }

  public issue(
    state: LadderState,
    schoolMode: boolean,
    now: number
  ): LadderChallenge {
    if (this.skipsRemaining(state, now) === 0) {
      return {
        rung: 'clock',
        reason:
          'The ladder has been used its limit of times this hour. Only the clock ' +
          'is left, for everybody — that cap is what keeps the ladder from making ' +
          'guessing cheaper than waiting.',
      }
    }

    const rung = this.rungFor(state, schoolMode)
    const nonce = randomUUID()

    switch (rung) {
      case 'dimsum': {
        const answerIndex = randomInt(0, 4)
        const pool = [...DISHES]
        const chosen: string[] = []
        while (chosen.length < 4 && pool.length > 0) {
          chosen.push(pool.splice(randomInt(0, pool.length), 1)[0]!)
        }
        const answer = chosen[answerIndex]!
        this.remember({ nonce, rung, issuedAt: now, answer })
        return {
          rung: 'dimsum',
          nonce,
          prompt: `Which one is ${DISH_HINTS[answer] ?? 'a dim sum dish'}?`,
          choices: chosen,
        }
      }

      case 'sums': {
        const questions = Array.from({ length: SUMS_REQUIRED }, () => {
          const a = randomInt(2, 30)
          const b = randomInt(2, 30)
          // Subtraction is ordered so the answer is never negative: nobody
          // needs paper for these, and that is the point.
          return a >= b
            ? { a, b, op: randomInt(0, 2) === 0 ? ('+' as const) : ('-' as const) }
            : { a: b, b: a, op: '+' as const }
        })
        const answer = questions.map(q => (q.op === '+' ? q.a + q.b : q.a - q.b))
        this.remember({ nonce, rung, issuedAt: now, answer })
        return { rung: 'sums', nonce, questions }
      }

      case 'moles': {
        const schedule = Array.from({ length: MOLE_TARGET_HITS + 6 }, (_, index) => ({
          index,
          cell: randomInt(0, MOLE_CELLS),
          atMs: randomInt(0, MOLE_ROUND_MS - 1200),
          forMs: randomInt(700, 1400),
        }))
        this.remember({ nonce, rung, issuedAt: now, answer: schedule })
        return {
          rung: 'moles',
          nonce,
          durationMs: MOLE_ROUND_MS,
          targetHits: MOLE_TARGET_HITS,
          cells: MOLE_CELLS,
          schedule,
        }
      }

      case 'clock':
      default:
        return {
          rung: 'clock',
          reason:
            'The ladder is finished for this lockout. Waiting is all that is left, ' +
            'and it is exactly the wait it always was.',
        }
    }
  }

  /**
   * Grades a submission.
   *
   * The nonce is consumed BEFORE grading, so a wrong answer cannot be retried
   * against the same question and a right one cannot be replayed.
   */
  public grade(
    state: LadderState,
    nonce: string,
    submission: unknown,
    now: number,
    /** Whatever the clock would have returned. The ladder returns the same. */
    attemptsTheClockWouldReturn: number
  ): LadderVerdict {
    const challenge = this.pending.get(nonce)
    this.pending.delete(nonce)

    const fail = (message: string, nextRung: LadderRung): LadderVerdict => ({
      cleared: false,
      nextRung,
      message,
      attemptsReturned: 0,
    })

    if (challenge === undefined) {
      return fail('That challenge is not open. Ask for a new one.', 'clock')
    }
    if (now - challenge.issuedAt > CHALLENGE_TTL_MS) {
      return fail('That challenge expired. Ask for a new one.', challenge.rung)
    }
    if (this.skipsRemaining(state, now) === 0) {
      return fail('The ladder has been used its limit of times this hour.', 'clock')
    }

    const cleared = this.isCorrect(state, challenge, submission, now)
    if (!cleared) {
      return fail(
        'Not this time.',
        this.rungFor(state, false)
      )
    }

    state.skips.push(now)
    return {
      cleared: true,
      // Stated in the verdict so no caller can quietly grant more.
      attemptsReturned: attemptsTheClockWouldReturn,
      nextRung: 'dimsum',
      message:
        'The wait is cleared. You still need your password — this only skipped ' +
        'the countdown, and it returned exactly the attempts the clock would have.',
    }
  }

  private isCorrect(
    state: LadderState,
    challenge: PendingChallenge,
    submission: unknown,
    now: number
  ): boolean {
    switch (challenge.rung) {
      case 'dimsum': {
        const correct = submission === challenge.answer
        if (!correct) {
          state.wrongDishes += 1
        }
        return correct
      }

      case 'sums': {
        const expected = challenge.answer as readonly number[]
        const given = Array.isArray(submission) ? submission : []
        // Every one must be right.
        const correct =
          given.length === expected.length &&
          expected.every((value, index) => Number(given[index]) === value)
        if (!correct) {
          state.sumsFailed = true
        }
        return correct
      }

      case 'moles': {
        const schedule = challenge.answer as MolesChallenge['schedule']
        const hits = Array.isArray(submission) ? submission : []

        // A timed game cannot be won faster than it lasts. Without this a
        // script returns a perfect score the instant it receives the schedule.
        const elapsed = now - challenge.issuedAt
        if (elapsed < MOLE_ROUND_MS) {
          state.molesLost = true
          return false
        }

        // Each mole is graded once, and only against a mole that was genuinely
        // visible in that cell at that moment. Otherwise "hit the moles"
        // degrades into "send enough taps".
        const counted = new Set<number>()
        for (const hit of hits) {
          const record = hit as { index?: unknown; cell?: unknown; atMs?: unknown }
          const index = Number(record.index)
          const mole = schedule[index]
          if (mole === undefined || counted.has(index)) {
            continue
          }
          const at = Number(record.atMs)
          if (
            Number(record.cell) === mole.cell &&
            at >= mole.atMs &&
            at <= mole.atMs + mole.forMs
          ) {
            counted.add(index)
          }
        }

        const won = counted.size >= MOLE_TARGET_HITS
        if (!won) {
          state.molesLost = true
        }
        return won
      }

      case 'clock':
      default:
        return false
    }
  }

  private remember(challenge: PendingChallenge): void {
    // Expired challenges are swept on every issue, so the map cannot grow
    // without bound in a long-lived process.
    for (const [nonce, pending] of this.pending) {
      if (challenge.issuedAt - pending.issuedAt > CHALLENGE_TTL_MS) {
        this.pending.delete(nonce)
      }
    }
    this.pending.set(challenge.nonce, challenge)
  }
}
