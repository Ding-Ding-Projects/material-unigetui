import { app } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'

/**
 * Support Tickets.
 *
 * The recovery route from a forgotten lock, dressed as a support desk. It plays
 * the part properly — a category, a severity nobody will honour, a ticket
 * number, a status that advances, a canned first response — and then the
 * "resolution" does the only thing that actually works: it points at the
 * application-data folder, which the user deletes themselves.
 *
 * **The bit is a bit, and the application says so.** Nothing is sent anywhere,
 * no ticket exists outside this machine, no network request is made, nobody is
 * reading it. A user must never sit waiting for a reply that was never coming,
 * so that disclosure is rendered outside the comedy and is not styled by the
 * funny level.
 *
 * It never deletes anything itself. Opening the folder is where this stops; the
 * deletion is the user's own act in their own file manager.
 */

export interface SupportTicket {
  readonly id: string
  readonly number: string
  readonly category: string
  readonly severity: string
  readonly description: string
  readonly status: TicketStatus
  readonly openedAt: string
  readonly replies: readonly string[]
}

export type TicketStatus =
  | 'received'
  | 'triaged'
  | 'escalated'
  | 'resolved'

const STATUS_ORDER: readonly TicketStatus[] = [
  'received',
  'triaged',
  'escalated',
  'resolved',
]

/** Deadpan on purpose: the joke is the procedure, not the wording. */
const CANNED_REPLIES: Readonly<Record<TicketStatus, string>> = {
  received:
    'Thank you for contacting support. Your ticket has been received and assigned a number. ' +
    'It has not been assigned to anyone, because there is nobody to assign it to.',
  triaged:
    'Your ticket has been triaged. The severity you selected has been noted and will not affect anything.',
  escalated:
    'Your ticket has been escalated to the highest available tier, which is also this computer.',
  resolved:
    'Resolution: delete the application-data folder. That clears every lock and every setting, ' +
    'and it is the only thing that works. The button below opens the folder; the deleting is yours to do.',
}

export const TICKET_CATEGORIES = [
  'Locked out of a tab',
  'Locked out of a setting',
  'Forgot a password',
  'Lost an authenticator',
  'Something else',
] as const

export const TICKET_SEVERITIES = [
  'Low',
  'Normal',
  'High',
  'Critical',
  'Catastrophic',
] as const

class TicketStore {
  private tickets: SupportTicket[] = []
  private loaded = false

  private file(): string {
    return path.join(app.getPath('userData'), 'support-tickets.json')
  }

  public async all(): Promise<readonly SupportTicket[]> {
    if (!this.loaded) {
      try {
        const raw = await fs.readFile(this.file(), 'utf8')
        const parsed: unknown = JSON.parse(raw)
        this.tickets = Array.isArray(parsed) ? (parsed as SupportTicket[]) : []
      } catch {
        this.tickets = []
      }
      this.loaded = true
    }
    return [...this.tickets].reverse()
  }

  public async create(
    category: string,
    severity: string,
    description: string
  ): Promise<readonly SupportTicket[]> {
    await this.all()

    const sequence = String(this.tickets.length + 1).padStart(4, '0')
    const ticket: SupportTicket = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      // Looks like a real case number and is generated entirely locally.
      number: `MUG-${new Date().getFullYear()}-${sequence}`,
      category,
      severity,
      description: description.slice(0, 4000),
      status: 'received',
      openedAt: new Date().toISOString(),
      replies: [CANNED_REPLIES.received],
    }

    this.tickets.push(ticket)
    await this.persist()
    return this.all()
  }

  public async advance(id: string): Promise<readonly SupportTicket[]> {
    await this.all()
    this.tickets = this.tickets.map(ticket => {
      if (ticket.id !== id) {
        return ticket
      }
      const index = STATUS_ORDER.indexOf(ticket.status)
      const next = STATUS_ORDER[Math.min(index + 1, STATUS_ORDER.length - 1)]!
      if (next === ticket.status) {
        return ticket
      }
      return {
        ...ticket,
        status: next,
        replies: [...ticket.replies, CANNED_REPLIES[next]],
      }
    })
    await this.persist()
    return this.all()
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.file()), { recursive: true })
      await fs.writeFile(this.file(), JSON.stringify(this.tickets, null, 2), 'utf8')
    } catch {
      // Tickets are a joke with a real purpose; failing to save one must not
      // take down the application around it.
    }
  }
}

export const ticketStore = new TicketStore()
