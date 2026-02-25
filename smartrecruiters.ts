import type { Page } from 'playwright';
import type { ProfileData } from './types.ts';
import { connectToBrowser, runWithErrorHandler, tryStep, fillIfEmpty } from './utils/browser.ts';
import { client } from './agent/openaiClient.ts';
import { runMcpAgent } from './agent/mcpAgent.ts';

/**
 * Fills in basic personal information on the application form.
 * Only fills fields that are still empty after resume auto-fill.
 */
async function fillPersonalDetails(page: Page, profile: ProfileData) {
    console.log('⌨️ Filling in personal details (only empty fields)...');

    const emailInput = page.locator('input#email-input');
    const emailValue = await emailInput.inputValue().catch(() => '');
    if (emailValue && emailValue.trim().length > 0) {
        console.log(`   ⏭️ Email already filled: "${emailValue}"`);
        // Still need confirm email
        const confirmValue = await page.locator('input#confirm-email-input').inputValue().catch(() => '');
        if (!confirmValue || confirmValue.trim().length === 0) {
            await page.locator('input#confirm-email-input').pressSequentially(emailValue, { delay: 100 });
            console.log('   ✏️ Confirm Email filled');
        }
    } else {
        const email = profile.contact.email;
        await emailInput.pressSequentially(email, { delay: 100 });
        await page.locator('input#confirm-email-input').pressSequentially(email, { delay: 100 });
        console.log('   ✏️ Email + Confirm Email filled');
    }
}

async function fillExperienceDetails(page: Page) {
    console.log('🔘 Processing experience entry...');
    const value = await page.getByRole('textbox', { name: 'Description' }).inputValue();
    console.log(`Description value: "${value}"`);

    const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: "You are a professional resume summarizer. Your ONLY job is to take the provided text, trim and summarize it to be UNDER 4000 characters, and output ONLY the raw final text. Do NOT include any conversational filler, greetings, markdown formatting, or introductory sentences like 'Here is the text'."
            },
            {
                role: "user",
                content: value || ""
            }
        ]
    });

    const newText = String(response.choices[0].message.content);
    console.log(newText);
    await page.getByRole('textbox', { name: 'Description' }).clear();
    await page.getByRole('textbox', { name: 'Description' }).fill(newText);
}


/**
 * Uploads a local file to the application.
 */
async function uploadResume(page: Page, filePath: string) {
    console.log(`📤 Uploading file: ${filePath}...`);
    await page.setInputFiles('input#file-input', filePath);
    console.log('✅ File uploaded successfully.');
    console.log('⏳ Waiting 7s for auto-fill from resume...');
    await page.waitForTimeout(7000);
}

/**
 * Exported handler for SmartRecruiters job applications.
 * Called by the router with dynamic URL and profile data.
 */
export async function runSmartRecruiters(page: Page, jobUrl: string, profile: ProfileData, resumePath: string): Promise<void> {
    console.log('🌐 Navigating to SmartRecruiters application page...');
    await page.goto(jobUrl);
    console.log('🔘 Clicking "I\'m interested"...');
    await page.getByRole('link', { name: "I'm interested" }).first().click();

    // Deterministic steps — wrapped so failures don't skip MCP fallback
    try {
        await tryStep('Upload Resume', () => uploadResume(page, resumePath));
        await page.waitForTimeout(1000);
        await tryStep('Personal Details', () => fillPersonalDetails(page, profile));
        await tryStep('Experience Details', () => fillExperienceDetails(page));

        // Try clicking Next — may not exist on all SmartRecruiters forms
        try {
            await page.getByRole("button", { name: "Next" }).click({ timeout: 5000 });
            await page.waitForTimeout(1000);
        } catch {
            console.log('⚠️ No "Next" button found or click failed — MCP agent will handle navigation.');
        }
    } catch (error: any) {
        console.log(`⚠️ Deterministic steps failed: ${error.message} — MCP agent will take over.`);
    }

    // MCP agent ALWAYS runs — handles remaining fields, navigation, and submission
    await runMcpAgent(page);
}

// ── Standalone mode (run directly) ──────────────────────────────────────────
if (process.argv[1]?.endsWith('smartrecruiters.ts')) {
    runWithErrorHandler(async () => {
        const { page } = await connectToBrowser();
        const url = process.argv[2] || 'https://jobs.smartrecruiters.com/T-SystemsICTIndiaPvtLtd1/744000106265935-system-engineer';
        const { readFileSync } = await import('fs');
        const data = JSON.parse(readFileSync('/Users/consultadd/projects/ResumeProfilerandApply/result.json', 'utf-8'));
        await runSmartRecruiters(page, url, data.application_data, data.resume_input);
    });
}