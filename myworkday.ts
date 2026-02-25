import type { Page } from 'playwright';
import type { ProfileData } from './types.ts';
import { connectToBrowser, runWithErrorHandler, tryStep, fillIfEmpty } from './utils/browser.ts';
import { runMcpAgent } from './agent/mcpAgent.ts';


async function uploadResume(page: Page, resumePath: string) {
    console.log(`📤 Uploading file: ${resumePath}...`);
    await page.setInputFiles('input[data-automation-id="file-upload-input-ref"]', resumePath);
    console.log('✅ File uploaded successfully.');
    console.log('⏳ Waiting 7s for auto-fill from resume...');
    await page.waitForTimeout(7000);
}
/**
 * Exported handler for Workday (myworkdayjobs.com) applications.
 * TODO: Add your Workday-specific automation logic here.
 */
export async function runWorkday(page: Page, jobUrl: string, profile: ProfileData, resumePath: string): Promise<void> {
    console.log('🌐 [1/9] Navigating to Workday job page...');
    await page.goto(jobUrl);
    await page.waitForTimeout(3000);

    console.log('🔘 [2/9] Clicking "Apply"...');
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(2000);

    console.log('🔘 [3/9] Clicking "Autofill with Resume"...');
    await page.getByRole("button", { name: "Autofill with Resume" }).click();
    await page.waitForTimeout(2000);

    console.log('⌨️ [4/9] Filling Email Address...');
    await tryStep("Email Address", () => page.getByRole("textbox", { name: "Email Address" }).fill(profile.contact.email));

    console.log('⌨️ [5/9] Filling Password...');
    await tryStep("Password", () => page.getByRole("textbox", { name: "Password", exact: true }).pressSequentially("Myworkday@789", { delay: 100 }));

    console.log('⌨️ [6/9] Filling Verify Password...');
    await tryStep("Verify New Password", () => page.getByRole("textbox", { name: "Verify New Password", exact: true }).pressSequentially("Myworkday@789", { delay: 100 }));

    console.log('☑️ [7/9] Checking consent checkbox...');
    await tryStep("Yes I Consent", () => page.getByRole("checkbox", { name: "Yes I Consent" }).check());

    console.log('🔘 [8/9] Clicking "Create Account"...');
    await tryStep("Create Account", () => page.getByRole("button", { name: "Create Account" }).click());
    await page.waitForTimeout(5000);

    await tryStep("Sign In",() => page.getByRole("textbox", { name: "Email Address" }).fill(profile.contact.email));
    await tryStep("Sign In",() => page.getByRole("textbox", { name: "Password", exact: true }).pressSequentially("Myworkday@789", { delay: 100 }));
    await tryStep("Sign In",() => page.getByRole("button", { name: "Sign In" }).click());
    await page.waitForTimeout(5000);

    console.log('📤 [9/9] Uploading resume...');
    await tryStep("Upload Resume", () => uploadResume(page, resumePath));

    console.log('🔘 Clicking "Continue"...');
    await tryStep("Continue", () => page.getByRole("button", { name: "Continue" }).click());
    await page.waitForTimeout(3000);

    console.log('🤖 Handing off to MCP agent for remaining fields + submit...');
    await runMcpAgent(page);
}

// ── Standalone mode (run directly with: npx tsx myworkday.ts <url>) ─────────
if (process.argv[1]?.endsWith('myworkday.ts')) {
    const url = process.argv[2];
    if (!url) {
        console.error('❌ Usage: npx tsx myworkday.ts <workday-job-url>');
        console.error('   Example: npx tsx myworkday.ts "https://wd1.myworkdayjobs.com/en-US/Company/job/Title_ID"');
        process.exit(1);
    }

    runWithErrorHandler(async () => {
        const { page } = await connectToBrowser();
        const { readFileSync } = await import('fs');

        const jsonPath = process.env.RESULT_JSON_PATH
            || '/Users/consultadd/projects/ResumeProfilerandApply/result.json';
        console.log(`📄 Loading profile from: ${jsonPath}`);
        const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));

        await runWorkday(page, url, data.application_data, data.resume_input);
    });
}