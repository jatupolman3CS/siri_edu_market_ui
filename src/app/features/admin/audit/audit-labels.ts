/**
 * responsive-ui v1.6.1 GR3-e (`docs/contracts/responsive-ui.md` §4.8 v1.6.1, R-21): the labels
 * `/admin/audit` shows for the codes the server writes into ADMIN_AUDIT_LOG.
 *
 * Every action code and entity type goes through a static code → key map. No key is ever built
 * from a code at runtime: `TranslationService.t()` returns the path itself for a missing key,
 * which would put a raw key on screen. A value the map doesn't know yet (a code the backend adds
 * later) renders humanized, never raw, until it gets its own key in the same pattern.
 */

/**
 * Action code → i18n key. The 27 codes the backend writes today (every `AppendAsync` call site),
 * plus 3 legacy codes it no longer writes (`document.approve`, `payout.approve`, `payout.reject`)
 * that stay mapped for seeded or older rows. 30 in total.
 */
export const AUDIT_ACTION_KEYS: ReadonlyMap<string, string> = new Map([
  ['document.approve', 'admin.audit.actionDocumentApprove'],
  ['document.reject', 'admin.audit.actionDocumentReject'],
  ['document.patch', 'admin.audit.actionDocumentPatch'],
  ['document.bulk', 'admin.audit.actionDocumentBulk'],
  ['document.report.create', 'admin.audit.actionDocumentReportCreate'],
  ['document.report.resolve', 'admin.audit.actionDocumentReportResolve'],
  ['document.report.resolve_all', 'admin.audit.actionDocumentReportResolveAll'],
  ['order.refund', 'admin.audit.actionOrderRefund'],
  ['user.suspend', 'admin.audit.actionUserSuspend'],
  ['user.ban', 'admin.audit.actionUserBan'],
  ['user.reinstate', 'admin.audit.actionUserReinstate'],
  ['payout.approve', 'admin.audit.actionPayoutApprove'],
  ['payout.reject', 'admin.audit.actionPayoutReject'],
  ['payout.requested', 'admin.audit.actionPayoutRequested'],
  ['payout.cancelled', 'admin.audit.actionPayoutCancelled'],
  ['payout.status_changed', 'admin.audit.actionPayoutStatusChanged'],
  ['payout.slip_uploaded', 'admin.audit.actionPayoutSlipUploaded'],
  ['payout.complete_manual', 'admin.audit.actionPayoutCompleteManual'],
  ['payout.completed_auto', 'admin.audit.actionPayoutCompletedAuto'],
  ['seller_payout_account.create', 'admin.audit.actionSellerPayoutAccountCreate'],
  ['seller_payout_account.update', 'admin.audit.actionSellerPayoutAccountUpdate'],
  ['seller_payout_account.reveal', 'admin.audit.actionSellerPayoutAccountReveal'],
  ['ads_campaign.created', 'admin.audit.actionAdsCampaignCreated'],
  ['ads_campaign.cancelled', 'admin.audit.actionAdsCampaignCancelled'],
  ['ads_campaign.stopped', 'admin.audit.actionAdsCampaignStopped'],
  ['ads_campaign.auto_refunded', 'admin.audit.actionAdsCampaignAutoRefunded'],
  ['ads_placement.updated', 'admin.audit.actionAdsPlacementUpdated'],
  ['affiliate.settings_updated', 'admin.audit.actionAffiliateSettingsUpdated'],
  ['feedback.status.change', 'admin.audit.actionFeedbackStatusChange'],
  ['feedback.delete', 'admin.audit.actionFeedbackDelete'],
]);

/** Entity type (as the backend writes it) → i18n key: all 9 types. */
export const AUDIT_ENTITY_KEYS: ReadonlyMap<string, string> = new Map([
  ['Document', 'admin.audit.entityDocument'],
  ['Payout', 'admin.audit.entityPayout'],
  ['Order', 'admin.audit.entityOrder'],
  ['User', 'admin.audit.entityUser'],
  ['AdsCampaign', 'admin.audit.entityAdsCampaign'],
  ['AdsPlacement', 'admin.audit.entityAdsPlacement'],
  ['AffiliateLink', 'admin.audit.entityAffiliateLink'],
  ['SellerPayoutAccount', 'admin.audit.entitySellerPayoutAccount'],
  ['Feedback', 'admin.audit.entityFeedback'],
]);

/**
 * The fallback for a code or type that has no key yet; the same text in both languages.
 * 1. every `.`, `_` and `-` becomes a space;
 * 2. a space goes between a lower-case letter or digit and the upper-case letter after it;
 * 3. whitespace runs collapse, the ends are trimmed, everything is lower-cased, then the first
 *    character is upper-cased.
 *
 * `report.export_started` → `Report export started`, `feedback.bulkClose` → `Feedback bulk close`,
 * `ReportExport` → `Report export`. Returns `''` when nothing is left.
 */
export function humanizeAuditValue(value: string): string {
  const text = value
    .replace(/[._-]/g, ' ')
    .replace(/([\p{Ll}\p{Nd}])(\p{Lu})/gu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The label for one audit value: its mapped key's text, else the value humanized. An empty or
 * missing value, or one whose humanized text is empty, gives the text of `defaultKey`.
 */
export function auditValueLabel(
  value: string | null | undefined,
  keys: ReadonlyMap<string, string>,
  defaultKey: string,
  translate: (key: string) => string,
): string {
  if (!value) {
    return translate(defaultKey);
  }
  const key = keys.get(value);
  if (key) {
    return translate(key);
  }
  return humanizeAuditValue(value) || translate(defaultKey);
}
