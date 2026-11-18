<script lang="ts">
    import { page } from '$app/state'
    import { resolve } from '$app/paths'
    import { m } from '#lib/paraglide/messages.js'
</script>

<svelte:head>
    <title>{page.status} · {m.app_name()}</title>
</svelte:head>

<main>
    <h1>{page.status}</h1>
    <p>{page.error?.message}</p>
    <p><a href={resolve('/')}>{m.back_home()}</a></p>
</main>
