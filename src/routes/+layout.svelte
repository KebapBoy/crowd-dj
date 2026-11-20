<script lang="ts">
    import '../app.css'
    import UserRoundIcon from '@lucide/svelte/icons/user-round'
    import { ModeWatcher } from 'mode-watcher'
    import { resolve } from '$app/paths'
    import favicon from '#lib/assets/favicon.svg'
    import LocaleSwitch from '#lib/components/locale-switch.svelte'
    import RenewalBanner from '#lib/components/renewal-banner.svelte'
    import ThemeToggle from '#lib/components/theme-toggle.svelte'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Separator } from '#lib/components/ui/separator/index.js'
    import { Toaster } from '#lib/components/ui/sonner/index.js'
    import * as Tooltip from '#lib/components/ui/tooltip/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { LayoutProps } from './$types'

    let { children, data }: LayoutProps = $props()
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

<!-- The dark class is set before the first paint by the script in app.html -->
<ModeWatcher disableHeadScriptInjection />
<Toaster position="bottom-right" closeButton />

<Tooltip.Provider delayDuration={300}>
    <header class="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:h-12">
            <a
                href={resolve('/')}
                class="font-semibold tracking-tight"
                aria-label={m.home({ app: m.app_name() })}
            >
                {m.app_name()}
            </a>
            <Separator orientation="vertical" class="data-vertical:h-4 data-vertical:self-center" />
            <span
                class="text-xs text-muted-foreground"
                title={m.version({ version: __APP_VERSION__ })}
            >
                {__APP_VERSION__}
            </span>
            <div class="ml-auto flex items-center gap-1">
                <Button
                    href={resolve('/profile')}
                    variant="ghost"
                    class="h-11 max-w-40 gap-1.5 px-3 sm:h-9 sm:px-2.5"
                    aria-label={m.profile_title()}
                    title={m.profile_title()}
                >
                    <UserRoundIcon class="size-5 sm:size-4" />
                    {#if data.profile}
                        <span class="hidden truncate sm:inline">{data.profile.name}</span>
                    {/if}
                </Button>
                <LocaleSwitch />
                <ThemeToggle />
            </div>
        </div>
    </header>

    <RenewalBanner renewals={data.renewals} />

    <main class="mx-auto max-w-6xl px-4 py-4 sm:py-6">
        {@render children()}
    </main>
</Tooltip.Provider>
