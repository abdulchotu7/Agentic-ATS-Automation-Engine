import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

/**
 * Connects to an existing Chrome browser instance via CDP.
 */
async function connectToBrowser(cdpUrl: string = "http://localhost:9222/"): Promise<{ browser: Browser, page: Page }> {
    console.log('🔗 Connecting to Chrome...');
    const browser = await chromium.connectOverCDP(cdpUrl);
    const defaultContext = browser.contexts()[0];
    const page = await defaultContext.newPage();
    console.log('✅ Connected to browser session.');
    return { browser, page };
}

/**
 * Fills in basic personal information on the application form.
 */
async function fillPersonalDetails(page: Page, firstName: string, lastName: string, email: string) {
    console.log('⌨️ Filling in personal details...');
    await page.locator('input#first-name-input').pressSequentially(firstName, { delay: 100 });
    await page.locator('input#last-name-input').pressSequentially(lastName, { delay: 100 });
    await page.locator('input#email-input').pressSequentially(email, { delay: 100 });
    await page.locator('input#confirm-email-input').pressSequentially(email, { delay: 100 });
}

/**
 * Handles the location autocomplete dropdown.
 */
async function selectLocation(page: Page, query: string) {
    console.log(`📍 Searching for location: "${query}"...`);
    const locationInput = page.locator('[data-sr-id="location-autocomplete-search-search-input"]');
    await locationInput.pressSequentially(query, { delay: 100 });

    console.log('⏳ Waiting for location dropdown options...');
    await page.waitForSelector('[role="listbox"] spl-select-option', { state: 'visible' });
    await page.waitForTimeout(500);

    const dropdownOptions = page.locator('[role="listbox"] spl-select-option');
    if (await dropdownOptions.count() > 0) {
        const firstOptionText = await dropdownOptions.first().textContent();
        console.log(`✨ Selecting primary location: ${firstOptionText?.trim()}`);
        await dropdownOptions.first().click();
    }
}

/**
 * Selects a country prefix and fills in the phone number.
 */
async function fillPhoneDetails(page: Page, countryQuery: string, phoneNumber: string) {
    console.log('🔘 Opening phone country prefix dropdown...');
    await page.getByLabel('Country code').click();


    console.log(`🔍 Searching for country: "${countryQuery}"...`);
    const countrySearch = page.getByRole('combobox', { name: 'Search by country or code' });
    await countrySearch.pressSequentially(countryQuery, { delay: 100 });
    await page.waitForTimeout(500);

    const phoneOptions = page.locator('spl-select-option.c-spl-phone-field-select-option');
    if (await phoneOptions.count() > 4) {
        console.log('✨ Selecting country option...');
        await phoneOptions.nth(4).click();
    }

    console.log(`📱 Filling phone number: ${phoneNumber}`);
    await page.locator('input[type="tel"]#spl-form-element_4').pressSequentially(phoneNumber, { delay: 100 });
    console.log('✅ Phone number filled.');
}

/**
 * Handles professional details selection using robust visible-only filtering.
 */
async function clickActionButtons(page: Page) {
    console.log('🔘 Adding experience entry...');
    await page.getByLabel('Add experience entry').click();

    // 1. Fill Job Title
    console.log('⌨️ Filling Job Title...');
    const jobTitleInput = page.getByRole('combobox', { name: 'Title' });
    await jobTitleInput.pressSequentially('Software Engineer', { delay: 100 });

    // Target ONLY the visible options to avoid ambiguity with hidden menus
    const jobOptions = page.locator('spl-select-option').filter({ visible: true });
    await jobOptions.first().waitFor({ state: 'visible' });

    console.log(`📋 Found ${await jobOptions.count()} job title options.`);
    await jobOptions.first().click();
    await page.waitForTimeout(300); // Allow UI to stabilize

    // 2. Fill Company
    console.log('⌨️ Filling Company...');
    const companyInput = page.getByRole('combobox', { name: 'Company' });
    await companyInput.pressSequentially('Autodesk', { delay: 100 });

    const companyOptions = page.locator('spl-select-option').filter({ visible: true });
    await companyOptions.first().waitFor({ state: 'visible' });

    console.log(`📋 Found ${await companyOptions.count()} company options.`);
    await companyOptions.first().click();
    await page.waitForTimeout(300);

    // 3. Fill Location
    console.log('⌨️ Filling Location...');
    const locationInput = page.getByRole('combobox', { name: 'Location' });
    await locationInput.pressSequentially('New York', { delay: 100 });

    const locationOptions = page.locator('spl-select-option').filter({ visible: true });
    await locationOptions.first().waitFor({ state: 'visible' });

    console.log(`📋 Found ${await locationOptions.count()} location options.`);
    await locationOptions.first().click();
    await page.waitForTimeout(300);

    // 4. Fill Description
    console.log('⌨️ Filling Description...');
    const descriptionInput = page.locator('textarea.c-spl-textarea').first();
    await descriptionInput.pressSequentially('Developed and maintained full-stack applications using Python and React.', { delay: 100 });

    await page.waitForTimeout(500);

    await page.getByRole("textbox", { name: "From" }).pressSequentially('2004-04-14', { delay: 100 });
    await page.getByRole("textbox", { name: "To" }).pressSequentially('2010-04-14', { delay: 100 });

    console.log('🔘 Clicking Save button...');
    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.click();

    await page.waitForTimeout(1000);
    console.log('✅ Experience entry details filled.');
}

/**
 * Main orchestration function for the job application process.
 */
async function runJobApplication() {
    try {
        const { page } = await connectToBrowser();

        console.log('🌐 Navigating to application page...');
        await page.goto('https://jobs.smartrecruiters.com/SigmaSoftware2/744000104656850-senior-full-stack-developer-python-react-');

        console.log('🔘 Clicking "I\'m interested"...');
        await page.locator('#st-apply').click();

        // await fillPersonalDetails(page, 'John', 'Doe', 'john.doe@example.com');
        // await selectLocation(page, 'New');
        // await fillPhoneDetails(page, 'Uni', '12345678900');
        await clickActionButtons(page);

        console.log('🎉 Automation flow reached the end successfully.');

    } catch (error: any) {
        console.error('❌ Automation Error Occurred');
        console.error('Message:', error.message);
        if (error.stack) {
            console.error('Trace:', error.stack.split('\n').slice(0, 3).join('\n'));
        }
        process.exit(1);
    }
}

// Execute the main script
runJobApplication();