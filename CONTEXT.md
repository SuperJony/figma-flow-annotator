# Figma Flow Annotator

This context describes design annotations and flow connectors used to make Figma design intent readable by both designers and agents.

## Language

**Annotation**:
A single semantic design note bound to one or more Figma nodes.
_Avoid_: Annotator, comment, remark

**Annotation Number**:
The visible sequence number that pairs an **Annotation Card** with an **Annotation Badge**.
_Avoid_: Index, badge number

**Annotation Title**:
The short heading of an **Annotation**.
_Avoid_: Name, label

**Annotation Body**:
The detailed note text of an **Annotation**.
_Avoid_: Description, content

**Annotation Kind**:
The category of an **Annotation**, such as note, rule, interaction, or state.
_Avoid_: Type, tag

**Annotation Card**:
The detailed visual representation of an **Annotation**, usually placed below the related UI frame.
_Avoid_: Annotation, annotator

**Design Notes Area**:
The area below a **Context Frame** where **Annotation Cards** are placed.
_Avoid_: Card area, note zone

**Annotation Badge**:
One numbered visual anchor instance for an **Annotation**, usually placed near one **Subject Node**.
_Avoid_: Badge annotation, marker

**Subject Node**:
The Figma node that an **Annotation** explains.
_Avoid_: Target, annotated node

**Context Frame**:
The UI frame that owns an **Annotation** as part of a design scene.
_Avoid_: Parent frame, page frame

**Temporary Page Context**:
The current Figma page used as the owning **Annotation** context when selected **Subject Nodes** do not share a **Context Frame**.
_Avoid_: Page frame, root frame

**Owner Context Frame**:
The **Context Frame** that owns a **Flow Connector** for extraction and grouping.
_Avoid_: Connector frame, parent context

**Flow Endpoint**:
The Figma node used as the start or end of a **Flow Connector**.
_Avoid_: Anchor, endpoint coordinate

**Connection Point**:
The boundary point where a **Flow Connector** enters or exits a **Flow Endpoint**.
_Avoid_: Center point, anchor coordinate

**Flow Connector**:
A standardized visual connector that represents a directed relationship from one Figma node to another.
_Avoid_: Arrow, line, wire

**Connector Route**:
The visual path of a **Flow Connector** between its **Connection Points**.
_Avoid_: Line path, connector shape

**Orthogonal Route**:
A **Connector Route** made only of horizontal and vertical line segments.
_Avoid_: Curved route, freeform route

**Rounded Corner**:
A visual smoothing of a bend in an **Orthogonal Route** that does not change the route's semantic points.
_Avoid_: Curved route

**Connector Trunk**:
The final shared segment used when multiple **Flow Connectors** enter the same **Flow Endpoint** from the same direction.
_Avoid_: Merged line, shared tail

**Connector Obstacle**:
A Figma node boundary that a routed **Flow Connector** should avoid crossing.
_Avoid_: Blocker, avoidance node

**Flow Action**:
The optional action label on a **Flow Connector**, such as click, input, or choose command.
_Avoid_: Connector label, arrow text

**Orphaned Annotation**:
An **Annotation** whose required **Annotation Card**, **Context Frame**, or all **Subject Nodes** no longer exist.
_Avoid_: Broken annotation, dangling annotation

**Orphaned Flow Connector**:
A **Flow Connector** whose start or end **Flow Endpoint** no longer exists.
_Avoid_: Broken connector, dangling connector

**Duplicate Flow Connector**:
More than one **Flow Connector** with the same ordered start **Flow Endpoint** and end **Flow Endpoint**.
_Avoid_: Parallel same-link connector

**Stale Reverse Index**:
A node-to-connector reference that points to a deleted **Flow Connector** visual root.
_Avoid_: Broken index, dangling id

**Figma File Operation**:
A runtime-neutral instruction emitted by shared core for creating or updating project-owned Figma file nodes and shared plugin data.
_Avoid_: Document operation, change plan

**Figma File Operation Batch**:
The ordered **Figma File Operations** for one authoring command, applied by a runtime-specific Figma writer.
_Avoid_: Document Change Plan, plan

## Relationships

- An **Annotation** has exactly one **Annotation Card**.
- An **Annotation Card** is usually placed in the **Design Notes Area** of its **Context Frame**.
- An **Annotation** has exactly one **Annotation Number**.
- An **Annotation** may have one **Annotation Title**.
- An **Annotation** must have one non-empty **Annotation Body**.
- An **Annotation** may have one **Annotation Kind**.
- An **Annotation** may have zero or more **Annotation Badges**.
- An **Annotation Card** and its **Annotation Badges** refer to the same **Annotation**.
- An **Annotation** is bound to one or more **Subject Nodes**.
- A **Subject Node** may be bound to multiple **Annotations**.
- An **Annotation Badge** belongs to exactly one **Subject Node**.
- A **Subject Node** may have multiple **Annotation Badges** when they refer to different **Annotations**.
- A **Subject Node** should not have more than one **Annotation Badge** for the same **Annotation**.
- By default, an **Annotation** with multiple **Subject Nodes** has one **Annotation Badge** for each **Subject Node**.
- Multiple **Annotation Badges** may share the same **Annotation Number** when they refer to the same **Annotation**.
- An **Annotation** belongs to exactly one context: either one **Context Frame** or the current page as a **Temporary Page Context**.
- An **Annotation Number** is unique within its owning context.
- An **Annotation Number** remains stable after other **Annotations** are deleted.
- A **Subject Node** and its **Context Frame** may be the same Figma frame.
- A **Flow Endpoint** may be a **Subject Node** or a **Context Frame**.
- **Annotation Cards** and **Annotation Badges** are not **Flow Endpoints**.
- A **Flow Connector** records exactly one start **Flow Endpoint** and one end **Flow Endpoint**.
- A **Flow Connector** belongs to exactly one **Owner Context Frame**.
- A cross-frame **Flow Connector** belongs to the start endpoint's **Context Frame**.
- Creating a **Flow Connector** requires exactly two **Flow Endpoints**.
- A **Flow Connector** enters and exits **Flow Endpoints** through **Connection Points**.
- A **Flow Connector** uses an **Orthogonal Route**.
- An **Orthogonal Route** may render bends with **Rounded Corners**.
- Only one **Flow Connector** may exist for the same ordered start and end **Flow Endpoints**.
- A **Duplicate Flow Connector** violates the flow model and must be resolved before reliable extraction.
- Multiple **Flow Connectors** entering the same **Flow Endpoint** from the same direction share a **Connector Trunk** near that endpoint.
- **Flow Connectors** with different end **Flow Endpoints** or opposite directions do not share a **Connector Trunk**.
- A **Flow Connector** may have one **Flow Action**.
- **Context Frames** and **Annotation Cards** are **Connector Obstacles**.
- **Annotation Badges** are not **Connector Obstacles**, but should appear above **Flow Connectors**.
- An **Annotation** remains valid when only its optional **Annotation Badge** is deleted.
- A **Subject Node** remains bound to its **Annotation** after its **Annotation Badge** is deleted.
- An **Annotation** becomes an **Orphaned Annotation** when its required **Annotation Card**, **Context Frame**, or every **Subject Node** is deleted.
- A **Flow Connector** becomes an **Orphaned Flow Connector** when either **Flow Endpoint** is deleted.
- Deleting a **Flow Connector** visual root deletes that **Flow Connector**.
- A deleted **Flow Connector** may leave a **Stale Reverse Index** on its former **Flow Endpoints**.
- A **Figma File Operation Batch** may create **Annotation Cards**, **Annotation Badges**, **Flow Connectors**, containers, shared plugin data, and reverse references.
- A **Figma File Operation Batch** does not call the Figma Plugin API directly.

## Example Dialogue

> **Dev:** "When a designer selects multiple UI nodes and creates one **Annotation**, how many **Annotation Badges** should appear?"
> **Domain expert:** "The **Annotation Card** is shared, and each selected **Subject Node** gets its own **Annotation Badge** with the same **Annotation Number**."

## Flagged Ambiguities

- "annotator" was used to mean the note content, but it reads like the tool or author. Resolved: use **Annotation** for the semantic record and reserve visual node names for **Annotation Card** and **Annotation Badge**.
