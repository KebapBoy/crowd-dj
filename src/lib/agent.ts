import { createAgent, registerTools } from '@ui-sdk/svelte/agent'

/** Asks the person whether the agent may do what a `data-agent-confirm` sentence describes. */
export type AskPerson = (sentence: string, signal: AbortSignal) => Promise<boolean>

/**
 * Lets the agent built into a browser (WebMCP, `document.modelContext`) read the components of the
 * page and use them through ui-sdk's tools, with the person's own rights. A step on a control marked
 * `data-agent-confirm` (leaving or ending a session, skipping a track …) waits until the person
 * agreed in the app; components inside `data-agent-hidden` (the personal link) are left out. Does
 * nothing in a browser without WebMCP. Returns the function that removes the tools again.
 */
export function connectAgents(ask: AskPerson): () => void {
    const agent = createAgent({
        allow: (step, { signal }) => (step.confirm ? ask(step.confirm, signal) : true)
    })
    // The bridge's allow above already decides every step, the marked ones with the person
    return registerTools(agent, { allow: () => true })
}
