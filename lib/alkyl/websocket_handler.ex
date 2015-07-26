defmodule Alkyl.WebsocketHandler do
  # based on (and with comments from) https://github.com/IdahoEv/cowboy-elixir-example
  require Logger

  @behaviour :cowboy_websocket_handler

  def init({_, _}, req, _opts) do
    { qs_transport, _ } = :cowboy_req.qs_val("transport", req)
    qs_sid = :cowboy_req.qs_val("sid", req, nil) |> elem(0)
    state = %{pad: nil, user: nil, user_name: nil, sid: qs_sid}
    if  qs_transport == "polling" do
      {:ok, req, state}
    else
      {:upgrade, :protocol, :cowboy_websocket, req, state}
    end
  end

  # poll requests
  def handle(req, state) do
    Alkyl.PollingProcessor.process(req, state)
  end

  def websocket_init(_TransportName, req, state) do
    Logger.debug "initiating websocket with #{_TransportName} --- '#{inspect state}'"
    Alkyl.ClientPool.register state.sid, self
    {:ok, req, state, 60000}
  end

  # Required callback.  Put any essential clean-up here.
  def websocket_terminate(_reason, _req, state) do
    # IO.puts("Terminating websocket for reason: #{inspect(_reason)}")
    # IO.puts("Terminating websocket after request: #{inspect(_req)}")
    # IO.puts("Terminating websocket with state: #{inspect(_state)}")
    if state.pad do
      Alkyl.ClientPool.disjoin(state.pad, state.sid, true)
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

    unless state.pad, do: state = Map.merge state, Alkyl.ClientPool.sess_by_sid(state.sid)

    [ "message",  message ] = Poison.decode!(meaning)

    { reply, req, state } = Alkyl.MessageProcessor.process message, req, state

    Logger.debug("42 state: #{inspect state} pid: #{inspect self}")

    case reply do
      nil ->  {:ok, req, state}
      _   ->  {:reply, {:text, reply}, req, state}
    end
  end

  def websocket_handle(_data, req, state) do
    Logger.debug "fell on the back"
    {:ok, req, state}
  end

  def websocket_info({:set_pad, pad}, req, state) do

    state = %{state| pad: pad}
    Logger.info("set pad '#{state.pad}' for websocket from polling handler")

    {:ok, req, state}
  end

  def websocket_info("42" <> msg, req, state) do
    Logger.debug "broadcasting message to user '#{state.user}' #{msg}"
    {:reply, {:text, "42" <> msg}, req, state}
  end

  # fallback message handler
  def websocket_info(_info, req, state) do
    Logger.debug "fell on the info back"
    {:ok, req, state}
  end

  # terminate handler for the regular (non-websocket) requests
  def terminate(_reason, _request, state) do
    Logger.info "terminating non-websocket process with reason '#{inspect _reason}' state: '#{inspect state}'"
    if state.sid do
      Alkyl.PollingAgent.unregister(state.sid, self())
    end
    :ok
  end
end
