# frozen_string_literal: true

require 'minitest/autorun'
require 'sendmux/management'

class SendmuxRubyManagementValidationTest < Minitest::Test
  def test_mailbox_email_validation_matches_the_full_value
    ["x\nvalid@example.com", "valid@example.com\n", "valid@example.com\r", "valid@example.com\r\n"].each do |email|
      assert_raises(ArgumentError) do
        Sendmux::Management::Generated::ManagementCreateMailboxRequest.new(email: email)
      end
    end

    request = Sendmux::Management::Generated::ManagementCreateMailboxRequest.new(email: 'valid@example.com')
    assert_equal 'valid@example.com', request.email
  end

  def test_nullable_delivery_log_constraints_accept_nil
    models = [
      Sendmux::Management::Generated::DeliveryLogItem.new(delivery_log_attributes),
      Sendmux::Management::Generated::DeliveryLogDetail.new(delivery_log_attributes.merge(recipients: nil))
    ]

    models.each do |model|
      assert_public_validation(model, expected_errors: [], expected_valid: true)
    end
  end

  def test_nullable_ses_limit_constraints_accept_nil
    models = [
      Sendmux::Management::Generated::SharedAmazonSesLimit.new(
        can_request_increase: true,
        daily_limit: nil,
        is_near_limit: false,
        sent_today: 0,
        threshold_usage: nil
      ),
      Sendmux::Management::Generated::SharedAmazonSesLimitRequest.new(
        approved_daily_limit: nil,
        created_at: '2026-09-16T00:00:00Z',
        current_daily_limit: 100,
        current_daily_sent: 10,
        id: 'limit_request_fixture',
        status: 'pending'
      )
    ]

    models.each do |model|
      assert_public_validation(model, expected_errors: [], expected_valid: true)
    end
  end

  def test_provider_item_reports_invalid_variables_without_raising
    [nil, 'not-a-hash'].each do |variables|
      model = Sendmux::Management::Generated::ProviderItem.new(provider_item_attributes.merge(variables: variables))

      errors = assert_public_validation(model, expected_valid: false)
      assert_includes errors, 'invalid value for "variables", variables cannot be nil.'
    end
  end

  def test_non_null_out_of_range_values_stay_invalid
    assert_raises(ArgumentError) do
      Sendmux::Management::Generated::DeliveryLogItem.new(
        delivery_log_attributes.merge(recipient_count: 51)
      )
    end
  end

  private

  def assert_public_validation(model, expected_valid:, expected_errors: nil)
    errors = nil
    valid = nil
    _stdout, stderr = capture_io do
      errors = model.list_invalid_properties
      valid = model.valid?
    end
    assert_equal 2, stderr.scan('[DEPRECATED]').length
    assert_equal expected_errors, errors unless expected_errors.nil?
    assert_equal expected_valid, valid
    errors
  end

  def delivery_log_attributes
    {
      accepted_recipient_count: nil, attempts: 1, created_at: '2026-09-16T00:00:00Z', delivery_group: nil,
      from_email: 'sender@example.com', id: 'delivery_fixture', message_id: 'message_fixture',
      provider_id: 'provider_fixture', provider_name: 'Provider fixture', recipient_count: nil,
      rejected_recipient_count: nil, sent_at: '2026-09-16T00:00:01Z', sent_from_email: 'sender@example.com',
      size_bytes: 512, status: 'sent', status_reason: nil, subject: 'Fixture', to_email: 'recipient@example.com'
    }
  end

  def provider_item_attributes
    actions = Sendmux::Management::Generated::ProviderAllowedActions.new(
      activate: true, deactivate: true, delete: true, test: true, update: true, update_variables: true
    )
    {
      allowed_actions: actions, created_at: '2026-09-16T00:00:00Z', has_refresh_token: false,
      has_smtp_password: true, id: 'provider_fixture', is_active: true, is_editable: true, is_shared: false,
      name: 'Provider fixture', quotas: Sendmux::Management::Generated::ProviderQuotas.new, status: 'active',
      type: 'smtp', updated_at: '2026-09-16T00:00:00Z', variables: {}
    }
  end
end
