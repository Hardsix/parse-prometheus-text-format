import { shallowEqualObjects } from "shallow-equal";
import { InvalidLineError } from "./InvalidLineError.js";
import { parseSampleLine } from "./parse-sample-line.js";

type MetricType = "COUNTER" | "GAUGE" | "SUMMARY" | "HISTOGRAM" | "UNTYPED";

interface BaseMetricSample {
  labels?: Record<string, string>;
  timestamp_ms?: string;
}

interface CounterSample extends BaseMetricSample {
  value: string;
}

interface GaugeSample extends BaseMetricSample {
  value: string;
}

interface SummarySample extends BaseMetricSample {
  quantiles?: Record<string, string>;
  count?: string;
  sum?: string;
}

interface HistogramSample extends BaseMetricSample {
  buckets: Record<string, string>;
  count: string;
  sum: string;
}

interface UntypedSample extends BaseMetricSample {
  value?: string;
}

type MetricSample<T extends MetricType = MetricType> = T extends "COUNTER"
  ? CounterSample
  : T extends "GAUGE"
  ? GaugeSample
  : T extends "SUMMARY"
  ? SummarySample
  : T extends "HISTOGRAM"
  ? HistogramSample
  : T extends "UNTYPED"
  ? UntypedSample
  :
      | CounterSample
      | GaugeSample
      | SummarySample
      | HistogramSample
      | UntypedSample;

type MetricFamily<T extends MetricType = MetricType> = {
  name: string;
  help: string;
  type: T;
  metrics: MetricSample<T>[];
};

type AnyMetricFamily =
  | MetricFamily<"COUNTER">
  | MetricFamily<"GAUGE">
  | MetricFamily<"SUMMARY">
  | MetricFamily<"HISTOGRAM">
  | MetricFamily<"UNTYPED">;

/*
Notes:
* Empty line handling is slightly looser than the original implementation.
* Everything else should be similarly strict.
*/
const SUMMARY_TYPE = "SUMMARY";
const HISTOGRAM_TYPE = "HISTOGRAM";

function parsePrometheusTextFormat(metrics: string): AnyMetricFamily[] {
  const lines = metrics.split("\n"); // Prometheus format defines LF endings
  const converted: AnyMetricFamily[] = [];

  let metric: string | null = null;
  let help: string | null = null;
  let type: string | null = null;
  let samples: any[] = [];

  for (let i = 0; i < lines.length; ++i) {
    const line = lines[i].trim();
    let lineMetric = null;
    let lineHelp = null;
    let lineType = null;
    let lineSample = null;
    if (line.length === 0) {
      // ignore blank lines
    } else if (line.startsWith("# ")) {
      // process metadata lines
      let lineData = line.substring(2);
      let instr = null;
      if (lineData.startsWith("HELP ")) {
        instr = 1;
      } else if (lineData.startsWith("TYPE ")) {
        instr = 2;
      }
      if (instr) {
        lineData = lineData.substring(5);
        const spaceIndex = lineData.indexOf(" ");
        if (spaceIndex !== -1) {
          // expect another token
          lineMetric = lineData.substring(0, spaceIndex);
          const remain = lineData.substring(spaceIndex + 1);
          if (instr === 1) {
            // HELP
            lineHelp = unescapeHelp(remain); // remain could be empty
          } else {
            // TYPE
            if (remain.includes(" ")) {
              throw new InvalidLineError(line);
            }
            lineType = remain.toUpperCase();
          }
        } else {
          throw new InvalidLineError(line);
        }
      }
      // 100% pure comment line, ignore
    } else {
      // process sample lines
      lineSample = parseSampleLine(line);
      lineMetric = lineSample.name;
    }

    if (lineMetric === metric) {
      // metadata always has same name
      if (!help && lineHelp) {
        help = lineHelp;
      } else if (!type && lineType) {
        type = lineType;
      }
    }

    // different types allow different suffixes
    const suffixedCount = `${metric}_count`;
    const suffixedSum = `${metric}_sum`;
    const suffixedBucket = `${metric}_bucket`;
    const allowedNames = [metric];
    if (type === SUMMARY_TYPE || type === HISTOGRAM_TYPE) {
      allowedNames.push(suffixedCount);
      allowedNames.push(suffixedSum);
    }
    if (type === HISTOGRAM_TYPE) {
      allowedNames.push(suffixedBucket);
    }

    // encountered new metric family or end of input
    if (
      i + 1 === lines.length ||
      (lineMetric && !allowedNames.includes(lineMetric))
    ) {
      // write current
      if (metric) {
        if (type === SUMMARY_TYPE) {
          samples = flattenMetrics(samples, "quantiles", "quantile", "value");
        } else if (type === HISTOGRAM_TYPE) {
          samples = flattenMetrics(samples, "buckets", "le", "bucket");
        }
        converted.push({
          name: metric,
          help: help ? help : "",
          type: (type as MetricFamily["type"]) || "UNTYPED",
          metrics: samples,
        });
      }
      // reset for new metric family
      metric = lineMetric;
      help = lineHelp ? lineHelp : null;
      type = lineType ? lineType : null;
      samples = [];
    }
    if (lineSample) {
      // key is not called value in official implementation if suffixed count, sum, or bucket
      if (lineSample.name !== metric) {
        if (type === SUMMARY_TYPE || type === HISTOGRAM_TYPE) {
          if (lineSample.name === suffixedCount) {
            lineSample.count = lineSample.value;
          } else if (lineSample.name === suffixedSum) {
            lineSample.sum = lineSample.value;
          }
        }
        if (type === HISTOGRAM_TYPE && lineSample.name === suffixedBucket) {
          lineSample.bucket = lineSample.value;
        }
        delete lineSample.value;
      }
      delete lineSample.name;
      // merge into existing sample if labels are deep equal
      const samplesLen = samples.length;
      const lastSample = samplesLen === 0 ? null : samples[samplesLen - 1];
      if (
        lastSample &&
        shallowEqualObjects(lineSample.labels, lastSample.labels)
      ) {
        delete lineSample.labels;
        for (const key in lineSample) {
          lastSample[key] = lineSample[key];
        }
      } else {
        samples.push(lineSample);
      }
    }
  }

  return converted;
}

function flattenMetrics(
  metrics: any[],
  groupName: string,
  keyName: string,
  valueName: string
): any[] {
  // Group metrics by their non-keyName labels to preserve series identity
  const groups: Record<string, any> = {};

  for (let i = 0; i < metrics.length; ++i) {
    const sample = metrics[i];

    // Create a key based on all labels except the keyName (le/quantile)
    const otherLabels = {};
    if (sample.labels) {
      for (const labelKey in sample.labels) {
        if (labelKey !== keyName) {
          otherLabels[labelKey] = sample.labels[labelKey];
        }
      }
    }
    const groupKey = JSON.stringify(otherLabels);

    if (!groups[groupKey]) {
      groups[groupKey] = {
        labels: Object.keys(otherLabels).length > 0 ? otherLabels : undefined,
        buckets: {},
        count: undefined,
        sum: undefined,
      };
    }

    const group = groups[groupKey];

    // Add bucket/quantile value
    if (sample.labels && sample.labels[keyName] && sample[valueName]) {
      group.buckets[sample.labels[keyName]] = sample[valueName];
    }

    // Add count and sum
    if (sample.count !== undefined) {
      group.count = sample.count;
    }
    if (sample.sum !== undefined) {
      group.sum = sample.sum;
    }
  }

  // Convert groups object to array
  const result = Object.values(groups).map((group) => {
    const metric: any = {};

    // Only add buckets/quantiles if there are any
    if (Object.keys(group.buckets).length > 0) {
      metric[groupName] = group.buckets;
    }

    if (group.labels) {
      metric.labels = group.labels;
    }
    if (group.count !== undefined) {
      metric.count = group.count;
    }
    if (group.sum !== undefined) {
      metric.sum = group.sum;
    }
    return metric;
  });

  return result.length > 0 ? result : metrics;
}

// adapted from https://github.com/prometheus/client_python/blob/0.0.19/prometheus_client/parser.py
function unescapeHelp(line: string): string {
  let result = "";
  let slash = false;

  for (let c = 0; c < line.length; ++c) {
    const char = line.charAt(c);
    if (slash) {
      if (char === "\\") {
        result += "\\";
      } else if (char === "n") {
        result += "\n";
      } else {
        result += `\\${char}`;
      }
      slash = false;
    } else {
      if (char === "\\") {
        slash = true;
      } else {
        result += char;
      }
    }
  }

  if (slash) {
    result += "\\";
  }

  return result;
}

export {
  parsePrometheusTextFormat,
  MetricType,
  MetricFamily,
  MetricSample,
  AnyMetricFamily,
  BaseMetricSample,
  CounterSample,
  GaugeSample,
  SummarySample,
  HistogramSample,
  UntypedSample,
};
