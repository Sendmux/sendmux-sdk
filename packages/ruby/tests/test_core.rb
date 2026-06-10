# frozen_string_literal: true

require 'json'
require 'minitest/autorun'
require 'sendmux/core'
require 'sendmux/mailbox'
require 'sendmux/management'
require 'sendmux/sdk'
require 'sendmux/sending'
require 'stringio'

class SendmuxRubyCoreTest < Minitest::Test
  class GeneratedError < StandardError
    attr_reader :code, :response_headers, :response_body

    def initialize
      super('unprocessable')
      @code = 422
      @response_headers = { 'X-Request-Id' => 'req_header' }
      @response_body = {
        ok: false,
        error: {
          code: 'validation_error',
          message: 'Invalid request',
          param: 'email',
          retryable: false,
          errors: [{ field: 'email', message: 'is invalid' }]
        },
        meta: { request_id: 'req_body' }
      }.to_json
    end
  end

  def test_key_surface_validation
    assert_equal Sendmux::Core::ApiKeySurface::ROOT,
                 Sendmux::Core::Auth.assert_api_key_surface('smx_root_test', Sendmux::Core::ApiKeySurface::ROOT)
    assert_raises(ArgumentError) do
      Sendmux::Core::Auth.assert_api_key_surface('smx_mbx_test', Sendmux::Core::ApiKeySurface::ROOT)
    end
  end

  def test_error_mapping_preserves_envelope_details
    mapped = Sendmux::Core::ErrorMapper.map(GeneratedError.new)

    assert_instance_of Sendmux::Core::ApiError, mapped
    assert_equal 422, mapped.status
    assert_equal 'validation_error', mapped.code
    assert_equal 'Invalid request', mapped.message
    assert_equal 'email', mapped.param
    assert_equal false, mapped.retryable
    assert_equal 'req_body', mapped.request_id
    assert_equal [{ 'field' => 'email', 'message' => 'is invalid' }], mapped.errors
  end

  def test_header_helpers_return_generated_option_keys
    assert_equal({ idempotency_key: 'idem_1' }, Sendmux::Core::Headers.idempotency_key('idem_1'))
    assert_equal({ if_match: 'W/"etag"' }, Sendmux::Core::Headers.if_match('W/"etag"'))
    assert_equal({ if_none_match: 'W/"etag"' }, Sendmux::Core::Headers.if_none_match('W/"etag"'))
    assert_equal({ if_match: 'a', if_none_match: 'b' }, Sendmux::Core::Headers.conditional(if_match: 'a',
                                                                                           if_none_match: 'b'))
  end

  def test_cursor_pager_streams_until_cursor_is_empty
    pages = [
      { data: [1, 2], meta: { pagination: { has_more: true, next_cursor: 'next' } } },
      { data: [3], meta: { pagination: { has_more: false } } }
    ]
    cursors = []
    pager = Sendmux::Core.each_cursor(lambda do |opts|
      cursors << opts[:cursor]
      pages.shift
    end)

    assert_equal [1, 2, 3], pager.to_a
    assert_equal [nil, 'next'], cursors
  end

  def test_retry_request_classification
    assert Sendmux::Core::Retry.retryable_request?({ method: :get, request_headers: {}, body: nil })
    assert Sendmux::Core::Retry.retryable_request?(
      { method: :post, request_headers: { 'Idempotency-Key' => 'idem' }, body: StringIO.new('body') }
    )
    refute Sendmux::Core::Retry.retryable_request?({ method: :post, request_headers: {}, body: 'body' })
  end

  def test_surface_clients_configure_auth_and_generated_apis
    sending = Sendmux::Sending::Client.new(api_key: 'smx_mbx_test')
    management = Sendmux::Management::Client.new(api_key: 'smx_root_test')
    mailbox = Sendmux::Mailbox::Client.new(api_key: 'smx_mbx_test')

    assert_equal 'smx_mbx_test', sending.configuration.access_token
    assert_instance_of Sendmux::Sending::Generated::EmailsApi, sending.emails
    assert_equal 'smx_root_test', management.configuration.access_token
    assert_equal 'smx_mbx_test', mailbox.configuration.access_token
  end

  def test_umbrella_factories_validate_profile_surfaces
    assert_instance_of Sendmux::Sending::Client, Sendmux::SDK.sending(api_key: 'smx_mbx_test')
    assert_instance_of Sendmux::Mailbox::Client, Sendmux::SDK.mailbox(api_key: 'smx_mbx_test')
    assert_raises(ArgumentError) { Sendmux::SDK.management(api_key: 'smx_mbx_test') }
  end
end
