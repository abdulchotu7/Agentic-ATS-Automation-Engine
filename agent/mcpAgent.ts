import { Agent, run } from "@openai/agents";
import { MCPServerStdio } from "@openai/agents-core";
import { candidateProfile } from "./profile.ts";

export async function runMcpAgent(page: any) {
    console.log("🤖 MCP Agent: Starting intelligent form cross-check...");

    // Get the current page URL so the MCP agent knows what page to work on
    const currentUrl = page.url();
    console.log("📍 Current page URL:", currentUrl);

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
            model: "gpt-4o",
            modelSettings: {
                parallelToolCalls: false,  // CRITICAL: force one tool call at a time for dropdown handling
            },
            instructions: `You are an expert job application form filler using Playwright MCP browser tools.

CANDIDATE PROFILE:
${candidateProfile}

CRITICAL REF RULES (READ THIS CAREFULLY):
- When you call browser_snapshot, the output contains elements with ref= attributes like [ref=e51], [ref=e71], [ref=e99], etc.
- These refs are SHORT CODES like "e51", "e71", "e99". They are NOT DOM IDs, NOT CSS selectors, NOT descriptive names.
- When you call browser_type or browser_click, the "ref" argument must be EXACTLY one of these short codes from your MOST RECENT snapshot.
- NEVER invent or guess a ref. NEVER use something like "input_full_name" or "question_abc123". Only use refs you actually see in the snapshot output.
- If a tool call fails with "Ref not found", call browser_snapshot again and re-read the refs.

WORKFLOW:
1. Call browser_snapshot to see the page.
2. CHECK THE TAB: Look at the "Open tabs" list in the snapshot. If the current tab URL does not match the job application, use browser_tabs with action="select" and the correct index. Then browser_snapshot again.
3. Read the snapshot carefully. Identify each form field by its label text and note its exact ref code.
4. Fill each empty field ONE AT A TIME in order:
   - For textbox fields: use browser_type with the ref from the snapshot.
   - For NATIVE SELECT dropdowns (shown as "combobox" in snapshot with NO listbox/options visible):
     Use browser_select_option with the ref and the value text. Example: browser_select_option(ref="e63", values=["United States"]).
     This is the PREFERRED method for any standard HTML <select> element. ALWAYS try browser_select_option FIRST for dropdowns.
   - For CUSTOM combobox/autocomplete (shown as "combobox" with a text input where you type to search):
     a. browser_click on the combobox ref to open it
     b. browser_snapshot to see the dropdown options that appeared
     c. browser_click on the correct option's ref from that NEW snapshot (option refs are DIFFERENT from the combobox ref!)
   - For radio buttons: use browser_click on the correct radio option ref.
   - For checkboxes: use browser_click on the checkbox ref.
5. After filling ALL fields, call browser_snapshot to verify everything is filled.
6. Click the "Submit", "Save", or "Next" button using browser_click with its ref.
7. IMMEDIATELY call browser_snapshot to check the result.
8. CHECK FOR VALIDATION ERRORS: If the page still shows the form with errors or unfilled required fields:
   a. Read the snapshot to find which fields are still empty or have errors
   b. Fill those fields using the correct refs from the NEW snapshot (refs change after re-render!)
   c. Click Submit/Save again
   d. browser_snapshot again to check
   e. Repeat up to 3 times
9. Only respond with your final summary AFTER the page has changed to a success/confirmation page or the next step of the application.

DROPDOWN SELECTION CRITICAL RULES:
- ALWAYS try browser_select_option FIRST. It works for most standard dropdowns.
- If browser_select_option fails, THEN use the 3-step click workflow.
- NEVER click the same ref twice hoping it will select an option. The combobox ref OPENS the dropdown; the OPTION ref (a different ref) SELECTS the value.
- After each dropdown selection, call browser_snapshot to VERIFY the value was actually set.

RULES:
- FULLY AUTOMATED: There is NO human available. You must NEVER ask the user for input, clarification, or missing data. NEVER stop and say "please provide X". You must fill EVERY field yourself.
- Use the candidate profile data above for all fields. If a field is not covered by the profile, use realistic dummy data (e.g., Street: "123 Main St", Zip: "10001", LinkedIn: "https://linkedin.com/in/laksvansh").
- You MUST make only ONE tool call at a time. Wait for the result before making the next call.
- For text answers, keep them concise (1-2 sentences max).
- DO NOT use browser_navigate, browser_run_code, or browser_evaluate. Only use: browser_snapshot, browser_tabs, browser_type, browser_click, browser_select_option, browser_fill_form.
- DO NOT navigate away from the current page or reload it.
- NEVER finish or output a final message if there are validation errors. You MUST fix them and resubmit.
- If you see a "Submit" or "Save" button, click it. If you see "Next", click it to proceed to the next page.
- NEVER stop early. Keep filling fields and submitting until you reach a confirmation/success page.`,
            mcpServers: [playwrightMcp],
        });

        console.log("🚀 Running MCP agent...");
        const runStream = await run(
            agent,
            `Call browser_snapshot now. Look at the "Open tabs" list and find the tab whose URL contains "${currentUrl}". If the current tab does not match, use browser_tabs with action="select" and the correct tab index to switch to it, then call browser_snapshot again. Once you are on the correct tab, read each field's label and ref from the snapshot and fill any EMPTY fields one by one using the exact ref codes. After all fields are filled, click the Submit button.`,
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
