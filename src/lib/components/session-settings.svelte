<script lang="ts">
    import { untrack } from 'svelte'
    import { toast } from '#lib/components/ui/toast/index.js'
    import { enhance } from '$app/forms'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as RadioGroup from '#lib/components/ui/radio-group/index.js'
    import { Separator } from '#lib/components/ui/separator/index.js'
    import { Switch } from '#lib/components/ui/switch/index.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { SessionSettings } from '#lib/server/sessions.ts'

    /** The host's form for a session's settings. */
    let { settings }: { settings: SessionSettings } = $props()

    // The vote thresholds are disabled (and so not sent) while voting is off
    let skipVoting = $state(untrack(() => settings.skipVoting))
    let busy = $state(false)

    const modes = [
        {
            value: 'wishes_first',
            label: m.session_mode_wishes_first,
            hint: m.session_mode_wishes_first_hint
        },
        {
            value: 'pool_only',
            label: m.session_mode_pool_only,
            hint: m.session_mode_pool_only_hint
        },
        {
            value: 'wishes_only',
            label: m.session_mode_wishes_only,
            hint: m.session_mode_wishes_only_hint
        }
    ] as const

    const limits = [
        { name: 'maxOpenWishes', label: m.session_max_open_wishes },
        { name: 'maxSessionWishes', label: m.session_max_session_wishes },
        { name: 'maxPoolSize', label: m.session_max_pool_size }
    ] as const

    const number = 'h-11 w-24 sm:h-8'
</script>

<form
    method="POST"
    action="?/settings"
    class="flex flex-col gap-5"
    use:enhance={() => {
        busy = true
        return async ({ result, update }) => {
            busy = false
            if (result.type === 'success') toast.success(m.session_settings_saved())
            else if (result.type === 'failure')
                toast.error(String(result.data?.settingsError ?? m.action_failed()))
            else toast.error(m.action_failed())
            await update({ reset: false })
        }
    }}
>
    <fieldset class="flex flex-col gap-3">
        <legend class="mb-3 font-medium">{m.session_mode()}</legend>
        <RadioGroup.Root name="mode" value={settings.mode} class="gap-1">
            {#each modes as mode (mode.value)}
                <Label
                    class="flex cursor-pointer items-start gap-3 rounded-lg p-2 font-normal hover:bg-muted/50"
                >
                    <RadioGroup.Item value={mode.value} class="mt-0.5" />
                    <span class="grid gap-0.5">
                        <span class="font-medium">{mode.label()}</span>
                        <span class="text-muted-foreground">{mode.hint()}</span>
                    </span>
                </Label>
            {/each}
        </RadioGroup.Root>
    </fieldset>

    <Separator />

    <Label class="flex cursor-pointer items-start justify-between gap-4 font-normal">
        <span class="grid gap-0.5">
            <span class="font-medium">{m.session_anonymous()}</span>
            <span class="text-muted-foreground">{m.session_anonymous_hint()}</span>
        </span>
        <Switch name="anonymous" checked={settings.anonymous} class="mt-0.5" />
    </Label>

    <Separator />

    <fieldset class="flex flex-col gap-3">
        <legend class="font-medium">{m.session_limits()}</legend>
        <p class="text-sm text-muted-foreground">{m.session_limits_hint()}</p>
        {#each limits as limit (limit.name)}
            <div class="flex items-center justify-between gap-4">
                <Label for={limit.name} class="font-normal">{limit.label()}</Label>
                <Input
                    id={limit.name}
                    name={limit.name}
                    type="number"
                    inputmode="numeric"
                    min={1}
                    max={999}
                    value={String(settings[limit.name] ?? '')}
                    class={number}
                />
            </div>
        {/each}
    </fieldset>

    <Separator />

    <Label class="flex cursor-pointer items-center justify-between gap-4 font-normal">
        <span class="font-medium">{m.session_skip_own()}</span>
        <Switch name="skipOwn" checked={settings.skipOwn} />
    </Label>

    <fieldset class="flex flex-col gap-3">
        <Label class="flex cursor-pointer items-start justify-between gap-4 font-normal">
            <span class="grid gap-0.5">
                <span class="font-medium">{m.session_skip_voting()}</span>
                <span class="text-muted-foreground">{m.session_skip_voting_hint()}</span>
            </span>
            <Switch name="skipVoting" bind:checked={skipVoting} class="mt-0.5" />
        </Label>
        <div class="flex items-center justify-between gap-4">
            <Label for="skipVotes" class="font-normal">{m.session_skip_votes()}</Label>
            <Input
                id="skipVotes"
                name="skipVotes"
                type="number"
                inputmode="numeric"
                min={1}
                max={999}
                required
                disabled={!skipVoting}
                value={String(settings.skipVotes)}
                class={number}
            />
        </div>
        <div class="flex items-center justify-between gap-4">
            <Label for="skipPercent" class="font-normal">{m.session_skip_percent()}</Label>
            <Input
                id="skipPercent"
                name="skipPercent"
                type="number"
                inputmode="numeric"
                min={1}
                max={100}
                required
                disabled={!skipVoting}
                value={String(settings.skipPercent)}
                class={number}
            />
        </div>
    </fieldset>

    <Button type="submit" class="h-11 w-full sm:h-8 sm:w-auto sm:self-start" disabled={busy}>
        {m.save()}
    </Button>
</form>
