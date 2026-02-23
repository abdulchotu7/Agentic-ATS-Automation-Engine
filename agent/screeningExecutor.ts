import type { Page } from "playwright";

export async function executeAction(
    page: Page,
    action: any
) {
    const { selector, inputType, value } = action;

    console.log("⚙️ Executing:", JSON.stringify(action));

    // Handle nth-based selectors (for .application-question containers)
    const isNth = selector.startsWith("nth=");
    const nthIndex = isNth ? parseInt(selector.split("=")[1]) : -1;

    switch (inputType) {

        case "file":
            if (isNth) {
                await page.locator(".application-question").nth(nthIndex).locator('input[type="file"]').setInputFiles(value || "./temp.txt");
            } else {
                await page.locator(selector).setInputFiles(value || "./temp.txt");
            }
            break;

        case "radio": {
            // Click the radio button matching the AI's chosen value
            const container = page.locator(".application-question").nth(nthIndex);
            // Find the <li> containing the chosen text, then click its radio
            await container.locator("li").filter({ has: page.getByText(value, { exact: true }) }).locator('input[type="radio"]').click();
            break;
        }

        case "checkbox": {
            // Check the checkbox matching the AI's chosen value
            const container = page.locator(".application-question").nth(nthIndex);
            await container.locator("li").filter({ has: page.getByText(value, { exact: true }) }).locator('input[type="checkbox"]').check();
            break;
        }

        case "textarea":
        case "text":
            if (isNth) {
                const container = page.locator(".application-question").nth(nthIndex);
                const input = container.locator("textarea, input[type='text']").first();
                await input.fill(value);
            } else {
                await page.locator(selector).fill(value);
            }
            break;

        case "select":
            if (isNth) {
                const container = page.locator(".application-question").nth(nthIndex);
                await container.locator("select").selectOption({ label: value });
            } else {
                await page.locator(selector).selectOption({ label: value });
            }
            break;

        default:
            if (isNth) {
                const container = page.locator(".application-question").nth(nthIndex);
                await container.locator("textarea, input[type='text']").first().fill(value);
            } else {
                await page.locator(selector).fill(value);
            }
    }
}