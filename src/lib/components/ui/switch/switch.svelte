<script lang="ts">
    import { Switch, SwitchThumb } from '@ui-sdk/svelte/switch'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let {
        class: className,
        checked = $bindable(false),
        ...restProps
    }: ComponentProps<typeof Switch> = $props()
</script>

<Switch
    bind:checked
    class={cn(
        'data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 focus-visible:border-ring focus-visible:ring-ring/50 peer group/switch relative inline-flex h-[18.4px] w-[32px] shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className
    )}
    {...restProps}
>
    <SwitchThumb
        class="bg-background dark:data-unchecked:bg-foreground dark:data-checked:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-checked:translate-x-[calc(100%_-_2px)] data-unchecked:translate-x-0 rtl:data-checked:translate-x-[calc(-100%_+_2px)]"
    />
</Switch>
