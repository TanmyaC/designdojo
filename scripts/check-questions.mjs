// Validate every file in questions/. Exit code 1 if any file has errors (used by CI and before builds).
import path from "node:path";
import { loadCatalog } from "../lib/catalog-core.mjs";

const qs = loadCatalog(path.resolve(process.cwd(), "questions"));
let bad = 0, warned = 0;
for (const q of qs) {
  if (q.errors.length) { bad++; console.log(`✗ questions/${q.id}.md`); q.errors.forEach((e) => console.log(`    error: ${e}`)); }
  if (q.warnings.length) { warned++; if (!q.errors.length) console.log(`! questions/${q.id}.md`); q.warnings.forEach((w) => console.log(`    warning: ${w}`)); }
}
const ok = qs.length - bad;
console.log(`\n${ok} of ${qs.length} question${qs.length === 1 ? "" : "s"} valid${warned ? `, ${warned} with warnings` : ""}.`);
if (!qs.length) { console.log("No questions found in questions/."); process.exit(1); }
if (bad) process.exit(1);
