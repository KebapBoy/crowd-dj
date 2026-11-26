<script lang="ts">
    import ExternalLinkIcon from '@lucide/svelte/icons/external-link'
    import ShieldCheckIcon from '@lucide/svelte/icons/shield-check'
    import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert'
    import Trash2Icon from '@lucide/svelte/icons/trash-2'
    import { toast } from '#lib/components/ui/toast/index.js'
    import { enhance } from '$app/forms'
    import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale } from '#lib/paraglide/runtime.js'
    import type { InboxView } from '#lib/server/inboxes.ts'

    /**
     * An inbox playlist for its host: open it in Spotify, store its invitation link, see when it
     * was last looked at, forget it. Posts to the page's `inboxInvite` and `inboxForget` actions.
     */
    let {
        inbox,
        allowed,
        allowHref
    }: {
        inbox: InboxView
        /** Whether the host's account still allows crowd-dj to read and change it. */
        allowed: boolean
        /** Where the host allows it again. */
        allowHref: string
    } = $props()

    let forgetOpen = $state(false)
    let busy = $state(false)
    let invalid = $state(false)

    const fieldId = $derived(`inbox-invite-${inbox.id}`)
    const synced = $derived(
        inbox.syncedAt
            ? m.inbox_status({
                  count: inbox.tracks,
                  time: new Intl.DateTimeFormat(getLocale(), {
                      dateStyle: 'short',
                      timeStyle: 'short'
                  }).format(inbox.syncedAt)
              })
            : m.inbox_status_never()
    )
    const touch = 'h-11 w-full sm:h-8 sm:w-auto'
</script>

<div class="flex flex-col gap-4">
    {#if !allowed}
        <p class="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlertIcon class="size-4 shrink-0" />
            {m.inbox_not_allowed()}
        </p>
    {/if}
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-sm text-muted-foreground">{synced}</p>
        <Button
            href={inbox.spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            class={touch}
        >
            <ExternalLinkIcon data-icon="inline-start" />
            {m.inbox_open()}
        </Button>
    </div>

    <form
        method="POST"
        action="?/inboxInvite"
        class="flex flex-col gap-2"
        use:enhance={() =>
            async ({ result, update }) => {
                invalid = result.type === 'failure' && !!result.data?.inviteInvalid
                if (result.type === 'success') toast.success(m.inbox_invite_saved())
                else if (!invalid)
                    toast.error(
                        result.type === 'failure' && typeof result.data?.error === 'string'
                            ? result.data.error
                            : m.action_failed()
                    )
                await update({ reset: false })
            }}
    >
        <input type="hidden" name="inbox" value={inbox.id} />
        <Label for={fieldId}>{m.inbox_invite_label()}</Label>
        <p class="text-sm text-muted-foreground">{m.inbox_invite_steps()}</p>
        <div class="flex flex-col gap-2 sm:flex-row">
            <!-- The invitation carries Spotify's token: an agent may fill it in, not read it -->
            <Input
                data-agent-secret
                id={fieldId}
                name="invite"
                type="url"
                inputmode="url"
                value={inbox.inviteUrl ?? ''}
                placeholder="https://open.spotify.com/playlist/…"
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? `${fieldId}-error` : undefined}
                class="h-11 sm:h-8"
            />
            <Button type="submit" class="h-11 sm:h-8">{m.save()}</Button>
        </div>
        {#if invalid}
            <p id="{fieldId}-error" class="text-sm text-destructive">
                {m.inbox_invite_invalid()}
            </p>
        {/if}
    </form>

    <div class="flex flex-col gap-2 sm:flex-row">
        {#if !allowed}
            <Button href={allowHref} class={touch}>
                <ShieldCheckIcon data-icon="inline-start" />
                {m.inbox_allow_again()}
            </Button>
        {/if}
        <AlertDialog.Root bind:open={forgetOpen}>
            <AlertDialog.Trigger variant="outline" class={touch}>
                <Trash2Icon data-icon="inline-start" />
                {m.inbox_forget()}
            </AlertDialog.Trigger>
            <AlertDialog.Content>
                <AlertDialog.Header>
                    <AlertDialog.Title>{m.inbox_forget_title()}</AlertDialog.Title>
                    <AlertDialog.Description>{m.inbox_forget_hint()}</AlertDialog.Description>
                </AlertDialog.Header>
                <form
                    method="POST"
                    action="?/inboxForget"
                    use:enhance={() => {
                        busy = true
                        return async ({ result, update }) => {
                            busy = false
                            forgetOpen = false
                            if (result.type === 'success') toast.success(m.inbox_forgotten())
                            else toast.error(m.action_failed())
                            await update()
                        }
                    }}
                >
                    <input type="hidden" name="inbox" value={inbox.id} />
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel type="button" class="h-11 sm:h-8">
                            {m.cancel()}
                        </AlertDialog.Cancel>
                        <Button
                            type="submit"
                            data-agent-confirm={m.agent_confirm_inbox_forget()}
                            variant="destructive"
                            class="h-11 sm:h-8"
                            disabled={busy}
                        >
                            {m.inbox_forget()}
                        </Button>
                    </AlertDialog.Footer>
                </form>
            </AlertDialog.Content>
        </AlertDialog.Root>
    </div>
</div>
