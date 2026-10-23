package mailbox

import "sendmux.ai/go/v3/core"

// APIError maps MailboxBatchDeleteMessagesBadRequest into the shared typed API error.
func (r *MailboxBatchDeleteMessagesBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxBatchDeleteMessagesConflict into the shared typed API error.
func (r *MailboxBatchDeleteMessagesConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxBatchDeleteMessagesRequestEntityTooLarge into the shared typed API error.
func (r *MailboxBatchDeleteMessagesRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxBatchGetMessagesBadRequest into the shared typed API error.
func (r *MailboxBatchGetMessagesBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxBatchGetMessagesNotFound into the shared typed API error.
func (r *MailboxBatchGetMessagesNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxBatchGetMessagesRequestEntityTooLarge into the shared typed API error.
func (r *MailboxBatchGetMessagesRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxBatchUpdateMessagesBadRequest into the shared typed API error.
func (r *MailboxBatchUpdateMessagesBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxBatchUpdateMessagesConflict into the shared typed API error.
func (r *MailboxBatchUpdateMessagesConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxBatchUpdateMessagesRequestEntityTooLarge into the shared typed API error.
func (r *MailboxBatchUpdateMessagesRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxControlDraftScheduleBadRequest into the shared typed API error.
func (r *MailboxControlDraftScheduleBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxControlDraftScheduleConflict into the shared typed API error.
func (r *MailboxControlDraftScheduleConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxControlDraftScheduleForbidden into the shared typed API error.
func (r *MailboxControlDraftScheduleForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxControlDraftScheduleInternalServerError into the shared typed API error.
func (r *MailboxControlDraftScheduleInternalServerError) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 500)
	return err
}

// APIError maps MailboxControlDraftScheduleNotFound into the shared typed API error.
func (r *MailboxControlDraftScheduleNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxControlDraftScheduleRequestEntityTooLarge into the shared typed API error.
func (r *MailboxControlDraftScheduleRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxControlDraftScheduleServiceUnavailable into the shared typed API error.
func (r *MailboxControlDraftScheduleServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxControlDraftScheduleTooManyRequests into the shared typed API error.
func (r *MailboxControlDraftScheduleTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps MailboxControlDraftScheduleUnauthorized into the shared typed API error.
func (r *MailboxControlDraftScheduleUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxControlDraftScheduleUnprocessableEntity into the shared typed API error.
func (r *MailboxControlDraftScheduleUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps MailboxCreateAttachmentUploadBadRequest into the shared typed API error.
func (r *MailboxCreateAttachmentUploadBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxCreateAttachmentUploadRequestEntityTooLarge into the shared typed API error.
func (r *MailboxCreateAttachmentUploadRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxCreateAttachmentUploadServiceUnavailable into the shared typed API error.
func (r *MailboxCreateAttachmentUploadServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxCreateDraftBadRequest into the shared typed API error.
func (r *MailboxCreateDraftBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxCreateDraftConflict into the shared typed API error.
func (r *MailboxCreateDraftConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxCreateDraftForbidden into the shared typed API error.
func (r *MailboxCreateDraftForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxCreateDraftInternalServerError into the shared typed API error.
func (r *MailboxCreateDraftInternalServerError) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 500)
	return err
}

// APIError maps MailboxCreateDraftNotFound into the shared typed API error.
func (r *MailboxCreateDraftNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxCreateDraftRequestEntityTooLarge into the shared typed API error.
func (r *MailboxCreateDraftRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxCreateDraftServiceUnavailable into the shared typed API error.
func (r *MailboxCreateDraftServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxCreateDraftTooManyRequests into the shared typed API error.
func (r *MailboxCreateDraftTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps MailboxCreateDraftUnauthorized into the shared typed API error.
func (r *MailboxCreateDraftUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxCreateDraftUnprocessableEntity into the shared typed API error.
func (r *MailboxCreateDraftUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps MailboxCreateFolderBadRequest into the shared typed API error.
func (r *MailboxCreateFolderBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxCreateFolderRequestEntityTooLarge into the shared typed API error.
func (r *MailboxCreateFolderRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxCreateFolderUnprocessableEntity into the shared typed API error.
func (r *MailboxCreateFolderUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps MailboxDeleteDraftBadRequest into the shared typed API error.
func (r *MailboxDeleteDraftBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxDeleteDraftConflict into the shared typed API error.
func (r *MailboxDeleteDraftConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxDeleteDraftForbidden into the shared typed API error.
func (r *MailboxDeleteDraftForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxDeleteDraftInternalServerError into the shared typed API error.
func (r *MailboxDeleteDraftInternalServerError) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 500)
	return err
}

// APIError maps MailboxDeleteDraftNotFound into the shared typed API error.
func (r *MailboxDeleteDraftNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxDeleteDraftRequestEntityTooLarge into the shared typed API error.
func (r *MailboxDeleteDraftRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxDeleteDraftServiceUnavailable into the shared typed API error.
func (r *MailboxDeleteDraftServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxDeleteDraftTooManyRequests into the shared typed API error.
func (r *MailboxDeleteDraftTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps MailboxDeleteDraftUnauthorized into the shared typed API error.
func (r *MailboxDeleteDraftUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxDeleteDraftUnprocessableEntity into the shared typed API error.
func (r *MailboxDeleteDraftUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps MailboxDeleteMessageConflict into the shared typed API error.
func (r *MailboxDeleteMessageConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxDeleteMessageNotFound into the shared typed API error.
func (r *MailboxDeleteMessageNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxDownloadRawMessageForbidden into the shared typed API error.
func (r *MailboxDownloadRawMessageForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxDownloadRawMessageInternalServerError into the shared typed API error.
func (r *MailboxDownloadRawMessageInternalServerError) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 500)
	return err
}

// APIError maps MailboxDownloadRawMessageNotFound into the shared typed API error.
func (r *MailboxDownloadRawMessageNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxDownloadRawMessageServiceUnavailable into the shared typed API error.
func (r *MailboxDownloadRawMessageServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxDownloadRawMessageTooManyRequests into the shared typed API error.
func (r *MailboxDownloadRawMessageTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps MailboxDownloadRawMessageUnauthorized into the shared typed API error.
func (r *MailboxDownloadRawMessageUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxGetAttachmentTextBadRequest into the shared typed API error.
func (r *MailboxGetAttachmentTextBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxGetAttachmentTextForbidden into the shared typed API error.
func (r *MailboxGetAttachmentTextForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxGetAttachmentTextInternalServerError into the shared typed API error.
func (r *MailboxGetAttachmentTextInternalServerError) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 500)
	return err
}

// APIError maps MailboxGetAttachmentTextNotFound into the shared typed API error.
func (r *MailboxGetAttachmentTextNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxGetAttachmentTextServiceUnavailable into the shared typed API error.
func (r *MailboxGetAttachmentTextServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxGetAttachmentTextTooManyRequests into the shared typed API error.
func (r *MailboxGetAttachmentTextTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps MailboxGetAttachmentTextUnauthorized into the shared typed API error.
func (r *MailboxGetAttachmentTextUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxGetConnectionForbidden into the shared typed API error.
func (r *MailboxGetConnectionForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(&r.Response, 403)
	return err
}

// APIError maps MailboxGetConnectionInternalServerError into the shared typed API error.
func (r *MailboxGetConnectionInternalServerError) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(&r.Response, 500)
	return err
}

// APIError maps MailboxGetConnectionServiceUnavailable into the shared typed API error.
func (r *MailboxGetConnectionServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(&r.Response, 503)
	return err
}

// APIError maps MailboxGetConnectionTooManyRequests into the shared typed API error.
func (r *MailboxGetConnectionTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(&r.Response, 429)
	return err
}

// APIError maps MailboxGetConnectionUnauthorized into the shared typed API error.
func (r *MailboxGetConnectionUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(&r.Response, 401)
	return err
}

// APIError maps MailboxGetDraftBadRequest into the shared typed API error.
func (r *MailboxGetDraftBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxGetDraftConflict into the shared typed API error.
func (r *MailboxGetDraftConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxGetDraftForbidden into the shared typed API error.
func (r *MailboxGetDraftForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxGetDraftInternalServerError into the shared typed API error.
func (r *MailboxGetDraftInternalServerError) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 500)
	return err
}

// APIError maps MailboxGetDraftNotFound into the shared typed API error.
func (r *MailboxGetDraftNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxGetDraftRequestEntityTooLarge into the shared typed API error.
func (r *MailboxGetDraftRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxGetDraftServiceUnavailable into the shared typed API error.
func (r *MailboxGetDraftServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxGetDraftTooManyRequests into the shared typed API error.
func (r *MailboxGetDraftTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps MailboxGetDraftUnauthorized into the shared typed API error.
func (r *MailboxGetDraftUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxGetDraftUnprocessableEntity into the shared typed API error.
func (r *MailboxGetDraftUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps MailboxGetIdentityForbidden into the shared typed API error.
func (r *MailboxGetIdentityForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxGetIdentityServiceUnavailable into the shared typed API error.
func (r *MailboxGetIdentityServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxGetIdentityUnauthorized into the shared typed API error.
func (r *MailboxGetIdentityUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxGetMeForbidden into the shared typed API error.
func (r *MailboxGetMeForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxGetMeNotFound into the shared typed API error.
func (r *MailboxGetMeNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxGetMeUnauthorized into the shared typed API error.
func (r *MailboxGetMeUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxGetMessageAttachmentBadRequest into the shared typed API error.
func (r *MailboxGetMessageAttachmentBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxGetMessageAttachmentNotFound into the shared typed API error.
func (r *MailboxGetMessageAttachmentNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxGetSessionForbidden into the shared typed API error.
func (r *MailboxGetSessionForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxGetSessionServiceUnavailable into the shared typed API error.
func (r *MailboxGetSessionServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxGetSessionUnauthorized into the shared typed API error.
func (r *MailboxGetSessionUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxGetThreadContentBadRequest into the shared typed API error.
func (r *MailboxGetThreadContentBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxGetThreadContentNotFound into the shared typed API error.
func (r *MailboxGetThreadContentNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxListBodyBadRequest into the shared typed API error.
func (r *MailboxListBodyBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxListBodyNotFound into the shared typed API error.
func (r *MailboxListBodyNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxListContentBadRequest into the shared typed API error.
func (r *MailboxListContentBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxListContentNotFound into the shared typed API error.
func (r *MailboxListContentNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxListDraftsBadRequest into the shared typed API error.
func (r *MailboxListDraftsBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxListDraftsConflict into the shared typed API error.
func (r *MailboxListDraftsConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxListDraftsForbidden into the shared typed API error.
func (r *MailboxListDraftsForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxListDraftsInternalServerError into the shared typed API error.
func (r *MailboxListDraftsInternalServerError) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 500)
	return err
}

// APIError maps MailboxListDraftsNotFound into the shared typed API error.
func (r *MailboxListDraftsNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxListDraftsRequestEntityTooLarge into the shared typed API error.
func (r *MailboxListDraftsRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxListDraftsServiceUnavailable into the shared typed API error.
func (r *MailboxListDraftsServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxListDraftsTooManyRequests into the shared typed API error.
func (r *MailboxListDraftsTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps MailboxListDraftsUnauthorized into the shared typed API error.
func (r *MailboxListDraftsUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxListDraftsUnprocessableEntity into the shared typed API error.
func (r *MailboxListDraftsUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps MailboxListGrantedMailboxesForbidden into the shared typed API error.
func (r *MailboxListGrantedMailboxesForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxListGrantedMailboxesUnauthorized into the shared typed API error.
func (r *MailboxListGrantedMailboxesUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxListIdentitiesBadRequest into the shared typed API error.
func (r *MailboxListIdentitiesBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxListIdentitiesForbidden into the shared typed API error.
func (r *MailboxListIdentitiesForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxListIdentitiesUnauthorized into the shared typed API error.
func (r *MailboxListIdentitiesUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxListMessagesBadRequest into the shared typed API error.
func (r *MailboxListMessagesBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxListMessagesForbidden into the shared typed API error.
func (r *MailboxListMessagesForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxListMessagesUnauthorized into the shared typed API error.
func (r *MailboxListMessagesUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxListThreadMessagesBadRequest into the shared typed API error.
func (r *MailboxListThreadMessagesBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxListThreadMessagesNotFound into the shared typed API error.
func (r *MailboxListThreadMessagesNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxListThreadsBadRequest into the shared typed API error.
func (r *MailboxListThreadsBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxListThreadsForbidden into the shared typed API error.
func (r *MailboxListThreadsForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxListThreadsUnauthorized into the shared typed API error.
func (r *MailboxListThreadsUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxRequestAttachmentTextBadRequest into the shared typed API error.
func (r *MailboxRequestAttachmentTextBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxRequestAttachmentTextForbidden into the shared typed API error.
func (r *MailboxRequestAttachmentTextForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxRequestAttachmentTextInternalServerError into the shared typed API error.
func (r *MailboxRequestAttachmentTextInternalServerError) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 500)
	return err
}

// APIError maps MailboxRequestAttachmentTextNotFound into the shared typed API error.
func (r *MailboxRequestAttachmentTextNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxRequestAttachmentTextServiceUnavailable into the shared typed API error.
func (r *MailboxRequestAttachmentTextServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxRequestAttachmentTextTooManyRequests into the shared typed API error.
func (r *MailboxRequestAttachmentTextTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps MailboxRequestAttachmentTextUnauthorized into the shared typed API error.
func (r *MailboxRequestAttachmentTextUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxSendDraftBadRequest into the shared typed API error.
func (r *MailboxSendDraftBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxSendDraftConflict into the shared typed API error.
func (r *MailboxSendDraftConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxSendDraftForbidden into the shared typed API error.
func (r *MailboxSendDraftForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxSendDraftInternalServerError into the shared typed API error.
func (r *MailboxSendDraftInternalServerError) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 500)
	return err
}

// APIError maps MailboxSendDraftNotFound into the shared typed API error.
func (r *MailboxSendDraftNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxSendDraftRequestEntityTooLarge into the shared typed API error.
func (r *MailboxSendDraftRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxSendDraftServiceUnavailable into the shared typed API error.
func (r *MailboxSendDraftServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxSendDraftTooManyRequests into the shared typed API error.
func (r *MailboxSendDraftTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps MailboxSendDraftUnauthorized into the shared typed API error.
func (r *MailboxSendDraftUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxSendDraftUnprocessableEntity into the shared typed API error.
func (r *MailboxSendDraftUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps MailboxSendMessageBadRequest into the shared typed API error.
func (r *MailboxSendMessageBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxSendMessageConflict into the shared typed API error.
func (r *MailboxSendMessageConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxSendMessageRequestEntityTooLarge into the shared typed API error.
func (r *MailboxSendMessageRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxSendMessageServiceUnavailable into the shared typed API error.
func (r *MailboxSendMessageServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxSendMessageUnprocessableEntity into the shared typed API error.
func (r *MailboxSendMessageUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps MailboxStreamEventsBadRequest into the shared typed API error.
func (r *MailboxStreamEventsBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxStreamEventsForbidden into the shared typed API error.
func (r *MailboxStreamEventsForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxStreamEventsServiceUnavailable into the shared typed API error.
func (r *MailboxStreamEventsServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxStreamEventsTooManyRequests into the shared typed API error.
func (r *MailboxStreamEventsTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps MailboxStreamEventsUnauthorized into the shared typed API error.
func (r *MailboxStreamEventsUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxUpdateDraftBadRequest into the shared typed API error.
func (r *MailboxUpdateDraftBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxUpdateDraftConflict into the shared typed API error.
func (r *MailboxUpdateDraftConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxUpdateDraftForbidden into the shared typed API error.
func (r *MailboxUpdateDraftForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxUpdateDraftInternalServerError into the shared typed API error.
func (r *MailboxUpdateDraftInternalServerError) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 500)
	return err
}

// APIError maps MailboxUpdateDraftNotFound into the shared typed API error.
func (r *MailboxUpdateDraftNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxUpdateDraftRequestEntityTooLarge into the shared typed API error.
func (r *MailboxUpdateDraftRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxUpdateDraftServiceUnavailable into the shared typed API error.
func (r *MailboxUpdateDraftServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxUpdateDraftTooManyRequests into the shared typed API error.
func (r *MailboxUpdateDraftTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps MailboxUpdateDraftUnauthorized into the shared typed API error.
func (r *MailboxUpdateDraftUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxUpdateDraftUnprocessableEntity into the shared typed API error.
func (r *MailboxUpdateDraftUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps MailboxUpdateFolderBadRequest into the shared typed API error.
func (r *MailboxUpdateFolderBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxUpdateFolderConflict into the shared typed API error.
func (r *MailboxUpdateFolderConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxUpdateFolderNotFound into the shared typed API error.
func (r *MailboxUpdateFolderNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxUpdateFolderRequestEntityTooLarge into the shared typed API error.
func (r *MailboxUpdateFolderRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxUpdateIdentityBadRequest into the shared typed API error.
func (r *MailboxUpdateIdentityBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxUpdateIdentityForbidden into the shared typed API error.
func (r *MailboxUpdateIdentityForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps MailboxUpdateIdentityRequestEntityTooLarge into the shared typed API error.
func (r *MailboxUpdateIdentityRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxUpdateIdentityServiceUnavailable into the shared typed API error.
func (r *MailboxUpdateIdentityServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps MailboxUpdateIdentityUnauthorized into the shared typed API error.
func (r *MailboxUpdateIdentityUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps MailboxUpdateIdentityUnprocessableEntity into the shared typed API error.
func (r *MailboxUpdateIdentityUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps MailboxUpdateMessageBadRequest into the shared typed API error.
func (r *MailboxUpdateMessageBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxUpdateMessageConflict into the shared typed API error.
func (r *MailboxUpdateMessageConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps MailboxUpdateMessageNotFound into the shared typed API error.
func (r *MailboxUpdateMessageNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps MailboxUpdateMessageRequestEntityTooLarge into the shared typed API error.
func (r *MailboxUpdateMessageRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxUploadAttachmentBadRequest into the shared typed API error.
func (r *MailboxUploadAttachmentBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxUploadAttachmentRequestEntityTooLarge into the shared typed API error.
func (r *MailboxUploadAttachmentRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps MailboxUploadAttachmentServiceUnavailable into the shared typed API error.
func (r *MailboxUploadAttachmentServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}
