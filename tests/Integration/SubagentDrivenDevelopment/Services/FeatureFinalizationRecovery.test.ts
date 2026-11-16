import { readFileSync } from "node:fs";

import { GitService } from "@spindle/Git/Services/GitService";
import { DeliveryService } from "@spindle/SubagentDrivenDevelopment/Services/DeliveryService";
import {
  appAt,
  originalIgnoredArtifacts,
  readyFeature,
  recordFinal,
} from "@test/Helpers/SubagentDrivenDevelopment/FeatureFinalizationFixture";
import { cliOutput, invokeAsync } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

test.each(["record-commit", "merge-index", "merge-commit", "metadata-commit", "remove", "delete"])(
  "real gates and exact journal recover after interruption following %s",
  async (where) => {
    const f = await readyFeature();
    const artifacts = originalIgnoredArtifacts(f);
    let root = f.root;
    if (where === "metadata-commit" || where === "remove" || where === "delete") {
      cliOutput(await f.finish());
      cliOutput(await recordFinal(f));
      root = f.original;
    }
    const app = await appAt(root);
    const gitService = await app.make(GitService);
    const originalRun = gitService.run.bind(gitService);
    let interrupted = false;
    const spy = vi.spyOn(gitService, "run").mockImplementation((args, options) => {
      const result = originalRun(args, options as never) as never;
      const matches =
        where === "record-commit"
          ? args.includes("commit") && options?.cwd === f.root
          : where === "merge-index"
            ? args.includes("merge") && args.includes("--no-ff")
            : where === "merge-commit"
              ? args.includes("commit") && options?.cwd === f.original
              : where === "metadata-commit"
                ? args.includes("commit") && options?.cwd === f.original
                : where === "remove"
                  ? args.includes("worktree") && args.includes("remove")
                  : args.includes("update-ref");
      if (matches && !interrupted) {
        interrupted = true;
        throw new Error("fixture interruption after Git mutation");
      }
      return result;
    });
    const delivery = await app.make(DeliveryService);
    expect(() =>
      delivery.finish({
        spec: root === f.root ? f.spec : f.originalSpec,
        author: "controller",
        report: f.report,
      }),
    ).toThrow("fixture interruption");
    for (const file of artifacts) expect(readFileSync(file.path, "utf8")).toBe(file.content);
    spy.mockRestore();
    const recovered =
      root === f.root
        ? cliOutput(await f.finish())
        : cliOutput(
            await invokeAsync(f.original, [
              "finish",
              "--feature",
              f.originalSpec.replace(/\/spec\.md$/, ""),
              "--actor",
              "controller",
            ]),
          );
    if (root === f.root) expect(recovered.finalValidation).toBe("pending");
    else expect(recovered.finished).toBe(true);
    for (const file of artifacts) expect(readFileSync(file.path, "utf8")).toBe(file.content);
  },
);
