create index if not exists document_signatures_org_time_page_idx
  on public.document_signatures (organization_id, signed_at desc, signature_id desc);

create index if not exists document_signatures_org_signer_time_page_idx
  on public.document_signatures (organization_id, signer_user_id, signed_at desc, signature_id desc)
  where signer_user_id is not null;
