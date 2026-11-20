<script lang="ts">
    import CirclePauseIcon from '@lucide/svelte/icons/circle-pause'
    import PlayIcon from '@lucide/svelte/icons/play'
    import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert'
    import { runAction } from '#lib/actions.ts'
    import DevicePicker from '#lib/components/device-picker.svelte'
    import StatusBadge from '#lib/components/status-badge.svelte'
    import TrackCard from '#lib/components/track-card.svelte'
    import * as Alert from '#lib/components/ui/alert/index.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Card from '#lib/components/ui/card/index.js'
    import { Progress } from '#lib/components/ui/progress/index.js'
    import { Separator } from '#lib/components/ui/separator/index.js'
    import { problemMessage } from '#lib/playing-messages.ts'
    import { m } from '#lib/paraglide/messages.js'
    import type { PlayingView, SessionTrack } from '#lib/server/playing.ts'

    /** "Now playing" and "up next" of a session; the host also starts the music and picks a device. */
    let {
        playing,
        sessionId,
        isHost,
        account
    }: {
        playing: PlayingView
        sessionId: string
        isHost: boolean
        /** Name of the account that plays. */
        account: string
    } = $props()

    let busy = $state(false)
    /** Now, ticking every second while a track plays, for its position. */
    let clock = $state(Date.now())
    /** When the page got the position it shows. */
    let loadedAt = $state(Date.now())

    const current = $derived(playing.current)
    const position = $derived(
        current
            ? Math.min(
                  current.durationMs,
                  current.progressMs + (current.isPlaying ? Math.max(0, clock - loadedAt) : 0)
              )
            : 0
    )
    const status = $derived.by(() => {
        if (playing.playback === 'stopped')
            return isHost ? m.playing_stopped_host() : m.playing_stopped()
        if (playing.playback === 'paused')
            return isHost ? m.playing_paused_host({ account }) : m.playing_paused({ account })
        if (playing.elsewhere) return m.playing_elsewhere()
        return m.playing_waiting()
    })
    // Whether the host's play button helps: the music has not started, was paused, or nothing of the
    // session plays; while the session's track plays, it would only skip it
    const canPlay = $derived(isHost && (playing.playback !== 'playing' || !current))

    $effect(() => {
        void playing
        loadedAt = Date.now()
        clock = loadedAt
    })

    $effect(() => {
        if (!current?.isPlaying) return
        const timer = setInterval(() => (clock = Date.now()), 1000)
        return () => clearInterval(timer)
    })

    function time(ms: number) {
        const seconds = Math.floor(ms / 1000)
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    }

    async function start() {
        busy = true
        await runAction('play', {}, (data) =>
            data?.played === 'nothing' ? m.playing_nothing() : m.playing_started()
        )
        busy = false
    }
</script>

{#snippet whose(item: SessionTrack)}
    {#if item.mine}
        <StatusBadge status="ok" label={m.playing_yours()} class="shrink-0" />
    {:else if item.by}
        <span class="max-w-28 shrink-0 truncate text-sm text-muted-foreground">
            {m.playing_for({ name: item.by })}
        </span>
    {/if}
{/snippet}

<Card.Root>
    <Card.Header>
        <Card.Title><h2>{m.playing_heading()}</h2></Card.Title>
        {#if playing.device}
            <Card.Description>{m.playing_on({ device: playing.device })}</Card.Description>
        {/if}
        {#if isHost}
            <Card.Action>
                <DevicePicker {sessionId} {account} />
            </Card.Action>
        {/if}
    </Card.Header>
    <Card.Content class="flex flex-col gap-4">
        {#if playing.problem}
            <Alert.Root variant="destructive">
                <TriangleAlertIcon />
                <Alert.Description>{problemMessage(playing.problem, account)}</Alert.Description>
            </Alert.Root>
        {/if}

        {#if current}
            <TrackCard track={current.track} size="lg">
                {#snippet actions()}{@render whose(current)}{/snippet}
            </TrackCard>
            {#if current.durationMs > 0}
                <div class="flex flex-col gap-1.5">
                    <Progress value={position} max={current.durationMs} />
                    <div
                        class="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums"
                    >
                        <span>{time(position)}</span>
                        {#if !current.isPlaying}
                            <StatusBadge
                                status="neutral"
                                icon={CirclePauseIcon}
                                label={m.playing_paused_in_spotify()}
                            />
                        {/if}
                        <span>{time(current.durationMs)}</span>
                    </div>
                </div>
            {/if}
        {:else}
            <p class="text-sm text-muted-foreground">{status}</p>
        {/if}

        {#if canPlay}
            <Button
                class="h-11 w-full sm:h-8 sm:w-auto sm:self-start"
                disabled={busy}
                onclick={start}
            >
                <PlayIcon data-icon="inline-start" />
                {playing.playback === 'paused' ? m.playing_resume() : m.playing_start()}
            </Button>
        {/if}

        <Separator />

        <div class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">{m.next_heading()}</h3>
            {#if playing.next}
                <TrackCard track={playing.next.track}>
                    {#snippet actions()}{@render whose(playing.next!)}{/snippet}
                </TrackCard>
                {#if !playing.next.queued}
                    <p class="text-xs text-muted-foreground">{m.next_may_change()}</p>
                {/if}
            {:else}
                <p class="text-sm text-muted-foreground">{m.next_none()}</p>
            {/if}
        </div>
    </Card.Content>
</Card.Root>
