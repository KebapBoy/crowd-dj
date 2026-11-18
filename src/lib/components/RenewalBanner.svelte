<script lang="ts">
    import { resolve } from '$app/paths'
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale } from '#lib/paraglide/runtime.js'
    import type { TokenStatus } from '#lib/server/accounts.ts'

    interface Renewal {
        kind: 'host' | 'player'
        name: string
        status: TokenStatus
        expiresAt: Date
    }

    let { renewals }: { renewals: Renewal[] } = $props()

    const format = (date: Date) =>
        new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long' }).format(date)
</script>

{#each renewals as renewal (renewal.kind)}
    <div class="banner" class:urgent={renewal.status !== 'expiring'} role="alert">
        <p>
            {#if renewal.status === 'expiring'}
                {m.renewal_expiring({ name: renewal.name, date: format(renewal.expiresAt) })}
            {:else}
                {m.renewal_expired({ name: renewal.name })}
            {/if}
            {renewal.kind === 'player' ? m.renewal_hint_player() : m.renewal_hint_host()}
        </p>
        <a
            class="button"
            href={renewal.kind === 'player'
                ? resolve('/auth/connect-player')
                : resolve('/auth/login')}
        >
            {renewal.kind === 'player' ? m.renewal_action_player() : m.renewal_action_host()}
        </a>
    </div>
{/each}

<style>
    .banner {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1rem;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        background: #fef0c7;
        color: #4e1d09;
        border-bottom: 2px solid #f79009;
        font-family: system-ui, sans-serif;
    }
    .urgent {
        background: #fee4e2;
        color: #55160c;
        border-bottom-color: #d92d20;
    }
    p {
        margin: 0;
        flex: 1 1 20rem;
    }
    .button {
        padding: 0.4rem 0.9rem;
        border-radius: 0.4rem;
        text-decoration: none;
        font-weight: 600;
        white-space: nowrap;
    }
    .button {
        background: #4e1d09;
        color: #fff;
    }
    .urgent .button {
        background: #b42318;
    }
</style>
