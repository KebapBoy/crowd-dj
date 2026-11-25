<script lang="ts">
    import { TabsList } from '@ui-sdk/svelte/tabs'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let { class: className, ...restProps }: ComponentProps<typeof TabsList> = $props()
</script>

<TabsList
    class={cn(
        'bg-muted text-muted-foreground inline-flex w-fit items-center justify-center rounded-lg p-[3px] group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col',
        className
    )}
    {...restProps}
/>
