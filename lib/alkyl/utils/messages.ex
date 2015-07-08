defmodule Alkyl.Utils.Messages do

  def format_message(type, msg) do
    message = %{ "type" => type, "data" => msg }
    "42" <> Poison.encode!([ "message",  message ])
  end

  def js_now() do
    Calendar.DateTime.now("Europe/Berlin") |> Calendar.DateTime.Format.js_ms
  end
end
