# frozen_string_literal: true

require 'minitest/autorun'
require 'sendmux/management'

class SendmuxRubyManagementDeprecatedAliasesTest < Minitest::Test
  # Names the nullable-reference schema shape drops from the generated gem. Each is a real generated
  # class until that regeneration lands and a deprecated alias of the class that types the same
  # attribute afterwards; either way the constant keeps resolving.
  COMPAT_MODEL_NAMES = {
    'MailboxAppPasswordResultCredential' => 'MailboxCredential',
    'ProviderCreateBodyQuotasPerDayAnyOf' => 'ProviderQuotaRange'
  }.freeze

  def setup
    @deprecated_warnings_enabled = Warning[:deprecated]
    Warning[:deprecated] = true
  end

  def teardown
    Warning[:deprecated] = @deprecated_warnings_enabled
  end

  def test_compat_model_names_keep_resolving
    COMPAT_MODEL_NAMES.each do |name, replacement|
      resolved = nil
      _stdout, stderr = capture_io { resolved = Sendmux::Management::Generated.const_get(name) }

      if stderr.empty?
        assert_equal "Sendmux::Management::Generated::#{name}", resolved.name
      else
        assert_same Sendmux::Management::Generated.const_get(replacement), resolved
        assert_equal 1, stderr.lines.length, stderr
        assert_includes stderr, "warning: constant Sendmux::Management::Generated::#{name} is deprecated"
      end
    end
  end

  def test_app_password_credential_name_is_the_class_typing_credential
    declared = Sendmux::Management::Generated::MailboxAppPasswordResult.openapi_types.fetch(:credential).to_s

    assert_same Sendmux::Management::Generated.const_get(declared), resolve('MailboxAppPasswordResultCredential')
  end

  def test_quota_range_name_is_a_member_of_the_per_day_quota_union
    members = Sendmux::Management::Generated::ProviderCreateBodyQuotasPerDay.openapi_any_of.map do |member|
      Sendmux::Management::Generated.const_get(member)
    end

    assert_includes members, resolve('ProviderCreateBodyQuotasPerDayAnyOf')
  end

  private

  def resolve(name)
    resolved = nil
    capture_io { resolved = Sendmux::Management::Generated.const_get(name) }
    resolved
  end
end
