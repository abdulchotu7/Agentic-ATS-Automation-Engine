import type { Page } from "playwright";
import { client } from "./openaiClient.ts";
import { candidateProfile } from "./profile.ts";
import { executeAction } from "./screeningExecutor.ts";
import { runMcpAgent } from "./mcpAgent.ts";

export async function answerScreeningQuestions(page: Page) {

    console.log("🤖 Scanning for screening questions...");

    // Extract questions from DOM — designed for Lever's .application-question structure
    const questions = await page.evaluate(() => {

        const results: any[] = [];

        // Scan each .application-question container
        document.querySelectorAll(".application-question").forEach((container: any, idx: number) => {

            // Get the question label text (first text element in the container)
            const labelEl = container.querySelector(".application-label, .application-dropdown-label");
            const label = labelEl?.innerText?.trim() || container.innerText?.trim().split("\n")[0] || "Unknown question";

            // Detect what kind of input this question has
            const radios = container.querySelectorAll('input[type="radio"]');
            const checkboxes = container.querySelectorAll('input[type="checkbox"]');
            const textarea = container.querySelector("textarea");
            const textInput = container.querySelector('input[type="text"]');
            const selectEl = container.querySelector("select");

            if (radios.length > 0) {
                // Radio group — extract option labels
                const options = Array.from(radios).map((r: any) => {
                    const optLabel = r.closest("li")?.innerText?.trim() || r.value;
                    return optLabel;
                });
                results.push({
                    label,
                    selector: `nth=${idx}`, // we'll use index-based selection
                    inputType: "radio",
                    options,
                });
            } else if (checkboxes.length > 0) {
                const options = Array.from(checkboxes).map((c: any) => {
                    return c.closest("li")?.innerText?.trim() || c.value;
                });
                results.push({
                    label,
                    selector: `nth=${idx}`,
                    inputType: "checkbox",
                    options,
                });
            } else if (textarea) {
                if (!textarea.value) {
                    results.push({
                        label,
                        selector: textarea.id ? `#${textarea.id}` : `nth=${idx}`,
                        inputType: "textarea",
                    });
                }
            } else if (textInput) {
                if (!textInput.value) {
                    results.push({
                        label,
                        selector: textInput.id ? `#${textInput.id}` : `nth=${idx}`,
                        inputType: "text",
                    });
                }
            } else if (selectEl) {
                const options = Array.from(selectEl.querySelectorAll("option")).map((o: any) => o.textContent?.trim());
                results.push({
                    label,
                    selector: selectEl.id ? `#${selectEl.id}` : `nth=${idx}`,
                    inputType: "select",
                    options,
                });
            }
        });

        return results;
    });

    if (!questions.length) {
        console.log("⚠️ No .application-question containers found. Falling back to MCP agent...");
        await runMcpAgent(page);
        return;
    }

    console.log(`🧠 Found ${questions.length} questions:`);
    questions.forEach((q: any, i: number) => console.log(`  ${i + 1}. [${q.inputType}] ${q.label.substring(0, 80)} → ${q.selector}`));

    // Ask AI how to answer
    const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `
You are filling a job application form. Each question has a "selector" and "inputType".

Rules:
- textarea/text → write a concise professional answer (2-3 sentences max)
- radio → the question includes an "options" array. Pick the BEST option. Set "value" to the EXACT option text.
- checkbox → same as radio, set "value" to the EXACT option text to check.
- select → pick best matching option label
- Be concise, realistic, and professional
        `,
            },
            {
                role: "user",
                content: `
Candidate profile:
${candidateProfile}

Questions:
${JSON.stringify(questions, null, 2)}

Return ONLY JSON array:
[
 { selector, inputType, value }
]
`,
            },
        ],
    });

    let content = response.choices[0].message.content || "[]";
    // Strip markdown code fences if GPT wraps the JSON
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let actions: any[] = [];

    try {
        actions = JSON.parse(content);
    } catch {
        console.log("❌ AI response parse failed. Raw:", content.substring(0, 200));
        return;
    }

    // Execute actions, tracking failures
    let failedCount = 0;
    for (const action of actions) {
        try {
            await executeAction(page, action);
        } catch (e: any) {
            console.log(`⚠️ Action failed: ${e.message}`);
            failedCount++;
        }
    }

    if (failedCount > 0) {
        console.log(`⚠️ ${failedCount} actions failed.`);
    } else {
        console.log("✅ Fast scanner completed.");
    }

    // Always run MCP agent as a final cross-check
    console.log("🔍 Running MCP agent cross-check...");
    await runMcpAgent(page);
}