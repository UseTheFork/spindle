# Flatten Single-File Blueprint Kinds

Agents and Instructions are authored as one-file Blueprint directories and installed as single files at their kind-specific destinations. This keeps discovery, Stack overlays, and duplicate-output validation in the shared lifecycle while supporting the flat file layout expected by GitHub; flat source files would require a separate discovery path, and handler-owned installation would duplicate lifecycle behavior.
