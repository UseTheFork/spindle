# Example feature workflow

This example shows a small feature with two dependent tickets. Ticket Markdown
holds requirements and acceptance criteria; `sdd.json` holds workflow state.
The exact command for each transition comes from `sdd next`.

1. Create a feature workspace and split independent work into tickets. Fill the
   ticket requirements and acceptance criteria, then record that `T-0002`
   depends on `T-0001`.
2. Ask `sdd next` for the current step. It identifies ready work and provides
   the dispatch command. Keep the two ticket worktrees separate.
3. The implementer changes and commits `T-0001`, then returns its report. The
   controller submits the report, obtains a review of that exact commit, and
   integrates the approved work. Record passing post-merge checks before
   treating the ticket as complete.
4. Once `T-0001` is complete, `T-0002` becomes ready. Repeat the same
   implement, report, review, integration, and post-merge validation steps.
5. After both tickets are complete, claim delivery ownership and follow the
   delivery checks and feature-review steps reported by `sdd next`. Add only
   justified specialists.
6. Submit every assigned report. The controller registers accepted findings
   from their reports. A blocking finding can return work to its related
   ticket; choose each correction separately, then obtain fresh checks and
   focused review.
7. Declare the complete final-check list before finishing. After the feature
   merge, run and record those checks in the original checkout. Clean up only
   after the recorded final checks pass.
