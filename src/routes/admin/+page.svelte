<script lang="ts">
    import { enhance } from '$app/forms'
    import TokenStatus from '#lib/components/TokenStatus.svelte'
    import { resolve } from '$app/paths'
    import { m } from '#lib/paraglide/messages.js'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()
</script>

<svelte:head>
    <title>{m.admin_title()} · {m.app_name()}</title>
</svelte:head>

<main>
    <p><a href={resolve('/')}>{m.app_name()}</a></p>
    <h1>{m.admin_title()}</h1>

    {#if !data.signedIn}
        <p>{m.admin_sign_in_intro()}</p>
        <p><a class="button" href={resolve('/auth/login')}>{m.sign_in_spotify()}</a></p>
    {:else}
        {#if form?.message}
            <p role="alert" class="error">{form.message}</p>
        {/if}

        <section>
            <h2>{m.admin_room_heading()}</h2>
            <p>{m.admin_room_intro()}</p>
            {#if data.room}
                <div class="account">
                    {#if data.room.imageUrl}<img src={data.room.imageUrl} alt="" />{/if}
                    <div>
                        <strong>{data.room.displayName ?? data.room.id}</strong>
                        <div><TokenStatus account={data.room} /></div>
                    </div>
                </div>
                <div class="actions">
                    <a class="button" href={resolve('/auth/connect-room')}>{m.admin_room_swap()}</a>
                    <form method="POST" action="?/disconnectRoom" use:enhance>
                        <button>{m.admin_room_disconnect()}</button>
                    </form>
                </div>
            {:else}
                <p>{m.admin_room_none()}</p>
                <p>
                    <a class="button" href={resolve('/auth/connect-room')}
                        >{m.admin_room_connect()}</a
                    >
                </p>
            {/if}
            <p class="hint">{m.admin_room_hint()}</p>
        </section>

        <section>
            <h2>{m.admin_hosts_heading()}</h2>
            <p>{m.admin_hosts_intro()}</p>
            {#if data.hosts.length === 0}
                <p>{m.admin_hosts_none()}</p>
            {:else}
                <ul>
                    {#each data.hosts as host (host.id)}
                        <li class="account">
                            {#if host.imageUrl}<img src={host.imageUrl} alt="" />{/if}
                            <div>
                                <strong>{host.displayName ?? host.id}</strong>
                                <span class="role">
                                    {host.isAdmin
                                        ? m.admin_role_admin()
                                        : host.approved
                                          ? m.admin_role_approved()
                                          : m.admin_role_pending()}
                                </span>
                                <div><TokenStatus account={host} /></div>
                                {#if !host.isAdmin}
                                    <div class="actions">
                                        <form
                                            method="POST"
                                            action={host.approved ? '?/unapprove' : '?/approve'}
                                            use:enhance
                                        >
                                            <input type="hidden" name="account" value={host.id} />
                                            <button
                                                >{host.approved
                                                    ? m.admin_unapprove()
                                                    : m.admin_approve()}</button
                                            >
                                        </form>
                                        <form method="POST" action="?/remove" use:enhance>
                                            <input type="hidden" name="account" value={host.id} />
                                            <button title={m.admin_remove_hint()}
                                                >{m.admin_remove()}</button
                                            >
                                        </form>
                                    </div>
                                {/if}
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>

        <form method="POST" action="/auth/logout">
            <button>{m.sign_out()}</button>
        </form>
    {/if}
</main>

<style>
    main {
        max-width: 40rem;
        margin: 0 auto;
        padding: 1rem;
        font-family: system-ui, sans-serif;
    }
    ul {
        list-style: none;
        padding: 0;
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
    .role {
        margin-inline-start: 0.5rem;
        color: #555;
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        margin-block: 0.5rem;
    }
    .hint {
        color: #555;
        font-size: 0.9em;
    }
    .error {
        color: #b42318;
    }
</style>
