# Jarvis — Windows AI Assistant with n8n

This repository is a single local Jarvis system, not a collection of unrelated automations.

```
Voice or text in the local Jarvis page
        ↓
n8n Master AI workflow
        ↓
Plans the task with OpenAI
        ↓
Email • Telegram • safe web browsing • controlled Windows actions
```

## What it can do

- understand text and browser-based voice input;
- answer normal questions;
- send email through Gmail;
- send Telegram messages;
- announce incoming Gmail and Telegram messages;
- open allow-listed Windows apps and public HTTPS links;
- type text, use allow-listed hotkeys, take screenshots, and speak;
- open web searches and pages.

Sending a message/email and every PC action needs a second explicit approval. The assistant deliberately cannot run arbitrary shell commands, delete files, capture passwords, or make payments.

## One-time setup

### 1. n8n

Run **self-hosted n8n on the same Windows PC**. Import all files under [workflows](./workflows), then configure the Gmail/IMAP/Telegram credentials where marked.

Set these n8n environment variables and restart n8n:

```
JARVIS_API_KEY=<long-random-secret>
JARVIS_BRIDGE_KEY=<different-long-random-secret>
JARVIS_DESKTOP_BRIDGE_URL=http://127.0.0.1:3100
JARVIS_N8N_BASE_URL=http://127.0.0.1:5678
OPENAI_API_KEY=<your OpenAI API key>
JARVIS_OPENAI_MODEL=gpt-4.1-mini
```

Activate these workflows after configuration:

1. **Jarvis - Master AI Assistant**
2. **Jarvis - Approved Email Sender**
3. **Jarvis - Approved Telegram Sender**
4. **Jarvis - Desktop Action Bridge**
5. **Jarvis - Web Research Bridge**
6. **Jarvis - Gmail Inbox Notifier** (optional)
7. **Jarvis - Telegram Inbox Notifier** (optional)

### 2. Windows desktop bridge

1. Install Node.js 20 or newer.
2. Copy `desktop-bridge/config.example.json` to `desktop-bridge/config.json`.
3. Edit the `allowedApps` list. Only apps listed there can be launched.
4. In PowerShell, set the same `JARVIS_API_KEY` and `JARVIS_BRIDGE_KEY` values, then start:

```powershell
cd desktop-bridge
node src/server.js
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100). Type or speak to Jarvis. The page sends commands to the master n8n workflow and reads replies aloud.

## Flow

- You ask: “Email Sam that I will be 10 minutes late.”
- Jarvis creates a draft plan and asks for approval.
- You click **Approve action**.
- n8n sends it through Gmail.
- Jarvis returns the result.

## Security

Keep n8n and the desktop bridge on your own computer. Do not expose the bridge port to the internet, do not put secrets in GitHub, and do not remove the confirmation checks. The bridge binds only to `127.0.0.1` and accepts only specific actions.
