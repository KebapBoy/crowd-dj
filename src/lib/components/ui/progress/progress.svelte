<script lang="ts">
    import { Progress, ProgressIndicator, ProgressTrack } from '@ui-sdk/svelte/progress'
    import type { ComponentProps } from 'svelte'
    import { cn } from '#lib/utils.js'

    let { class: className, ...restProps }: ComponentProps<typeof Progress> = $props()
</script>

<Progress class={cn('flex w-full items-center', className)} {...restProps}>
    <ProgressTrack class="bg-muted relative h-1 w-full overflow-hidden rounded-full">
        <ProgressIndicator class="bg-primary absolute inset-y-0 transition-[width]" />
    </ProgressTrack>
</Progress>
