<script lang="ts">
    import { AlertDialogBackdrop, AlertDialogContent } from '@ui-sdk/svelte/alert-dialog'
    import type { ComponentProps } from 'svelte'
    import { backdropClasses, contentClasses } from '#lib/components/ui/dialog/classes.ts'
    import { cn } from '#lib/utils.js'

    let { class: className, ...restProps }: ComponentProps<typeof AlertDialogContent> = $props()
</script>

<AlertDialogBackdrop class={backdropClasses} />
<AlertDialogContent class={cn(contentClasses, 'max-w-xs sm:max-w-sm', className)} {...restProps} />
