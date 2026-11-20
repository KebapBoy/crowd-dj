<script lang="ts">
    import type { Snippet } from 'svelte'
    import TrackCard from '#lib/components/track-card.svelte'
    import { m } from '#lib/paraglide/messages.js'
    import type { TrackView } from '#lib/server/catalog.ts'
    import type { PoolEntry } from '#lib/server/pools.ts'

    /** A participant's pool, newest first; beyond a session's limit the older tracks do not count. */
    let {
        pool,
        limit = null,
        trackActions
    }: {
        pool: PoolEntry[]
        /** The session's pool limit, if any. */
        limit?: number | null
        /** The buttons for each track. */
        trackActions: Snippet<[TrackView]>
    } = $props()

    const counted = $derived(limit === null ? pool : pool.slice(0, limit))
    const rest = $derived(limit === null ? [] : pool.slice(limit))
</script>

{#snippet entries(items: PoolEntry[])}
    <ul class="flex flex-col gap-2">
        {#each items as entry (entry.track.id)}
            <li>
                <TrackCard track={entry.track}>
                    {#snippet actions()}
                        {@render trackActions(entry.track)}
                    {/snippet}
                </TrackCard>
            </li>
        {/each}
    </ul>
{/snippet}

{#if pool.length === 0}
    <p class="text-sm text-muted-foreground">{m.pool_empty()}</p>
{:else}
    <div class="flex flex-col gap-4">
        {@render entries(counted)}
        {#if rest.length > 0}
            <section class="flex flex-col gap-2">
                <h3 class="text-sm font-medium text-muted-foreground">
                    {m.pool_not_counted({ count: limit ?? 0 })}
                </h3>
                <div class="opacity-60">{@render entries(rest)}</div>
            </section>
        {/if}
    </div>
{/if}
