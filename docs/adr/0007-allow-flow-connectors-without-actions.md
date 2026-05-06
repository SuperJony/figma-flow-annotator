# Allow flow connectors without actions

**Flow Action** is optional. A **Flow Connector** without an action remains valid and should be extracted with a null action value; validation may warn that the flow semantics are incomplete, but it must not treat the connector as broken or infer a default action.

