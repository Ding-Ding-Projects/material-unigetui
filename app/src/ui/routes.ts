/**
 * Every destination, exactly as the design defines them.
 *
 * The split into primary and tools matters: it is what the nav drawer renders,
 * and reordering it silently changes the interface.
 *
 * `icon` is the exact Material Symbols Rounded ligature name the design uses
 * (its `pageIcons` map) — not a guess at a similar-sounding glyph. `i18nKey`
 * is the translation key that supplies the localized label; `label` is the
 * English fallback used only where no i18n context is available.
 */
export const primaryRoutes = [
  { id: 'discover', label: 'Discover packages', icon: 'explore', i18nKey: 'discover' },
  { id: 'updates', label: 'Software updates', icon: 'upgrade', i18nKey: 'updates' },
  { id: 'installed', label: 'Installed packages', icon: 'check_circle', i18nKey: 'installed' },
  { id: 'bundles', label: 'Package bundles', icon: 'package_2', i18nKey: 'bundles' },
] as const

export const toolsRoutes = [
  { id: 'history', label: 'Operation history', icon: 'history', i18nKey: 'history' },
  { id: 'automation', label: 'Automation · CLI & IPC', icon: 'terminal', i18nKey: 'automation' },
  { id: 'converter', label: 'File converter', icon: 'sync_alt', i18nKey: 'converter' },
  { id: 'ollama', label: 'Ollama suite manager', icon: 'neurology', i18nKey: 'ollama' },
  { id: 'auth', label: 'Authenticator', icon: 'shield_lock', i18nKey: 'auth' },
  { id: 'logs', label: 'Logs', icon: 'receipt_long', i18nKey: 'logs' },
  { id: 'tickets', label: 'Support Tickets', icon: 'support_agent', i18nKey: 'tickets' },
  { id: 'about', label: 'Help & About', icon: 'info', i18nKey: 'about' },
  { id: 'settings', label: 'Settings', icon: 'settings', i18nKey: 'settings' },
] as const

export const allRoutes = [...primaryRoutes, ...toolsRoutes]

export type RouteId = (typeof allRoutes)[number]['id']

export function routeLabel(id: RouteId): string {
  return allRoutes.find(route => route.id === id)?.label ?? id
}
