/**
 * Every destination, exactly as the design defines them.
 *
 * The split into primary and tools matters: it is what the nav rail renders,
 * and reordering it silently changes the interface.
 */
export const primaryRoutes = [
  { id: 'discover', label: 'Discover packages', icon: 'travel_explore' },
  { id: 'updates', label: 'Software updates', icon: 'system_update_alt' },
  { id: 'installed', label: 'Installed packages', icon: 'apps' },
  { id: 'bundles', label: 'Package bundles', icon: 'inventory_2' },
] as const

export const toolsRoutes = [
  { id: 'history', label: 'Operation history', icon: 'history' },
  { id: 'automation', label: 'Automation · CLI & IPC', icon: 'terminal' },
  { id: 'converter', label: 'File converter', icon: 'swap_horiz' },
  { id: 'ollama', label: 'Ollama suite manager', icon: 'neurology' },
  { id: 'auth', label: 'Authenticator', icon: 'password' },
  { id: 'logs', label: 'Logs', icon: 'description' },
  { id: 'tickets', label: 'Support Tickets', icon: 'confirmation_number' },
  { id: 'about', label: 'Help & About', icon: 'help' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
] as const

export const allRoutes = [...primaryRoutes, ...toolsRoutes]

export type RouteId = (typeof allRoutes)[number]['id']

export function routeLabel(id: RouteId): string {
  return allRoutes.find(route => route.id === id)?.label ?? id
}
