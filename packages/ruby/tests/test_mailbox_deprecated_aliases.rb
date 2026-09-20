# frozen_string_literal: true

require 'minitest/autorun'
require 'sendmux/mailbox'

class SendmuxRubyMailboxDeprecatedAliasesTest < Minitest::Test
  DEPRECATION_WARNING = 'warning: constant Sendmux::Mailbox::Generated::MailboxRealtimeMessageAllOfBody is deprecated'

  # Names the nullable-reference schema shape drops from the generated gem. Each is a real generated
  # class until that regeneration lands and a deprecated alias of the class that types the same
  # attribute afterwards; either way the constant keeps resolving.
  COMPAT_MODEL_NAMES = {
    'MailboxMessageContentResponseAllOfData' => ['MailboxMessageContent', 'MailboxMessageContentResponse', :data],
    'MailboxRawBodyResponseAllOfData' => ['MailboxRawBody', 'MailboxRawBodyResponse', :data],
    'MailboxSubmissionEnvelopeRcptToInner' =>
      ['MailboxSubmissionEnvelopeAddress', 'MailboxSubmissionEnvelope', :rcpt_to],
    'MailboxThreadContentResponseAllOfData' => ['MailboxMessageContent', 'MailboxThreadContentResponse', :data]
  }.freeze

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

  def test_compat_model_names_keep_resolving
    COMPAT_MODEL_NAMES.each do |name, (replacement, _owner, _attribute)|
      resolved = nil
      _stdout, stderr = capture_io { resolved = Sendmux::Mailbox::Generated.const_get(name) }

      if stderr.empty?
        assert_equal "Sendmux::Mailbox::Generated::#{name}", resolved.name
      else
        assert_same Sendmux::Mailbox::Generated.const_get(replacement), resolved
        assert_equal 1, stderr.lines.length, stderr
        assert_includes stderr, "warning: constant Sendmux::Mailbox::Generated::#{name} is deprecated"
      end
    end
  end

  def test_compat_model_names_are_the_classes_typing_their_attributes
    COMPAT_MODEL_NAMES.each do |name, (_replacement, owner, attribute)|
      resolved = nil
      capture_io { resolved = Sendmux::Mailbox::Generated.const_get(name) }
      declared = Sendmux::Mailbox::Generated.const_get(owner).openapi_types.fetch(attribute).to_s
      declared = declared.delete_prefix('Array<').delete_suffix('>')

      assert_same Sendmux::Mailbox::Generated.const_get(declared), resolved
    end
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
