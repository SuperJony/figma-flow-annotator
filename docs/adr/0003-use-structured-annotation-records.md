# Use structured annotation records

The first demo stores **Annotations** as structured records instead of free-text-only cards. Each record includes a visible number, optional title, required non-empty body, optional kind, subject node IDs, and context frame ID so the plugin can render standardized cards while later agent skills can extract the same design intent without guessing from visual text alone. The complete **Annotation** record lives on the **Annotation Card** visual root; **Subject Nodes** store only reverse references.
