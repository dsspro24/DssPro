export function buildDssOrganization({
  summary,
  savedOrganization,
  resourceAccess = [],
  specialistId,
  canManageWorkspace,
}) {
  const fallbackResourceSettings = Object.fromEntries(
    resourceAccess.map(({ document_id: documentId, settings }) => [documentId, settings ?? {}]),
  );
  const fallbackOrganization = {
    ...summary,
    resources: resourceAccess.map(({ document_id: documentId }) => documentId),
    resourceSettings: fallbackResourceSettings,
  };
  const source = savedOrganization ?? fallbackOrganization;

  return {
    ...summary,
    ...source,
    id: summary.id,
    name: summary.name,
    companyCode: summary.companyCode,
    dss: [...new Set([...(source.dss ?? []), specialistId])],
    canManageWorkspace: canManageWorkspace === true,
    resources: source.resources ?? fallbackOrganization.resources,
    resourceSettings: source.resourceSettings ?? fallbackResourceSettings,
  };
}
