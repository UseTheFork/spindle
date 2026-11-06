---
name: retrospective
description: "Assess a coding session and apply individually approved improvements."
disable-model-invocation: true
metadata:
  spindle:
    version: 1.1.2
---

Assess the selected coding session and help the maintainer improve future runs.

## Required skill

Before acting, load and follow **REQUIRED:** `int-retrospective`.

Identify this invocation as a `maintainer` retrospective in the calling context, forwarding the user's session selection and any proposal-report pointer as task context. With no session selection, the internal skill uses the current session. It owns evidence selection, assessment, approval, application, and verification.
