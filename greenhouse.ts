import type { Page } from 'playwright';
import { connectToBrowser, runWithErrorHandler } from './utils/browser.ts';
import { runMcpAgent } from './agent/mcpAgent.ts';

async function fillPersonalDetails(page: Page) {
    console.log('⌨️ Filling in personal details...');
    await page.getByRole('textbox', { name: 'First Name', exact: true }).pressSequentially('LAKS', { delay: 100 });
    await page.getByRole('textbox', { name: 'Last Name' }).pressSequentially('VANSH', { delay: 100 });
    await page.getByRole('textbox', { name: 'Email' }).pressSequentially('laksvansh@gmail.com', { delay: 100 });

    console.log('📞 Selecting US country code...');
    await page.getByRole('combobox', { name: 'Country' }).pressSequentially('United States');
    await page.waitForTimeout(1000);
    await page.getByRole('option', { name: 'United States +' }).click();
    await page.waitForTimeout(500);

    await page.getByRole('textbox', { name: 'Phone' }).pressSequentially('9876543210', { delay: 100 });
    console.log('✅ Personal details filled.');
}

async function uploadResume(page: Page, filePath: string) {
    console.log(`📤 Uploading resume: ${filePath}...`);
    await page.locator('input#resume').setInputFiles(filePath);
    await page.waitForTimeout(2000);
    console.log('✅ Resume uploaded.');
}

async function fillLocation(page: Page) {
    console.log('📍 Filling location...');
    const locationCombobox = page.getByRole('combobox', { name: 'Location (City)' });
    await locationCombobox.click();
    await locationCombobox.fill('new');
    await page.waitForTimeout(1500);
    await page.getByRole('option', { name: 'New York, NY, USA' }).click();
    console.log('✅ Location filled.');
}

runWithErrorHandler(async () => {
    const { page } = await connectToBrowser();
    console.log('🌐 Navigating to application page...');
    await page.goto('https://job-boards.greenhouse.io/540/jobs/7614871003');
    await page.waitForTimeout(2000);

    await uploadResume(page, '/Users/consultadd/projects/ResumeProfilerandApply/uploads/20260213_185222_LAKS_VANSH_Resume._20260204-160700.docx');
    await fillPersonalDetails(page);
    await fillLocation(page);

    console.log('🤖 Handing off to MCP agent for remaining fields + submit...');
    await runMcpAgent(page);
});