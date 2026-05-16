/**
 * Thin aliases for admin document/report endpoints — keeps feature imports stable
 * while the generated SDK uses longer names.
 */
export {
  getApiAdminDocuments as getApiAdminDocumentsList,
  getApiAdminDocumentsById as getApiAdminDocumentById,
  patchApiAdminDocumentsById as patchApiAdminDocumentById,
  getApiAdminDocumentsByIdReports as getApiAdminDocumentReports,
  postApiAdminDocumentsByIdReports as postApiAdminDocumentReports,
  postApiAdminDocumentsByIdReportsByReportIdResolve as postApiAdminDocumentReportResolve,
  postApiAdminDocumentsByIdReportsResolveAll as postApiAdminDocumentReportsResolveAll,
  postApiAdminDocumentsBulk,
} from './sdk.gen';

export type {
  AdminDocumentDetailResponse as AdminDocumentDetail,
  AdminDocumentListItemResponse as AdminDocumentListItem,
  AdminDocumentReportResponse as AdminDocumentReport,
} from './types.gen';
