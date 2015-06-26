defmodule Alkyl.WebsocketHandler do
  # based on (and with comments from) https://github.com/IdahoEv/cowboy-elixir-example
  require Logger

  @behaviour :cowboy_websocket_handler

  def init({_, _}, req, _opts) do
    { qs_transport, _ } = :cowboy_req.qs_val("transport", req)
    if  qs_transport == "polling" do
      {:ok, req, :first}
    else
      {:upgrade, :protocol, :cowboy_websocket}
    end
  end

  # poll requests
  def handle(req, state) do

    { qs_sid, _ } = :cowboy_req.qs_val("sid", req, nil)

    unless qs_sid do

      Logger.debug "first poll"
      { :ok, reply } = :cowboy_req.reply(
        200,

        # TODO: set session cookie "io" to something like fy6cKlaJbhAvJuskAAAA to
        # the same value as the "sid" value in the body (no path)

        [ {"content-type", "application/octet-stream"} ],
        << 0, 9, 7, 255, 48 >> <> ~s'{"sid":"7vGQmFsKYGEXPCvgAAAA","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":60000}',
        req
      )

    else

      Logger.debug "second poll"
      { :ok, reply } = :cowboy_req.reply(
        200,
        [ {"content-type", "application/octet-stream"} ],
        << 0, 2, 255, 52, 48 >>,
        req
      )
    end

    {:ok, reply, %{token: :cowboy_req.cookie("token", req, nil)}}
  end


  def websocket_init(_TransportName, req, opt) do
    Logger.debug "initiating websocket with #{_TransportName} --- #{opt}"
    {:ok, req, :undefined_state, 60000}
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

  def websocket_handle({:text, "5"}, req, state) do

    Logger.debug("Client gave us five. We don't respond...")

    {:ok, req, state}
  end

  def websocket_handle({:text, "42" <> meaning}, req, state) do

    Logger.debug("handling socket!")

    [ "message",  message ] = Poison.decode!(meaning)

    e_reply = Alkyl.MessageProcessor.process message

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
  # messages are sent to the handler process.
  #
  # In a larger app various clauses of websocket_info might handle all kinds
  # of messages and pass information out the websocket to the client.
  def websocket_info({_timeout, _ref, _foo}, req, state) do

    # send the new message to the client. Note that even though there was no
    # incoming message from the client, we still call the outbound message
    # a 'reply'.  That makes the format for outbound websocket messages
    # exactly the same as websocket_handle()
    {:reply, {:text, ""}, req, state}
  end

  # fallback message handler
  def websocket_info(_info, req, state) do
    {:ok, req, state}
  end

  # terminate handler for the regular (non-websocket) requests
  def terminate(_reason, _request, _state) do
    :ok
  end
end
