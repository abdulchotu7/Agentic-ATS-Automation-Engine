import { connectToBrowser, runWithErrorHandler } from './utils/browser.ts';
import { runMcpAgent } from './agent/mcpAgent.ts';


runWithErrorHandler(async () => {
    const { page } = await connectToBrowser();
    console.log('🌐 Navigating to application page...');
    await page.goto('https://careers.adobe.com/us/en/job/ADOBUSR159047EXTERNALENUS/Software-Development-Engineer?utm_source=linkedin&utm_medium=phenom-feeds&source=LinkedIn');
    await page.waitForTimeout(2000);

    console.log('🤖 Handing off to MCP agent for remaining fields + submit...');
    await runMcpAgent(page);
});