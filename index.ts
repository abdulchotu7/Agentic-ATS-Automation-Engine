import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { client } from './agent/openaiClient.ts';
import { runMcpAgent } from './agent/mcpAgent.ts';
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
    // await page.locator('input#first-name-input').pressSequentially(firstName, { delay: 100 });
    // await page.locator('input#last-name-input').pressSequentially(lastName, { delay: 100 });

    // Read the email that is currently in the first field (even if auto-filled)
    const emailValue = await page.locator('input#email-input').inputValue();
    if (emailValue) {
        await page.locator('input#confirm-email-input').pressSequentially(emailValue, { delay: 100 });
    } else {
        await page.locator('input#email-input').pressSequentially(email, { delay: 100 });
        await page.locator('input#confirm-email-input').pressSequentially(email, { delay: 100 });
    }
}

/**
 * Handles the location autocomplete dropdown.
 */
async function selectLocation(page: Page, query: string) {
    console.log(`📍 Searching for location: "${query}"...`);
    // const locationInput = page.locator('[data-sr-id="location-autocomplete-search-search-input"]');
    const locationInput = page.getByRole('combobox', { name: 'City' });
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
    const countrySearch = page.getByRole('combobox', { name: 'Search by country/region or code' });
    await countrySearch.pressSequentially(countryQuery, { delay: 100 });
    await page.waitForTimeout(500);

    const phoneOptions = page.locator('spl-select-option.c-spl-phone-field-select-option');
    if (await phoneOptions.count() > 4) {
        console.log('✨ Selecting country option...');
        await phoneOptions.nth(4).click();
    }

    console.log(`📱 Filling phone number: ${phoneNumber}`);
    await page.getByRole('textbox', { name: 'Phone number' }).pressSequentially(phoneNumber, { delay: 100 });
    console.log('✅ Phone number filled.');
}

/**
 * Handles professional details selection using robust visible-only filtering.
 */
async function fillExperienceDetails(page: Page) {
    console.log('🔘 Adding experience entry...');
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
    console.log(response.choices[0].message.content);
    const new_text = String(response.choices[0].message.content);
    await page.getByRole('textbox', { name: 'Description' }).clear();
    await page.getByRole('textbox', { name: 'Description' }).fill(new_text);
    // await page.getByLabel('Add experience entry').click();

    // // 1. Fill Job Title
    // console.log('⌨️ Filling Job Title...');
    // const jobTitleInput = page.getByRole('combobox', { name: 'Title' });
    // await jobTitleInput.click();
    // await jobTitleInput.pressSequentially('Software Engineer', { delay: 100 });

    // // Target ONLY the visible options to avoid ambiguity with hidden menus
    // const jobOptions = page.locator('spl-select-option').filter({ visible: true });
    // await jobOptions.first().waitFor({ state: 'visible' });

    // console.log(`📋 Found ${ await jobOptions.count() } job title options.`);
    // await jobOptions.first().click();
    // await page.waitForTimeout(300); // Allow UI to stabilize

    // // 2. Fill Company
    // console.log('⌨️ Filling Company...');
    // const companyInput = page.getByRole('combobox', { name: 'Company' });
    // await companyInput.pressSequentially('Autodesk', { delay: 100 });

    // const companyOptions = page.locator('spl-select-option').filter({ visible: true });
    // await companyOptions.first().waitFor({ state: 'visible' });

    // console.log(`📋 Found ${ await companyOptions.count() } company options.`);
    // await companyOptions.first().click();
    // await page.waitForTimeout(300);

    // // 3. Fill Location
    // console.log('⌨️ Filling Location...');
    // const locationInput = page.getByRole('combobox', { name: 'Location' });
    // await locationInput.pressSequentially('New York', { delay: 100 });

    // const locationOptions = page.locator('spl-select-option').filter({ visible: true });
    // await locationOptions.first().waitFor({ state: 'visible' });

    // console.log(`📋 Found ${ await locationOptions.count() } location options.`);
    // await locationOptions.first().click();
    // await page.waitForTimeout(300);

    // // 4. Fill Description
    // console.log('⌨️ Filling Description...');
    // const descriptionInput = page.locator('textarea.c-spl-textarea').first();
    // await descriptionInput.pressSequentially('Developed and maintained full-stack applications using Python and React.', { delay: 100 });

    // await page.waitForTimeout(500);

    // await page.getByRole("textbox", { name: "From" }).pressSequentially('2004-04-14', { delay: 100 });
    // await page.getByRole("textbox", { name: "To" }).pressSequentially('2010-04-14', { delay: 100 });

    // console.log('🔘 Clicking Save button...');
    // const saveButton = page.getByRole('button', { name: 'Save' });
    // await saveButton.click();

    // await page.waitForTimeout(1000);
    // console.log('✅ Experience entry details filled.');
}

async function fillEducationDetails(page: Page) {
    console.log('🔘 Adding education entry...');
    await page.getByLabel('Add education entry').click();

    const institutionInput = page.getByRole("combobox", { name: "Institution" })
    await institutionInput.pressSequentially("University of California, Berkeley", { delay: 100 });
    await page.waitForTimeout(500);
    const institutionOptions = page.locator('spl-select-option').filter({ visible: true });
    await institutionOptions.first().waitFor({ state: 'visible' });
    console.log(`📋 Found ${await institutionOptions.count()} institution options.`);
    await institutionOptions.first().click();
    await page.waitForTimeout(300);

    await page.getByLabel("Major").pressSequentially("Computer Science", { delay: 100 });
    await page.waitForTimeout(500);

    await page.getByLabel("Degree").pressSequentially("Master of Science", { delay: 100 });
    await page.waitForTimeout(500);

    await page.getByLabel("Description").pressSequentially("Developed and maintained full-stack applications using Python and React.", { delay: 100 });
    await page.waitForTimeout(500);

    await page.getByRole("textbox", { name: "From" }).pressSequentially('2004-04-14', { delay: 100 });
    await page.getByRole("textbox", { name: "To" }).pressSequentially('2010-04-14', { delay: 100 });

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(1000);
    console.log('✅ Education entry details filled.');



}

async function fillAdditionalDetails(page: Page) {
    console.log('🔘 Adding additional details...');
    const countryInput = page.getByRole("combobox", { name: "What country do you plan to work from?" })
    await countryInput.pressSequentially("Germany", { delay: 100 });
    await page.waitForTimeout(500);
    const countryOptions = page.locator('spl-select-option').filter({ visible: true });
    await countryOptions.first().waitFor({ state: 'visible' });
    console.log(`📋 Found ${await countryOptions.count()} country options.`);
    await countryOptions.first().click();
    await page.waitForTimeout(300);

    const radioBtn = page.getByRole("radio", { name: "Yes" })
    await radioBtn.click();
    await page.waitForTimeout(300);

    const englishProficiency = page.getByRole("combobox", { name: "What is your level of proficiency in English?" })
    await englishProficiency.click();
    await page.waitForTimeout(500);
    const englishProficiencyOptions = page.locator('spl-select-option').filter({ visible: true });
    await englishProficiencyOptions.first().waitFor({ state: 'visible' });
    console.log(`📋 Found ${await englishProficiencyOptions.count()} english proficiency options.`);
    await englishProficiencyOptions.first().click();
    await page.waitForTimeout(300);

    // Check the policy agreement or similar checkbox
    console.log('🔘 Checking policy checkbox...');
    const policyCheckbox = page.locator('input#noPolicy');
    await policyCheckbox.check();
    await page.waitForTimeout(300);
    const saveButton = page.getByRole('button', { name: 'Submit' });
    await saveButton.click();

    console.log('✅ Additional details filled.');
}


/**
 * Uploads a local file to the application.
 */
async function uploadResume(page: Page, filePath: string) {
    console.log(`📤 Uploading file: ${filePath}...`);
    // setInputFiles handles hidden file inputs automatically
    await page.setInputFiles('input#file-input', filePath);
    console.log('✅ File uploaded successfully.');
}

/**
 * Main orchestration function for the job application process.
 */
async function runJobApplication() {
    try {
        const { page } = await connectToBrowser();

        console.log('🌐 Navigating to application page...');
        await page.goto('https://jobs.smartrecruiters.com/T-SystemsICTIndiaPvtLtd1/744000106265935-system-engineer');
        console.log('🔘 Clicking "I\'m interested"...');
        await page.getByRole('link', { name: "I'm interested" }).first().click();

        // 1. Upload Resume First

        // 2. Fill Rest of the form
        // await selectLocation(page, 'New');
        // await fillPhoneDetails(page, 'Uni', '12345678900');
        // await fillExperienceDetails(page);
        // await fillEducationDetails(page);
        await uploadResume(page, '/Users/consultadd/projects/ResumeProfilerandApply/uploads/20260213_185222_LAKS_VANSH_Resume._20260204-160700.docx');
        await page.waitForTimeout(1000);
        await fillPersonalDetails(page, 'John', 'Doe', 'john.doe@example.com');
        await fillExperienceDetails(page);



        await page.getByRole("button", { name: "Next" }).click();
        await page.waitForTimeout(1000);
        await runMcpAgent(page);


        // await fillAdditionalDetails(page);

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