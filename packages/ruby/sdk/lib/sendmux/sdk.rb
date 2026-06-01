# frozen_string_literal: true

require 'sendmux/core'
require 'sendmux/mailbox'
require 'sendmux/management'
require 'sendmux/sending'
require 'sendmux/sdk/version'

module Sendmux
  module SDK
    def self.sending(api_key:, base_url: Sendmux::Sending::DEFAULT_BASE_URL, retry_options: nil)
      Sendmux::Sending::Client.new(api_key: api_key, base_url: base_url, retry_options: retry_options)
    end

    def self.mailbox(api_key:, base_url: Sendmux::Mailbox::DEFAULT_BASE_URL, retry_options: nil)
      Sendmux::Mailbox::Client.new(api_key: api_key, base_url: base_url, retry_options: retry_options)
    end

    def self.management(api_key:, base_url: Sendmux::Management::DEFAULT_BASE_URL, retry_options: nil)
      Sendmux::Management::Client.new(api_key: api_key, base_url: base_url, retry_options: retry_options)
    end
  end

  Sdk = SDK
end
