<script lang="ts">
    import LogInIcon from '@lucide/svelte/icons/log-in'
    import LogOutIcon from '@lucide/svelte/icons/log-out'
    import PlayIcon from '@lucide/svelte/icons/play'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import SpeakerIcon from '@lucide/svelte/icons/speaker'
    import Trash2Icon from '@lucide/svelte/icons/trash-2'
    import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert'
    import UnplugIcon from '@lucide/svelte/icons/unplug'
    import { toast } from '#lib/components/ui/toast/index.js'
    import { enhance } from '$app/forms'
    import { resolve } from '$app/paths'
    import type { SubmitFunction } from '$app/forms'
    import AccountRow from '#lib/components/account-row.svelte'
    import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Card from '#lib/components/ui/card/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { PageProps } from './$types'

    let { data }: PageProps = $props()

    let removeOpen = $state(false)
    let deleteOpen = $state(false)
    let busy = $state(false)

    /** Submits a confirmed action, then closes its dialog and reports the outcome as a toast. */
    function confirmed(success: () => string, close: () => void): SubmitFunction {
        return () => {
            busy = true
            return async ({ result, update }) => {
                busy = false
                close()
                if (result.type === 'success' || result.type === 'redirect')
                    toast.success(success())
                else toast.error(m.action_failed())
                await update()
            }
        }
    }

    const touch = 'h-11 w-full sm:h-8 sm:w-auto'
</script>

<svelte:head>
    <title>{m.account_title()} · {m.app_name()}</title>
</svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-4 sm:gap-6">
    <h1 class="text-2xl font-semibold tracking-tight">{m.account_title()}</h1>

    {#if !data.host}
        <Card.Root>
            <Card.Header>
                <Card.Description>{m.host_intro()}</Card.Description>
            </Card.Header>
            <Card.Footer>
                <Button href={resolve('/auth/login')} class={touch}>
                    <LogInIcon data-icon="inline-start" />
                    {m.sign_in_spotify()}
                </Button>
            </Card.Footer>
        </Card.Root>
    {:else}
        <Card.Root>
            <Card.Header>
                <Card.Title><h2>{m.account_host_heading()}</h2></Card.Title>
            </Card.Header>
            <Card.Content class="flex flex-col gap-3">
                <AccountRow account={data.host} />
                <p class="text-sm text-muted-foreground">{m.account_renew_hint()}</p>
            </Card.Content>
            <Card.Footer class="flex-col gap-2 sm:flex-row">
                <Button href={resolve('/auth/login')} variant="outline" class={touch}>
                    <RefreshCwIcon data-icon="inline-start" />
                    {m.renewal_action_host()}
                </Button>
                <form method="POST" action="/auth/logout" class="w-full sm:w-auto">
                    <Button type="submit" variant="ghost" class={touch}>
                        <LogOutIcon data-icon="inline-start" />
                        {m.sign_out()}
                    </Button>
                </form>
            </Card.Footer>
        </Card.Root>

        <Card.Root>
            <Card.Header>
                <Card.Title><h2>{m.account_player_heading()}</h2></Card.Title>
                <Card.Description>{m.account_player_intro()}</Card.Description>
            </Card.Header>
            <Card.Content class="flex flex-col gap-3">
                {#if data.player}
                    <AccountRow account={data.player} />
                {:else if data.host.allowsPlayback}
                    <p class="flex items-center gap-2 text-sm">
                        <SpeakerIcon class="size-4 shrink-0 text-muted-foreground" />
                        {m.account_player_none()}
                    </p>
                {:else}
                    <p class="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                        <TriangleAlertIcon class="size-4 shrink-0" />
                        {m.account_player_not_allowed()}
                    </p>
                {/if}
                <p class="text-sm text-muted-foreground">{m.account_playback_hint()}</p>
                <p class="text-sm text-muted-foreground">{m.account_player_hint()}</p>
            </Card.Content>
            <Card.Footer class="flex-col gap-2 sm:flex-row">
                {#if data.player}
                    <Button href={resolve('/auth/connect-player')} variant="outline" class={touch}>
                        <RefreshCwIcon data-icon="inline-start" />
                        {m.account_player_swap()}
                    </Button>
                    <AlertDialog.Root bind:open={removeOpen}>
                        <AlertDialog.Trigger variant="destructive" class={touch}>
                            <UnplugIcon data-icon="inline-start" />
                            {m.account_player_remove()}
                        </AlertDialog.Trigger>
                        <AlertDialog.Content>
                            <AlertDialog.Header>
                                <AlertDialog.Title
                                    >{m.account_player_remove_title()}</AlertDialog.Title
                                >
                                <AlertDialog.Description>
                                    {m.account_player_remove_hint()}
                                </AlertDialog.Description>
                            </AlertDialog.Header>
                            <form
                                method="POST"
                                action="?/removePlayer"
                                use:enhance={confirmed(
                                    m.account_player_removed,
                                    () => (removeOpen = false)
                                )}
                            >
                                <AlertDialog.Footer>
                                    <AlertDialog.Cancel type="button" class="h-11 sm:h-8">
                                        {m.cancel()}
                                    </AlertDialog.Cancel>
                                    <Button
                                        type="submit"
                                        data-agent-confirm={m.agent_confirm_player_remove()}
                                        variant="destructive"
                                        class="h-11 sm:h-8"
                                        disabled={busy}
                                    >
                                        {m.account_player_remove()}
                                    </Button>
                                </AlertDialog.Footer>
                            </form>
                        </AlertDialog.Content>
                    </AlertDialog.Root>
                {:else}
                    <Button href={resolve('/auth/connect-player')} class={touch}>
                        <SpeakerIcon data-icon="inline-start" />
                        {m.account_player_connect()}
                    </Button>
                    {#if !data.host.allowsPlayback}
                        <Button
                            href={resolve('/auth/allow-playback')}
                            variant="outline"
                            class={touch}
                        >
                            <PlayIcon data-icon="inline-start" />
                            {m.account_playback_allow()}
                        </Button>
                    {/if}
                {/if}
            </Card.Footer>
        </Card.Root>

        <Card.Root class="ring-destructive/30">
            <Card.Header>
                <Card.Title><h2>{m.account_delete()}</h2></Card.Title>
                <Card.Description>{m.account_delete_hint()}</Card.Description>
            </Card.Header>
            <Card.Footer>
                <AlertDialog.Root bind:open={deleteOpen}>
                    <AlertDialog.Trigger variant="destructive" class={touch}>
                        <Trash2Icon data-icon="inline-start" />
                        {m.account_delete()}
                    </AlertDialog.Trigger>
                    <AlertDialog.Content>
                        <AlertDialog.Header>
                            <AlertDialog.Title>{m.account_delete_title()}</AlertDialog.Title>
                            <AlertDialog.Description
                                >{m.account_delete_hint()}</AlertDialog.Description
                            >
                        </AlertDialog.Header>
                        <form
                            method="POST"
                            action="?/deleteAccount"
                            use:enhance={confirmed(m.account_deleted, () => (deleteOpen = false))}
                        >
                            <AlertDialog.Footer>
                                <AlertDialog.Cancel type="button" class="h-11 sm:h-8">
                                    {m.cancel()}
                                </AlertDialog.Cancel>
                                <Button
                                    type="submit"
                                    data-agent-confirm={m.agent_confirm_account_delete()}
                                    variant="destructive"
                                    class="h-11 sm:h-8"
                                    disabled={busy}
                                >
                                    {m.account_delete_confirm()}
                                </Button>
                            </AlertDialog.Footer>
                        </form>
                    </AlertDialog.Content>
                </AlertDialog.Root>
            </Card.Footer>
        </Card.Root>
    {/if}
</div>
