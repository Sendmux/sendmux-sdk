# frozen_string_literal: true

module Sendmux
  module Sending
    DEFAULT_BASE_URL = 'https://smtp.sendmux.ai/api/v1'

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
          Sendmux::Core::ApiKeySurface::SENDING,
          base_url: base_url,
          access_token: access_token
        )
        Sendmux::Core::Retry.configure(@configuration, retry_options)
        @api_client = ApiClient.new(@configuration)
      end

      def attachments
        @attachments ||= Generated::AttachmentsApi.new(@api_client)
      end

      def emails
        @emails ||= Generated::EmailsApi.new(@api_client)
      end

      def meta
        @meta ||= Generated::MetaApi.new(@api_client)
      end
    end
  end
end
