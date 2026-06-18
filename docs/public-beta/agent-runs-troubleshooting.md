# Agent Runs Troubleshooting

Agent runs are PawPlan's record of scheduled or agent-triggered rebalance attempts. They make failures visible and prevent retries from silently creating duplicate Review drafts.

## Run Statuses

- `started`: PawPlan accepted the run and began processing it. This is not success yet.
- `draft_created`: PawPlan created a new Review draft. Open `/review` to inspect and apply or reject it.
- `no_change`: PawPlan did not create a draft because the requested moves were no-ops, skipped, or not safe to propose.
- `duplicate`: PawPlan already saw the same idempotency key. If a `patchId` is present, use the existing Review draft.
- `failed`: PawPlan could not create a reliable result. The agent must report the error and must not claim success.

## What To Do For `failed`

1. Read the returned error code and message.
2. Check that the MCP token or OAuth authorization is still active.
3. Confirm the agent used a `read_write` token or authorization.
4. Re-run only after choosing a new idempotency key or confirming that retrying the same key is intended.
5. If the error is about task state, open PawPlan and inspect the task before asking the agent to try again.

Do not work around `failed` by asking the agent to directly edit task dates or by hand-writing a low-level patch for routine movement.

## Why `duplicate` Is Usually Safe

`duplicate` normally means a scheduler retried the same run, or the agent sent the same idempotency key twice. PawPlan returns the existing run result instead of creating another draft.

If `duplicate` includes `patchId`, open `/review` and inspect the existing draft. Do not ask the agent to create a second draft unless the original one is wrong and you intentionally use a new idempotency key.

## Why Review Is Still Required

Agent runs only create or locate Review drafts. They do not apply plan changes.

The user must still:

1. Open `/review`.
2. Inspect before and after values.
3. Accept or reject each operation.
4. Apply accepted operations.

Skipped operations, no-change runs, duplicate runs, and failed runs are not applied changes.

## Revoke Tokens Or OAuth Access

For Codex or other bearer-token clients:

1. Open PawPlan `/settings`.
2. Revoke the MCP token.
3. Remove the raw token from the client environment.
4. Restart the client and confirm the old token no longer works.

For Claude OAuth connector access:

1. Open PawPlan `/settings`.
2. Revoke the Claude authorization.
3. Return to Claude and reconnect only if access should be restored.

Revocation is workspace-scoped. It does not delete existing Review drafts or already-applied task changes.
