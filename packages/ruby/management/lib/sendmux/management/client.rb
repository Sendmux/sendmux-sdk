# frozen_string_literal: true

module Sendmux
  module Management
    DEFAULT_BASE_URL = 'https://app.sendmux.ai/api/v1'

    class ApiClient < Generated::ApiClient
      def update_params_for_auth!(header_params, query_params, auth_names)
        return super unless config.access_token_getter && !Array(auth_names).empty?

        header_params['Authorization'] = "Bearer #{config.access_token_with_refresh}"
      end

      def call_api(...)
        super
      rescue Generated::ApiError => e
        raise Sendmux::Core::ErrorMapper.map(e)
      end
    end

    class Client
      attr_reader :api_client, :configuration

      def initialize(api_key: nil, access_token: nil, base_url: DEFAULT_BASE_URL, retry_options: nil)
        @configuration = Sendmux::Core::Auth.configure_bearer(
          Generated::Configuration.new,
          api_key,
          Sendmux::Core::ApiKeySurface::ROOT,
          base_url: base_url,
          access_token: access_token
        )
        Sendmux::Core::Retry.configure(@configuration, retry_options)
        @api_client = ApiClient.new(@configuration)
      end

      def billing
        @billing ||= Generated::BillingApi.new(@api_client)
      end

      def connection
        @connection ||= Generated::ConnectionApi.new(@api_client)
      end

      def domain_filters
        @domain_filters ||= Generated::DomainFiltersApi.new(@api_client)
      end

      def domains
        @domains ||= Generated::DomainsApi.new(@api_client)
      end

      def emails
        @emails ||= Generated::EmailsApi.new(@api_client)
      end

      def inboxes
        @inboxes ||= Generated::InboxesApi.new(@api_client)
      end

      def mailbox_filters
        @mailbox_filters ||= Generated::MailboxFiltersApi.new(@api_client)
      end

      def mailboxes
        @mailboxes ||= Generated::MailboxesApi.new(@api_client)
      end

      def sending_accounts
        @sending_accounts ||= Generated::SendingAccountsApi.new(@api_client)
      end

      def webhooks
        @webhooks ||= Generated::WebhooksApi.new(@api_client)
      end
    end
  end
end
