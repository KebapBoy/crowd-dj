<script lang="ts">
    import { AlertDialogClose } from '@ui-sdk/svelte/alert-dialog'
    import type { ComponentProps } from 'svelte'
    import { buttonVariants, type ButtonLook } from '#lib/components/ui/button/index.js'
    import { cn } from '#lib/utils.js'

    /** The answer that closes the dialog without doing anything. */
    let {
        class: className,
        variant = 'outline',
        size = 'default',
        ...restProps
    }: ComponentProps<typeof AlertDialogClose> & ButtonLook = $props()
</script>

<AlertDialogClose class={cn(buttonVariants({ variant, size }), className)} {...restProps} />
