# Create custom flow connectors in Figma Design

The plugin targets Figma Design, so **Flow Connectors** are custom visual node groups rather than native Figma `ConnectorNode` objects, which are only available in FigJam. Each custom connector stores its start endpoint, end endpoint, and optional flow action in shared plugin data so later plugin commands and agent skills can extract the relationship from Figma Design files.

