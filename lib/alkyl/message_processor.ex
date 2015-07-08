defmodule Alkyl.MessageProcessor do
  require Logger
  import Alkyl.Utils.Messages

  def process( %{ "type" => "CLIENT_READY"} = cdata, req, state ) do
    Logger.debug "processing CLIENT_READY message... #{inspect cdata}"
    { io_cookie, _ } = :cowboy_req.cookie("io", req, nil)
    state = %{state | pad: cdata["padId"],
              user: Alkyl.Store.author_by_token(cdata["token"]),
              io_atom: Alkyl.Utils.Session.io_atom(io_cookie)}
    Alkyl.PadPool.join state.pad, state.io_atom
    Logger.debug "state.io_atom: #{state.io_atom}"
    # todo: identify guest users by "token" cookie resp. by cdata.token
    # and  globalAuthor/token2author records, and before all
    # initialize the pad...
    pad = Alkyl.Store.get_pad state.pad
    { { client_ip, _ }, _ } = :cowboy_req.peer(req)
    data = %{ Alkyl.MessageDefaults.client_vars |
      "padId" => state.pad,
      "userId" => state.user,
      "serverTimestamp" => js_now(),
      "chatHead" => pad.chatHead,
      "collab_client_vars" => %{"apool" => pad.pool,
                                "clientIp" => :inet.ntoa(client_ip),
                                "historicalAuthorData" => %{},
                                "initialAttributedText" => pad.atext,
                                "padId" => state.pad,
                                "rev" => 0,
                                "time" => 1434008984626}, # need to get this from the last rev
      "numConnectedUsers" => Alkyl.PadPool.num_pad_users(state.pad) - 1
    }
    { format_message("CLIENT_VARS", data ), req, state }
  end

  def process( %{ "type" => "COLLABROOM", "data" => data }, req, state ) do
    Logger.debug "data: #{inspect data}"
    Alkyl.CollabroomProcessor.process(data, req, state)
  end
end
