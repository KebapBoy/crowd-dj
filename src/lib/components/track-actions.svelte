<script lang="ts">
    import CheckIcon from '@lucide/svelte/icons/check'
    import ListMinusIcon from '@lucide/svelte/icons/list-minus'
    import ListMusicIcon from '@lucide/svelte/icons/list-music'
    import ListPlusIcon from '@lucide/svelte/icons/list-plus'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import { runAction } from '#lib/actions.ts'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js'
    import { m } from '#lib/paraglide/messages.js'

    /** Wish a track in the session or add it to (or remove it from) the pool. */
    let {
        id,
        title,
        inPool,
        wished,
        canWish
    }: {
        id: string
        title: string
        inPool: boolean
        /** Wished by this person in this session already. */
        wished: boolean
        /** Whether wishes are taken in this session. */
        canWish: boolean
    } = $props()

    let busy = $state(false)

    async function run(action: string, success: string) {
        busy = true
        await runAction(action, { track: id }, success)
        busy = false
    }
</script>

<DropdownMenu.Root>
    <DropdownMenu.Trigger disabled={busy}>
        {#snippet child({ props })}
            <Button
                {...props}
                variant="ghost"
                size="icon"
                class="size-11 shrink-0 sm:size-9"
                aria-label={m.track_actions({ title })}
                title={m.track_actions({ title })}
            >
                {#if wished || inPool}
                    <CheckIcon />
                {:else}
                    <PlusIcon />
                {/if}
            </Button>
        {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="min-w-48">
        <DropdownMenu.Label class="max-w-64 truncate">{title}</DropdownMenu.Label>
        {#if canWish}
            <DropdownMenu.Item
                class="min-h-11 sm:min-h-8"
                disabled={wished}
                onSelect={() => run('wish', m.wish_added())}
            >
                <ListMusicIcon />
                {wished ? m.wish_done() : m.wish_add()}
            </DropdownMenu.Item>
        {/if}
        {#if inPool}
            <DropdownMenu.Item
                class="min-h-11 sm:min-h-8"
                onSelect={() => run('unpool', m.pool_removed())}
            >
                <ListMinusIcon />
                {m.pool_remove()}
            </DropdownMenu.Item>
        {:else}
            <DropdownMenu.Item
                class="min-h-11 sm:min-h-8"
                onSelect={() => run('pool', m.pool_added({ count: 1 }))}
            >
                <ListPlusIcon />
                {m.pool_add()}
            </DropdownMenu.Item>
        {/if}
    </DropdownMenu.Content>
</DropdownMenu.Root>
