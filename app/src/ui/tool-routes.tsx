import './tools.css'

/**
 * Barrel for the tool routes this lane owns: operation history, logs,
 * bundles, Support Tickets, automation, the file converter and the Ollama
 * suite manager. `app.tsx` imports every route it renders from here.
 *
 * Split into `tools/*` so each surface stays independently readable — the
 * whole set ported in one 568-line file was the pre-port state this lane
 * replaced.
 */
export { LogsRoute } from './tools/logs-route'
export { HistoryRoute } from './tools/history-route'
export { BundlesRoute } from './tools/bundles-route'
export { TicketsRoute } from './tools/tickets-route'
export { AutomationRoute } from './tools/automation-route'
export { ConverterRoute } from './tools/converter-route'
export { OllamaRoute } from './tools/ollama-route'
