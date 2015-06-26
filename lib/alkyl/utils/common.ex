defmodule Alkyl.Utils.Common do

  import Alkyl.Utils.Base36

  @doc """
  turning an attribut identifier string into a list of
  ("decimal") strings. e.g.: "*0*7*b" -> ["0","7","11"]
  """
  def attribs_prs("") do
    []
  end
  def attribs_prs("*" <> attstr) do
    String.split(attstr, "*")
    |> Enum.map(&from_b36/1)
    |> Enum.map(&to_string/1)
  end

  def attribs_dmp([]) do
    ""
  end
  def attribs_dmp(att_lst) do
    "*" <> ( Enum.map(att_lst, &(String.to_integer(&1) |> to_b36)) |> Enum.join("*") )
  end

  def lfs_dmp(0) do
    ""
  end
  def lfs_dmp(lfs) do
    "|#{to_b36(lfs)}"
  end

  def count_lfs(string) do
    count_lfs(string, 0)
  end
  defp count_lfs("\n" <> string, num) do
    count_lfs(string, num + 1)
  end
  defp count_lfs(<<_>> <> string, num) do
    count_lfs(string, num)
  end
  defp count_lfs("", num) do
    num
  end

  def contains_lf?("\n" <> string) do
    true
  end
  def contains_lf?(<<_>> <> string) do
    contains_lf?(string)
  end
  def contains_lf?("") do
    false
  end

  # defp split_lf_aware(str, 0, "", line), do: [ line, to_string(str) ]
  # defp split_lf_aware(str, 0, acc, line), do: [ acc, line <> to_string(str) ]
  # defp split_lf_aware([], _, acc, line), do: [ acc + line, "" ]

  # defp split_lf_aware(["\n" | str], pos, acc, line) do
  #   split_lf_aware(str, pos-1, acc <> line <> "\n", "")
  # end

  # defp split_lf_aware([chr | str], pos, acc, line) do
  #   split_lf_aware(str, pos-1, acc, line <> chr)
  # end

  # def split_lf_aware(str, pos) do
  #   split_lf_aware(String.codepoints(str), pos, "", "")
  # end

  defp split_lf_aware(str, 0, "", line), do: { line, to_string(str) }
  defp split_lf_aware(str, 0, acc, line), do: { acc, line <> to_string(str) }
  defp split_lf_aware("", _, acc, line), do: { acc + line, "" }

  defp split_lf_aware("\n" <> str, pos, acc, line) do
    split_lf_aware(str, pos-1, acc <> line <> "\n", "")
  end

  defp split_lf_aware(<<chr :: utf8>> <> str, pos, acc, line) do
    split_lf_aware(str, pos-1, acc, line <> <<chr :: utf8>>)
  end

  def split_lf_aware(str, pos) do
    split_lf_aware(str, pos, "", "")
  end

  def last_lf(string) do
    last_lf(string, 0, -1)
  end
  defp last_lf("\n" <> string, num, last) do
    last_lf(string, num + 1, num)
  end
  defp last_lf(<<_>> <> string, num, last) do
    last_lf(string, num + 1, last)
  end
  defp last_lf("", num, last) do
    last
  end

  def last_lf_before(string, max) do
    last_lf_before(string, 0, max, 0, string)
  end
  defp last_lf_before("\n" <> string, num, max, last, full) do
    last_lf_before(string, num + 1, max, num, full)
  end
  defp last_lf_before(<<_>> <> string, num, max, last, full) when num <= max do
    last_lf_before(string, num + 1, max, last, full)
  end
  defp last_lf_before(<<_>> <> string, num, max, last, full) do
    last
  end
  defp last_lf_before("", num, max, last, full) do
    last
  end

  def first_lf(string) do
    first_lf(string, 0)
  end
  defp first_lf("\n" <> string, num) do
    num
  end
  defp first_lf(<<_>> <> string, num) do
    first_lf(string, num + 1)
  end
  defp first_lf("", num) do
    -1
  end

  def split_after_last_lf(str) do
    String.split_at(str, last_lf(str) + 1)
  end

  def trailing_lf?(str) do
    String.last(str) == "\n"
  end
end
