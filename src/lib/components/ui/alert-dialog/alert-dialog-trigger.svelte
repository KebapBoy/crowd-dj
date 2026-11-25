<script lang="ts">
    import { AlertDialogTrigger } from '@ui-sdk/svelte/alert-dialog'
    import type { ComponentProps } from 'svelte'
    import { buttonVariants, type ButtonLook } from '#lib/components/ui/button/index.js'
    import { cn } from '#lib/utils.js'

    let {
        class: className,
        variant = 'default',
        size = 'default',
        ...restProps
    }: ComponentProps<typeof AlertDialogTrigger> & ButtonLook = $props()
</script>

<AlertDialogTrigger class={cn(buttonVariants({ variant, size }), className)} {...restProps} />
