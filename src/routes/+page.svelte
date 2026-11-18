<script lang="ts">
    import { resolve } from '$app/paths'
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale, locales, setLocale } from '#lib/paraglide/runtime.js'
    import type { PageProps } from './$types'

    let { data }: PageProps = $props()
</script>

<svelte:head>
    <title>{m.app_name()}</title>
</svelte:head>

<main>
    <h1>{m.app_name()}</h1>
    <p>{m.tagline()}</p>

    <section>
        <h2>{m.host_heading()}</h2>
        {#if data.account}
            <p>{m.host_signed_in_as({ name: data.account.displayName ?? data.account.id })}</p>
            {#if data.account.isAdmin}
                <p>{m.host_status_admin()} <a href={resolve('/admin')}>{m.admin_link()}</a></p>
            {:else if data.account.approved}
                <p>{m.host_status_approved()}</p>
            {:else}
                <p>{m.host_status_pending()}</p>
            {/if}
            <form method="POST" action="/auth/logout">
                <button>{m.sign_out()}</button>
            </form>
        {:else}
            <p>{m.host_intro()}</p>
            <p><a href={resolve('/auth/login')}>{m.sign_in_spotify()}</a></p>
        {/if}
    </section>

    <nav aria-label={m.language()}>
        {#each locales as locale (locale)}
            <button
                type="button"
                disabled={locale === getLocale()}
                onclick={() => setLocale(locale)}
            >
                {locale}
            </button>
        {/each}
    </nav>
</main>
