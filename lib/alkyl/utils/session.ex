defmodule Alkyl.Utils.Session do

  def author_id do
    "a." <> random_b62()
  end

  def session_id() do
    random_b62() |> String.replace(~r/^(.{16}).*$/, "\\1AAAA") # this will cause problems!
  end

  def io_atom(io_cookie), do: String.to_atom "io" <> io_cookie

  def random_b62() do
    Base62.encode :crypto.rand_uniform(round(:math.pow(10,30)),round(:math.pow(10,42)))
  end
end
