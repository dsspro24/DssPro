export function getPrimarySubscriptionPlans(plans, organizationId, subscription) {
  const organizationPlans = plans
    .filter((plan) => plan.organization_id === organizationId && plan.active !== false)
    .sort((left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime());
  const currentOrganizationPlan = organizationPlans.find((plan) => plan.code === subscription?.planCode)
    ?? organizationPlans[0];

  return plans.filter((plan) => (
    !plan.code.startsWith('additional_workspace')
    && (plan.organization_id == null || plan.code === currentOrganizationPlan?.code)
    && (plan.active !== false || plan.code === subscription?.planCode)
  ));
}
