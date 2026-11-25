import { toast } from '#lib/components/ui/toast/index.js'
import { deserialize } from '$app/forms'
import { invalidateAll } from '$app/navigation'
import { m } from '#lib/paraglide/messages.js'

/**
 * Posts to a form action of the current page from outside a form (a menu item, say), reloads the
 * page's data when it worked and says how it went in a toast (`success` may depend on what the
 * action returned). Returns whether it worked.
 */
export async function runAction(
    action: string,
    fields: Record<string, string | string[]>,
    success: string | ((data: Record<string, unknown> | undefined) => string)
): Promise<boolean> {
    const body = new FormData()
    for (const [key, value] of Object.entries(fields))
        for (const item of [value].flat()) body.append(key, item)
    let message: string | undefined
    try {
        const response = await fetch(`?/${action}`, {
            method: 'POST',
            body,
            headers: { 'x-sveltekit-action': 'true' }
        })
        const result = deserialize(await response.text())
        if (result.type === 'success') {
            toast.success(typeof success === 'string' ? success : success(result.data))
            await invalidateAll()
            return true
        }
        if (result.type === 'failure' && typeof result.data?.error === 'string')
            message = result.data.error
        if (result.type === 'error') message = result.error?.message
    } catch {
        // Offline or the like: the general message below
    }
    toast.error(message ?? m.action_failed())
    return false
}

/** The text of an error response from an endpoint (SvelteKit sends `{ message }`). */
export async function errorMessage(response: Response): Promise<string> {
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null
    return typeof body?.message === 'string' ? body.message : m.action_failed()
}
