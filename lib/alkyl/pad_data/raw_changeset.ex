defmodule Alkyl.PadData.RawChangeset do
  defstruct old_len: 0,
            new_len: 0,
            char_bank: "",
            changeset_str: "",
            change_ops: []

  alias __MODULE__
  import Alkyl.Utils.Base36
  import Alkyl.Utils.Common

  def parse(ch_str) do
    rx = ~r{
           \A
           Z                   # "magic character" (http://policypad.readthedocs.org/en/latest/changesets.html)
           :(\w+)              # length of the "document" before applying the changeset
           ([<>])              # algebraic sign for the difference > == +, < == - (see next line)
           (\w+)               # difference of length after the changes
           ([-+=|*].+)         # operations
           \$
           (.*)                # the "char bank"
           \Z   }sx

    [old_len, sign, diff, ops, char_bank] = Regex.run(rx, ch_str,  capture: :all_but_first)
    old_len = from_b36(old_len)
    new_len = old_len + %{"<" => -1, ">" => 1}[sign] * from_b36(diff)

    op_rx = ~r/
                                      # \w+ matches for base 36 integer representation
      ( (?: \*        \w+ )+ )?       # optional attribs e.g. *0*3*g
      (?:   \|      ( \w+ )  )?       # optional number of line feeds (lfs)
      (?:   ([-=+]) ( \w+ )  )        # kind of op and length
              /x

    change_ops = Regex.scan(op_rx, ops, capture: :all_but_first)
    |> Enum.map( fn [ attst, lfs, opc, len ] ->

      %{ opc: opc,
         len: from_b36(len),
         lfs: from_b36(lfs),
         attribs: attribs_prs(attst),
         text: ""
       }
    end )

    %RawChangeset{old_len: old_len,
               new_len: new_len,
               char_bank: char_bank,
               changeset_str: ch_str,
               change_ops: text_into_ops(change_ops, char_bank)
              }
  end

  # distributing the *char bank* to the corresponding insert operations
  defp text_into_ops( [ %{opc: "+"} = op | rest ], char_bank ) do
    { text, t_rest } = String.split_at(char_bank, op.len)
    [ %{ op | text: text } | text_into_ops( rest, t_rest) ]
  end
  defp text_into_ops( [ op | rest ], char_bank ) do
    [ op | text_into_ops( rest, char_bank ) ]
  end
  defp text_into_ops( [], _ ) do
    []
  end
end
