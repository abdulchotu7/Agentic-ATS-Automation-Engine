import type { Page } from 'playwright';
import { connectToBrowser, runWithErrorHandler } from './utils/browser.ts';
import { client } from './agent/openaiClient.ts';
import { runMcpAgent } from './agent/mcpAgent.ts';

/**
 * Fills in basic personal information on the application form.
 */
async function fillPersonalDetails(page: Page, firstName: string, lastName: string, email: string) {
    console.log('⌨️ Filling in personal details...');

    const emailValue = await page.locator('input#email-input').inputValue();
    if (emailValue) {
        await page.locator('input#confirm-email-input').pressSequentially(emailValue, { delay: 100 });
    } else {
        await page.locator('input#email-input').pressSequentially(email, { delay: 100 });
        await page.locator('input#confirm-email-input').pressSequentially(email, { delay: 100 });
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
}

runWithErrorHandler(async () => {
    const { page } = await connectToBrowser();

    console.log('🌐 Navigating to application page...');
    await page.goto('https://jobs.smartrecruiters.com/T-SystemsICTIndiaPvtLtd1/744000106265935-system-engineer');
    console.log('🔘 Clicking "I\'m interested"...');
    await page.getByRole('link', { name: "I'm interested" }).first().click();

    await uploadResume(page, '/Users/consultadd/projects/ResumeProfilerandApply/uploads/20260213_185222_LAKS_VANSH_Resume._20260204-160700.docx');
    await page.waitForTimeout(1000);
    await fillPersonalDetails(page, 'John', 'Doe', 'john.doe@example.com');
    await fillExperienceDetails(page);

    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForTimeout(1000);
    await runMcpAgent(page);
});