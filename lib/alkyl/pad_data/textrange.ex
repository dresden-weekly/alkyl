defmodule Alkyl.PadData.Textrange do
  # very similar to Changeset...

  defstruct len: 0, lfs: 0, opc: "", attribs: [], text: ""
  alias Alkyl.PadData.Textrange

  import Alkyl.Utils.Base36
  import Alkyl.Utils.Common

  def parse(str, text) do
    Regex.scan(~r/
                                 # \w+ matches for base 36 integer representation
      ( (?: \*   \w+ )+ )?       # optional attribs e.g. *0*3*g
      (?:   \| ( \w+ )  )?       # optional number of line feeds (lfs)
      (?:   \+ ( \w+ )  )        # always present length

                 /x, str,  capture: :all_but_first)
    |> Enum.map( fn [ attst, lfs, len ] ->

      %Textrange{ len: from_b36(len),
                  lfs: from_b36(lfs),
                  attribs: attribs_prs(attst)
                }
    end )
    |> text_into_rng( text )
  end

  def dump(trs) do
    {res, text} = Enum.reject(trs, fn %{opc: opc} -> opc == "-" end)
    |> merge_similar()
    |> Enum.map_reduce( "", fn tr, text ->
      { "#{attribs_dmp(tr.attribs)}#{lfs_dmp(tr.lfs)}+#{to_b36(tr.len)}",
        text <> tr.text }
    end )
    { Enum.join(res, ""), text }
  end

  def merge_similar([ %{attribs: atts} = a, %{attribs: atts} = b | tail ]) do
    cond do
      a.lfs > 0 and b.lfs == 0 -> [ a | merge_similar([ b | tail ])]
      true -> merge_similar([ %{a | len: a.len + b.len, lfs: a.lfs + b.lfs, text: a.text <> b.text}  |  tail])
    end
  end
  def merge_similar([ a | tail ]) do
    [ a | merge_similar(tail) ]
  end
  def merge_similar([]), do: []

  # distributing the text to the corresponding ranges
  defp text_into_rng( [ rng | rest ], text ) do
    { text, t_rest } = String.split_at(text, rng.len)
    [ %{ rng | text: text } | text_into_rng( rest, t_rest) ]
  end
  defp text_into_rng( [], _ ) do
    []
  end
end
