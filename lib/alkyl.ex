defmodule Alkyl do
  def start(_type, _args) do

    dispatch = :cowboy_router.compile([

      { :_,
        [
          {"/", :cowboy_static, {:priv_file, :alkyl, "Etherpad.html"}},

          {"/p/[...]", DynamicPageHandler, []},

          {"/socket.io/socket.io.js",  :cowboy_static, {:priv_file,  :alkyl, "socket.io.js"}},
          {"/locales.json",            :cowboy_static, {:priv_file,  :alkyl, "locales.json"}},
          {"/favicon.ico",             :cowboy_static, {:priv_file,  :alkyl, "favicon.ico"}},

          {"/socket.io/", WebsocketHandler, []},
          # {"/socket.io", WebsocketHandler, []},

          {"/static/[...]",        :cowboy_static, {:priv_dir,  :alkyl, "static"}},
          {"/javascripts/[...]",   :cowboy_static, {:priv_dir,  :alkyl, "javascripts"}},
          {"/pluginfw/[...]",      :cowboy_static, {:priv_dir,  :alkyl, "pluginfw"}},
          {"/locales/[...]",      :cowboy_static, {:priv_dir,  :alkyl, "locales"}},

          # {"/static/[...]", :cowboy_static, {:priv_dir,  :alkyl, "static_files"}},

          {"/dynamic", DynamicPageHandler, []},

          # Serve websocket requests.
          {"/websocket", WebsocketHandler, []}
      ]}
    ])
    { :ok, _ } = :cowboy.start_http(:http,
                                    100,
                                   [{:port, 4001}],
                                   [{ :env, [{:dispatch, dispatch}]}]
                                   )
  end
end
