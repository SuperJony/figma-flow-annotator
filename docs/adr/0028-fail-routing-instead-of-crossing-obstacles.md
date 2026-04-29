# Fail routing instead of crossing obstacles

When no legal **Orthogonal Route** can avoid all **Connector Obstacles**, connector creation or refresh should fail visibly instead of drawing through a context frame or annotation card. Creation should not create the connector, refresh should preserve the previous visual route when possible, and validation should report the routing failure as an error.

