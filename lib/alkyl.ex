defmodule Alkyl do
  use Application

  def start(_type, _args) do
    import Supervisor.Spec, warn: false

    dispatch = :cowboy_router.compile([

      { :_,
        [
          {"/", :cowboy_static, {:priv_file, :alkyl, "Etherpad.html"}},

          {"/p/[...]", Alkyl.DynamicPageHandler, []},

          {"/socket.io/",             Alkyl.WebsocketHandler, []},

          {"/socket.io/socket.io.js",  :cowboy_static, {:priv_file,  :alkyl, "socket.io.js"}},
          {"/locales.json",            :cowboy_static, {:priv_file,  :alkyl, "locales.json"}},
          {"/favicon.ico",             :cowboy_static, {:priv_file,  :alkyl, "favicon.ico"}},

          {"/static/[...]",        :cowboy_static, {:priv_dir,  :alkyl, "static"}},
          {"/javascripts/[...]",   :cowboy_static, {:priv_dir,  :alkyl, "javascripts"}},
          {"/pluginfw/[...]",      :cowboy_static, {:priv_dir,  :alkyl, "pluginfw"}},
          {"/locales/[...]",      :cowboy_static, {:priv_dir,  :alkyl, "locales"}},
      ]}
    ])
    { :ok, _ } = :cowboy.start_http(:http,
                                    100,
                                   [{:port, 4001}],
                                   [{ :env, [{:dispatch, dispatch}]}]
    )

    children = [
      worker(Alkyl.PadPoolStore, [%{}]),
      supervisor(Alkyl.PadPoolSub, []),
      worker(Alkyl.Reloader, []),
      worker(Alkyl.Repo, [])
    ]

    opts = [strategy: :one_for_one, name: Alkyl.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
