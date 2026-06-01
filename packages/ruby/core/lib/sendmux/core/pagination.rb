# frozen_string_literal: true

module Sendmux
  module Core
    class CursorPager
      include Enumerable

      def initialize(fetch_page, cursor_param: :cursor)
        @fetch_page = fetch_page
        @cursor_param = cursor_param
      end

      def each(&block)
        return enum_for(:each) unless block_given?

        cursor = nil
        loop do
          response = @fetch_page.call(cursor ? { @cursor_param => cursor } : {})
          extract_items(response).each(&block)
          pagination = extract_pagination(response)
          break unless bool_value?(pagination, 'has_more')

          cursor = value(pagination, 'next_cursor')
          break unless cursor
        end
      end

      private

      def extract_items(response)
        data = value(response, 'data')
        return data if data.is_a?(Array)

        []
      end

      def extract_pagination(response)
        meta = value(response, 'meta')
        value(meta, 'pagination') || value(response, 'pagination') || {}
      end

      def bool_value?(object, name)
        value(object, name) == true
      end

      def value(object, name)
        return object[name] || object[name.to_sym] if object.is_a?(Hash)
        return object.public_send(name) if object.respond_to?(name)

        method = snake_to_camel(name)
        object.public_send(method) if object.respond_to?(method)
      end

      def snake_to_camel(name)
        parts = name.to_s.split('_')
        parts.first + parts.drop(1).map(&:capitalize).join
      end
    end

    def self.each_cursor(fetch_page, cursor_param: :cursor)
      CursorPager.new(fetch_page, cursor_param: cursor_param)
    end
  end
end
