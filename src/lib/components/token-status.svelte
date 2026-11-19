<script lang="ts">
    import CircleAlertIcon from '@lucide/svelte/icons/circle-alert'
    import CircleCheckIcon from '@lucide/svelte/icons/circle-check'
    import CircleXIcon from '@lucide/svelte/icons/circle-x'
    import StatusBadge, { type Status } from '#lib/components/status-badge.svelte'
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale } from '#lib/paraglide/runtime.js'
    import type { AccountView, TokenStatus } from '#lib/server/accounts.ts'

    let { account }: { account: Pick<AccountView, 'tokenStatus' | 'tokenExpiresAt'> } = $props()

    const states = {
        ok: { status: 'ok', icon: CircleCheckIcon, label: m.token_status_ok },
        expiring: { status: 'warning', icon: CircleAlertIcon, label: m.token_status_expiring },
        expired: { status: 'error', icon: CircleXIcon, label: m.token_status_expired },
        revoked: { status: 'error', icon: CircleXIcon, label: m.token_status_revoked }
    } satisfies Record<TokenStatus, { status: Status; icon: unknown; label: () => string }>

    const state = $derived(states[account.tokenStatus])
    const date = $derived(
        new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' }).format(account.tokenExpiresAt)
    )
</script>

<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
    <StatusBadge status={state.status} icon={state.icon} label={state.label()} />
    {#if account.tokenStatus !== 'revoked'}
        <span class="text-sm text-muted-foreground">{m.token_expires({ date })}</span>
    {/if}
</div>
