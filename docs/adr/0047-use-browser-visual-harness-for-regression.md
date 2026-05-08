# Use browser visual harness for regression

The first demo should verify **Flow Connector** visuals and plugin panel states through a deterministic browser visual harness that reuses the plugin's route/SVG and UI rendering paths, while keeping real Figma desktop checks as low-frequency smoke tests before demo or release. Direct desktop automation is too stateful for routine agent verification, and pure semantic tests cannot show whether **Connector Routes**, arrowheads, **Flow Action** labels, and panel states remain visually readable.
