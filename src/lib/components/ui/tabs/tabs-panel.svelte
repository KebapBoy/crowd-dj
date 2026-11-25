<script lang="ts">
    import { TabsPanel } from '@ui-sdk/svelte/tabs'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let { class: className, ...restProps }: ComponentProps<typeof TabsPanel> = $props()
</script>

<TabsPanel class={cn('flex-1 text-sm outline-none', className)} {...restProps} />
