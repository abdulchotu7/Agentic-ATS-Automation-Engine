import type { Page } from 'playwright';
import type { ProfileData } from '../types.ts';
import { connectToBrowser, runWithErrorHandler, tryStep, fillIfEmpty } from '../utils/browser.ts';
import { client } from '../agent/openaiClient.ts';
import { runMcpAgent } from '../agent/mcpAgent.ts';

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

function sanitizeText(text: string): string {
    return text.replace(/;/g, '.');
}

async function fillExperienceDetails(page: Page, profile: ProfileData) {
    console.log('🔘 Processing experience entries...');
    const experiences = profile.work_experience || [];

    const descriptionsLocator = page.getByRole('textbox', { name: 'Description' });
    const count = await descriptionsLocator.count();
    console.log(`📊 Found ${count} Description field(s) on page.`);

    for (let i = 0; i < count; i++) {
        const field = page.getByRole('textbox', { name: 'Description' }).nth(i);
        let value = await field.inputValue().catch(() => '');

        if ((!value || value.trim().length === 0) && experiences[i]) {
            console.log(`   ✏️ Description #${i + 1} is empty, filling from profile...`);
            value = experiences[i].summary || '';
            if (value) {
                await field.fill(sanitizeText(value));
            }
        }

        if (!value || value.trim().length === 0) {
            console.log(`   ⏭️ Description #${i + 1}: empty, skipping`);
            continue;
        }

        if (value.length > 4000) {
            console.log(`   ✂️ Description #${i + 1}: ${value.length} chars → summarizing...`);
            const response = await client.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "You are a professional resume summarizer. Your ONLY job is to take the provided text, trim and summarize it to be UNDER 4000 characters. CRITICAL: NEVER use semicolons (;)."
                    },
                    {
                        role: "user",
                        content: value
                    }
                ]
            });
            let newText = String(response.choices[0].message.content);
            await field.clear();
            await field.fill(sanitizeText(newText));
            console.log(`   ✅ Description #${i + 1}: trimmed to ${newText.length} chars`);
        } else if (value.includes(';')) {
            await field.fill(sanitizeText(value));
            console.log(`   ✅ Description #${i + 1}: Sanitized (semicolons removed)`);
        } else {
            console.log(`   ✅ Description #${i + 1}: ${value.length} chars (under limit)`);
        }
    }
}

export async function runSmartRecruiters(page: Page, url: string, profile: ProfileData, resumePath: string) {
    console.log('🌐 Navigating to SmartRecruiters application page...');
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await tryStep('I\'m interested Button', () =>
        page.getByRole('link', { name: 'I\'m interested' }).first().click()
    );

    await tryStep('Initial Upload', async () => {
        console.log(`📤 Uploading file: ${resumePath}...`);
        await page.setInputFiles('input#file-input', resumePath);
        console.log(`✅ File uploaded successfully.`);
        await page.waitForTimeout(7000);
    });

    await tryStep('Personal Details', () => fillPersonalDetails(page, profile));
    await fillExperienceDetails(page, profile);

    // MCP agent handles specific questions, additional fields, and final submission
    await runMcpAgent(page);
}

// ── Standalone mode (run directly) ──────────────────────────────────────────
if (process.argv[1]?.endsWith('smartrecruiters.ts')) {
    runWithErrorHandler(async () => {
        const { page } = await connectToBrowser();
        const url = process.argv[2] || 'https://jobs.smartrecruiters.com/T-SystemsICTIndiaPvtLtd1/744000106265935-system-engineer';
        const { readFileSync, readdirSync } = await import('fs');

        // Find latest result.json if not provided in env
        let jsonPath = process.env.RESULT_JSON_PATH || '';
        if (!jsonPath) {
            const resultsDir = './results';
            try {
                const files = readdirSync(resultsDir).filter(f => f.endsWith('_result.json')).sort().reverse();
                jsonPath = files.length > 0 ? `${resultsDir}/${files[0]}` : './result.json';
            } catch {
                jsonPath = './result.json';
            }
        }
        console.log(`📄 Using profile: ${jsonPath}`);

        // Set env so MCP agent's profile.ts picks it up
        process.env.RESULT_JSON_PATH = jsonPath;

        const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
        await runSmartRecruiters(page, url, data.application_data, data.resume_input);
    });
}