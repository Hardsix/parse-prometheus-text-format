import fs from "node:fs";
import path from "node:path";
import { parsePrometheusTextFormat, MetricFamily } from "../index.js";

const inputOutputPairs = [
  {
    input: fs.readFileSync(
      path.join(__dirname, "./input-output-pairs/simple/input.txt"),
      "utf8"
    ),
    output: fs.readFileSync(
      path.join(__dirname, "./input-output-pairs/simple/expected-output.json"),
      "utf8"
    ),
  },
  {
    input: fs.readFileSync(
      path.join(__dirname, "./input-output-pairs/labels/input.txt"),
      "utf8"
    ),
    output: fs.readFileSync(
      path.join(__dirname, "./input-output-pairs/labels/expected-output.json"),
      "utf8"
    ),
  },
];

describe("parsePrometheusTextFormat", () => {
  it("should parse Prometheus text format correctly", () => {
    const expected = sortPromJSON(
      normalizeNumberValues(JSON.parse(inputOutputPairs[0].output))
    );
    const actual = sortPromJSON(
      normalizeNumberValues(
        parsePrometheusTextFormat(inputOutputPairs[0].input)
      )
    );
    expect(actual).toEqual(expected);
  });

  it("should parse histograms with labels correctly", () => {
    const expected = sortPromJSON(
      normalizeNumberValues(JSON.parse(inputOutputPairs[1].output))
    );
    const actual = sortPromJSON(
      normalizeNumberValues(
        parsePrometheusTextFormat(inputOutputPairs[1].input)
      )
    );

    expect(actual).toEqual(expected);
  });
});

/**
 * Normalizes the "value", "count", and "sum" prop of metric fields by converting to Number type.
 *
 * Since all numbers are string encoded (such as "3851.0" or
 * "1.458255915e9"), it is necessary to normalize all number values before
 * comparing against the prom2json CLI output, to ensure that "3851.0" equals
 * "3851" and "1.458255915e+09" equals "1.458255915e9" in tests.
 *
 * @param promJSON - the JSON array that is the result of parsing prometheus text
 */
function normalizeNumberValues(promJSON: MetricFamily[]): any[] {
  return promJSON.map((family) => ({
    ...family,
    metrics: family.metrics.map((metric: any) => ({
      ...metric,
      value: Number(metric.value),
      count: Number(metric.count),
      sum: Number(metric.sum),
    })),
  }));
}

/**
 * Sorts the promJSON array by metric family name.
 *
 * Sorting is necessary for testing against the prom2json CLI because the
 * prom2json CLI outputs the metrics in a non-deterministic order.
 *
 * @param promJSON - the JSON that is the result of parsing prometheus text
 */
function sortPromJSON(promJSON: any[]): any[] {
  return promJSON.sort((family1, family2) => {
    if (family1.name < family2.name) {
      return -1;
    }
    if (family1.name > family2.name) {
      return 1;
    }
    return 0;
  });
}
