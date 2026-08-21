import * as React from 'react'
import { Operation } from '../models/operation'
import { useNotifications } from './notifications'

/**
 * The operations dock.
 *
 * Progress is reported where the operation was started, not only in a distant
 * panel, and it reports the real thing: a percentage when the manager prints
 * one, and an honest indeterminate state when it does not. A spinner that could
 * mean either is indistinguishable from a hang.
 */

export function useOperations(): {
  readonly operations: readonly Operation[]
  refresh(): void
} {
  const [operations, setOperations] = React.useState<readonly Operation[]>([])
  const { notify } = useNotifications()
  const previous = React.useRef(new Map<string, Operation>())

  const refresh = React.useCallback(() => {
    void window.materialUniGetUi.operations.list().then(setOperations)
  }, [])

  React.useEffect(() => {
    refresh()
    // The subscription returns its own unsubscribe; without it every remount
    // stacks another listener on the bridge.
    const stop = window.materialUniGetUi.operations.onChanged(next => {
      setOperations(next)
    })
    return stop
  }, [refresh])

  // Announce transitions rather than states, so a finished operation is
  // reported once instead of on every subsequent update.
  React.useEffect(() => {
    for (const operation of operations) {
      const before = previous.current.get(operation.id)
      if (before?.status === operation.status) {
        continue
      }
      const name = operation.package.name
      if (operation.status === 'succeeded') {
        notify('success', `${name} finished`, describeAction(operation))
      } else if (operation.status === 'failed') {
        notify(
          'error',
          `${name} failed`,
          operation.failureReason ?? 'The package manager reported a failure.'
        )
      } else if (operation.status === 'cancelled') {
        notify('info', `${name} was cancelled`)
      }
    }
    previous.current = new Map(operations.map(o => [o.id, o]))
  }, [operations, notify])

  return { operations, refresh }
}

function describeAction(operation: Operation): string {
  const verb =
    operation.action === 'install'
      ? 'Installed'
      : operation.action === 'update'
        ? 'Updated'
        : 'Removed'
  return `${verb} with ${operation.package.manager}.`
}

export function OperationsDock(props: {
  readonly operations: readonly Operation[]
  readonly expanded: boolean
  onToggle(): void
}): JSX.Element | null {
  const active = props.operations.filter(
    operation => operation.status === 'queued' || operation.status === 'running'
  )

  if (props.operations.length === 0) {
    return null
  }

  return (
    <section
      className="ops-dock"
      data-expanded={props.expanded}
      aria-label="Operations"
    >
      <button
        type="button"
        className="ops-dock__head"
        aria-expanded={props.expanded}
        onClick={props.onToggle}
      >
        <span className="ops-dock__title">
          {active.length > 0
            ? `${active.length} running`
            : `${props.operations.length} finished`}
        </span>
        <span aria-hidden="true">{props.expanded ? '▾' : '▴'}</span>
      </button>

      {props.expanded && (
        <div className="ops-dock__list">
          {props.operations.map(operation => (
            <OperationRow key={operation.id} operation={operation} />
          ))}
        </div>
      )}
    </section>
  )
}

function OperationRow(props: { readonly operation: Operation }): JSX.Element {
  const { operation } = props
  const [output, setOutput] = React.useState<readonly string[] | null>(null)
  const running = operation.status === 'running'
  const finished =
    operation.status === 'succeeded' ||
    operation.status === 'failed' ||
    operation.status === 'cancelled'

  return (
    <div className="ops-row" data-status={operation.status}>
      <div className="ops-row__text">
        <div className="ops-row__name">{operation.package.name}</div>
        <div className="ops-row__meta">
          {operation.action} · {operation.package.manager} · {operation.status}
          {operation.failureReason !== undefined && ` · ${operation.failureReason}`}
        </div>
      </div>

      <div className="ops-row__progress">
        {running && operation.progress !== undefined ? (
          <progress max={100} value={operation.progress} aria-label="Progress">
            {operation.progress}%
          </progress>
        ) : running ? (
          // No percentage was printed. Saying "running" is honest; drawing a
          // bar at a made-up position is not.
          <span className="ops-row__indeterminate">running…</span>
        ) : null}
      </div>

      <div className="ops-row__actions">
        {(running || operation.status === 'queued') && (
          <button
            type="button"
            className="btn btn--small"
            onClick={() => void window.materialUniGetUi.operations.cancel(operation.id)}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            if (output !== null) {
              setOutput(null)
              return
            }
            void window.materialUniGetUi.operations
              .output(operation.id)
              .then(lines => setOutput(lines))
          }}
        >
          {output === null ? 'Output' : 'Hide'}
        </button>
        {finished && (
          <button
            type="button"
            className="btn btn--small"
            onClick={() => void window.materialUniGetUi.operations.forget(operation.id)}
          >
            Forget
          </button>
        )}
      </div>

      {output !== null && (
        <pre className="ops-row__output" tabIndex={0} aria-label="Command output">
          {output.length === 0 ? 'No output was produced.' : output.join('\n')}
        </pre>
      )}
    </div>
  )
}
