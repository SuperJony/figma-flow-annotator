# Share trunks for different directed connector pairs

Only one **Flow Connector** may exist for the same ordered start and end endpoints. Shared **Connector Trunks** apply to different directed connector pairs that enter the same end endpoint from the same direction, such as A -> C and B -> C. Their final segment should overlap as a shared trunk and branch upstream instead of running as separate parallel lines all the way into the endpoint. Connectors with different end **Flow Endpoints** or opposite directions should not share a trunk, because that would blur distinct flow semantics.
