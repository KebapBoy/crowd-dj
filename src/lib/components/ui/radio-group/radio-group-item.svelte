<script lang="ts">
    import { Radio, RadioIndicator } from '@ui-sdk/svelte/radio'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let { class: className, ...restProps }: ComponentProps<typeof Radio> = $props()
</script>

<Radio
    class={cn(
        'border-input dark:bg-input/30 data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary data-checked:border-primary focus-visible:border-ring focus-visible:ring-ring/50 peer relative flex aspect-square size-4 shrink-0 rounded-full border outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className
    )}
    {...restProps}
>
    <RadioIndicator
        class="bg-primary-foreground absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
    />
</Radio>
