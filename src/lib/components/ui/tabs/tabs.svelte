<script lang="ts">
    import { Tabs } from '@ui-sdk/svelte/tabs'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let {
        class: className,
        value = $bindable(),
        ...restProps
    }: ComponentProps<typeof Tabs> = $props()
</script>

<Tabs
    bind:value
    class={cn('group/tabs flex gap-2 data-horizontal:flex-col', className)}
    {...restProps}
/>
