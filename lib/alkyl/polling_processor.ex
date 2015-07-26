defmodule Alkyl.PollingProcessor do
  require Logger

  def process(req, state) do

    method = :cowboy_req.method(req) |> elem(0)
    qs_t = :cowboy_req.qs_val("t", req) |> elem(0)
    r_num = String.replace qs_t, ~r/^\d+-/, ""

    creds = %{method: method, sid: state.sid, r_num: r_num}
    Logger.debug "pocessing poll request - creds: '#{inspect creds}'"

    state = Map.merge state, Alkyl.ClientPool.sess_by_sid(state.sid)

    process(creds, req, state)
  end

  def process(%{sid: nil}, req, state) do

    Logger.debug "first poll - setting io cookie '#{inspect state}'"

    io = Alkyl.Utils.Session.session_id()

    Alkyl.PollingAgent.register(io, self())
    Alkyl.PollingAgent.unregister(io, self())

    cleaned = :cowboy_req.set_resp_cookie("io", "", [Version: 1, Expires: "Thu, 01-Jan-1970 00:00:01 GMT",
                                                     max_age: 0], req)
    baked =  :cowboy_req.set_resp_cookie("io", io, [path: "/socket.io/"], cleaned)

    { :ok, reply } = :cowboy_req.reply(
      200,

      [ {"content-type", "application/octet-stream"} ],
      Alkyl.Utils.Messages.prepend_ep_prefix(~s'0{"sid":"#{io}","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":60000}'),
      # Alkyl.Utils.Messages.prepend_ep_prefix(~s'0{"sid":"#{io}","upgrades":[],"pingInterval":25000,"pingTimeout":60000}'),
      baked
    )

    {:ok, reply, state}
  end

  def process(%{method: "POST"} = creds, req, state) do

    Logger.debug "polling - POST request"
    body = :cowboy_req.body(req) |> elem(1)

    Logger.debug "POST body '#{body}'"

    msg = String.replace(body, ~R/^\d+:/, "")

    cond do
      msg in ["1","2"] ->
        cue_body = "3"
      String.split_at(msg, 2) |> elem(0) == "42" ->
        "42" <> msg_body = msg
        # Logger.info "--2--WTF: '#{String.slice(msg_body, 0, 20)}'"
        [ "message", message ] = Poison.decode!(msg_body)
        { cue_body, _, state } = Alkyl.MessageProcessor.process(message, req, state)
      true ->
        Logger.error "couldn't process message '#{inspect msg}'"
    end

    if cue_body do
      Alkyl.PollingAgent.push_message creds.sid, cue_body
    end

    { :ok, reply } = :cowboy_req.reply(
      200,
      [ {"content-type", "text/html"} ],
      "ok",
      req
    )

    {:ok, reply, state}
  end

  def process(%{r_num: "1"}, req, %{pad: nil} = state) do

    { :ok, reply } = :cowboy_req.reply(
      200,
      [ {"content-type", "application/octet-stream"} ],
      Alkyl.Utils.Messages.ep_length_prefix(2) <> "40",
      req
    )
    {:ok, reply, state}
  end

  def process(creds, req, state) do

    Alkyl.PollingAgent.register(creds.sid, self())

    receive do
      :fetch_message  ->
        msg = Alkyl.PollingAgent.fetch_message(creds.sid)

      holy_shit ->
        Logger.error "Oh, no! '#{inspect holy_shit}'"

    after 60000 ->
        Logger.info "absolute pollution!"
        Alkyl.PollingAgent.unregister(creds.sid, self())
        msg = "3"
    end

    { :ok, reply } = :cowboy_req.reply(
      200,
      [ {"content-type", "application/octet-stream"} ],
      Alkyl.Utils.Messages.prepend_ep_prefix(msg),
      req
    )

    {:ok, reply, state}
  end
end
