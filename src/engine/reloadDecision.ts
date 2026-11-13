/**
 * Decides whether the page should reload after a service worker takes control.
 * Pure function: no DOM, no React.
 *
 * - First visit (no previous controller): never reload.
 * - Update while a statement is loaded: never reload, so in-memory data survives.
 * - Update with no statement loaded: reload once to pick up the new version.
 */
export type ReloadDecision = 'reload' | 'no-reload'

export function decideReload(input: {
  hadPreviousController: boolean
  hasLoadedStatement: boolean
}): ReloadDecision {
  return input.hadPreviousController && !input.hasLoadedStatement ? 'reload' : 'no-reload'
}
