<script lang="ts">
    import { enhance } from '$app/forms'
    import { resolve } from '$app/paths'
    import TokenStatus from '#lib/components/TokenStatus.svelte'
    import { m } from '#lib/paraglide/messages.js'
    import type { PageProps } from './$types'

    let { data }: PageProps = $props()
</script>

<svelte:head>
    <title>{m.account_title()} · {m.app_name()}</title>
</svelte:head>

<main>
    <p><a href={resolve('/')}>{m.app_name()}</a></p>
    <h1>{m.account_title()}</h1>

    {#if !data.host}
        <p>{m.host_intro()}</p>
        <p><a class="button" href={resolve('/auth/login')}>{m.sign_in_spotify()}</a></p>
    {:else}
        <section>
            <h2>{m.account_host_heading()}</h2>
            <div class="account">
                {#if data.host.imageUrl}<img src={data.host.imageUrl} alt="" />{/if}
                <div>
                    <strong>{data.host.displayName ?? data.host.id}</strong>
                    <div><TokenStatus account={data.host} /></div>
                </div>
            </div>
            <p class="hint">{m.account_renew_hint()}</p>
        </section>

        <section>
            <h2>{m.account_player_heading()}</h2>
            <p>{m.account_player_intro()}</p>
            {#if data.player}
                <div class="account">
                    {#if data.player.imageUrl}<img src={data.player.imageUrl} alt="" />{/if}
                    <div>
                        <strong>{data.player.displayName ?? data.player.id}</strong>
                        <div><TokenStatus account={data.player} /></div>
                    </div>
                </div>
                <div class="actions">
                    <a class="button" href={resolve('/auth/connect-player')}
                        >{m.account_player_swap()}</a
                    >
                    <form method="POST" action="?/removePlayer" use:enhance>
                        <button>{m.account_player_remove()}</button>
                    </form>
                </div>
            {:else}
                <p>{m.account_player_none()}</p>
                <p>
                    <a class="button" href={resolve('/auth/connect-player')}
                        >{m.account_player_connect()}</a
                    >
                </p>
            {/if}
            <p class="hint">{m.account_player_hint()}</p>
        </section>

        <section>
            <form method="POST" action="/auth/logout">
                <button>{m.sign_out()}</button>
            </form>
            <details>
                <summary>{m.account_delete()}</summary>
                <p>{m.account_delete_hint()}</p>
                <form method="POST" action="?/deleteAccount">
                    <button class="danger">{m.account_delete_confirm()}</button>
                </form>
            </details>
        </section>
    {/if}
</main>

<style>
    main {
        max-width: 40rem;
        margin: 0 auto;
        padding: 1rem;
        font-family: system-ui, sans-serif;
    }
    section {
        margin-block: 1.5rem;
    }
    .account {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        margin-block: 0.75rem;
    }
    .account img {
        width: 3rem;
        height: 3rem;
        border-radius: 50%;
        object-fit: cover;
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
    }
    .hint {
        color: #555;
        font-size: 0.9em;
    }
    details {
        margin-block: 1rem;
    }
    .danger {
        color: #b42318;
    }
</style>
