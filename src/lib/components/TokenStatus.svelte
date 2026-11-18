<script lang="ts">
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale } from '#lib/paraglide/runtime.js'
    import type { AccountView } from '#lib/server/accounts.ts'

    let { account }: { account: Pick<AccountView, 'tokenStatus' | 'tokenExpiresAt'> } = $props()

    const label = $derived(
        {
            ok: m.token_status_ok,
            expiring: m.token_status_expiring,
            expired: m.token_status_expired,
            revoked: m.token_status_revoked
        }[account.tokenStatus]()
    )
    const date = $derived(
        new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' }).format(account.tokenExpiresAt)
    )
</script>

<span class="status" class:warn={account.tokenStatus !== 'ok'}>{label}</span>
{#if account.tokenStatus !== 'revoked'}
    <span class="expires">{m.token_expires({ date })}</span>
{/if}

<style>
    .status {
        font-weight: 600;
    }
    .warn {
        color: #b42318;
    }
    .expires {
        color: #555;
    }
</style>
