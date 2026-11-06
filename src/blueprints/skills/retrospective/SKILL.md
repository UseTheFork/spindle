---
name: retrospective
description: "Assess a coding session and apply individually approved improvements."
disable-model-invocation: true
metadata:
  spindle:
    version: 1.1.1
---

Assess the selected coding session and help the maintainer improve future runs.

## Required skill

Before acting, load and follow **REQUIRED:** `int-retrospective`.

Supply arguments `--entry maintainer`, forwarding the user's session selection and any proposal-report pointer as task context. The internal skill owns evidence selection, assessment, approval, application, and verification.
