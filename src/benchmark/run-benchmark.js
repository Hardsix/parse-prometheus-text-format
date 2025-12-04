import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePrometheusTextFormat } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputStr = fs.readFileSync(
  path.join(__dirname, "../__tests__/input-output-pairs/simple/input.txt"),
  "utf8"
);

console.time("parse 50000 times");
for (let i = 0; i < 50000; ++i) {
  parsePrometheusTextFormat(inputStr);
}
console.timeEnd("parse 50000 times");
