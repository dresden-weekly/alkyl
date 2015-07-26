defmodule Alkyl.Utils.Session do
  require Logger

  def author_id do
    "a." <> random_b62()
  end

  def session_id() do
    random_b62() |> String.replace(~r/^(.{16}).*$/, "\\1AAAA") # this will cause problems!
  end

  @doc "identifier for polling_agent processes"
  def to_sid_atom(sid), do: String.to_atom "sid" <> sid

  @doc "identifier for polling_agent processes reverse"
  def from_sid_atom(sid_atom) do
    "sid" <> sid = to_string sid_atom
    sid
  end

  def random_b62() do
    Base62.encode :crypto.rand_uniform(round(:math.pow(10,30)),round(:math.pow(10,42)))
  end
end
