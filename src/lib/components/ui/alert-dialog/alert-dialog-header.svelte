<script lang="ts">
    import type { HTMLAttributes } from 'svelte/elements'
    import Div from '#lib/components/ui/dialog/div.svelte'

    let props: HTMLAttributes<HTMLDivElement> = $props()
</script>

<Div
    base="grid place-items-center gap-1.5 text-center sm:place-items-start sm:text-left"
    data-slot="alert-dialog-header"
    {...props}
/>
