import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { Application } from "@/Foundation/Application";
import { DiscoverGitRoot } from "@/Foundation/Bootstrap/DiscoverGitRoot";
import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { RegisterProviders } from "@/Foundation/Bootstrap/RegisterProviders";
import { ServiceProvider } from "@/Foundation/ServiceProvider";

import { fixture } from "../SubagentDrivenDevelopment/helpers/helpers";

test("external providers observe malformed configuration after discovery without blocking bootstrap", async () => {
  const { repo } = fixture();
  const nested = join(repo, "nested");
  mkdirSync(nested);
  mkdirSync(join(repo, ".github"), { recursive: true });
  writeFileSync(join(repo, ".github", "spindle.json"), "{");
  const app = new Application({ basePath: nested });
  const observations: unknown[] = [];
  class ConfigurationObserver extends ServiceProvider {
    public constructor(application: Application) {
      super(application);
      observations.push(application.value("config.project"));
    }
    public register(): void {
      expect(this.app.workspaceRoot).toBe(repo);
      observations.push(this.app.value("config.project"));
    }
    public async boot(): Promise<void> {
      observations.push(this.app.value("config.project"));
    }
  }
  app.selectBootstrapProviders([ConfigurationObserver]);
  await app.bootstrapWith([DiscoverGitRoot, LoadProjectConfiguration, RegisterProviders]);
  await app.boot();
  expect(app.hasBeenBootstrapped).toBe(true);
  expect(observations).toHaveLength(3);
  for (const state of observations) {
    expect(state).toMatchObject({ status: "invalid", data: "{", error: expect.any(SyntaxError) });
  }
  expect(app.config.has("project")).toBe(false);
});
