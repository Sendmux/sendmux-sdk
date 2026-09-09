# frozen_string_literal: true

require 'json'
require 'minitest/autorun'
require 'sendmux/sdk'
require_relative 'oauth_http_fixture'

class SendmuxRubyOAuthRetryTest < Minitest::Test
  include SendmuxRubyOAuthHTTPFixture

  SURFACES = {
    sending: [Sendmux::Sending::Client, :meta, :sending_get_connection],
    mailbox: [Sendmux::Mailbox::Client, :mailbox_api, :mailbox_get_connection],
    management: [Sendmux::Management::Client, :connection, :management_get_connection]
  }.freeze

  SURFACES.each do |surface, (client_class, api, operation)|
    define_method("test_#{surface}_static_access_token") do
      with_server do |url, requests|
        client = client_class.new(access_token: 'opaque/token+value==', base_url: url)
        client.public_send(api).public_send(operation)
        assert_equal(['Bearer opaque/token+value=='], requests.map { |req| req[:headers]['authorization'] })
      end
    end

    define_method("test_#{surface}_provider_is_lazy_and_refreshes_between_requests") do
      with_server do |url, requests|
        tokens = %w[first.token second.token]
        provider = -> { tokens.shift }
        client = Sendmux::SDK.public_send(surface, access_token: provider, base_url: url)
        assert_equal 2, tokens.length
        2.times { client.public_send(api).public_send(operation) }
        assert_equal(['Bearer first.token', 'Bearer second.token'],
                     requests.map { |req| req[:headers]['authorization'] })
      end
    end

    define_method("test_#{surface}_provider_failure_prevents_request") do
      with_server do |url, requests|
        client = client_class.new(access_token: -> { raise 'refresh failed' }, base_url: url)
        error = assert_raises(RuntimeError) { client.public_send(api).public_send(operation) }
        assert_equal 'refresh failed', error.message
        assert_empty requests
      end
    end

    define_method("test_#{surface}_rejects_invalid_provider_tokens_before_request") do
      with_server do |url, requests|
        [nil, '', "bad\n", 'Bearer token', 'bad token', 42].each do |token|
          client = client_class.new(access_token: -> { token }, base_url: url)
          error = assert_raises(ArgumentError) { client.public_send(api).public_send(operation) }
          assert_match(/access token/i, error.message)
        end
        assert_empty requests
      end
    end
  end

  def test_requires_exactly_one_credential_source
    SURFACES.each do |surface, entry|
      client_class = entry.first
      [{}, { api_key: 'smx_mbx_test', access_token: 'token' }].each do |credentials|
        error = assert_raises(ArgumentError) { client_class.new(**credentials) }
        assert_match(/exactly one/i, error.message)
        error = assert_raises(ArgumentError) { Sendmux::SDK.public_send(surface, **credentials) }
        assert_match(/exactly one/i, error.message)
      end
    end
  end

  def test_explicit_retryable_false_preserves_original_response
    with_server(response: error_response(false)) do |url, requests|
      client = Sendmux::SDK.sending(api_key: 'smx_mbx_test', base_url: url, retry_options: quick_retries)
      error = assert_raises(Sendmux::Core::ApiError) { client.meta.sending_get_connection }
      assert_equal 1, requests.length
      assert_equal 503, error.status
      assert_equal false, error.retryable
      assert_equal 'request-oauth', error.request_id
      assert_equal '0', error.response_headers['retry-after']
      assert_equal error_response(false)[2], error.response_body
    end

    assert_retryable_response_is_retried
  end

  private

  def assert_retryable_response_is_retried
    with_server(response: error_response(true)) do |url, requests|
      client = Sendmux::SDK.sending(api_key: 'smx_mbx_test', base_url: url, retry_options: quick_retries)
      assert_raises(Sendmux::Core::ApiError) { client.meta.sending_get_connection }
      assert_equal 3, requests.length
    end
  end

  def quick_retries
    Sendmux::Core::RetryOptions.new(base_delay_seconds: 0, jitter: false)
  end

  def error_response(retryable)
    [503, { 'Retry-After' => '0', 'X-Request-Id' => 'request-oauth' },
     { ok: false, error: { code: 'unavailable', message: 'Unavailable', retryable: retryable } }.to_json]
  end
end
