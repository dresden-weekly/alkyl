defmodule Alkyl.CollabroomProcessor do
  require Logger
  import Alkyl.Utils.Messages

  def process( %{"type" => "USER_CHANGES"} = cdata, req, state ) do

    # reply with something like {"type":"COLLABROOM","data":{"type":"ACCEPT_COMMIT","newRev":1}}
    # and send s.l. %{ "type" => "COLLABROOM", "data" => %{"type" => "NEW_CHANGES", ....} to the rest
    { nil, req, state }
  end

  def process( %{"type" => "GET_CHAT_MESSAGES"}, req, state ) do

    message = %{"type" => "CHAT_MESSAGES",
                "messages" => Alkyl.Store.get_chats(state.pad)}

    { format_message("COLLABROOM", message), req, state }
  end

  def process( %{"type" => "USERINFO_UPDATE"} = cdata, req, state ) do
    # {"type":"USERINFO_UPDATE","userInfo":{"userId":"a.PnwbmyVSInSBAV8G","name":"chromium","ip":"127.0.0.1","colorId":"#c7ff8f","userAgent":"Anonymous"}}}]
    # save user and
    # forward {"type":"USER_NEWINFO","userInfo":{"userId":"a.PnwbmyVSInSBAV8G","name":"chromium","colorId":"#c7ff8f","userAgent":"Anonymous","ip":"127.0.0.1"}}}]
    # to the rest
    { nil, req, state }
  end

  def process( %{"type" => "CHAT_MESSAGE"} = message, req, state ) do
    Logger.debug "message: #{inspect message}"
    message = Dict.put_new message, "userId", state.user
    message = Dict.put_new message, "time", js_now()
    if state.user_name do
      message = Dict.put_new message, "userName", state.user_name
    end

    Alkyl.ClientPool.broadcast state.pad, format_message("COLLABROOM", message)

    Alkyl.Store.insert_chat(state.pad, message)
    { nil, req, state }
  end
end
