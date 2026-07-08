package sending

import "sendmux.ai/go/core"

// APIError maps SendingCompleteAttachmentUploadBadRequest into the shared typed API error.
func (r *SendingCompleteAttachmentUploadBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps SendingCompleteAttachmentUploadConflict into the shared typed API error.
func (r *SendingCompleteAttachmentUploadConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps SendingCompleteAttachmentUploadNotFound into the shared typed API error.
func (r *SendingCompleteAttachmentUploadNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps SendingCompleteAttachmentUploadRequestEntityTooLarge into the shared typed API error.
func (r *SendingCompleteAttachmentUploadRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps SendingCompleteAttachmentUploadServiceUnavailable into the shared typed API error.
func (r *SendingCompleteAttachmentUploadServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps SendingCompleteAttachmentUploadUnauthorized into the shared typed API error.
func (r *SendingCompleteAttachmentUploadUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps SendingCompleteAttachmentUploadUnprocessableEntity into the shared typed API error.
func (r *SendingCompleteAttachmentUploadUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps SendingCreateAttachmentUploadBadRequest into the shared typed API error.
func (r *SendingCreateAttachmentUploadBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps SendingCreateAttachmentUploadConflict into the shared typed API error.
func (r *SendingCreateAttachmentUploadConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps SendingCreateAttachmentUploadForbidden into the shared typed API error.
func (r *SendingCreateAttachmentUploadForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps SendingCreateAttachmentUploadRequestEntityTooLarge into the shared typed API error.
func (r *SendingCreateAttachmentUploadRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps SendingCreateAttachmentUploadServiceUnavailable into the shared typed API error.
func (r *SendingCreateAttachmentUploadServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps SendingCreateAttachmentUploadTooManyRequests into the shared typed API error.
func (r *SendingCreateAttachmentUploadTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps SendingCreateAttachmentUploadUnauthorized into the shared typed API error.
func (r *SendingCreateAttachmentUploadUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps SendingCreateAttachmentUploadUnprocessableEntity into the shared typed API error.
func (r *SendingCreateAttachmentUploadUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps SendingGetAttachmentForbidden into the shared typed API error.
func (r *SendingGetAttachmentForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps SendingGetAttachmentNotFound into the shared typed API error.
func (r *SendingGetAttachmentNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps SendingGetAttachmentServiceUnavailable into the shared typed API error.
func (r *SendingGetAttachmentServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps SendingGetAttachmentTooManyRequests into the shared typed API error.
func (r *SendingGetAttachmentTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps SendingGetAttachmentUnauthorized into the shared typed API error.
func (r *SendingGetAttachmentUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps SendingSendEmailBadRequest into the shared typed API error.
func (r *SendingSendEmailBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps SendingSendEmailBatchBadRequest into the shared typed API error.
func (r *SendingSendEmailBatchBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps SendingSendEmailBatchConflict into the shared typed API error.
func (r *SendingSendEmailBatchConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps SendingSendEmailBatchForbidden into the shared typed API error.
func (r *SendingSendEmailBatchForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps SendingSendEmailBatchPaymentRequired into the shared typed API error.
func (r *SendingSendEmailBatchPaymentRequired) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 402)
	return err
}

// APIError maps SendingSendEmailBatchRequestEntityTooLarge into the shared typed API error.
func (r *SendingSendEmailBatchRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps SendingSendEmailBatchServiceUnavailable into the shared typed API error.
func (r *SendingSendEmailBatchServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps SendingSendEmailBatchTooManyRequests into the shared typed API error.
func (r *SendingSendEmailBatchTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps SendingSendEmailBatchUnauthorized into the shared typed API error.
func (r *SendingSendEmailBatchUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps SendingSendEmailBatchUnprocessableEntity into the shared typed API error.
func (r *SendingSendEmailBatchUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps SendingSendEmailConflict into the shared typed API error.
func (r *SendingSendEmailConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps SendingSendEmailForbidden into the shared typed API error.
func (r *SendingSendEmailForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps SendingSendEmailPaymentRequired into the shared typed API error.
func (r *SendingSendEmailPaymentRequired) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 402)
	return err
}

// APIError maps SendingSendEmailRequestEntityTooLarge into the shared typed API error.
func (r *SendingSendEmailRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps SendingSendEmailServiceUnavailable into the shared typed API error.
func (r *SendingSendEmailServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps SendingSendEmailTooManyRequests into the shared typed API error.
func (r *SendingSendEmailTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps SendingSendEmailUnauthorized into the shared typed API error.
func (r *SendingSendEmailUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps SendingSendEmailUnprocessableEntity into the shared typed API error.
func (r *SendingSendEmailUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps SendingUploadAttachmentBadRequest into the shared typed API error.
func (r *SendingUploadAttachmentBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps SendingUploadAttachmentConflict into the shared typed API error.
func (r *SendingUploadAttachmentConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps SendingUploadAttachmentForbidden into the shared typed API error.
func (r *SendingUploadAttachmentForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps SendingUploadAttachmentRequestEntityTooLarge into the shared typed API error.
func (r *SendingUploadAttachmentRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps SendingUploadAttachmentServiceUnavailable into the shared typed API error.
func (r *SendingUploadAttachmentServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps SendingUploadAttachmentTooManyRequests into the shared typed API error.
func (r *SendingUploadAttachmentTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps SendingUploadAttachmentUnauthorized into the shared typed API error.
func (r *SendingUploadAttachmentUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps SendingUploadAttachmentUnprocessableEntity into the shared typed API error.
func (r *SendingUploadAttachmentUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}
