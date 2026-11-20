<script lang="ts">
    import QrCodeIcon from '@lucide/svelte/icons/qr-code'
    import SpeakerIcon from '@lucide/svelte/icons/speaker'
    import SquareIcon from '@lucide/svelte/icons/square'
    import { onMount } from 'svelte'
    import { toast } from 'svelte-sonner'
    import { enhance } from '$app/forms'
    import { invalidateAll } from '$app/navigation'
    import CatalogSearch from '#lib/components/catalog-search.svelte'
    import NameForm from '#lib/components/name-form.svelte'
    import PoolList from '#lib/components/pool-list.svelte'
    import SessionSettings from '#lib/components/session-settings.svelte'
    import ShareLink from '#lib/components/share-link.svelte'
    import StatusBadge from '#lib/components/status-badge.svelte'
    import TrackActions from '#lib/components/track-actions.svelte'
    import WishList from '#lib/components/wish-list.svelte'
    import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js'
    import * as Avatar from '#lib/components/ui/avatar/index.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Card from '#lib/components/ui/card/index.js'
    import * as Dialog from '#lib/components/ui/dialog/index.js'
    import * as Tabs from '#lib/components/ui/tabs/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { TrackView } from '#lib/server/catalog.ts'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    const HEARTBEAT_MS = 5 * 60 * 1000

    let endOpen = $state(false)
    let tab = $state('search')
    let busy = $state(false)

    const title = $derived(m.session_title({ host: data.session.hostName }))
    const poolIds = $derived(new Set(data.pool.map((entry) => entry.track.id)))
    const wishedIds = $derived(new Set(data.wishes.map((wish) => wish.track.id)))
    const openWishes = $derived(data.wishes.filter((wish) => !wish.playedAt).length)
    const canWish = $derived(data.session.mode !== 'pool_only')

    /** First character, whole even when it is an emoji. */
    const initial = (name: string) => (Array.from(name)[0] ?? '').toUpperCase()

    // Until live updates exist, an open page reloads its data now and then: that keeps the session
    // from ending as idle while people look at it, and shows who joined meanwhile
    onMount(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') invalidateAll()
        }, HEARTBEAT_MS)
        return () => clearInterval(timer)
    })
</script>

{#snippet trackActions(track: TrackView)}
    <TrackActions
        id={track.id}
        title={track.title}
        inPool={poolIds.has(track.id)}
        wished={wishedIds.has(track.id)}
        {canWish}
    />
{/snippet}

{#snippet note(text: string)}
    <p class="text-sm text-muted-foreground">{text}</p>
{/snippet}

<svelte:head>
    <title>{title} · {m.app_name()}</title>
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-4 sm:gap-6">
    <div class="flex items-start justify-between gap-3">
        <div class="grid min-w-0 gap-1">
            <h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
                <SpeakerIcon class="size-4 shrink-0" />
                <span class="truncate">
                    {m.session_plays_through({ account: data.session.playingName })}
                </span>
            </p>
        </div>
        <Dialog.Root>
            <Dialog.Trigger>
                {#snippet child({ props })}
                    <Button {...props} variant="outline" class="h-11 shrink-0 sm:h-8">
                        <QrCodeIcon data-icon="inline-start" />
                        {m.session_invite()}
                    </Button>
                {/snippet}
            </Dialog.Trigger>
            <Dialog.Content>
                <Dialog.Header>
                    <Dialog.Title>{title}</Dialog.Title>
                    <Dialog.Description>{m.session_invite_intro()}</Dialog.Description>
                </Dialog.Header>
                <ShareLink url={data.session.joinUrl} {title} />
            </Dialog.Content>
        </Dialog.Root>
    </div>

    {#if !data.profile}
        <Card.Root>
            <Card.Header>
                <Card.Title><h2>{m.session_join_heading()}</h2></Card.Title>
                <Card.Description>{m.session_join_intro()}</Card.Description>
            </Card.Header>
            <Card.Content>
                <form
                    method="POST"
                    action="?/join"
                    use:enhance={() =>
                        async ({ result, update }) => {
                            if (result.type === 'success') toast.success(m.session_joined())
                            await update({ reset: false })
                        }}
                >
                    <NameForm
                        name={data.suggestedName}
                        invalid={form?.invalidName}
                        submit={m.session_join()}
                    />
                </form>
            </Card.Content>
        </Card.Root>
    {:else}
        <Card.Root>
            <Card.Header>
                <Card.Title><h2>{m.music_heading()}</h2></Card.Title>
            </Card.Header>
            <Card.Content>
                <Tabs.Root bind:value={tab} class="gap-4">
                    <Tabs.List
                        class="w-full group-data-horizontal/tabs:h-11 sm:group-data-horizontal/tabs:h-8"
                    >
                        <Tabs.Trigger value="search">{m.search()}</Tabs.Trigger>
                        <Tabs.Trigger value="wishes">
                            {m.wishes_tab({ count: openWishes })}
                        </Tabs.Trigger>
                        <Tabs.Trigger value="pool">
                            {m.pool_tab({ count: data.pool.length })}
                        </Tabs.Trigger>
                    </Tabs.List>
                    <Tabs.Content value="search">
                        <CatalogSearch sessionId={data.session.id} {trackActions} />
                    </Tabs.Content>
                    <Tabs.Content value="wishes" class="flex flex-col gap-4">
                        {#if !canWish}
                            {@render note(m.wish_mode_pool_only())}
                        {:else}
                            {@render note(m.wishes_intro())}
                            {#if data.session.maxOpenWishes !== null}
                                {@render note(
                                    m.wishes_open_of({
                                        count: openWishes,
                                        max: data.session.maxOpenWishes
                                    })
                                )}
                            {/if}
                            {#if data.session.maxSessionWishes !== null}
                                {@render note(
                                    m.wishes_session_of({
                                        count: data.wishes.length,
                                        max: data.session.maxSessionWishes
                                    })
                                )}
                            {/if}
                        {/if}
                        <WishList wishes={data.wishes} />
                    </Tabs.Content>
                    <Tabs.Content value="pool" class="flex flex-col gap-4">
                        {@render note(
                            data.session.mode === 'wishes_only'
                                ? m.pool_mode_wishes_only()
                                : m.pool_intro()
                        )}
                        {#if data.session.maxPoolSize !== null && data.session.mode !== 'wishes_only'}
                            {@render note(m.pool_limit({ count: data.session.maxPoolSize }))}
                        {/if}
                        <PoolList
                            pool={data.pool}
                            limit={data.session.mode === 'wishes_only'
                                ? null
                                : data.session.maxPoolSize}
                            {trackActions}
                        />
                    </Tabs.Content>
                </Tabs.Root>
            </Card.Content>
        </Card.Root>

        <Card.Root>
            <Card.Header>
                <Card.Title>
                    <h2>{m.session_members({ count: data.members.length })}</h2>
                </Card.Title>
            </Card.Header>
            <Card.Content>
                {#if data.members.length === 0}
                    <p class="text-sm text-muted-foreground">{m.session_members_none()}</p>
                {:else}
                    <ul class="flex flex-col gap-2">
                        {#each data.members as member (member.id)}
                            <li class="flex items-center gap-3">
                                <Avatar.Root>
                                    <Avatar.Fallback>
                                        {initial(member.name)}
                                    </Avatar.Fallback>
                                </Avatar.Root>
                                <span class="truncate">{member.name}</span>
                                {#if member.id === data.profile.id}
                                    <StatusBadge status="neutral" label={m.you()} />
                                {/if}
                            </li>
                        {/each}
                    </ul>
                {/if}
            </Card.Content>
        </Card.Root>
    {/if}

    {#if data.settings}
        <Card.Root>
            <Card.Header>
                <Card.Title><h2>{m.session_settings()}</h2></Card.Title>
            </Card.Header>
            <Card.Content>
                <SessionSettings settings={data.settings} />
            </Card.Content>
        </Card.Root>

        <Card.Root class="ring-destructive/30">
            <Card.Header>
                <Card.Title><h2>{m.session_end()}</h2></Card.Title>
                <Card.Description>{m.session_end_hint()}</Card.Description>
            </Card.Header>
            <Card.Footer>
                <AlertDialog.Root bind:open={endOpen}>
                    <AlertDialog.Trigger>
                        {#snippet child({ props })}
                            <Button
                                {...props}
                                variant="destructive"
                                class="h-11 w-full sm:h-8 sm:w-auto"
                            >
                                <SquareIcon data-icon="inline-start" />
                                {m.session_end()}
                            </Button>
                        {/snippet}
                    </AlertDialog.Trigger>
                    <AlertDialog.Content>
                        <AlertDialog.Header>
                            <AlertDialog.Title>{m.session_end_title()}</AlertDialog.Title>
                            <AlertDialog.Description>{m.session_end_hint()}</AlertDialog.Description
                            >
                        </AlertDialog.Header>
                        <form
                            method="POST"
                            action="?/end"
                            use:enhance={() => {
                                busy = true
                                return async ({ result, update }) => {
                                    busy = false
                                    endOpen = false
                                    if (result.type === 'redirect')
                                        toast.success(m.session_ended_toast())
                                    else toast.error(m.action_failed())
                                    await update()
                                }
                            }}
                        >
                            <AlertDialog.Footer>
                                <AlertDialog.Cancel type="button" class="h-11 sm:h-8">
                                    {m.cancel()}
                                </AlertDialog.Cancel>
                                <Button
                                    type="submit"
                                    variant="destructive"
                                    class="h-11 sm:h-8"
                                    disabled={busy}
                                >
                                    {m.session_end()}
                                </Button>
                            </AlertDialog.Footer>
                        </form>
                    </AlertDialog.Content>
                </AlertDialog.Root>
            </Card.Footer>
        </Card.Root>
    {/if}
</div>
