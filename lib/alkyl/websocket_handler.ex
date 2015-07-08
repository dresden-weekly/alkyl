defmodule Alkyl.WebsocketHandler do
  # based on (and with comments from) https://github.com/IdahoEv/cowboy-elixir-example
  require Logger

  @behaviour :cowboy_websocket_handler

  def init({_, _}, req, _opts) do
    { qs_transport, _ } = :cowboy_req.qs_val("transport", req)
    if  qs_transport == "polling" do
      state = %{pad: nil, user: nil, user_name: nil, io_atom: nil}
      {:ok, req, state}
    else
      {:upgrade, :protocol, :cowboy_websocket}
    end
  end

  # poll requests
  def handle(req, state) do

    # { qs_sid, _ } = :cowboy_req.qs_val("sid", req, nil)
    { qs_t, _ } = :cowboy_req.qs_val("t", req)

    r_num = String.replace qs_t, ~r/^\d+-/, ""

    # unless qs_sid do
    case r_num do

      "0" ->

        io = Alkyl.Utils.Session.session_id()

        cleaned = :cowboy_req.set_resp_cookie("io", "", [max_age: 0], req)
        baked =  :cowboy_req.set_resp_cookie("io", io, [path: "/socket.io/"], cleaned)

        Logger.debug "first poll"
        { :ok, reply } = :cowboy_req.reply(
          200,

          [ {"content-type", "application/octet-stream"} ],
          << 0, 9, 7, 255, 48 >> <> ~s'{"sid":"#{io}","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":60000}',
          baked
        )

      "1" ->

        Logger.debug "second poll"
        { :ok, reply } = :cowboy_req.reply(
          200,
          [ {"content-type", "application/octet-stream"} ],
          << 0, 2, 255, 52, 48 >>,
          req
        )

      "2" ->

        Logger.debug "third poll"
        { :ok, body, _ } =  :cowboy_req.body(req)

        [ "message", cr_msg ] = String.replace(body, ~R/^\d+:42/, "") |> Poison.decode!

        { io_cookie, _ } = :cowboy_req.cookie("io", req, nil)

        :erlang.start_timer(500, String.to_atom("bla" <> io_cookie), cr_msg)

        Logger.debug "third poll - #{inspect cr_msg}"

        { :ok, reply } = :cowboy_req.reply(
          200,
          [ {"content-type", "text/html"} ],
          "ok",
          req
        )

      "3" ->

        Logger.debug "fourth poll"
        { io_cookie, _ } = :cowboy_req.cookie("io", req, nil)
        :erlang.register(String.to_atom("bla" <> io_cookie), self())

        receive do
          {:timeout, _ref,  message} ->
            cr_msg = message
          bla ->
            Logger.debug "fourth poll #{inspect bla}"

        after 2000 ->
            Logger.error "No message for #{io_cookie}"
        end

        { body, _, state } = Alkyl.MessageProcessor.process(cr_msg, req, state)

        { :ok, reply } = :cowboy_req.reply(
          200,
          [ {"content-type", "application/octet-stream"} ],
          << 0, 9, 4, 2, 0, 255 >> <> body,
          req
        )

      _ ->

        Logger.error "unhandled poll number #{r_num}"
    end

    {:ok, reply, state}
  end

  def websocket_init(_TransportName, req, opt) do
    Logger.debug "initiating websocket with #{_TransportName} --- '#{opt}'"
    # { tok, _ } = :cowboy_req.cookie("token", req, nil)
    # Logger.debug "trying to set user from 'token'-cookie #{tok}"
    # if tok do
    #   Logger.debug "setting user from 'token'-cookie #{tok}"
    #   state = %{pad: nil, user: nil, user: Alkyl.Store.author_by_token(tok)}
    # else
    { io_cookie, _ } = :cowboy_req.cookie("io", req, nil)
    Alkyl.PadPool.register Alkyl.Utils.Session.io_atom(io_cookie), self
    state = %{pad: nil, user: nil, user_name: nil, io_atom: nil}
    # end
    {:ok, req, state, 60000}
  end

  # Required callback.  Put any essential clean-up here.
  def websocket_terminate(_reason, _req, state) do
    # IO.puts("Terminating websocket for reason: #{inspect(_reason)}")
    # IO.puts("Terminating websocket after request: #{inspect(_req)}")
    # IO.puts("Terminating websocket with state: #{inspect(_state)}")
    if state.pad do
      Alkyl.PadPool.disjoin(state.pad, state.io_atom)
    end
    :ok
  end

  # websocket_handle deals with messages coming in over the websocket.
  # it should return a 4-tuple starting with either :ok (to do nothing)
  # or :reply (to send a message back).
  def websocket_handle({:text, "2" <> content}, req, state) do

    # Logger.debug("answering '2' message with content: '#{content}'")

    {:reply, {:text, "3" <> content}, req, state}
  end

  def websocket_handle({:text, "5"}, req, state) do

    Logger.debug("Client gave us five. We don't respond...")

    {:ok, req, state}
  end

  def websocket_handle({:text, "42" <> meaning}, req, state) do

    Logger.debug("handling socket!")

    [ "message",  message ] = Poison.decode!(meaning)

    { reply, req, state } = Alkyl.MessageProcessor.process message, req, state

    Logger.debug("42 state: #{inspect state}")

    case reply do
      nil ->  {:ok, req, state}
      _   ->  {:reply, {:text, reply}, req, state}
    end
  end

  def websocket_info("42" <> msg, req, state) do
    Logger.debug "broadcasting message to user '#{state.user}' #{msg}"
    {:reply, {:text, "42" <> msg}, req, state}
  end

  def websocket_handle(_data, req, state) do
    Logger.debug "fell on the back"
    {:ok, req, state}
  end

  # fallback message handler
  def websocket_info(_info, req, state) do
    Logger.debug "fell on the info back"
    {:ok, req, state}
  end

  # terminate handler for the regular (non-websocket) requests
  def terminate(_reason, _request, state) do
    if state.pad do
      Alkyl.PadPool.disjoin(state.pad, state.io_atom)
    end
    :ok
  end
end
