# frozen_string_literal: true

require 'json'
require 'minitest/autorun'
require 'sendmux/sdk'

class SendmuxRubyDatetimeContractTest < Minitest::Test
  def test_cost_query_preserves_instant_and_milliseconds
    [
      ['2026-10-05T12:00:00.123Z', '2026-10-05T12:00:00.123Z', '2026-10-05T12:00:01.123Z'],
      ['2026-10-05T12:00:00.123+09:30', '2026-10-05T02:30:00.123Z', '2026-10-05T02:30:01.123Z']
    ].each do |timestamp, expected_start, expected_end|
      client, requests = client_with_transport(:management, :get, '/api/v1/mailboxes/mbx_test/usage')
      start = Time.iso8601(timestamp)
      client.mailboxes.management_get_mailbox_cost_usage('mbx_test', start, start + 1)

      assert_equal({ 'start' => expected_start, 'end' => expected_end },
                   URI.decode_www_form(requests.fetch(0).fetch(:url).query).to_h)
    end
  end

  def test_cost_bounds_reject_submillisecond_precision_without_rounding
    [Rational(123_001, 1_000_000), Rational(1, 1_000_000_000_000)].each do |fraction|
      2.times do |bound|
        client, requests = client_with_transport(:management, :get, '/api/v1/mailboxes/mbx_test/usage')
        bounds = [Time.iso8601('2026-10-05T12:00:00Z'), Time.iso8601('2026-10-05T13:00:00Z')]
        bounds[bound] += fraction

        assert_raises(ArgumentError) { client.mailboxes.management_get_mailbox_cost_usage('mbx_test', *bounds) }
        assert_empty requests
      end
    end
  end

  def test_scheduled_send_serializes_time_as_rfc3339_without_losing_precision
    [
      ['2026-10-05T12:00:00Z', '2026-10-05T12:00:00Z'],
      ['2026-10-05T12:00:00.123+09:30', '2026-10-05T02:30:00.123Z'],
      ['2026-10-05T12:00:00.123456Z', '2026-10-05T12:00:00.123456Z'],
      ['2026-10-05T12:00:00.123456789Z', '2026-10-05T12:00:00.123456789Z']
    ].each do |timestamp, expected|
      client, requests = client_with_transport(:mailbox, :post, '/api/v1/mailbox/drafts/draft_test/send')
      body = Sendmux::Mailbox::Generated::SendMailboxDraft.new(
        expected_revision: 1, scheduled_for: Time.iso8601(timestamp)
      )
      client.mailbox_api.mailbox_send_draft('draft_test', body)

      assert_equal expected, JSON.parse(requests.fetch(0).fetch(:body)).fetch('scheduled_for')
    end
  end

  def test_scheduled_send_rejects_subnanosecond_precision_without_rounding
    client, requests = client_with_transport(:mailbox, :post, '/api/v1/mailbox/drafts/draft_test/send')
    body = Sendmux::Mailbox::Generated::SendMailboxDraft.new(
      expected_revision: 1,
      scheduled_for: Time.iso8601('2026-10-05T12:00:00Z') + Rational(1, 1_000_000_000_000)
    )

    assert_raises(ArgumentError) { client.mailbox_api.mailbox_send_draft('draft_test', body) }
    assert_empty requests
  end

  def test_scheduled_send_preserves_instant_with_second_granularity_timezone
    client, requests = client_with_transport(:mailbox, :post, '/api/v1/mailbox/drafts/draft_test/send')
    body = Sendmux::Mailbox::Generated::SendMailboxDraft.new(
      expected_revision: 1, scheduled_for: Time.iso8601('2026-10-05T12:00:00Z').getlocal(30)
    )
    client.mailbox_api.mailbox_send_draft('draft_test', body)

    assert_equal '2026-10-05T12:00:00Z', JSON.parse(requests.fetch(0).fetch(:body)).fetch('scheduled_for')
  end

  def test_cost_query_preserves_instant_with_second_granularity_timezone
    client, requests = client_with_transport(:management, :get, '/api/v1/mailboxes/mbx_test/usage')
    start = Time.iso8601('2026-10-05T12:00:00.123Z').getlocal(30)
    client.mailboxes.management_get_mailbox_cost_usage('mbx_test', start, start + 1)

    assert_equal({ 'start' => '2026-10-05T12:00:00.123Z', 'end' => '2026-10-05T12:00:01.123Z' },
                 URI.decode_www_form(requests.fetch(0).fetch(:url).query).to_h)
  end

  private

  def client_with_transport(surface, method, route)
    requests = []
    client = Sendmux::SDK.public_send(surface, access_token: 'test.token', base_url: 'https://sdk.example.invalid/api/v1')
    stubs = Faraday::Adapter::Test::Stubs.new do |stub|
      stub.public_send(method, route) do |request|
        requests << { url: request.url, body: request.body }
        [204, {}, '']
      end
    end
    client.configuration.configure_faraday_connection { |connection| connection.adapter :test, stubs }
    [client, requests]
  end
end
