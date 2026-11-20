<script lang="ts">
    import ListMinusIcon from '@lucide/svelte/icons/list-minus'
    import { toast } from 'svelte-sonner'
    import { enhance } from '$app/forms'
    import { runAction } from '#lib/actions.ts'
    import NameForm from '#lib/components/name-form.svelte'
    import PoolList from '#lib/components/pool-list.svelte'
    import ShareLink from '#lib/components/share-link.svelte'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Card from '#lib/components/ui/card/index.js'
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
            <Card.Description>{m.profile_intro()}</Card.Description>
        </Card.Header>
        <Card.Content>
            <form
                method="POST"
                action="?/save"
                use:enhance={() => {
                    const created = !data.profile
                    return async ({ result, update }) => {
                        if (result.type === 'success')
                            toast.success(created ? m.profile_created() : m.profile_renamed())
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
    </Card.Root>

    {#if data.deviceLink}
        <Card.Root>
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
