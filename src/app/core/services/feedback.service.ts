import { Injectable, inject } from '@angular/core';
import {
  postApiMeFeedback,
  getApiMeFeedback,
  getApiMeFeedbackById,
  postApiFilesUpload,
  type PagedResponseOfMyFeedbackListItemResponse,
} from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import type {
  SubmitFeedbackRequest,
  MyFeedbackResponse,
  MyFeedbackListItemResponse,
  PagedResponse,
} from '../models';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly apiFail = inject(ApiFailureReporter);

  async submit(request: SubmitFeedbackRequest): Promise<MyFeedbackResponse> {
    const res = await postApiMeFeedback({
      body: request,
    });
    return unwrapSdkResult(res);
  }

  async listMine(
    status?: string,
    page = 1,
    pageSize = 20
  ): Promise<PagedResponse<MyFeedbackListItemResponse> | PagedResponseOfMyFeedbackListItemResponse> {
    const res = await getApiMeFeedback({
      query: {
        status: status || undefined,
        page,
        pageSize,
      },
    });
    return unwrapSdkResult(res);
  }

  async getMine(id: string): Promise<MyFeedbackResponse> {
    const res = await getApiMeFeedbackById({
      path: { id },
    });
    return unwrapSdkResult(res);
  }

  async uploadAttachment(file: File): Promise<{ key: string }> {
    try {
      const res = await postApiFilesUpload({ body: { file } });
      const data = unwrapSdkResult(res);
      return { key: data.key };
    } catch (e) {
      this.apiFail.report('errors.context.uploadAttachment', e);
      throw e;
    }
  }
}
