import { describe, it, expect } from "vitest";
import { compareVersions, isNewer, parseChangelog, notesSince } from "./update.js";

describe("compareVersions", () => {
  it("orders numerically, not lexically", () => {
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1); // 9 < 10
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("treats missing segments as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.1", "1.2")).toBe(1);
  });

  it("doesn't throw on malformed input", () => {
    expect(compareVersions("", "0.0.0")).toBe(0);
    // "v1.x" → segments parse to 0.0; less than 1.0.0. Just shouldn't throw.
    expect(compareVersions("v1.x", "1.0.0")).toBe(-1);
  });
});

describe("isNewer", () => {
  it("is true only when latest > current", () => {
    expect(isNewer("0.12.0", "0.11.0")).toBe(true);
    expect(isNewer("0.11.0", "0.11.0")).toBe(false);
    expect(isNewer("0.10.0", "0.11.0")).toBe(false);
  });
});

const SAMPLE = `# Changelog

Some intro text that should be ignored.

## [0.12.0]

### Added
- Cool new thing.

## [0.11.0]

### Fixed
- An old bug.

## [0.2.1]

### Added
- Ancient history.
`;

describe("parseChangelog", () => {
  it("splits into version sections in document order, ignoring the intro", () => {
    const s = parseChangelog(SAMPLE);
    expect(s.map((x) => x.version)).toEqual(["0.12.0", "0.11.0", "0.2.1"]);
    expect(s[0].body).toContain("Cool new thing");
    expect(s[0].body).not.toContain("Changelog"); // intro excluded
    expect(s[1].body).toContain("An old bug");
  });

  it("returns [] for empty or headerless input", () => {
    expect(parseChangelog("")).toEqual([]);
    expect(parseChangelog("just prose, no versions")).toEqual([]);
  });
});

describe("notesSince", () => {
  it("collects only versions newer than current, newest first", () => {
    const notes = notesSince(parseChangelog(SAMPLE), "0.11.0");
    expect(notes).toContain("v0.12.0");
    expect(notes).toContain("Cool new thing");
    expect(notes).not.toContain("An old bug"); // 0.11.0 is not > 0.11.0
    expect(notes).not.toContain("Ancient history");
  });

  it("is empty when current is already the latest", () => {
    expect(notesSince(parseChangelog(SAMPLE), "0.12.0")).toBe("");
  });
});
