<script lang="ts">
    import { Button } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import { NAME_MAX_LENGTH } from '#lib/limits.ts'
    import { m } from '#lib/paraglide/messages.js'

    /** The fields for a participant's name, inside a form of the page. */
    let {
        name = '',
        invalid = false,
        submit
    }: { name?: string; invalid?: boolean; submit: string } = $props()
</script>

<div class="flex flex-col gap-2">
    <Label for="profile-name">{m.profile_name()}</Label>
    <div class="flex flex-col gap-2 sm:flex-row">
        <Input
            id="profile-name"
            name="name"
            value={name}
            required
            maxlength={NAME_MAX_LENGTH}
            autocomplete="nickname"
            placeholder={m.profile_name_placeholder()}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? 'profile-name-error' : undefined}
            class="h-11 sm:h-8"
        />
        <Button type="submit" class="h-11 sm:h-8">{submit}</Button>
    </div>
    {#if invalid}
        <p id="profile-name-error" class="text-sm text-destructive">
            {m.profile_name_invalid({ max: NAME_MAX_LENGTH })}
        </p>
    {/if}
</div>
