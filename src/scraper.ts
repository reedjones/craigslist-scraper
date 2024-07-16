import { PROXY_ROTATION_NAMES, SESSION_MAX_USAGE_COUNTS } from "./consts.js";
import { PlaywrightCrawler, Dataset, playwrightUtils } from "crawlee";
import { strict as assert } from "assert";
import { CraigslistPost, InputSchema, Search } from "./types.js";
import { validateInput, getRequestUrls } from "./validation.js";
import { Actor } from "apify";
import axios from "axios";





export class CrawlerSetup {

  // Provide typing information 
  name: string;
  search: Search;
  crawler!: PlaywrightCrawler | Promise<PlaywrightCrawler>;
  input: InputSchema;
  startUrls: string[];
  maxSessionUsageCount: number;
  maxPoolSize!: number;

  // Construct Playwright scraper with input defining the scope of the search
  constructor(input: InputSchema) {
    this.input = input;
    this.name = "Craigslist Playwright Scraper";
    this.search = validateInput(input);
    this.startUrls = getRequestUrls(this.search);
    this.maxSessionUsageCount = SESSION_MAX_USAGE_COUNTS[input.proxyRotation]!;
    if (this.input.proxyRotation === PROXY_ROTATION_NAMES.UNTIL_FAILURE) {
      this.maxPoolSize = 1;
    }
  }

  async getCrawler(): Promise<PlaywrightCrawler> {
    await axios.get(this.input.healthcheck!).catch(() => {});

    return new PlaywrightCrawler({
      maxConcurrency: this.input.maxConcurrency,
      maxRequestRetries: this.input.maxRequestRetries,
      maxRequestsPerCrawl: this.input.maxPagesPerCrawl,
      proxyConfiguration: await Actor.createProxyConfiguration(
        this.input.proxyConfiguration
      ),
      useSessionPool: true,
      sessionPoolOptions: {
        maxPoolSize: this.maxPoolSize,
        sessionOptions: {
          maxUsageCount: this.maxSessionUsageCount,
        },
      },
      headless: true,
      // for each request preform the following:
      requestHandler: async ({ page, request }) => {

        const key = request.url.replace(/[:/]/g, '_');
        
        console.log(`Scraping ${await page.title()} | ${request.url}`);
          const actorCard = page.locator('.results').first();
        // Upon calling one of the locator methods Playwright
        // waits for the element to render and then accesses it.
        
        await page.waitForSelector('.results', { timeout: 10000 });
        const actorText = await actorCard.textContent();
        const screenshot = await page.screenshot();
    // Save the screenshot to the default key-value store
       await playwrightUtils.saveSnapshot(page, { key, saveHtml: false });


        let postData: { content: string, title: string }[] = [];
        const posts = await page.$$eval(".result-node", nodes => {
          return nodes.map(node => {
            return { content: node.innerHTML, title: document.title };
          });
        });

        postData.push(...posts);

    console.log(`Got ${posts.length} posts`);
        await Actor.pushData(postData);

       

        if(this.input.externalAPI) {
          console.log('sending posts to external API ');
           await axios.post(this.input.externalAPI, posts).catch ( (err) => {
console.log(`There was an Error sending data to external API \n API: ${this.input.externalAPI} \n error: ${err}`);
             
           } )
        } else { console.log('will not send to external api'); }
        // Send All posts to backend django server for analyses
        // posts.forEach(async (post) => {
        //   await console.log(post)
        //   await axios.post(this.input.externalAPI!, post).catch(() => {});
        // });
        
      },
    });
  }
}
