<script lang="ts">
    import XIcon from '@lucide/svelte/icons/x'
    import { runAction } from '#lib/actions.ts'
    import StatusBadge from '#lib/components/status-badge.svelte'
    import TrackCard from '#lib/components/track-card.svelte'
    import { Button } from '#lib/components/ui/button/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { WishView } from '#lib/server/wishes.ts'

    /** A participant's wishes in a session; open ones can be withdrawn. */
    let { wishes }: { wishes: WishView[] } = $props()

    let busy = $state<string | null>(null)

    async function withdraw(id: string) {
        busy = id
        await runAction('withdraw', { wish: id }, m.wish_withdrawn())
        busy = null
    }
</script>

{#if wishes.length === 0}
    <p class="text-sm text-muted-foreground">{m.wish_none()}</p>
{:else}
    <ul class="flex flex-col gap-2">
        {#each wishes as wish (wish.id)}
            <li class={wish.playedAt ? 'opacity-60' : undefined}>
                <TrackCard track={wish.track}>
                    {#snippet actions()}
                        {#if wish.playedAt}
                            <StatusBadge status="neutral" label={m.wish_played()} />
                        {:else}
                            <Button
                                variant="ghost"
                                size="icon"
                                class="size-11 shrink-0 sm:size-9"
                                disabled={busy === wish.id}
                                aria-label={m.wish_withdraw({ title: wish.track.title })}
                                title={m.wish_withdraw({ title: wish.track.title })}
                                onclick={() => withdraw(wish.id)}
                            >
                                <XIcon />
                            </Button>
                        {/if}
                    {/snippet}
                </TrackCard>
            </li>
        {/each}
    </ul>
{/if}
