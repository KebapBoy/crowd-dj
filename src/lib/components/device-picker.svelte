<script lang="ts">
    import MonitorSpeakerIcon from '@lucide/svelte/icons/monitor-speaker'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { errorMessage, runAction } from '#lib/actions.ts'
    import StatusBadge from '#lib/components/status-badge.svelte'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Dialog from '#lib/components/ui/dialog/index.js'
    import { Skeleton } from '#lib/components/ui/skeleton/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { PlayerDevice } from '#lib/server/spotify/api.ts'

    /** For the host: the devices the playing account can play on, to start or move playback. */
    let { sessionId, account }: { sessionId: string; account: string } = $props()

    let open = $state(false)
    let devices = $state<PlayerDevice[] | null>(null)
    let problem = $state<string | null>(null)
    let busy = $state<string | null>(null)

    async function load() {
        devices = null
        problem = null
        try {
            const response = await fetch(`/s/${sessionId}/devices`)
            if (response.ok) devices = (await response.json()) as PlayerDevice[]
            else problem = await errorMessage(response)
        } catch {
            problem = m.action_failed()
        }
    }

    async function choose(device: PlayerDevice) {
        if (!device.id) return
        busy = device.id
        const done = await runAction('play', { device: device.id }, (data) =>
            data?.played === 'nothing'
                ? m.playing_nothing()
                : m.playing_device_moved({ device: device.name })
        )
        busy = null
        if (done) open = false
    }

    $effect(() => {
        if (open) load()
    })
</script>

<Dialog.Root bind:open>
    <Dialog.Trigger>
        {#snippet child({ props })}
            <Button {...props} variant="outline" class="h-11 sm:h-8">
                <MonitorSpeakerIcon data-icon="inline-start" />
                {m.playing_device()}
            </Button>
        {/snippet}
    </Dialog.Trigger>
    <Dialog.Content>
        <Dialog.Header>
            <Dialog.Title>{m.playing_devices_title()}</Dialog.Title>
            <Dialog.Description>{m.playing_devices_intro({ account })}</Dialog.Description>
        </Dialog.Header>
        {#if problem}
            <p class="text-sm text-destructive">{problem}</p>
        {:else if devices === null}
            <div class="flex flex-col gap-2">
                <Skeleton class="h-11 w-full" />
                <Skeleton class="h-11 w-full" />
            </div>
        {:else if devices.length === 0}
            <p class="text-sm text-muted-foreground">{m.playing_devices_none({ account })}</p>
        {:else}
            <ul class="flex flex-col gap-2">
                {#each devices as device, i (device.id ?? `none-${i}`)}
                    <li>
                        <Button
                            variant="outline"
                            class="h-11 w-full justify-start sm:h-9"
                            disabled={!device.id || device.isRestricted || busy !== null}
                            onclick={() => choose(device)}
                        >
                            <MonitorSpeakerIcon data-icon="inline-start" />
                            <span class="truncate">{device.name}</span>
                            {#if device.isActive}
                                <StatusBadge
                                    status="ok"
                                    label={m.playing_device_active()}
                                    class="ml-auto"
                                />
                            {:else if !device.id || device.isRestricted}
                                <StatusBadge
                                    status="neutral"
                                    label={m.playing_device_restricted()}
                                    class="ml-auto"
                                />
                            {/if}
                        </Button>
                    </li>
                {/each}
            </ul>
        {/if}
        <Dialog.Footer>
            <Button
                variant="ghost"
                class="h-11 sm:h-8"
                disabled={devices === null && !problem}
                onclick={load}
            >
                <RefreshCwIcon data-icon="inline-start" />
                {m.playing_devices_reload()}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
