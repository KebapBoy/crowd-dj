<script lang="ts" module>
    import type { Component } from 'svelte'

    /** Kinds of state, each with the same colors everywhere in the app. */
    export type Status = 'ok' | 'warning' | 'error' | 'neutral'

    const classes: Record<Status, string> = {
        ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
        warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
        error: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
        neutral: 'bg-muted text-muted-foreground'
    }
</script>

<script lang="ts">
    import { Badge } from '#lib/components/ui/badge/index.js'
    import { cn } from '#lib/utils.ts'

    let {
        status,
        label,
        icon: Icon,
        class: className
    }: { status: Status; label: string; icon?: Component; class?: string } = $props()
</script>

<Badge variant="secondary" class={cn('h-6 px-2.5', classes[status], className)}>
    {#if Icon}<Icon data-icon="inline-start" />{/if}
    {label}
</Badge>
