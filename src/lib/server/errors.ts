/**
 * One line about an error that is safe to log: no query parameters (Drizzle puts them, with the
 * encrypted tokens, into its message) and no response bodies.
 */
export function errorSummary(error: unknown): string {
    if (!(error instanceof Error)) return String(error)
    if (error.name === 'DrizzleQueryError') {
        const cause = error.cause instanceof Error ? error.cause.message : 'unknown cause'
        return `${error.name}: ${cause}`
    }
    return `${error.name}: ${error.message}`
}
