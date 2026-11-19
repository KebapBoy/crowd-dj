<script lang="ts">
    import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert'
    import { resolve } from '$app/paths'
    import * as Alert from '#lib/components/ui/alert/index.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale } from '#lib/paraglide/runtime.js'
    import type { TokenStatus } from '#lib/server/accounts.ts'
    import { cn } from '#lib/utils.ts'

    interface Renewal {
        kind: 'host' | 'player'
        name: string
        status: TokenStatus
        expiresAt: Date
    }

    let { renewals }: { renewals: Renewal[] } = $props()

    const format = (date: Date) =>
        new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long' }).format(date)
</script>

{#if renewals.length > 0}
    <div class="mx-auto flex max-w-6xl flex-col gap-2 px-4 pt-4">
        {#each renewals as renewal (renewal.kind)}
            {@const expiring = renewal.status === 'expiring'}
            <Alert.Root
                variant={expiring ? 'default' : 'destructive'}
                class={cn(
                    'flex flex-col gap-3 sm:flex-row sm:items-center',
                    expiring && 'border-amber-500/50 text-amber-700 dark:text-amber-400'
                )}
            >
                <div class="flex flex-1 gap-2">
                    <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
                    <div class="grid gap-0.5">
                        <Alert.Title>
                            {expiring
                                ? m.renewal_expiring({
                                      name: renewal.name,
                                      date: format(renewal.expiresAt)
                                  })
                                : m.renewal_expired({ name: renewal.name })}
                        </Alert.Title>
                        <Alert.Description class="text-current/80">
                            {renewal.kind === 'player'
                                ? m.renewal_hint_player()
                                : m.renewal_hint_host()}
                        </Alert.Description>
                    </div>
                </div>
                <Button
                    href={renewal.kind === 'player'
                        ? resolve('/auth/connect-player')
                        : resolve('/auth/login')}
                    variant={expiring ? 'outline' : 'destructive'}
                    class="h-11 sm:h-8"
                >
                    {renewal.kind === 'player'
                        ? m.renewal_action_player()
                        : m.renewal_action_host()}
                </Button>
            </Alert.Root>
        {/each}
    </div>
{/if}
