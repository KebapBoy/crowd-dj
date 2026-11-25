<script lang="ts">
    import type { Snippet } from 'svelte'
    import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left'
    import ChevronRightIcon from '@lucide/svelte/icons/chevron-right'
    import DiscIcon from '@lucide/svelte/icons/disc-3'
    import ListPlusIcon from '@lucide/svelte/icons/list-plus'
    import MicVocalIcon from '@lucide/svelte/icons/mic-vocal'
    import SearchIcon from '@lucide/svelte/icons/search'
    import { toast } from '#lib/components/ui/toast/index.js'
    import { resolve } from '$app/paths'
    import { errorMessage, runAction } from '#lib/actions.ts'
    import TrackCard from '#lib/components/track-card.svelte'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Skeleton } from '#lib/components/ui/skeleton/index.js'
    import { QUERY_MAX_LENGTH } from '#lib/limits.ts'
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale } from '#lib/paraglide/runtime.js'
    import type { AlbumView, SearchResult, TrackView } from '#lib/server/catalog.ts'
    import { LINKS_MAX, parseAlbumId, parseTrackIds } from '#lib/spotify-links.ts'
    import { cn } from '#lib/utils.ts'

    /** Search, pasted links and browsing artists and albums, for a session's participants. */
    let {
        sessionId,
        trackActions
    }: {
        sessionId: string
        /** The buttons for each track found. */
        trackActions: Snippet<[TrackView]>
    } = $props()

    type View =
        | { kind: 'search'; result: SearchResult }
        | { kind: 'links'; tracks: TrackView[]; dropped: number }
        | { kind: 'album'; album: AlbumView; tracks: TrackView[] }
        | { kind: 'artist'; name: string; id: string; albums: AlbumView[]; next: number | null }

    let query = $state('')
    /** What was opened, the last one is shown; going back returns to the one before. */
    let views = $state<View[]>([])
    let loading = $state(false)
    let adding = $state(false)

    const view = $derived(views.at(-1))
    const base = $derived(resolve('/s/[id]', { id: sessionId }))
    const list = (items: string[]) =>
        new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(items)

    /** Fetches JSON from an endpoint of the session; shows the error and returns null on failure. */
    async function get<T>(path: string): Promise<T | null> {
        loading = true
        try {
            const response = await fetch(`${base}/${path}`)
            if (!response.ok) {
                toast.error(await errorMessage(response))
                return null
            }
            return (await response.json()) as T
        } catch {
            toast.error(m.action_failed())
            return null
        } finally {
            loading = false
        }
    }

    async function search(event: SubmitEvent) {
        event.preventDefault()
        const text = query.trim()
        if (!text) return
        const ids = parseTrackIds(text)
        if (ids.length > 0) {
            const tracks = await get<TrackView[]>(`tracks?ids=${ids.slice(0, LINKS_MAX).join(',')}`)
            if (tracks)
                views = [{ kind: 'links', tracks, dropped: Math.max(0, ids.length - LINKS_MAX) }]
            return
        }
        const albumId = parseAlbumId(text)
        if (albumId) {
            await openAlbum(albumId, true)
            return
        }
        if (text.length > QUERY_MAX_LENGTH) {
            toast.error(m.search_too_long({ max: QUERY_MAX_LENGTH }))
            return
        }
        const result = await get<SearchResult>(`search?q=${encodeURIComponent(text)}`)
        if (result) views = [{ kind: 'search', result }]
    }

    /** Opens an album on top of what is shown, or instead of it (`replace`, for a pasted link). */
    async function openAlbum(id: string, replace = false) {
        const found = await get<{ album: AlbumView; tracks: TrackView[] }>(`albums/${id}`)
        if (found) views = [...(replace ? [] : views), { kind: 'album', ...found }]
    }

    async function openArtist(id: string, name: string) {
        const page = await get<{ albums: AlbumView[]; next: number | null }>(`artists/${id}`)
        if (page) views = [...views, { kind: 'artist', id, name, ...page }]
    }

    async function moreAlbums(current: Extract<View, { kind: 'artist' }>) {
        const page = await get<{ albums: AlbumView[]; next: number | null }>(
            `artists/${current.id}?offset=${current.next}`
        )
        if (page) {
            // Spotify's order may shift between pages; each album once
            const seen = new Set(current.albums.map((album) => album.id))
            current.albums = [
                ...current.albums,
                ...page.albums.filter((album) => !seen.has(album.id))
            ]
            current.next = page.next
        }
    }

    async function addAll(tracks: TrackView[]) {
        adding = true
        await runAction(
            'pool',
            { track: tracks.map((track) => track.id) },
            m.pool_added({ count: tracks.length })
        )
        adding = false
    }

    const row =
        'flex min-h-14 w-full items-center gap-3 rounded-lg p-1 text-left hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50'
</script>

{#snippet tracks(items: TrackView[])}
    <ul class="flex flex-col gap-2">
        {#each items as track (track.id)}
            <li>
                <TrackCard {track}>
                    {#snippet actions()}
                        {@render trackActions(track)}
                    {/snippet}
                </TrackCard>
            </li>
        {/each}
    </ul>
{/snippet}

{#snippet albums(items: AlbumView[], showArtists: boolean)}
    <ul class="flex flex-col gap-1">
        {#each items as album (album.id)}
            <li>
                <button
                    type="button"
                    class={row}
                    disabled={loading}
                    onclick={() => openAlbum(album.id)}
                >
                    <span
                        class="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground"
                    >
                        {#if album.coverUrl}
                            <img
                                src={album.coverUrl}
                                alt=""
                                class="size-full object-cover"
                                loading="lazy"
                            />
                        {:else}
                            <DiscIcon class="size-5" />
                        {/if}
                    </span>
                    <span class="grid min-w-0 flex-1 gap-0.5">
                        <span class="truncate font-medium">{album.name}</span>
                        <span class="truncate text-sm text-muted-foreground">
                            {[showArtists ? list(album.artists) : '', album.year ?? '']
                                .filter(Boolean)
                                .join(' · ')}
                        </span>
                    </span>
                    <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground" />
                </button>
            </li>
        {/each}
    </ul>
{/snippet}

{#snippet heading(text: string)}
    <h3 class="text-sm font-medium text-muted-foreground">{text}</h3>
{/snippet}

<div class="flex flex-col gap-4">
    <form class="flex flex-col gap-2" role="search" onsubmit={search}>
        <div class="flex gap-2">
            <Input
                type="search"
                bind:value={query}
                enterkeyhint="search"
                autocomplete="off"
                placeholder={m.search_placeholder()}
                aria-label={m.search_label()}
                class="h-11 sm:h-8"
            />
            <Button
                type="submit"
                class="h-11 shrink-0 sm:h-8"
                disabled={loading || !query.trim()}
                aria-label={m.search_label()}
            >
                <SearchIcon />
                <span class="hidden sm:inline">{m.search()}</span>
            </Button>
        </div>
        <p class="text-sm text-muted-foreground">{m.search_hint()}</p>
    </form>

    {#if views.length > 1}
        <Button
            variant="ghost"
            class="h-11 self-start sm:h-8"
            disabled={loading}
            onclick={() => (views = views.slice(0, -1))}
        >
            <ArrowLeftIcon data-icon="inline-start" />
            {m.back()}
        </Button>
    {/if}

    <div class={cn('flex flex-col gap-5', loading && 'opacity-60')} aria-busy={loading}>
        {#if loading && !view}
            {#each { length: 4 }, i (i)}
                <div class="flex items-center gap-3">
                    <Skeleton class="size-12" />
                    <div class="grid flex-1 gap-1.5">
                        <Skeleton class="h-4 w-2/3" />
                        <Skeleton class="h-3 w-1/3" />
                    </div>
                </div>
            {/each}
        {:else if view?.kind === 'search'}
            {@const { result } = view}
            {#if result.tracks.length + result.albums.length + result.artists.length === 0}
                <p class="text-sm text-muted-foreground">{m.search_nothing()}</p>
            {/if}
            {#if result.tracks.length > 0}
                <section class="flex flex-col gap-2">
                    {@render heading(m.search_tracks())}
                    {@render tracks(result.tracks)}
                </section>
            {/if}
            {#if result.artists.length > 0}
                <section class="flex flex-col gap-2">
                    {@render heading(m.search_artists())}
                    <ul class="flex flex-col gap-1">
                        {#each result.artists as artist (artist.id)}
                            <li>
                                <button
                                    type="button"
                                    class={row}
                                    disabled={loading}
                                    onclick={() => openArtist(artist.id, artist.name)}
                                >
                                    <span
                                        class="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-muted-foreground"
                                    >
                                        {#if artist.imageUrl}
                                            <img
                                                src={artist.imageUrl}
                                                alt=""
                                                class="size-full object-cover"
                                                loading="lazy"
                                            />
                                        {:else}
                                            <MicVocalIcon class="size-5" />
                                        {/if}
                                    </span>
                                    <span class="min-w-0 flex-1 truncate font-medium">
                                        {artist.name}
                                    </span>
                                    <ChevronRightIcon
                                        class="size-4 shrink-0 text-muted-foreground"
                                    />
                                </button>
                            </li>
                        {/each}
                    </ul>
                </section>
            {/if}
            {#if result.albums.length > 0}
                <section class="flex flex-col gap-2">
                    {@render heading(m.search_albums())}
                    {@render albums(result.albums, true)}
                </section>
            {/if}
        {:else if view?.kind === 'links'}
            <section class="flex flex-col gap-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    {@render heading(m.links_found({ count: view.tracks.length }))}
                    {#if view.tracks.length > 1}
                        <Button
                            variant="outline"
                            class="h-11 sm:h-8"
                            disabled={adding}
                            onclick={() => view.kind === 'links' && addAll(view.tracks)}
                        >
                            <ListPlusIcon data-icon="inline-start" />
                            {m.pool_add_all({ count: view.tracks.length })}
                        </Button>
                    {/if}
                </div>
                {#if view.dropped > 0}
                    <p class="text-sm text-muted-foreground">
                        {m.links_dropped({ count: view.dropped, max: LINKS_MAX })}
                    </p>
                {/if}
                {#if view.tracks.length === 0}
                    <p class="text-sm text-muted-foreground">{m.search_nothing()}</p>
                {/if}
                {@render tracks(view.tracks)}
            </section>
        {:else if view?.kind === 'album'}
            <section class="flex flex-col gap-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="grid min-w-0 gap-0.5">
                        <h3 class="truncate font-semibold">{view.album.name}</h3>
                        <p class="truncate text-sm text-muted-foreground">
                            {[list(view.album.artists), view.album.year ?? '']
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                    </div>
                    {#if view.tracks.length > 1}
                        <Button
                            variant="outline"
                            class="h-11 sm:h-8"
                            disabled={adding}
                            onclick={() => view.kind === 'album' && addAll(view.tracks)}
                        >
                            <ListPlusIcon data-icon="inline-start" />
                            {m.pool_add_all({ count: view.tracks.length })}
                        </Button>
                    {/if}
                </div>
                {@render tracks(view.tracks)}
            </section>
        {:else if view?.kind === 'artist'}
            {@const artist = view}
            <section class="flex flex-col gap-3">
                <h3 class="truncate font-semibold">{artist.name}</h3>
                {#if artist.albums.length === 0}
                    <p class="text-sm text-muted-foreground">{m.search_nothing()}</p>
                {/if}
                {@render albums(artist.albums, false)}
                {#if artist.next !== null}
                    <Button
                        variant="outline"
                        class="h-11 self-start sm:h-8"
                        disabled={loading}
                        onclick={() => moreAlbums(artist)}
                    >
                        {m.search_more()}
                    </Button>
                {/if}
            </section>
        {/if}
    </div>
</div>
