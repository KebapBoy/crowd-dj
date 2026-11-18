<script lang="ts">
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale, locales, setLocale } from '#lib/paraglide/runtime.js'
</script>

<svelte:head>
    <title>{m.app_name()}</title>
</svelte:head>

<main>
    <h1>{m.app_name()}</h1>
    <p>{m.tagline()}</p>

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
