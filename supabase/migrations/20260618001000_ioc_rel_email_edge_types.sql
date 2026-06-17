-- Fix: store-email writes edge_type='extracted_from_email', but the original
-- ioc_relationships CHECK only allowed the Phase 2/3 edge types, so those email
-- -> IOC edges silently failed the constraint and never persisted (breaking
-- repeat-offender counting). Extend the allowed set.
alter table ioc_relationships drop constraint if exists ioc_relationships_edge_type_check;
alter table ioc_relationships add constraint ioc_relationships_edge_type_check
  check (edge_type in (
    'resolves_to', 'cert_san', 'hosted_on', 'signed_by', 'seen_with', 'related_hash',
    'extracted_from_email', 'sent_by'
  ));
