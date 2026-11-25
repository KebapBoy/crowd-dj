<script lang="ts">
    import { RadioGroup } from '@ui-sdk/svelte/radio'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let {
        class: className,
        value = $bindable(),
        ...restProps
    }: ComponentProps<typeof RadioGroup> = $props()
</script>

<RadioGroup bind:value class={cn('grid w-full gap-2', className)} {...restProps} />
