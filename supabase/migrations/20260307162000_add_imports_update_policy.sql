drop policy if exists "imports_update_manageable" on public.imports;
create policy "imports_update_manageable"
  on public.imports
  for update
  to authenticated
  using (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter'])
    and public.can_access_agency(agency_id)
  )
  with check (
    public.current_user_has_agency_role(array['owner', 'manager', 'recruiter'])
    and public.can_access_agency(agency_id)
  );
