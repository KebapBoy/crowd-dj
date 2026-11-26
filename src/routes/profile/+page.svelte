<script lang="ts">
    import ListMinusIcon from '@lucide/svelte/icons/list-minus'
    import UnlinkIcon from '@lucide/svelte/icons/unlink'
    import { toast } from '#lib/components/ui/toast/index.js'
    import { enhance } from '$app/forms'
    import { runAction } from '#lib/actions.ts'
    import NameForm from '#lib/components/name-form.svelte'
    import PoolList from '#lib/components/pool-list.svelte'
    import ShareLink from '#lib/components/share-link.svelte'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Card from '#lib/components/ui/card/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { TrackView } from '#lib/server/catalog.ts'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    let removing = $state<string | null>(null)

    async function remove(id: string) {
        removing = id
        await runAction('unpool', { track: id }, m.pool_removed())
        removing = null
    }
</script>

{#snippet removeButton(track: TrackView)}
    <Button
        variant="ghost"
        size="icon"
        class="size-11 shrink-0 sm:size-9"
        disabled={removing === track.id}
        aria-label={m.pool_remove_track({ title: track.title })}
        title={m.pool_remove_track({ title: track.title })}
        onclick={() => remove(track.id)}
    >
        <ListMinusIcon />
    </Button>
{/snippet}

<svelte:head>
    <title>{m.profile_title()} · {m.app_name()}</title>
</svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-4 sm:gap-6">
    <h1 class="text-2xl font-semibold tracking-tight">{m.profile_title()}</h1>

    <Card.Root>
        <Card.Header>
            {#if data.nameFromSpotify && data.profile}
                <Card.Title><h2>{data.profile.name}</h2></Card.Title>
                <Card.Description>{m.profile_name_from_spotify()}</Card.Description>
            {:else}
                <Card.Description>{m.profile_intro()}</Card.Description>
            {/if}
        </Card.Header>
        {#if !data.nameFromSpotify}
            <Card.Content>
                <form
                    method="POST"
                    action="?/save"
                    use:enhance={() => {
                        const created = !data.profile
                        return async ({ result, update }) => {
                            if (result.type === 'success')
                                toast.success(created ? m.profile_created() : m.profile_renamed())
                            if (result.type === 'failure' && result.data?.tooManyProfiles)
                                toast.error(m.profile_too_many())
                            await update({ reset: false })
                        }
                    }}
                >
                    <NameForm
                        name={data.profile?.name ?? ''}
                        invalid={form?.invalid}
                        submit={data.profile ? m.save() : m.profile_create()}
                    />
                </form>
            </Card.Content>
        {/if}
    </Card.Root>

    {#if data.profile}
        <Card.Root>
            <Card.Header>
                <Card.Title><h2>{m.profile_spotify_heading()}</h2></Card.Title>
                <Card.Description>{m.profile_spotify_intro()}</Card.Description>
            </Card.Header>
            <Card.Content class="flex flex-col gap-3">
                {#if data.nameFromSpotify}
                    <p class="text-sm">
                        {data.profile.spotifyUserId
                            ? m.profile_spotify_from_account()
                            : m.profile_spotify_other_device()}
                    </p>
                {:else if data.profile.spotifyUserId}
                    <p class="text-sm">
                        {m.profile_spotify_linked({ user: data.profile.spotifyUserId })}
                    </p>
                    <form
                        method="POST"
                        action="?/unlinkSpotify"
                        use:enhance={() =>
                            async ({ result, update }) => {
                                if (result.type === 'success')
                                    toast.success(m.profile_spotify_unlinked())
                                else toast.error(m.action_failed())
                                await update()
                            }}
                    >
                        <Button
                            type="submit"
                            variant="outline"
                            class="h-11 w-full sm:h-8 sm:w-auto"
                        >
                            <UnlinkIcon data-icon="inline-start" />
                            {m.profile_spotify_unlink()}
                        </Button>
                    </form>
                {:else}
                    <form
                        method="POST"
                        action="?/linkSpotify"
                        class="flex flex-col gap-2"
                        use:enhance={() =>
                            async ({ result, update }) => {
                                if (result.type === 'success')
                                    toast.success(m.profile_spotify_saved())
                                else if (
                                    result.type === 'failure' &&
                                    typeof result.data?.error === 'string'
                                )
                                    toast.error(result.data.error)
                                else if (result.type !== 'failure') toast.error(m.action_failed())
                                await update({ reset: false })
                            }}
                    >
                        <Label for="profile-spotify">{m.profile_spotify_label()}</Label>
                        <p class="text-sm text-muted-foreground">{m.profile_spotify_steps()}</p>
                        <div class="flex flex-col gap-2 sm:flex-row">
                            <Input
                                id="profile-spotify"
                                name="spotify"
                                inputmode="url"
                                required
                                placeholder="https://open.spotify.com/user/…"
                                aria-invalid={form?.spotifyInvalid || undefined}
                                aria-describedby={form?.spotifyInvalid
                                    ? 'profile-spotify-error'
                                    : undefined}
                                class="h-11 sm:h-8"
                            />
                            <Button type="submit" class="h-11 sm:h-8">{m.save()}</Button>
                        </div>
                        {#if form?.spotifyInvalid}
                            <p id="profile-spotify-error" class="text-sm text-destructive">
                                {m.profile_spotify_invalid()}
                            </p>
                        {/if}
                    </form>
                {/if}
            </Card.Content>
        </Card.Root>
    {/if}

    {#if data.deviceLink}
        <!-- The personal link is the profile's key: kept from agents in the browser -->
        <Card.Root data-agent-hidden>
            <Card.Header>
                <Card.Title><h2>{m.profile_devices_heading()}</h2></Card.Title>
                <Card.Description>{m.profile_devices_intro()}</Card.Description>
            </Card.Header>
            <Card.Content>
                <ShareLink url={data.deviceLink} title={m.profile_title()} />
            </Card.Content>
        </Card.Root>
    {/if}

    {#if data.profile}
        <Card.Root>
            <Card.Header>
                <Card.Title><h2>{m.pool_tab({ count: data.pool.length })}</h2></Card.Title>
                <Card.Description>{m.profile_pool_intro()}</Card.Description>
            </Card.Header>
            <Card.Content>
                <PoolList pool={data.pool} trackActions={removeButton} />
            </Card.Content>
        </Card.Root>
    {/if}
</div>
