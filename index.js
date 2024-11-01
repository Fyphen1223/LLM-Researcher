process.noDeprecation = true;
const config = require('./config.json');

const Groq = require('groq-sdk');
const readability = require('@mozilla/readability');
const puppeteer = require('puppeteer');

const readline = require('readline');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false,
});

const { search, OrganicResult, DictionaryResult, ResultTypes } = require('google-sr');

let groqApiKey = null;
let groq = null;

async function searchFor(q) {
	let res = await search({
		query: q,
		resultTypes: [OrganicResult, DictionaryResult],
		requestConfig: {
			params: {
				safe: 'disable',
			},
		},
	});
	let organicResults = res.filter((result) => result.type === 'ORGANIC');
	organicResults = organicResults.filter((result) => {
		result.link !== null;
	});
	return organicResults;
}

async function getSearchTerms(query) {
	let res = await groq.chat.completions.create({
		messages: [
			{
				role: 'system',
				content:
					'You are search keyword encoder.\n' +
					'Your task is to make a list of keywords that seem to be ffectively used for searching the given keyword.\n' +
					'User will provide the keyword\n' +
					'Your answer should be in JS array format.\n' +
					'You must at least provide 5 keywords.\n' +
					'You must provide accurate and as academic as possible answers.\n' +
					'Here\'s the example: ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"...]' +
					'You MUST NOT WRITE ANYTHING ELSE THAN JSON ARRAY FORMAT, AND ANSWERS SHOULD BE IN THE SAME LANGUAGE AS THE USER SPEAKS.',
			},
			{
				role: 'user',
				content: query,
			},
		],
		model: 'llama-3.2-11b-text-preview',
	});
	return res.choices[0].message.content;
}

const question = (query) => {
	return new Promise((resolve) => {
		rl.question(query, (answer) => {
			resolve(answer);
		});
	});
};

(async () => {
	if (!config.token) {
		let res = await question('Input Groq API Key: ');
		if (res) {
			console.log(
				'Got API key. At this moment, the program is not sure whther the API key is valid or not.'
			);
		}
		groqApiKey = res;
	} else {
		console.log('API key provided from config.json.');
		groqApiKey = config.token;
	}
	groq = new Groq({ apiKey: groqApiKey });

	const term = await question('Enter search term: ');
	let searchableTerms = JSON.parse(await getSearchTerms(term));
	console.log('[LLM]: Decided keywords to search for:');
	console.log(searchableTerms);
	console.log('[LOG]: Executing search...');
	let storage = [];
	await Promise.all(
		searchableTerms.map(async (element) => {
			console.log(
				`[LOG]: Searching for "${element}", progress: ${
					searchableTerms.indexOf(element) + 1
				}/${searchableTerms.length}`
			);
			let searchResults = await searchFor(element);
			console.log(searchResults);
			storage.push(...searchResults);
		})
	);
	console.log('[LOG]: Search completed.');
	console.log('[LOG]: Search result:');
	console.log(storage);
	console.log(`[LOG]: ${storage.length} results found.`);
})();
