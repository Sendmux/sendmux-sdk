# frozen_string_literal: true

require 'minitest/autorun'
require 'sendmux/mailbox'

class SendmuxRubyMailboxDeprecatedAliasesTest < Minitest::Test
  DEPRECATION_WARNING = 'warning: constant Sendmux::Mailbox::Generated::MailboxRealtimeMessageAllOfBody is deprecated'

  def setup
    @deprecated_warnings_enabled = Warning[:deprecated]
    Warning[:deprecated] = true
  end

  def teardown
    Warning[:deprecated] = @deprecated_warnings_enabled
  end

  def test_deprecated_alias_resolves_to_the_new_model_with_one_warning
    alias_class = nil
    _stdout, stderr = capture_io do
      alias_class = Sendmux::Mailbox::Generated::MailboxRealtimeMessageAllOfBody
    end

    assert_same Sendmux::Mailbox::Generated::MailboxRealtimeMessageBody, alias_class
    assert_equal 1, stderr.lines.length, stderr
    assert_includes stderr, DEPRECATION_WARNING
  end

  def test_new_model_is_not_deprecated
    _stdout, stderr = capture_io do
      Sendmux::Mailbox::Generated::MailboxRealtimeMessageBody
    end

    assert_empty stderr
  end

  def test_realtime_message_body_is_the_new_model
    message = Sendmux::Mailbox::Generated::MailboxRealtimeMessage.build_from_hash(realtime_message_attributes)

    assert_instance_of Sendmux::Mailbox::Generated::MailboxRealtimeMessageBody, message.body
    assert_equal 'hello', message.body.text
  end

  private

  def realtime_message_attributes
    {
      bcc: [], cc: [], folder_ids: ['inbox'], has_attachments: false, id: 'msg_rb_alias', keywords: [],
      body: { html: nil, is_truncated: false, max_bytes: 65_536, text: 'hello' },
      flags: { answered: false, draft: false, flagged: false, seen: false },
      from: { email: 'sender@example.com', name: nil }, preview: 'hello',
      received_at: '2026-09-19T00:00:00.000Z', rfc5322_message_id: '<msg_rb_alias@example.com>', sent_at: nil,
      size_bytes: 512, subject: 'Alias', thread_id: 'thr_rb_alias', to: [{ email: 'agent@example.com', name: nil }]
    }
  end
end
