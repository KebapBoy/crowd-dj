<script lang="ts">
    import { createConfirm } from '@ui-sdk/svelte/alert-dialog'
    import type { DialogContentState } from '@ui-sdk/svelte/dialog'
    import { onMount } from 'svelte'
    import { connectAgents } from '#lib/agent.ts'
    import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js'
    import { m } from '#lib/paraglide/messages.js'

    /** Connects browser agents to the page and asks the person before a marked step, once in the layout. */
    type Question = { sentence: string }
    const confirm = createConfirm<Question>()
    const sentenceOf = (state: DialogContentState) =>
        (state.payload as Question | undefined)?.sentence

    onMount(() =>
        connectAgents((sentence, signal) => {
            const answer = confirm({ sentence })
            signal.addEventListener('abort', () => confirm.controller.close(), { once: true })
            return answer
        })
    )
</script>

<AlertDialog.Root controller={confirm.controller}>
    <!-- The agent waits for this answer and must never give it itself -->
    <AlertDialog.Content data-agent-hidden>
        {#snippet children(state: DialogContentState)}
            <AlertDialog.Header>
                <AlertDialog.Title>{m.agent_confirm_title()}</AlertDialog.Title>
                <AlertDialog.Description>{sentenceOf(state)}</AlertDialog.Description>
            </AlertDialog.Header>
            <AlertDialog.Footer>
                <AlertDialog.Cancel class="h-11 sm:h-8">{m.cancel()}</AlertDialog.Cancel>
                <AlertDialog.Close value="confirm" variant="default" class="h-11 sm:h-8">
                    {m.agent_confirm_allow()}
                </AlertDialog.Close>
            </AlertDialog.Footer>
        {/snippet}
    </AlertDialog.Content>
</AlertDialog.Root>
