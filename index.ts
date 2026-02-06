
import { chromium } from 'playwright';

(async () => {
    try {
        // Connect to existing Chrome browser via CDP
        const browser = await chromium.connectOverCDP("http://localhost:9222/");

        console.log('✅ Connected to Chrome!');
        console.log('Browser Type:', browser.browserType().name());

        // Get the default context (existing Chrome session)
        const defaultContext = browser.contexts()[0];

        // Create a new page or use existing pages
        const page = await defaultContext.newPage();
        await page.goto('https://jobs.smartrecruiters.com/SigmaSoftware2/744000104656850-senior-full-stack-developer-python-react-');

        console.log('Page title:', await page.title());

        // Click the "I'm interested" button
        await page.locator('#st-apply').click();

        // Fill in the application form - type like a human
        await page.locator('input#first-name-input').pressSequentially('John', { delay: 100 });
        await page.locator('input#last-name-input').pressSequentially('Doe', { delay: 100 });
        await page.locator('input#email-input').pressSequentially('john.doe@example.com', { delay: 100 });
        await page.locator('input#confirm-email-input').pressSequentially('john.doe@example.com', { delay: 100 });

        // Handle autocomplete dropdown for location
        const locationInput = page.locator('input#spl-form-element_9');
        await locationInput.pressSequentially('New', { delay: 100 });

        // Wait for dropdown to appear and options to be visible
        await page.waitForSelector('[role="listbox"] spl-select-option', { state: 'visible' });

        // Small wait to ensure content has rendered
        await page.waitForTimeout(500);

        // Get all select-option elements
        const dropdownOptions = page.locator('[role="listbox"] spl-select-option');
        const optionsCount = await dropdownOptions.count();

        console.log(`\n📋 Found ${optionsCount} location options:`);

        // Print all options cleaner - target the Light DOM typography
        const options = [];
        for (let i = 0; i < optionsCount; i++) {
            const option = dropdownOptions.nth(i);

            // Try to get text from Light DOM typography component
            const optionText = await option.evaluate(el => {
                const typography = el.querySelector('.c-spl-autocomplete-option-content spl-typography-body');
                return typography?.textContent?.trim() || el.textContent?.trim() || '';
            });

            options.push(optionText);
            console.log(`  ${i + 1}. ${optionText || '[No text found]'}`);
        }

        // Select the first option
        if (optionsCount > 0) {
            await dropdownOptions.first().click();
            console.log(`\n✅ Selected: ${options[0] || 'First option'}`);
        }

        console.log('✅ Location selection completed');

        // Don't close the browser - it's the user's Chrome instance
        // await browser.close();

    } catch (error: any) {
        console.error('❌ Failed to connect to Chrome');
        console.error('Error:', error.message);
        process.exit(1);
    }
})();