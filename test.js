const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer-extra');

(async () => {
	puppeteer.use(StealthPlugin());
	const browser = await puppeteer.launch({
		headless: false,
		defaultViewport: { width: 1920, height: 1080 },
	});
	const page = await browser.newPage();
	await page.goto('https://www.google.com/');
	await page.type('textarea[title="検索"]', 'Puppeteer', { delay: 50 });
	await page.evaluate(() => {
		document.querySelector('input[value^="Google"]').click();
	});

	await page.waitForNavigation({ timeout: 600000, waitUntil: 'domcontentloaded' });

	console.log('検索結果がブラウザに表示されました。');
})();
