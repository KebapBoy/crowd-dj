<script lang="ts">
    import TokenStatus from '#lib/components/token-status.svelte'
    import * as Avatar from '#lib/components/ui/avatar/index.js'
    import type { AccountView } from '#lib/server/accounts.ts'

    /** A Spotify account with its picture, name and the state of its sign-in. */
    let { account }: { account: AccountView } = $props()

    const name = $derived(account.displayName ?? account.id)
</script>

<div class="flex items-center gap-3">
    <Avatar.Root size="lg">
        {#if account.imageUrl}<Avatar.Image src={account.imageUrl} alt="" />{/if}
        <Avatar.Fallback>{(Array.from(name)[0] ?? '').toUpperCase()}</Avatar.Fallback>
    </Avatar.Root>
    <div class="grid min-w-0 gap-1">
        <p class="truncate font-medium">{name}</p>
        <TokenStatus {account} />
    </div>
</div>
