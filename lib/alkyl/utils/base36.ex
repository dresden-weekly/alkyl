defmodule Alkyl.Utils.Base36 do

  def to_b36(int) do
    Integer.to_string(int, 36) |> String.downcase
  end

  def from_b36("") do
    0
  end
  def from_b36(str) do
    String.to_integer(str, 36)
  end
end
