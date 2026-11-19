<script lang="ts" module>
    import MonitorIcon from '@lucide/svelte/icons/monitor'
    import MoonIcon from '@lucide/svelte/icons/moon'
    import SunIcon from '@lucide/svelte/icons/sun'
    import { m } from '#lib/paraglide/messages.js'

    /** The modes in the order the toggle cycles through them, with icon and translated name. */
    export const themes = [
        { mode: 'system', icon: MonitorIcon, label: m.theme_system },
        { mode: 'light', icon: SunIcon, label: m.theme_light },
        { mode: 'dark', icon: MoonIcon, label: m.theme_dark }
    ] as const
</script>

<script lang="ts">
    import { setMode, userPrefersMode } from 'mode-watcher'
    import { Button } from '#lib/components/ui/button/index.js'

    const index = $derived(
        Math.max(
            0,
            themes.findIndex((theme) => theme.mode === userPrefersMode.current)
        )
    )
    const current = $derived(themes[index])
    const next = $derived(themes[(index + 1) % themes.length])
    const label = $derived(m.theme_toggle({ current: current.label(), next: next.label() }))
</script>

<Button
    variant="ghost"
    size="icon"
    class="size-11 sm:size-9"
    aria-label={label}
    title={label}
    onclick={() => setMode(next.mode)}
>
    <current.icon class="size-5 sm:size-4" />
</Button>
