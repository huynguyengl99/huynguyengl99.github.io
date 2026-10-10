// Renders every scripts/covers/part-NN.html to a 2400x1350 PNG beside the post
// it belongs to. Playwright is not a dependency of the blog, so this runs it
// through npx:
//
//   npx -y playwright@latest install chromium   # once
//   node scripts/covers/render.mjs
//
// Pass part numbers to render a subset: node scripts/covers/render.mjs 00 01
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../src/content/posts/agent-graph-engineering/_images");

const wanted = process.argv.slice(2);
const pages = (await readdir(here))
  .filter(f => /^part-\d\d\.html$/.test(f))
  .filter(f => wanted.length === 0 || wanted.includes(f.slice(5, 7)))
  .sort();

const browser = await chromium.launch();
for (const file of pages) {
  const part = file.slice(5, 7);
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1.5,
  });
  await page.goto(pathToFileURL(resolve(here, file)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(out, `cover-${part}.png`) });
  await page.close();
  console.log(`cover-${part}.png`);
}
await browser.close();
