<script lang="ts">
    import LogInIcon from '@lucide/svelte/icons/log-in'
    import PlayIcon from '@lucide/svelte/icons/play'
    import UserIcon from '@lucide/svelte/icons/user'
    import UserRoundIcon from '@lucide/svelte/icons/user-round'
    import { enhance } from '$app/forms'
    import { resolve } from '$app/paths'
    import * as Alert from '#lib/components/ui/alert/index.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Card from '#lib/components/ui/card/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    const touch = 'h-11 w-full sm:h-9 sm:w-auto'
</script>

<svelte:head>
    <title>{m.app_name()}</title>
</svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-6">
    <section class="flex flex-col gap-2 py-4 sm:py-8">
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{m.app_name()}</h1>
        <p class="text-lg text-balance text-muted-foreground">{m.tagline()}</p>
    </section>

    <Card.Root>
        <Card.Header>
            <Card.Title><h2>{m.participant_heading()}</h2></Card.Title>
            <Card.Description>
                {#if data.profile}
                    {m.participant_as({ name: data.profile.name })}
                {/if}
                {m.participant_intro()}
            </Card.Description>
        </Card.Header>
        <Card.Footer>
            <Button href={resolve('/profile')} variant="outline" class={touch}>
                <UserRoundIcon data-icon="inline-start" />
                {data.profile ? m.profile_title() : m.participant_choose_name()}
            </Button>
        </Card.Footer>
    </Card.Root>

    <Card.Root>
        <Card.Header>
            <Card.Title><h2>{m.host_heading()}</h2></Card.Title>
            <Card.Description>
                {#if data.account}
                    {m.host_signed_in_as({
                        name: data.account.displayName ?? data.account.id
                    })}
                    {#if data.openSession}{m.session_running()}{/if}
                {:else}
                    {m.host_intro()}
                {/if}
            </Card.Description>
        </Card.Header>
        {#if form?.startError}
            <Card.Content>
                <Alert.Root variant="destructive">
                    <Alert.Description>{form.startError}</Alert.Description>
                </Alert.Root>
            </Card.Content>
        {/if}
        <Card.Footer class="flex-col gap-2 sm:flex-row">
            {#if data.account}
                {#if data.openSession}
                    <Button href={resolve('/s/[id]', { id: data.openSession })} class={touch}>
                        <PlayIcon data-icon="inline-start" />
                        {m.session_open()}
                    </Button>
                {:else}
                    <form
                        method="POST"
                        action="?/startSession"
                        use:enhance
                        class="w-full sm:w-auto"
                    >
                        <Button type="submit" class={touch}>
                            <PlayIcon data-icon="inline-start" />
                            {m.session_start()}
                        </Button>
                    </form>
                {/if}
                <Button href={resolve('/account')} variant="outline" class={touch}>
                    <UserIcon data-icon="inline-start" />
                    {m.account_title()}
                </Button>
            {:else}
                <Button href={resolve('/auth/login')} class={touch}>
                    <LogInIcon data-icon="inline-start" />
                    {m.sign_in_spotify()}
                </Button>
            {/if}
        </Card.Footer>
    </Card.Root>
</div>
