# ADR-001: Multi-Tenant Architecture Strategy

## Status
Accepted

## Context
PrintFlow needs to serve multiple print shops while maintaining strict data isolation, cost-effective infrastructure, and the ability to scale. Each print shop (tenant) must have their data completely isolated from other shops for security and compliance reasons.

### Requirements
- Complete data isolation between print shops
- Cost-effective for small to medium-sized shops
- Easy onboarding of new shops
- Consistent feature set across all shops
- Ability to scale to hundreds of shops
- Simple backup and disaster recovery

### Options Considered

1. **Database-per-tenant**: Each shop gets its own database
2. **Schema-per-tenant**: Each shop gets its own schema within a shared database
3. **Single database with row-level isolation**: All shops share tables with shop_id foreign keys
4. **Hybrid approach**: Shared database with option to migrate large tenants

## Decision
We will implement **single database with row-level isolation** using `shop_id` foreign keys on all tables.

## Rationale

### Advantages of Chosen Approach
1. **Cost Efficiency**: Single database instance reduces infrastructure costs significantly
2. **Simplified Operations**: One database to backup, monitor, and maintain
3. **Easy Feature Rollout**: Schema changes apply to all tenants simultaneously
4. **Resource Efficiency**: Shared connection pooling and caching
5. **Straightforward Implementation**: Simple foreign key relationships

### Implementation Details
- Every table includes `shop_id UUID NOT NULL` with foreign key to `shops` table
- All queries automatically filtered by authenticated user's shop_id via middleware
- Database indexes optimized for shop_id + common query patterns
- Optional Row Level Security (RLS) as defense-in-depth

### Risk Mitigation
1. **Data Leakage Prevention**:
   - Middleware enforces shop_id filtering on ALL database queries
   - TypeScript types ensure shop_id is included in queries
   - Regular security audits of data access patterns
   - Optional PostgreSQL RLS for additional protection

2. **Performance at Scale**:
   - Proper indexing on (shop_id, *) for all common queries
   - Monitoring of slow queries per tenant
   - Ability to migrate large tenants to dedicated infrastructure

3. **Noisy Neighbor**:
   - Query timeouts and resource limits
   - Rate limiting per shop
   - Monitoring of resource usage per tenant

## Consequences

### Positive
- **Lower Costs**: ~90% reduction in infrastructure costs vs database-per-tenant
- **Faster Development**: No need to manage multiple database connections
- **Easier Maintenance**: Single point of backup and recovery
- **Better Resource Utilization**: Shared caching and connection pooling

### Negative
- **Complexity in Queries**: Every query must include shop_id filter
- **Risk of Data Leakage**: Programming error could expose cross-tenant data
- **Limited Customization**: Harder to customize schema per tenant
- **Scaling Limitations**: Very large tenants may impact others

### Neutral
- **Migration Path**: Can move to hybrid model if needed for large tenants
- **Compliance**: May need additional measures for specific regulatory requirements

## Implementation Checklist

- [x] Add shop_id to all tables in Prisma schema
- [x] Create tenant isolation middleware
- [x] Add TypeScript types for tenant context
- [x] Implement automatic shop_id filtering
- [x] Add validation to ensure shop_id is always present
- [ ] Implement PostgreSQL RLS as additional security layer
- [ ] Create monitoring for cross-tenant query attempts
- [ ] Document tenant isolation patterns for developers

## Monitoring and Validation

### Metrics to Track
- Query patterns to detect missing shop_id filters
- Performance metrics per tenant
- Resource usage per tenant
- Failed authorization attempts

### Regular Audits
- Monthly review of query logs for shop_id filtering
- Quarterly security audit of data access patterns
- Annual review of architecture decision based on growth

## References
- [Designing Multi-Tenant Applications](https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/overview)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [SaaS Tenancy Patterns](https://martinfowler.com/articles/multi-tenant.html)

## Decision Makers
- Tech Lead: [Name]
- Backend Architect: [Name]
- Security Lead: [Name]
- Date: 2024-01-15

## Review Date
This decision should be reviewed in 12 months or when we reach 100 active tenants, whichever comes first.