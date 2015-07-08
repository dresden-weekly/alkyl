defmodule Alkyl.Utils.Common do

  import Alkyl.Utils.Base36

  @doc """
  Turning an attribut identifier string into a list of
  ("decimal") strings.

  ## Example
  iex> Alkyl.Utils.Common.attribs_prs "*0*7*b"
  ["0","7","11"]
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

  def contains_lf?("\n" <> _) do
    true
  end
  def contains_lf?(<<_>> <> string) do
    contains_lf?(string)
  end
  def contains_lf?("") do
    false
  end

  @doc"""
  Split a string at a given position if it doesn't contain linefeeds,
  else split it at the lat linefeed before the given position.

  ## Example
    iex> Alkyl.Utils.Common.split_lf_aware("one line string\\n", 3)
    {"one", " line string\\n"}
    iex> Alkyl.Utils.Common.split_lf_aware("one line string\\n", 9)
    {"one line ", "string\\n"}
    iex> Alkyl.Utils.Common.split_lf_aware("two line\\n string\\n", 9)
    {"two line\\n", " string\\n"}
    iex> Alkyl.Utils.Common.split_lf_aware("one line ütf-8 string\\n", 3)
    {"one", " line ütf-8 string\\n"}
    iex> Alkyl.Utils.Common.split_lf_aware("one line ütf-8 string\\n", 9)
    {"one line ", "ütf-8 string\\n"}
    iex> Alkyl.Utils.Common.split_lf_aware("one line ütf-8 string\\n", 14)
    {"one line ütf-8", " string\\n"}
    iex> Alkyl.Utils.Common.split_lf_aware("two line\\n ütf-8 string\\n", 9)
    {"two line\\n", " ütf-8 string\\n"}

    iex> Alkyl.Utils.Common.split_lf_aware("", 0)
    {"", ""}
    iex> Alkyl.Utils.Common.split_lf_aware("", 5)
    {"", ""}
    iex> Alkyl.Utils.Common.split_lf_aware("one", 5)
    {"one", ""}
    iex> Alkyl.Utils.Common.split_lf_aware("one\\n line", 10)
    {"one\\n", " line"}
    iex> Alkyl.Utils.Common.split_lf_aware("two\\nlines\\n", 12)
    {"two\\nlines\\n", ""}
    # iex>_raise ArgumentError, "position out of range", fn ->
    #   split_lf_aware("", 5)
    # end
  """
  def split_lf_aware(str, pos) do
    split_lf_aware(str, pos, "", "")
  end
  defp split_lf_aware(str, 0, "", line), do: { line, str }
  defp split_lf_aware(str, 0, acc, line), do: { acc, line <> str }
  defp split_lf_aware("", _, "", line), do: { line, "" }
  defp split_lf_aware("", _, acc, line), do: { acc, line }
  # defp split_lf_aware("", _, acc, line) do
  #   raise(ArgumentError, message: "position out of range")
  # end
  defp split_lf_aware("\n" <> str, pos, acc, line) do
    split_lf_aware(str, pos-1, acc <> line <> "\n", "")
  end
  defp split_lf_aware(<<chr :: utf8>> <> str, pos, acc, line) do
    split_lf_aware(str, pos-1, acc, line <> <<chr :: utf8>>)
  end

  def last_lf(string) do
    last_lf(string, 0, -1)
  end
  defp last_lf("\n" <> string, num, _) do
    last_lf(string, num + 1, num)
  end
  defp last_lf(<<_>> <> string, num, last) do
    last_lf(string, num + 1, last)
  end
  defp last_lf("", _, last) do
    last
  end

  def last_lf_before(string, max) do
    last_lf_before(string, 1, max, 0)
  end
  defp last_lf_before("\n" <> string, num, max, _) do
    last_lf_before(string, num + 1, max, num)
  end
  defp last_lf_before(<<_::utf8>> <> string, num, max, last) when num <= max do
    last_lf_before(string, num + 1, max, last)
  end
  defp last_lf_before(<<_::utf8>> <> string, num, max, last) do
    last
  end
  defp last_lf_before("", num, max, last) do
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
