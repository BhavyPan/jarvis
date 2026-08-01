# Jarvis n8n Starter Kit

Import the JSON files in this folder into a **local n8n** instance to create a personal assistant that can:

- send Gmail messages and Telegram messages after explicit approval;
- announce new email and Telegram messages through a local desktop bridge;
- request allow-listed PC actions through that bridge; and
- run safe web-research requests through that bridge.

## Workflows

| File | Purpose |
| --- | --- |
| `command-router.json` | Validates a command and returns the action endpoint/payload to call. |
| `gmail-inbox-notifier.json` | Watches Gmail through IMAP and posts a desktop notification. |
| `telegram-inbox-notifier.json` | Watches Telegram messages and posts a desktop notification. |
| `approved-email-sender.json` | Sends Gmail only when a secret and confirmation are supplied. |
| `approved-telegram-sender.json` | Sends Telegram only when a secret and confirmation are supplied. |
| `desktop-action-bridge.json` | Sends approved, allow-listed PC actions to the desktop bridge. |
| `web-research-bridge.json` | Sends safe web-search/read requests to the desktop bridge. |

## Setup

1. Run n8n locally, ideally with a local HTTPS tunnel only if remote voice/mobile access is needed.
2. Import each workflow and attach your Gmail, IMAP, and Telegram credentials in n8n.
3. Set these n8n environment variables:

   - `JARVIS_API_KEY`: a long random value. Send it in the `x-jarvis-key` request header.
   - `JARVIS_DESKTOP_BRIDGE_URL`: the local bridge URL, for example `http://127.0.0.1:3100`.
   - `JARVIS_BRIDGE_KEY`: a different long random value used by n8n when it calls the bridge.

4. Build/run a local desktop bridge that implements:

   - `POST /notify` — receives `{ title, message, level }`
   - `POST /actions` — receives `{ action, args, requestId }`
   - `POST /research` — receives `{ mode, query, url, requestId }`

The bridge must bind to loopback only, verify `x-jarvis-bridge-key`, and enforce its own allow-list. For PC actions, permit only specific actions such as `open_app`, `open_url`, `take_screenshot`, `type_text`, and `hotkey`. Never expose arbitrary shell execution.

## Calling an action

Post JSON to an action workflow webhook with header `x-jarvis-key: <JARVIS_API_KEY>`.

Example email payload:

```json
{
  "approved": true,
  "confirmation": "SEND EMAIL",
  "to": "person@example.com",
  "subject": "Hello",
  "message": "Sent by Jarvis."
}
```

All outbound messaging and PC actions use a deliberate confirmation phrase. Keep that check when connecting a voice agent or LLM: an LLM may propose an action, but it should never be allowed to silently send, delete, purchase, or execute arbitrary commands.

## Important

These workflows are intentionally safe by default. They do **not** include destructive PC control, login/password capture, financial transactions, or arbitrary command execution. Configure credential nodes after importing; no secrets are committed to this repository.
