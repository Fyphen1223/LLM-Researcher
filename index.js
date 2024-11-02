process.noDeprecation = true;

const fs = require('fs');

const config = require('./config.json');
let cache = require('./cache.json');

const Groq = require('groq-sdk');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const puppeteer = require('puppeteer');

const readline = require('readline');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false,
});

const { search, OrganicResult } = require('google-sr');

let groqApiKey = null;
let groq = null;

async function searchFor(q) {
	if (!cache[q]) {
		console.log('[LOG]: Cache not found.');
		let res = await search({
			query: q,
			resultTypes: [OrganicResult],
			requestConfig: {
				params: {
					safe: 'disable',
				},
			},
		});
		let organicResults = res.filter((result) => result.link);
		cache[q] = organicResults;
		fs.writeFileSync('./cache.json', JSON.stringify(cache, null, 4));
		cache = JSON.parse(fs.readFileSync('./cache.json', 'utf-8'));
		return organicResults;
	} else {
		console.log('[LOG]: Cache found.');
		return cache[q];
	}
}

async function getSearchTerms(query) {
	let res = await groq.chat.completions.create({
		messages: [
			{
				role: 'system',
				content:
					'You are search keyword encoder.\n' +
					'Your task is to make a list of keywords that seem to be ffectively used for searching the given keyword.\n' +
					'User will provide the keyword.\n' +
					'Your answer should be in JS array format.\n' +
					'You must provide "2" keywords.\n' +
					'You must provide accurate and as academic as possible answers.\n' +
					'DO NOT RESEARCH ABOUT ANYTHING ELSE THE TOPIC. YOUR ANSWER MUST BE DIRECTLY RELATED TO THE TOPIC.' +
					'Here\'s the example: ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"...]' +
					'You MUST NOT WRITE ANYTHING ELSE THAN JSON ARRAY FORMAT, AND ANSWERS SHOULD BE IN THE SAME LANGUAGE AS THE USER SPEAKS.',
			},
			{
				role: 'user',
				content: query,
			},
		],
		model: 'llama-3.2-11b-text-preview',
		temperature: 0.1,
	});
	return res.choices[0].message.content;
}
async function estimateQuality(t, q) {
	const res = await groq.chat.completions.create({
		messages: [
			{
				role: 'system',
				content:
					'You are relevant estimator.\n' +
					'Your task is to estimate the relevance of webpage and given keyword or things user want to research.\n' +
					'User will provide the keyword and the website.\n' +
					'Your answer should be in integer 0 to 1.\n' +
					'If you think it is absolutely relevant, reply 1. If absolutely unrelevant, reply 0.' +
					'You must provide accurate and as academic as possible answers.\n' +
					'Your answer must be directly parsable as integer in node.js.' +
					"Here's the example: 1 0 0.6 0.75 0.11 0.98" +
					'You MUST NOT WRITE ANYTHING ELSE THAN INTEGER, AND ANSWERS SHOULD BE DIRECTLY PARSED AS INTEGER WITH NODE.JS RUNTIME.',
			},
			{
				role: 'user',
				content:
					`Keyword or idea: ${t}\n` +
					`Website: ${q.link}` +
					`Content: ${q.description}` +
					`Title: ${q.title}`,
			},
		],
		model: 'llama-3.2-11b-text-preview',
		temperature: 0.1,
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
			storage.push(...searchResults);
		})
	);
	console.log('[LOG]: Search completed.');
	console.log('[LOG]: Search result:');
	console.log(`[LOG]: ${storage.length} results found.`);
	await Promise.all(
		storage.map(async (element) => {
			console.log(`[LOG]: Estimating relevance for ${element.link}...`);
			element.relevance = await estimateQuality(term, element);
			console.log(
				`[LOG]: Estimated relevance: ${element.relevance} for ${element.link}`
			);
		})
	);
	const sortedResults = storage.sort((a, b) => b.relevance - a.relevance);
	console.log('[LOG]: Sorted results.');

	let papers = [];
	let i = 0;
	await Promise.all(
		sortedResults.map(async (e) => {
			console.log('[LOG]: Accessing page: ' + e.link);
			const content = await globalThis.fetch(e.link);
			const html = await content.text();
			const dom = new JSDOM(html);
			const r = new Readability(dom.window.document, {
				charThreshold: 100,
			});
			const article = r.parse();
			i++;
			if (!article) {
				console.log('[LOG]: Article could not be parsed, and will be ignored.');
			} else {
				if (article.textContent.length < 100) {
					console.log('[LOG]: Article is too short, and will be ignored.');
				} else if (article.textContent.length > 50000) {
					console.log('[LOG]: Article is too long, and will be ignored.');
				} else {
					console.log(
						`[LOG]: Article parsed. ${article.textContent.length} characters. Progress: ${i}/${sortedResults.length}`
					);
					papers.push(article.textContent);
				}
			}
		})
	);
	console.log('[LOG]: Papers fetched, and parsed correctly.');
	console.log('[LOG]: Total papers: ' + papers.length);
	console.log('[LOG]: Total characters: ' + papers.join('').length);
	console.log('[LOG]: Moving to next step.');
	console.log('[LOG]: Generating summary for each paper...');
})();
