drop policy if exists family_members_owner_insert on public.family_members;
drop policy if exists family_members_owner_update on public.family_members;
drop policy if exists family_members_owner_delete on public.family_members;

-- Native Family Account mutations must go through auth.uid()-scoped RPCs.
-- Direct client writes could bypass pending -> accepted invite consent.
