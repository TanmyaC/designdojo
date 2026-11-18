// Create questions/<id>.md from the template:  npm run question:new -- "Design a web crawler"
import fs from "node:fs";
import path from "node:path";
import { slugify } from "../lib/catalog-core.mjs";

const title = process.argv.slice(2).join(" ").trim();
if (!title) { console.error('Usage: npm run question:new -- "Design a web crawler"'); process.exit(1); }
const full = /^design\b/i.test(title) ? title.replace(/^design/i, "Design") : `Design ${title}`;
const id = slugify(full);
const dir = path.resolve(process.cwd(), "questions"), file = path.join(dir, `${id}.md`);
if (fs.existsSync(file)) { console.error(`questions/${id}.md already exists.`); process.exit(1); }
const subject = full.replace(/^Design\s+/, "");
const text = fs.readFileSync(path.join(dir, "_TEMPLATE.md"), "utf8")
  .replace("title: Design a <system>", `title: ${full}`)
  .replace("Let's design <system>.", `Let's design ${subject}.`);
fs.writeFileSync(file, text);
console.log(`Created questions/${id}.md\nFill it in, then run: npm run questions:check`);
