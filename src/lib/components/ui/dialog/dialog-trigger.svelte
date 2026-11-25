<script lang="ts">
    import { DialogTrigger } from '@ui-sdk/svelte/dialog'
    import type { ComponentProps } from 'svelte'
    import { buttonVariants, type ButtonLook } from '#lib/components/ui/button/index.js'
    import { cn } from '#lib/utils.js'

    let {
        class: className,
        variant = 'default',
        size = 'default',
        ...restProps
    }: ComponentProps<typeof DialogTrigger> & ButtonLook = $props()
</script>

<DialogTrigger class={cn(buttonVariants({ variant, size }), className)} {...restProps} />
