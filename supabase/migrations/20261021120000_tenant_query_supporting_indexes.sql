create index if not exists document_signatures_org_employee_time_page_idx
  on public.document_signatures (organization_id, employee_id, signed_at desc, signature_id desc);

create index if not exists protocol_batch_employees_org_employee_batch_idx
  on public.protocol_batch_employees (organization_id, employee_id, batch_id);

drop index if exists public.document_signatures_employee_time_idx;
