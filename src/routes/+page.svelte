<script lang="ts">
    import LogInIcon from '@lucide/svelte/icons/log-in'
    import UserIcon from '@lucide/svelte/icons/user'
    import { resolve } from '$app/paths'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Card from '#lib/components/ui/card/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { PageProps } from './$types'

    let { data }: PageProps = $props()
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
            <Card.Title><h2>{m.host_heading()}</h2></Card.Title>
            <Card.Description>
                {#if data.account}
                    {m.host_signed_in_as({
                        name: data.account.displayName ?? data.account.id
                    })}
                {:else}
                    {m.host_intro()}
                {/if}
            </Card.Description>
        </Card.Header>
        <Card.Footer>
            {#if data.account}
                <Button href={resolve('/account')} class="h-11 w-full sm:h-9 sm:w-auto">
                    <UserIcon data-icon="inline-start" />
                    {m.account_title()}
                </Button>
            {:else}
                <Button href={resolve('/auth/login')} class="h-11 w-full sm:h-9 sm:w-auto">
                    <LogInIcon data-icon="inline-start" />
                    {m.sign_in_spotify()}
                </Button>
            {/if}
        </Card.Footer>
    </Card.Root>
</div>
