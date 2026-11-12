import { afterEach, expect, test, vi } from "vitest";

import { Application } from "@/Foundation/Application";
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";

afterEach(() => vi.restoreAllMocks());

test("output modes belong to individual application singletons", async () => {
  const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
  const first = new Application({ basePath: "/first" });
  const second = new Application({ basePath: "/second" });
  const json = await first.make(ConsoleOutputService);
  json.setMode("json");
  const human = await second.make(ConsoleOutputService);
  json.result({ level: "info", human: "JSON result", data: [] });
  human.result({ level: "info", human: "Human result", data: [] });

  expect(await first.make(ConsoleOutputService)).toBe(json);
  expect(stdout.mock.calls).toEqual([['{"ok":true,"data":[]}'], ["Human result"]]);
});
