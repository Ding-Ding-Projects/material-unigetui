import * as React from 'react'

export interface PackageRowModel {
  readonly key: string
  readonly id: string
  readonly name: string
  readonly versionText: string
}

/**
 * Every list state is explicit.
 *
 * A list that renders nothing while loading is indistinguishable from a list
 * that is genuinely empty, and both look like a broken screen.
 */
export function PackageList(props: {
  readonly loading: boolean
  readonly error: string | null
  readonly packages: readonly PackageRowModel[]
  readonly emptyMessage: string
}): JSX.Element {
  if (props.loading) {
    return <div className="state-note">Asking your package managers…</div>
  }

  if (props.error !== null) {
    return (
      <div className="state-note">
        <strong>That did not work.</strong> {props.error}
      </div>
    )
  }

  if (props.packages.length === 0) {
    return <div className="state-note">{props.emptyMessage}</div>
  }

  return (
    <div>
      {props.packages.map(pkg => (
        <div className="package-row" key={pkg.key}>
          <div className="package-row__grow">
            <div className="package-row__name">{pkg.name}</div>
            <div className="package-row__id">{pkg.id}</div>
          </div>
          <div className="package-row__version">{pkg.versionText}</div>
        </div>
      ))}
    </div>
  )
}
