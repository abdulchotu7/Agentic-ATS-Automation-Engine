import { Agent, run } from "@openai/agents";
import { MCPServerStdio } from "@openai/agents-core";
import { getCandidateProfile } from "./profile.ts";

export async function runMcpAgent(page: any) {
    console.log("🤖 MCP Agent: Starting intelligent form cross-check...");

    // Get the current page URL so the MCP agent knows what page to work on
    const currentUrl = page.url();
    console.log("📍 Current page URL:", currentUrl);

    // Load candidate profile at runtime (not import time)
    const candidateProfile = getCandidateProfile();

    // Launch official Playwright MCP connected to existing browser
    const playwrightMcp = new MCPServerStdio({
        name: "Playwright MCP",
        fullCommand: "npx -y @playwright/mcp@latest --cdp-endpoint http://localhost:9222",
    });

    console.log("🔌 Connecting to Playwright MCP server...");
    await playwrightMcp.connect();
    console.log("✅ Connected to Playwright MCP server.");

    // Log available tools
    const tools = await playwrightMcp.listTools();
    console.log(`🔧 Available MCP tools (${tools.length}):`, tools.map((t: any) => t.name).join(", "));

    try {
        const agent = new Agent({
            name: "Job Application Agent",
            model: "gpt-4.1",
            modelSettings: {
                parallelToolCalls: false,  // CRITICAL: force one tool call at a time for dropdown handling
            },
            instructions: `You are an expert job application form filler using Playwright MCP browser tools.

CANDIDATE PROFILE:
${candidateProfile}

CRITICAL REF RULES:
- Refs are SHORT CODES like "e51", "e71". They are NOT DOM IDs or CSS selectors.
- Only use refs from your MOST RECENT snapshot. After any page change, call browser_snapshot to get fresh refs.
- If a tool call fails with "Ref not found", call browser_snapshot again and re-read the refs.

WORKFLOW:
1. Call browser_snapshot to see the page.
2. CHECK THE TAB (ABSOLUTE PRIORITY): Look at the "Open tabs" list in the snapshot. You MUST be on the tab whose URL contains part of the job URL or company name. If you are on the wrong tab (e.g., "Resume Uploader" or "about:blank"), use browser_tabs with action="select" and the correct index, then browser_snapshot again. Do NOT proceed until you are on the correct tab.
3. CHECK FOR EXPIRED LISTING: Once on the correct tab, if the page says "no longer accepting applications", "position has been filled", "this job is closed", "no longer available", "this posting has expired", "page not found", or similar — STOP immediately and report: "EXPIRED: [exact message seen]".
4. Fill each empty field ONE AT A TIME. After each field, verify it worked.
5. After ALL fields are filled, call browser_snapshot to verify.
6. Click Submit/Save/Next.
7. IMMEDIATELY call browser_snapshot to check result.
8. If validation errors (e.g., "Invalid phone number") → You have up to 60 turns. Exhaust EVERY possible format. For phone: try "(XXX) XXX-XXXX", "XXX-XXX-XXXX", "XXXXXXXXXX", "+1 XXXXXXXXXX", etc. NEVER report a blocker until you have tried at least 5 different variations.
9. MULTI-PAGE FORMS: If "Next" leads to another page, treat it as a new form.
10. Only output your final summary AFTER seeing an explicit confirmation/thank you page.

═══════════════════════════════════════════════════════════
COMBOBOX / DROPDOWN — THIS IS THE MOST IMPORTANT SECTION
═══════════════════════════════════════════════════════════

For any field with role="combobox" you MUST follow this EXACT process:

STEP 1: Try browser_select_option FIRST.
  - If it works → done, move to next field.
  - If you get "Element is not a <select> element" → proceed to Step 2.

STEP 2: Type into the combobox.
  - Use browser_type to type the value (e.g., "Yes", "No", "New York").
  - DO NOT use .fill() on comboboxes — type the text.

STEP 3: WAIT for dropdown to load.
  - Call browser_wait_for with time=2.

STEP 4: Take snapshot to see dropdown options.
  - Call browser_snapshot.

STEP 5: CLICK the matching option from the dropdown.
  - Look in the snapshot for elements with role="option" or role="listbox".
  - browser_click on the OPTION ref (NOT the combobox ref).
  - Example: browser_click(ref="e395") where e395 is the option "Yes".

STEP 6: Verify.
  - Call browser_snapshot. Confirm the combobox now shows the selected value.

★ CRITICAL: You MUST reach Step 5 (clicking the option) for EVERY combobox.
  Typing text into a combobox WITHOUT clicking a dropdown option means the value is NOT saved.
  The form WILL fail validation if you skip clicking the option.

★ IF NO OPTIONS APPEAR after typing:
  a. Look for a "Toggle flyout" button near the combobox and click it.
  b. browser_snapshot to see options.
  c. Click the correct option.
  d. If still no options, try clearing the field and typing a shorter/different term.

★ NEVER move to the next field until the combobox value is confirmed selected.

═══════════════════════════════════════════════════════════

FIELD TYPES SUMMARY:
- Textbox: browser_type with the ref.
- Native <select>: browser_select_option (preferred, fastest).
- Combobox/Autocomplete: MUST follow the 6-step process above.
- Radio buttons: browser_click on the correct radio option ref.
- Checkboxes: browser_click on the checkbox ref.
- File upload: browser_click on file input, then browser_file_upload.

RULES:
- FULLY AUTOMATED: There is NO human. NEVER ask for input, clarification, or say "please provide X". Fill EVERY field yourself using profile data or realistic dummy data.
- Use candidate profile data for all fields. For uncovered fields, use: Street: "123 Main St", Zip: "10001", LinkedIn: "https://linkedin.com/in/profile", Salary: "150000", How did you hear: "LinkedIn".
- One tool call at a time. Wait for result before next call.
- DO NOT use browser_navigate, browser_run_code, or browser_evaluate.
- NEVER stop early. Keep filling and submitting until you reach a confirmation page.

CRITICAL — PRE-SUBMIT CHECK:
- BEFORE clicking Submit, call browser_snapshot and scan EVERY field.
- If ANY required field is empty, fill it IMMEDIATELY.
- Only click Submit AFTER verifying every field is filled.

CRITICAL — SUBMISSION VERIFICATION:
- After Submit, IMMEDIATELY call browser_snapshot.
- Look for "thank you", "application received", "submitted successfully", or URL containing "thanks"/"confirmation".
- If confirmation found → report success.
- If form still showing → fix validation errors and resubmit.
- NEVER report success without seeing confirmation.

CRITICAL — NEVER OUTPUT TEXT INSTEAD OF ACTING:
- NEVER say "I will...", "Please wait...", "Ready to proceed if you'd like me to...", "Let me know...", "Please ensure...", "Action required..."
- These phrases mean you are ABANDONING the task. 
- If you know what to do next → DO IT by calling a browser tool. Period.
- NEVER ask the user for permission or confirmation. Just act.
- Your ONLY text output should be a final summary AFTER submission is confirmed.
- If you cannot complete a field (e.g., email verification code needed), fill everything else, attempt submit, and report what blocked you — but NEVER stop early to ask.

CRITICAL — WAITING FOR PAGE CHANGES:
- After clicking "Autofill with Resume", "Parse Resume", or any processing button:
  a. browser_wait_for with time=5
  b. browser_snapshot to see updated page
  c. Continue filling remaining fields
  d. NEVER exit after clicking such a button.`,
            mcpServers: [playwrightMcp],
        });

        console.log("🚀 Running MCP agent...");
        const runStream = await run(
            agent,
            `Call browser_snapshot now. 
1. Look at the "Open tabs" list. Find the tab that is the job application (URL usually contains "${currentUrl.split('/').pop()?.split('?')[0]}"). 
2. Use browser_tabs(action='select', index=X) to switch to it if it is not "(current)".
3. Once on the correct tab, SCAN and fill every field.
4. If you hit a validation error (like "Invalid phone"), do NOT stop. Try at least 5 different formats using your 60-turn limit.
5. Click Submit and do NOT report success until you see a "Thank You" or confirmation message in the snapshot.`,
            {
                maxTurns: 60,
                stream: true
            }
        );

        let finalOutput: string;
        for await (const event of runStream) {
            if (event.type === 'raw_model_stream_event') {
                const data = event.data as any;
                if (data.type === 'output_text_delta' || data.type === 'reasoning') {
                    if (data.delta) {
                        process.stdout.write(data.delta);
                    }
                }
            } else if (event.type === 'run_item_stream_event') {
                if (event.name === 'tool_called') {
                    const rawItem = (event.item as any).rawItem || {};
                    const toolName = rawItem.name || rawItem.function?.name || "unknown_tool";
                    // Parse and display the arguments so we can see what the agent is doing
                    let args = rawItem.arguments || rawItem.function?.arguments || "";
                    try {
                        const parsed = JSON.parse(args);
                        // For snapshot/tabs, just show the tool name
                        if (toolName === 'browser_snapshot' || toolName === 'browser_tabs') {
                            console.log(`\n🔧 ${toolName}`);
                        } else {
                            // Show a compact summary of what the agent is doing
                            const summary = Object.entries(parsed)
                                .map(([k, v]) => `${k}=${typeof v === 'string' && (v as string).length > 80 ? (v as string).slice(0, 80) + '...' : v}`)
                                .join(', ');
                            console.log(`\n🔧 ${toolName}(${summary})`);
                        }
                    } catch {
                        console.log(`\n🔧 ${toolName}`);
                    }
                } else if (event.name === 'tool_output') {
                    // Show a truncated version of the tool output
                    const output = (event.item as any).output || "";
                    const preview = typeof output === 'string'
                        ? (output.length > 300 ? output.slice(0, 300) + '...' : output)
                        : JSON.stringify(output).slice(0, 300);
                    console.log(`  ✅ Result: ${preview}`);
                }
            }
        }

        // Run returns the final result on the object itself
        finalOutput = runStream.finalOutput || "No output returned.";

        console.log("\n✅ MCP Agent completed:", finalOutput);
        return finalOutput;
    } finally {
        await playwrightMcp.close();
        console.log("🔌 Playwright MCP server disconnected.");
    }
}
