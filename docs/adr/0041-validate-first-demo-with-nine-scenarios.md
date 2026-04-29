# Validate first demo with nine scenarios

The first demo is accepted only when these nine scenarios work end to end:

1. Selecting one node and creating an **Annotation** creates one **Annotation Card**, one nearby **Annotation Badge**, and a shared-plugin-data record.
2. Selecting multiple nodes and creating one **Annotation** creates one shared card and one same-number badge beside each **Subject Node**.
3. **Add Subject Nodes** appends selected subjects and same-number badges to an existing **Annotation** without changing its **Annotation Number**.
4. Deleting one badge causes validation to warn while the **Annotation** remains valid.
5. After the plugin opens, selecting A then shift-selecting B creates a directed A -> B **Flow Connector** with a shared-plugin-data record.
6. For three horizontal **Context Frames**, a 1 -> 3 connector routes around frame 2 and around **Annotation Cards**.
7. Different connectors with different starts, the same end, and the same incoming side share the final **Connector Trunk**.
8. Creating A -> B when A -> B already exists updates the existing connector's **Flow Action** and route instead of creating a duplicate connector.
9. Deleting a **Flow Endpoint** used by an existing **Flow Connector** causes validation to report an **Orphaned Flow Connector** error.
