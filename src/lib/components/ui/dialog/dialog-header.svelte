<script lang="ts">
    import type { HTMLAttributes } from 'svelte/elements'
    import Div from './div.svelte'
    import { headerClasses } from './classes.ts'

    let props: HTMLAttributes<HTMLDivElement> = $props()
</script>

<Div base={headerClasses} data-slot="dialog-header" {...props} />
