import { afterEach, expect, test, vi } from "vitest";

import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";

afterEach(() => vi.restoreAllMocks());

test("human results share styling while notices and errors use stderr", () => {
  const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
  const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
  const output = new ConsoleOutputService();
  output.result({ level: "success", human: ["Created feature", "Saved records"], data: { id: 1 } });
  output.notice("warning", "Unmanaged file preserved");
  output.error(new Error("Cannot write configuration"));

  expect(stdout.mock.calls.map(([message]) => message)).toEqual([
    expect.stringContaining("Created feature"),
    expect.stringContaining("Saved records"),
  ]);
  expect(stdout.mock.calls[0][0]).toContain("✔");
  expect(stderr.mock.calls).toEqual([
    [expect.stringContaining("Unmanaged file preserved")],
    [expect.stringContaining("Cannot write configuration")],
  ]);
});

test("JSON results exclude human presentation and keep diagnostics on stderr", () => {
  const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
  const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
  const output = new ConsoleOutputService();
  output.setMode("json");
  output.notice("info", "Preparing changes");
  output.notice("warning", "File preserved");
  output.result({ level: "success", human: "Not machine data", data: { name: "draft" } });
  output.error(new Error("Write failed\nTry again"));

  expect(stdout.mock.calls).toEqual([['{"ok":true,"data":{"name":"draft"}}']]);
  expect(stderr.mock.calls.map(([message]) => JSON.parse(message))).toEqual([
    { level: "info", message: "Preparing changes" },
    { level: "warning", message: "File preserved" },
    { ok: false, error: { message: "Write failed\nTry again" } },
  ]);
});

test("invalid or unserializable JSON results fail before emitting a result", () => {
  const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
  const output = new ConsoleOutputService();
  output.setMode("json");
  expect(() => output.result({ level: "info", human: "", data: undefined })).toThrow(
    /must define JSON data/,
  );
  expect(() => output.result({ level: "info", human: "", data: { number: 1n } })).toThrow();
  expect(stdout).not.toHaveBeenCalled();
});
