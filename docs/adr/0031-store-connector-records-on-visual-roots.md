# Store connector records on visual roots

The complete **Flow Connector** record lives on the connector visual root node. Start and end **Flow Endpoints** store only reverse indexes of related connector IDs, avoiding duplicated connector records across endpoints while still supporting node-to-connector lookup.

