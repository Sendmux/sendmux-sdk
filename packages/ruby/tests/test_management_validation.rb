# frozen_string_literal: true

require 'minitest/autorun'
require 'sendmux/management'

class SendmuxRubyManagementValidationTest < Minitest::Test
  def test_mailbox_email_validation_matches_the_full_value
    assert_raises(ArgumentError) do
      Sendmux::Management::Generated::ManagementCreateMailboxRequest.new(email: "x\nvalid@example.com")
    end

    request = Sendmux::Management::Generated::ManagementCreateMailboxRequest.new(email: 'valid@example.com')
    assert_equal 'valid@example.com', request.email
  end
end
