<script lang="ts">
    import { Input } from '@ui-sdk/svelte/input'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let {
        class: className,
        value = $bindable(),
        ...restProps
    }: ComponentProps<typeof Input> = $props()
</script>

<Input
    bind:value
    class={cn(
        'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 data-disabled:bg-input/50 dark:data-disabled:bg-input/80 placeholder:text-muted-foreground h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:ring-3 aria-invalid:ring-3 data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 md:text-sm',
        className
    )}
    {...restProps}
/>
