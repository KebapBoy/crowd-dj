<script lang="ts">
    import { Label } from '@ui-sdk/svelte/label'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let { class: className, ...restProps }: ComponentProps<typeof Label> = $props()
</script>

<Label
    class={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className
    )}
    {...restProps}
/>
