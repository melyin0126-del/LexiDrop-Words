---
description: Start the LexiDrop Next.js development server without blocking
---

# Start Dev Server

This workflow starts the Next.js dev server in a non-blocking way.

IMPORTANT: `npm run dev` is a long-running process that never exits.
Always use WaitMsBeforeAsync=3000 and SafeToAutoRun=true so it goes to background immediately.

// turbo
1. Run the dev server in the background using run_command with:
   - CommandLine: `npm run dev`
   - Cwd: `c:\Users\JUN\Desktop\Mel单词`
   - WaitMsBeforeAsync: 3000   ← short wait, then release to background
   - SafeToAutoRun: true       ← auto-approve so user doesn't need to confirm

2. After 3 seconds, use command_status to check the output contains "Ready" or "localhost:3000".

3. Tell the user the server is ready at http://localhost:3000 and open that URL in the browser subagent.
