# Store connector records with route cache

**Flow Connector** semantic records are stored in shared plugin data just like **Annotation** records. The semantic fields include connector ID, start endpoint, end endpoint, owner context frame, and optional flow action; route points are stored alongside them only as derived visual cache that refresh can overwrite without changing the connector's flow meaning.

