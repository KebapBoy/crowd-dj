<script lang="ts">
    import { MenuTrigger } from '@ui-sdk/svelte/menu'
    import type { ComponentProps } from 'svelte'
    import { buttonVariants, type ButtonLook } from '#lib/components/ui/button/index.js'
    import { cn } from '#lib/utils.js'

    let {
        class: className,
        variant = 'default',
        size = 'default',
        ...restProps
    }: ComponentProps<typeof MenuTrigger> & ButtonLook = $props()
</script>

<MenuTrigger class={cn(buttonVariants({ variant, size }), className)} {...restProps} />
