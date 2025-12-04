const fs = require("fs");
const path = require("path");
const { parsePrometheusTextFormat } = require("../../dist/index.js");

const inputStr = fs.readFileSync(
  path.join(__dirname, "../__tests__/input-output-pairs/simple/input.txt"),
  "utf8"
);

console.time("parse 50000 times");
for (let i = 0; i < 50000; ++i) {
  parsePrometheusTextFormat(inputStr);
}
console.timeEnd("parse 50000 times");
