package management

import "sendmux.ai/go/core"

// APIError maps ManagementActivateProviderConflict into the shared typed API error.
func (r *ManagementActivateProviderConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementActivateProviderNotFound into the shared typed API error.
func (r *ManagementActivateProviderNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementCancelSharedAmazonSesLimitRequestConflict into the shared typed API error.
func (r *ManagementCancelSharedAmazonSesLimitRequestConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementCancelSharedAmazonSesLimitRequestNotFound into the shared typed API error.
func (r *ManagementCancelSharedAmazonSesLimitRequestNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementCheckMailboxAvailabilityForbidden into the shared typed API error.
func (r *ManagementCheckMailboxAvailabilityForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementCheckMailboxAvailabilityUnauthorized into the shared typed API error.
func (r *ManagementCheckMailboxAvailabilityUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementCreateDomainBadRequest into the shared typed API error.
func (r *ManagementCreateDomainBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementCreateDomainConflict into the shared typed API error.
func (r *ManagementCreateDomainConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementCreateDomainRequestEntityTooLarge into the shared typed API error.
func (r *ManagementCreateDomainRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps ManagementCreateDomainServiceUnavailable into the shared typed API error.
func (r *ManagementCreateDomainServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps ManagementCreateMailboxBadRequest into the shared typed API error.
func (r *ManagementCreateMailboxBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementCreateMailboxConflict into the shared typed API error.
func (r *ManagementCreateMailboxConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementCreateMailboxKeyBadRequest into the shared typed API error.
func (r *ManagementCreateMailboxKeyBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementCreateMailboxKeyConflict into the shared typed API error.
func (r *ManagementCreateMailboxKeyConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementCreateMailboxKeyNotFound into the shared typed API error.
func (r *ManagementCreateMailboxKeyNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementCreateMailboxKeyRequestEntityTooLarge into the shared typed API error.
func (r *ManagementCreateMailboxKeyRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps ManagementCreateMailboxKeyServiceUnavailable into the shared typed API error.
func (r *ManagementCreateMailboxKeyServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps ManagementCreateMailboxKeyUnprocessableEntity into the shared typed API error.
func (r *ManagementCreateMailboxKeyUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementCreateMailboxRequestEntityTooLarge into the shared typed API error.
func (r *ManagementCreateMailboxRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps ManagementCreateMailboxServiceUnavailable into the shared typed API error.
func (r *ManagementCreateMailboxServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps ManagementCreateMailboxUnprocessableEntity into the shared typed API error.
func (r *ManagementCreateMailboxUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementCreateProviderBadRequest into the shared typed API error.
func (r *ManagementCreateProviderBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementCreateProviderConflict into the shared typed API error.
func (r *ManagementCreateProviderConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementCreateProviderRequestEntityTooLarge into the shared typed API error.
func (r *ManagementCreateProviderRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps ManagementCreateSharedAmazonSesLimitRequestConflict into the shared typed API error.
func (r *ManagementCreateSharedAmazonSesLimitRequestConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementCreateSharedAmazonSesLimitRequestNotFound into the shared typed API error.
func (r *ManagementCreateSharedAmazonSesLimitRequestNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementCreateSharedAmazonSesLimitRequestUnprocessableEntity into the shared typed API error.
func (r *ManagementCreateSharedAmazonSesLimitRequestUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementCreateWebhookBadRequest into the shared typed API error.
func (r *ManagementCreateWebhookBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementCreateWebhookConflict into the shared typed API error.
func (r *ManagementCreateWebhookConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementCreateWebhookForbidden into the shared typed API error.
func (r *ManagementCreateWebhookForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementCreateWebhookRequestEntityTooLarge into the shared typed API error.
func (r *ManagementCreateWebhookRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps ManagementCreateWebhookUnauthorized into the shared typed API error.
func (r *ManagementCreateWebhookUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementCreateWebhookUnprocessableEntity into the shared typed API error.
func (r *ManagementCreateWebhookUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementDeactivateProviderConflict into the shared typed API error.
func (r *ManagementDeactivateProviderConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementDeactivateProviderNotFound into the shared typed API error.
func (r *ManagementDeactivateProviderNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementDeleteDomainConflict into the shared typed API error.
func (r *ManagementDeleteDomainConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementDeleteDomainNotFound into the shared typed API error.
func (r *ManagementDeleteDomainNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementDeleteProviderNotFound into the shared typed API error.
func (r *ManagementDeleteProviderNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementDeleteProviderUnprocessableEntity into the shared typed API error.
func (r *ManagementDeleteProviderUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementGetDeliveryPayloadForbidden into the shared typed API error.
func (r *ManagementGetDeliveryPayloadForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementGetDeliveryPayloadNotFound into the shared typed API error.
func (r *ManagementGetDeliveryPayloadNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementGetDeliveryPayloadUnauthorized into the shared typed API error.
func (r *ManagementGetDeliveryPayloadUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementGetDomainFiltersConflict into the shared typed API error.
func (r *ManagementGetDomainFiltersConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementGetDomainFiltersNotFound into the shared typed API error.
func (r *ManagementGetDomainFiltersNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementGetDomainFiltersServiceUnavailable into the shared typed API error.
func (r *ManagementGetDomainFiltersServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps ManagementGetEmailLogForbidden into the shared typed API error.
func (r *ManagementGetEmailLogForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementGetEmailLogNotFound into the shared typed API error.
func (r *ManagementGetEmailLogNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementGetEmailLogUnauthorized into the shared typed API error.
func (r *ManagementGetEmailLogUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementGetEmailMetricsForbidden into the shared typed API error.
func (r *ManagementGetEmailMetricsForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementGetEmailMetricsUnauthorized into the shared typed API error.
func (r *ManagementGetEmailMetricsUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementGetInboxLogForbidden into the shared typed API error.
func (r *ManagementGetInboxLogForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementGetInboxLogNotFound into the shared typed API error.
func (r *ManagementGetInboxLogNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementGetInboxLogUnauthorized into the shared typed API error.
func (r *ManagementGetInboxLogUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementGetMailboxFiltersNotFound into the shared typed API error.
func (r *ManagementGetMailboxFiltersNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementGetMailboxFiltersServiceUnavailable into the shared typed API error.
func (r *ManagementGetMailboxFiltersServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps ManagementGetProviderStatsForbidden into the shared typed API error.
func (r *ManagementGetProviderStatsForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementGetProviderStatsUnauthorized into the shared typed API error.
func (r *ManagementGetProviderStatsUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementGetSpendSummaryForbidden into the shared typed API error.
func (r *ManagementGetSpendSummaryForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementGetSpendSummaryUnauthorized into the shared typed API error.
func (r *ManagementGetSpendSummaryUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementListBalanceForbidden into the shared typed API error.
func (r *ManagementListBalanceForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementListBalanceUnauthorized into the shared typed API error.
func (r *ManagementListBalanceUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementListDeliveryBadRequest into the shared typed API error.
func (r *ManagementListDeliveryBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementListDeliveryForbidden into the shared typed API error.
func (r *ManagementListDeliveryForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementListDeliveryNotFound into the shared typed API error.
func (r *ManagementListDeliveryNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementListDeliveryUnauthorized into the shared typed API error.
func (r *ManagementListDeliveryUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementListDomainsForbidden into the shared typed API error.
func (r *ManagementListDomainsForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementListDomainsUnauthorized into the shared typed API error.
func (r *ManagementListDomainsUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementListEmailLogsForbidden into the shared typed API error.
func (r *ManagementListEmailLogsForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementListEmailLogsUnauthorized into the shared typed API error.
func (r *ManagementListEmailLogsUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementListInboxLogsForbidden into the shared typed API error.
func (r *ManagementListInboxLogsForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementListInboxLogsUnauthorized into the shared typed API error.
func (r *ManagementListInboxLogsUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementListMailboxesForbidden into the shared typed API error.
func (r *ManagementListMailboxesForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementListMailboxesUnauthorized into the shared typed API error.
func (r *ManagementListMailboxesUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementListProvidersForbidden into the shared typed API error.
func (r *ManagementListProvidersForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementListProvidersUnauthorized into the shared typed API error.
func (r *ManagementListProvidersUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementListTransactionsForbidden into the shared typed API error.
func (r *ManagementListTransactionsForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementListTransactionsUnauthorized into the shared typed API error.
func (r *ManagementListTransactionsUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementListWebhooksForbidden into the shared typed API error.
func (r *ManagementListWebhooksForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementListWebhooksUnauthorized into the shared typed API error.
func (r *ManagementListWebhooksUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps ManagementRequestSendingAccountLimitIncreaseConflict into the shared typed API error.
func (r *ManagementRequestSendingAccountLimitIncreaseConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementRequestSendingAccountLimitIncreaseUnprocessableEntity into the shared typed API error.
func (r *ManagementRequestSendingAccountLimitIncreaseUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementResumeMailboxConflict into the shared typed API error.
func (r *ManagementResumeMailboxConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementResumeMailboxForbidden into the shared typed API error.
func (r *ManagementResumeMailboxForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementResumeMailboxNotFound into the shared typed API error.
func (r *ManagementResumeMailboxNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementResumeMailboxServiceUnavailable into the shared typed API error.
func (r *ManagementResumeMailboxServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps ManagementRotateWebhookSecretConflict into the shared typed API error.
func (r *ManagementRotateWebhookSecretConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementRotateWebhookSecretNotFound into the shared typed API error.
func (r *ManagementRotateWebhookSecretNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementSetDomainFiltersBadRequest into the shared typed API error.
func (r *ManagementSetDomainFiltersBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementSetDomainFiltersConflict into the shared typed API error.
func (r *ManagementSetDomainFiltersConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementSetDomainFiltersNotFound into the shared typed API error.
func (r *ManagementSetDomainFiltersNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementSetDomainFiltersRequestEntityTooLarge into the shared typed API error.
func (r *ManagementSetDomainFiltersRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps ManagementSetDomainFiltersServiceUnavailable into the shared typed API error.
func (r *ManagementSetDomainFiltersServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps ManagementSetDomainFiltersUnprocessableEntity into the shared typed API error.
func (r *ManagementSetDomainFiltersUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementSetMailboxFiltersBadRequest into the shared typed API error.
func (r *ManagementSetMailboxFiltersBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementSetMailboxFiltersConflict into the shared typed API error.
func (r *ManagementSetMailboxFiltersConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementSetMailboxFiltersNotFound into the shared typed API error.
func (r *ManagementSetMailboxFiltersNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementSetMailboxFiltersRequestEntityTooLarge into the shared typed API error.
func (r *ManagementSetMailboxFiltersRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps ManagementSetMailboxFiltersServiceUnavailable into the shared typed API error.
func (r *ManagementSetMailboxFiltersServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps ManagementSetMailboxFiltersUnprocessableEntity into the shared typed API error.
func (r *ManagementSetMailboxFiltersUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementSuspendMailboxConflict into the shared typed API error.
func (r *ManagementSuspendMailboxConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementSuspendMailboxForbidden into the shared typed API error.
func (r *ManagementSuspendMailboxForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps ManagementSuspendMailboxNotFound into the shared typed API error.
func (r *ManagementSuspendMailboxNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementSuspendMailboxServiceUnavailable into the shared typed API error.
func (r *ManagementSuspendMailboxServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps ManagementTestProviderNotFound into the shared typed API error.
func (r *ManagementTestProviderNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementTestProviderServiceUnavailable into the shared typed API error.
func (r *ManagementTestProviderServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps ManagementTestProviderUnprocessableEntity into the shared typed API error.
func (r *ManagementTestProviderUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementTestWebhookConflict into the shared typed API error.
func (r *ManagementTestWebhookConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementTestWebhookNotFound into the shared typed API error.
func (r *ManagementTestWebhookNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementTestWebhookServiceUnavailable into the shared typed API error.
func (r *ManagementTestWebhookServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps ManagementUpdateDomainBadRequest into the shared typed API error.
func (r *ManagementUpdateDomainBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementUpdateDomainConflict into the shared typed API error.
func (r *ManagementUpdateDomainConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementUpdateDomainNotFound into the shared typed API error.
func (r *ManagementUpdateDomainNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementUpdateDomainRequestEntityTooLarge into the shared typed API error.
func (r *ManagementUpdateDomainRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps ManagementUpdateDomainUnprocessableEntity into the shared typed API error.
func (r *ManagementUpdateDomainUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementUpdateMailboxBadRequest into the shared typed API error.
func (r *ManagementUpdateMailboxBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementUpdateMailboxConflict into the shared typed API error.
func (r *ManagementUpdateMailboxConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementUpdateMailboxNotFound into the shared typed API error.
func (r *ManagementUpdateMailboxNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementUpdateMailboxRequestEntityTooLarge into the shared typed API error.
func (r *ManagementUpdateMailboxRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps ManagementUpdateMailboxUnprocessableEntity into the shared typed API error.
func (r *ManagementUpdateMailboxUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementUpdateProviderBadRequest into the shared typed API error.
func (r *ManagementUpdateProviderBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementUpdateProviderConflict into the shared typed API error.
func (r *ManagementUpdateProviderConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementUpdateProviderNotFound into the shared typed API error.
func (r *ManagementUpdateProviderNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementUpdateProviderRequestEntityTooLarge into the shared typed API error.
func (r *ManagementUpdateProviderRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps ManagementUpdateProviderUnprocessableEntity into the shared typed API error.
func (r *ManagementUpdateProviderUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps ManagementUpdateWebhookBadRequest into the shared typed API error.
func (r *ManagementUpdateWebhookBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps ManagementUpdateWebhookConflict into the shared typed API error.
func (r *ManagementUpdateWebhookConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps ManagementUpdateWebhookNotFound into the shared typed API error.
func (r *ManagementUpdateWebhookNotFound) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 404)
	return err
}

// APIError maps ManagementUpdateWebhookRequestEntityTooLarge into the shared typed API error.
func (r *ManagementUpdateWebhookRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps ManagementUpdateWebhookUnprocessableEntity into the shared typed API error.
func (r *ManagementUpdateWebhookUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}
