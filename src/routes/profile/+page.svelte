<script lang="ts">
    import { toast } from 'svelte-sonner'
    import { enhance } from '$app/forms'
    import NameForm from '#lib/components/name-form.svelte'
    import ShareLink from '#lib/components/share-link.svelte'
    import * as Card from '#lib/components/ui/card/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()
</script>

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
</div>
