# Use a persistent plugin panel

The first demo opens through a single Figma menu command, **Open Flow Annotator**, and keeps a persistent plugin UI panel open while designers work. The nine first-demo operations live inside this panel instead of becoming separate Figma menu commands. A persistent panel is required for reliable connector creation because the plugin must observe selection changes while it is open to infer start/end selection order, and it also provides a place for annotation body entry, flow action editing, validation results, and swap controls.
