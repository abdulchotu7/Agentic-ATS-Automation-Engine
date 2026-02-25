import type { Page } from 'playwright';
import type { ProfileData } from './types.ts';
import { connectToBrowser, runWithErrorHandler, tryStep, fillIfEmpty } from './utils/browser.ts';
import { runMcpAgent } from './agent/mcpAgent.ts';

async function uploadResume(page: Page, filePath: string) {
    console.log(`📤 Uploading resume: ${filePath}...`);
    await page.locator('input#resume').setInputFiles(filePath);
    console.log('✅ Resume uploaded.');
    console.log('⏳ Waiting 7s for auto-fill from resume...');
    await page.waitForTimeout(7000);
}

async function fillPersonalDetails(page: Page, profile: ProfileData) {
    console.log('⌨️ Filling personal details (only empty fields)...');
    const contact = profile.contact;

    await fillIfEmpty(page.getByRole('textbox', { name: 'First Name', exact: true }), contact.first_name, { label: 'First Name' });
    await fillIfEmpty(page.getByRole('textbox', { name: 'Last Name' }), contact.last_name, { label: 'Last Name' });
    await fillIfEmpty(page.getByRole('textbox', { name: 'Email' }), contact.email, { label: 'Email' });

    // Phone: country code + number
    const phoneField = page.getByRole('textbox', { name: 'Phone' });
    const phoneValue = await phoneField.inputValue().catch(() => '');
    if (!phoneValue || phoneValue.trim().length === 0) {
        console.log('📞 Selecting US country code...');
        await page.getByRole('combobox', { name: 'Country' }).pressSequentially('United States');
        await page.waitForTimeout(1000);
        await page.getByRole('option', { name: 'United States +' }).click();
        await page.waitForTimeout(500);
        await phoneField.pressSequentially(contact.phone || '9876543210', { delay: 100 });
        console.log('   ✏️ Phone filled');
    } else {
        console.log(`   ⏭️ Phone already filled: "${phoneValue}"`);
    }
    console.log('✅ Personal details filled.');
}

async function fillLocation(page: Page, profile: ProfileData) {
    console.log('📍 Filling location...');
    const locationCombobox = page.getByRole('combobox', { name: 'Location (City)' });
    await locationCombobox.click();
    const city = profile.contact.city || 'New York';
    await locationCombobox.fill(city.substring(0, 3).toLowerCase());
    await page.waitForTimeout(1500);
    try {
        await page.getByRole('option').first().click();
    } catch {
        console.warn('⚠️ No location option found, MCP agent will handle it.');
    }
    console.log('✅ Location filled.');
}

/**
 * Exported handler for Greenhouse job applications.
 * Order: navigate → upload resume → wait for auto-fill → fill empties → MCP agent
 */
export async function runGreenhouse(page: Page, jobUrl: string, profile: ProfileData, resumePath: string): Promise<void> {
    console.log('🌐 Navigating to Greenhouse application page...');
    await page.goto(jobUrl);
    await page.waitForTimeout(2000);

    // 1. Upload resume FIRST — some sites auto-fill from it
    await tryStep('Upload Resume', () => uploadResume(page, resumePath));

    // 2. Fill only empty fields (respecting auto-fill)
    await tryStep('Personal Details', () => fillPersonalDetails(page, profile));
    await tryStep('Location', () => fillLocation(page, profile));

    // 3. MCP agent handles remaining fields + submit
    console.log('🤖 Handing off to MCP agent for remaining fields + submit...');
    await runMcpAgent(page);
}

// ── Standalone mode (run directly) ──────────────────────────────────────────
if (process.argv[1]?.endsWith('greenhouse.ts')) {
    runWithErrorHandler(async () => {
        const { page } = await connectToBrowser();
        const url = process.argv[2] || 'https://job-boards.greenhouse.io/evolver/jobs/4092128009';
        const { readFileSync } = await import('fs');
        const data = JSON.parse(readFileSync('/Users/consultadd/projects/ResumeProfilerandApply/result.json', 'utf-8'));
        await runGreenhouse(page, url, data.application_data, data.resume_input);
    });
}