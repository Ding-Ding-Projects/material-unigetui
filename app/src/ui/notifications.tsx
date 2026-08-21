import * as React from 'react'

/**
 * Non-blocking notifications, anchored in a screen corner.
 *
 * Anything that only informs becomes one of these. A modal dialog is reserved
 * for a decision the user must make before continuing — a confirmation, an
 * unsaved-changes prompt, a destructive gate. Telling somebody an install
 * finished is not a decision.
 *
 * Successes auto-dismiss; warnings and errors stay until dismissed, because
 * the one that vanishes while you are looking elsewhere is the one you needed.
 */

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface AppNotification {
  readonly id: string
  readonly level: NotificationLevel
  readonly title: string
  readonly body?: string
  readonly at: number
  /** Optional single action, e.g. Retry or View output. */
  readonly action?: { readonly label: string; run(): void }
}

interface NotificationsValue {
  readonly items: readonly AppNotification[]
  /** Everything ever raised this session, including dismissed ones. */
  readonly history: readonly AppNotification[]
  notify(
    level: NotificationLevel,
    title: string,
    body?: string,
    action?: AppNotification['action']
  ): string
  dismiss(id: string): void
  dismissAll(): void
  clearHistory(): void
}

const NotificationsContext = React.createContext<NotificationsValue | null>(null)

export function useNotifications(): NotificationsValue {
  const value = React.useContext(NotificationsContext)
  if (value === null) {
    throw new Error('useNotifications used outside NotificationsProvider')
  }
  return value
}

const AUTO_DISMISS_MS = 6000

export function NotificationsProvider(props: {
  readonly children: React.ReactNode
}): JSX.Element {
  const [items, setItems] = React.useState<readonly AppNotification[]>([])
  const [history, setHistory] = React.useState<readonly AppNotification[]>([])
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = React.useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setItems(current => current.filter(item => item.id !== id))
  }, [])

  const notify = React.useCallback<NotificationsValue['notify']>(
    (level, title, body, action) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const item: AppNotification = { id, level, title, body, at: Date.now(), action }
      setItems(current => [...current, item])
      setHistory(current => [item, ...current])

      if (level === 'info' || level === 'success') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
        )
      }
      return id
    },
    [dismiss]
  )

  const dismissAll = React.useCallback(() => {
    for (const timer of timers.current.values()) {
      clearTimeout(timer)
    }
    timers.current.clear()
    setItems([])
  }, [])

  const clearHistory = React.useCallback(() => setHistory([]), [])

  // Every pending timer is cleared on teardown; without this each remount
  // leaks one and a dismissed notification can reappear.
  React.useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer)
      }
      pending.clear()
    }
  }, [])

  const value = React.useMemo<NotificationsValue>(
    () => ({ items, history, notify, dismiss, dismissAll, clearHistory }),
    [items, history, notify, dismiss, dismissAll, clearHistory]
  )

  return (
    <NotificationsContext.Provider value={value}>
      {props.children}
      <NotificationHost />
    </NotificationsContext.Provider>
  )
}

function NotificationHost(): JSX.Element {
  const { items, dismiss } = useNotifications()

  return (
    <div
      className="notification-host"
      // Polite rather than assertive: an install finishing must not interrupt
      // whatever a screen-reader user is in the middle of reading.
      aria-live="polite"
      aria-relevant="additions"
    >
      {items.map(item => (
        <div className="notification" data-level={item.level} key={item.id} role="status">
          <div className="notification__text">
            <div className="notification__title">{item.title}</div>
            {item.body !== undefined && (
              <div className="notification__body">{item.body}</div>
            )}
          </div>
          {item.action !== undefined && (
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                item.action?.run()
                dismiss(item.id)
              }}
            >
              {item.action.label}
            </button>
          )}
          <button
            type="button"
            className="notification__dismiss"
            aria-label={`Dismiss: ${item.title}`}
            onClick={() => dismiss(item.id)}
          >
            {'×'}
          </button>
        </div>
      ))}
    </div>
  )
}
