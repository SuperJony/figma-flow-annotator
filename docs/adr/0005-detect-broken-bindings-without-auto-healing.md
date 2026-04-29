# Detect broken bindings without auto-healing

The first demo reports **Orphaned Annotations** and **Orphaned Flow Connectors** instead of trying to infer replacement nodes. Figma canvas edits can delete cards, badges, subject nodes, context frames, or endpoints independently, and guessing a new binding would risk corrupting the design intent; validation should surface the issue for an explicit human repair.

