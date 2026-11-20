<script lang="ts" module>
    /** What the Developer Policy (II.5) asks to show with anything that plays. */
    export interface TrackInfo {
        title: string
        artists: string[]
        album: string
        /** Cover art from Spotify; a placeholder stands in while it is missing. */
        coverUrl: string | null
        /** Link back to the track in Spotify. */
        spotifyUrl: string
    }
</script>

<script lang="ts">
    import type { Snippet } from 'svelte'
    import DiscIcon from '@lucide/svelte/icons/disc-3'
    import ExternalLinkIcon from '@lucide/svelte/icons/external-link'
    import { Button } from '#lib/components/ui/button/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale } from '#lib/paraglide/runtime.js'
    import { cn } from '#lib/utils.ts'

    let {
        track,
        size = 'default',
        class: className,
        actions
    }: {
        track: TrackInfo
        /** `lg` for the track that is playing, `default` for lists. */
        size?: 'default' | 'lg'
        class?: string
        /** Buttons for the track, shown before the link to Spotify. */
        actions?: Snippet
    } = $props()

    const artists = $derived(
        new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(track.artists)
    )
</script>

<div class={cn('flex min-w-0 items-center gap-3', size === 'lg' && 'gap-4', className)}>
    <div
        class={cn(
            'grid shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground',
            size === 'lg' ? 'size-24 sm:size-32' : 'size-12'
        )}
    >
        {#if track.coverUrl}
            <img
                src={track.coverUrl}
                alt={m.track_cover({ album: track.album })}
                class="size-full object-cover"
                loading="lazy"
            />
        {:else}
            <DiscIcon class={size === 'lg' ? 'size-10' : 'size-5'} aria-hidden="true" />
        {/if}
    </div>
    <div class="grid min-w-0 flex-1 gap-0.5">
        <p class={cn('truncate font-medium', size === 'lg' && 'text-lg')}>{track.title}</p>
        <p class="truncate text-sm text-muted-foreground">{artists}</p>
        {#if size === 'lg'}
            <p class="truncate text-sm text-muted-foreground">{track.album}</p>
        {/if}
    </div>
    {@render actions?.()}
    <Button
        href={track.spotifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        variant="ghost"
        size="icon"
        class="size-11 shrink-0 sm:size-9"
        aria-label={m.track_open_spotify({ title: track.title })}
        title={m.track_open_spotify({ title: track.title })}
    >
        <ExternalLinkIcon />
    </Button>
</div>
