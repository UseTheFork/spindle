import { expect, test } from "vitest";

import {
  createTicket,
  ticketFixture,
} from "../../../Helpers/SubagentDrivenDevelopment/ticket-helpers";

test("continuing a correction requires an assessment without a redundant result flag", async () => {
  const { service, feature } = await ticketFixture("Correction Assessment");
  const { ticket } = createTicket(service, feature.spec, "Correct a finding");
  const options = {
    spec: feature.spec,
    ticket,
    author: "controller",
    findings: ["F-0001"],
    details: "Correct the finding",
    decision: "continue",
  };

  expect(() => service.correctionService.correct(options)).toThrow(
    "--assessment is required with --decision continue",
  );
  expect(() =>
    service.correctionService.correct({
      ...options,
      assessment: "The previous correction improved the result.",
    }),
  ).toThrow("Only the recorded ticket controller");
});
