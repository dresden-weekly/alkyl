defmodule Alkyl.Utils.Messages do
  require Bitwise

  def js_now() do
    Calendar.DateTime.now("UTC") |> Calendar.DateTime.Format.js_ms
  end

  def format_message(type, msg) do
    message = %{ "type" => type, "data" => msg }
    "42" <> Poison.encode!([ "message",  message ])
  end

  @doc """
  Format message prefixed with the special length prefix.

  iex> format_msg_prfxd("CLIENT_DATA", %{padId: "pad-one"})
  << 0,6,3,255 >> <> ~S'42["message",{"type":"CLIENT_DATA","data":{"padId":"pad-one"}}]'
  """
  def format_msg_prfxd(type, msg) do
    format_message(type, msg)
    |> prepend_ep_prefix
  end

  @doc """
  Special Etherpad 'binary-decimal-encoded' length prefix for polling responses.

  iex> ep_length_prefix(157)
  << 0,1,5,7,255 >>
  """
  def ep_length_prefix(int) do
    << 0 >> <> (
      Integer.to_char_list(int)
      |> Enum.map(&Bitwise.bxor(&1, 48))
      |> to_string()
    ) <> << 255 >>
  end

  @doc """
  iex> prepend_ep_prefix("it is a little special")
  << 0,2,2,255 >> <> "it is a little special"
  """
  def prepend_ep_prefix(str) do
    ( String.length(str)
    |> ep_length_prefix )
    <> str
  end
end
