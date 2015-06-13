defmodule WebsocketHandler do
  # based on (and with comments from) https://github.com/IdahoEv/cowboy-elixir-example
  require Logger

  @behaviour :cowboy_websocket_handler


  def init({tcp, http}, req, _opts) do
    { qs_transport, _ } = :cowboy_req.qs_val("transport", req)
    { qs_sid, _ } = :cowboy_req.qs_val("sid", req, nil)
    poll_or_sock(%{qs_transport: qs_transport, qs_sid: qs_sid, req: req})
  end

  # first poll request
  defp poll_or_sock(%{qs_transport: "polling", qs_sid: nil, req: req}) do
    Logger.debug "first poll"
    { :ok, reply } = :cowboy_req.reply(
      200,
      [ {"content-type", "application/octet-stream"} ],
      << 0, 9, 7, 255, 48 >> <> ~s'{"sid":"7vGQmFsKYGEXPCvgAAAA","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":60000}',
      req
    )
    {:upgrade, :protocol, :cowboy_websocket, reply, :shutdown}
  end

  # second poll request
  defp poll_or_sock(%{qs_transport: "polling", qs_sid: _, req: req}) do
    Logger.debug "second poll"
    token = :cowboy_req.cookie "token", req
    { :ok, reply } = :cowboy_req.reply(
      200,
      [ {"content-type", "application/octet-stream"} ],
      << 0, 2, 255, 52, 48 >>,
      req
    )
    {:upgrade, :protocol, :cowboy_websocket, reply, :shutdown}
  end

  defp poll_or_sock(%{qs_transport: "websocket", qs_sid: _, req: req}) do
    Logger.debug "upgrading protocol"
    # {:upgrade, :protocol, :cowboy_websocket}
    {:upgrade, :protocol, :cowboy_websocket, req, :upgrade}
  end

  def websocket_init(_TransportName, req, opt) do
    Logger.debug "initiating websocket with #{_TransportName} --- #{opt}"
    case opt do
      :upgrade     ->    {:ok, req, :undefined_state, 60000}
      :shutdown    ->    {:shutdown, req}
    end
  end

  # Required callback.  Put any essential clean-up here.
  def websocket_terminate(_reason, _req, _state) do
    # IO.puts("Terminating websocket for reason: #{inspect(_reason)}")
    # IO.puts("Terminating websocket after request: #{inspect(_req)}")
    # IO.puts("Terminating websocket with state: #{inspect(_state)}")
    :ok
  end

  # websocket_handle deals with messages coming in over the websocket.
  # it should return a 4-tuple starting with either :ok (to do nothing)
  # or :reply (to send a message back).
  def websocket_handle({:text, "2" <> content}, req, state) do

    Logger.debug("answering '2' message with content: '#{content}'")

    {:reply, {:text, "3" <> content}, req, state}
  end

  def websocket_handle({:text, "5" }, req, state) do

    Logger.debug("Client gave us five. We don't respond...")

    {:ok, req, state}
  end

  def websocket_handle({:text, "42" <> meaning}, req, state) do

    Logger.debug("handling socket!")

    [ "message",  message ] = Poison.decode!(meaning)

    e_reply = MessageProcessor.process message

    reply = "42" <> Poison.encode!([ "message",  e_reply ])

    # The reply format here is a 4-tuple starting with :reply followed
    # by the body of the reply, in this case the tuple {:text, reply}
    {:reply, {:text, reply}, req, state}
  end

  # Fallback clause for websocket_handle.  If the previous one does not match
  # this one just returns :ok without taking any action.  A proper app should
  # probably intelligently handle unexpected messages.
  def websocket_handle(_data, req, state) do
    Logger.debug "fell on the back"
    {:ok, req, state}
  end

  # websocket_info is the required callback that gets called when erlang/elixir
  # messages are sent to the handler process.  In this example, the only erlang
  # messages we are passing are the :timeout messages from the timing loop.
  #
  # In a larger app various clauses of websocket_info might handle all kinds
  # of messages and pass information out the websocket to the client.
  def websocket_info({timeout, _ref, _foo}, req, state) do

    { :ok, message } = Poison.encode(%{ time: "00:00:00"})

    # send the new message to the client. Note that even though there was no
    # incoming message from the client, we still call the outbound message
    # a 'reply'.  That makes the format for outbound websocket messages
    # exactly the same as websocket_handle()
    { :reply, {:text, message}, req, state}
  end

  # fallback message handler
  def websocket_info(_info, req, state) do
    {:ok, req, state}
  end

end
