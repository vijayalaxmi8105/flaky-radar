import { XMLParser } from "fast-xml-parser";

export type TestExecutionStatus = "passed" | "failed" | "error" | "skipped";

export interface ParsedTestCase {
  suiteName: string;
  testName: string;
  status: TestExecutionStatus;
  durationMs: number;
  errorMessage: string | null;
  stackTrace: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function getText(node: any): string | null {
  if (node === undefined || node === null) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "object" && "#text" in node) {
    const text = node["#text"];
    return typeof text === "string" ? text.trim() || null : null;
  }
  return null;
}

function truncate(value: string | null, maxLen = 4000): string | null {
  if (value === null) return null;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

export function parseJunitXml(xml: string): ParsedTestCase[] {
  const parsed = parser.parse(xml);

  const root = parsed.testsuites ?? parsed.testsuite;
  if (!root) {
    throw new Error("Invalid JUnit XML: no <testsuites> or <testsuite> root element found");
  }

  const suites = parsed.testsuites
    ? toArray(parsed.testsuites.testsuite)
    : toArray(parsed.testsuite);

  const results: ParsedTestCase[] = [];

  for (const suite of suites) {
    const outerSuiteName: string = suite["@_name"] ?? "unknown_suite";
    const testcases = toArray(suite.testcase);

    for (const tc of testcases) {
      const classname: string | undefined = tc["@_classname"];
      const suiteName = classname && classname.trim() !== "" ? classname : outerSuiteName;
      const testName: string = tc["@_name"] ?? "unnamed_test";
      const timeSeconds = parseFloat(tc["@_time"] ?? "0");
      const durationMs = Number.isFinite(timeSeconds) ? Math.round(timeSeconds * 1000) : 0;

      let status: TestExecutionStatus = "passed";
      let errorMessage: string | null = null;
      let stackTrace: string | null = null;

      if (tc.failure !== undefined) {
        status = "failed";
        const failure = Array.isArray(tc.failure) ? tc.failure[0] : tc.failure;
        errorMessage = failure["@_message"] ?? null;
        stackTrace = getText(failure) ?? errorMessage;
      } else if (tc.error !== undefined) {
        status = "error";
        const error = Array.isArray(tc.error) ? tc.error[0] : tc.error;
        errorMessage = error["@_message"] ?? null;
        stackTrace = getText(error) ?? errorMessage;
      } else if (tc.skipped !== undefined) {
        status = "skipped";
        const skipped = Array.isArray(tc.skipped) ? tc.skipped[0] : tc.skipped;
        errorMessage = typeof skipped === "object" ? skipped["@_message"] ?? null : null;
      }

      results.push({
        suiteName,
        testName,
        status,
        durationMs,
        errorMessage: truncate(errorMessage, 1000),
        stackTrace: truncate(stackTrace, 4000),
      });
    }
  }

  return results;
}