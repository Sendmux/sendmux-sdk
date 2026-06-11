package mailbox

import "sendmux.ai/go/core"

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

// APIError maps MailboxCreateFolderBadRequest into the shared typed API error.
func (r *MailboxCreateFolderBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps MailboxCreateFolderUnprocessableEntity into the shared typed API error.
func (r *MailboxCreateFolderUnprocessableEntity) APIError() *core.APIError {
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
