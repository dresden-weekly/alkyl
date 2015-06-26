defmodule Alkyl.PadData.ChangesetProcessor do

  import Kernel, except: [apply: 2, apply: 3]
  import Alkyl.Utils.Common
  require Logger

  alias Alkyl.PadData.Textrange
  alias Alkyl.PadData.Pad
  alias Alkyl.PadData.Atext

  def apply(pad, chset) do

    ranges = apply( pad.atext.ranges,
                    chset.change_ops,
                    {chset.contradict, chset.remove_atts},
                    {0, 0} )

    { attribs, text } = Textrange.dump(ranges)

    %Pad{ pad | atext: %Atext{text: text,
                              attribs: attribs,
                              ranges: []}
        }
  end

  #---------------------------------------------------------------------

  def apply( _, _, _, { r_pos, o_pos} ) when r_pos > o_pos do
    Logger.error "Shit happened!"
  end
  #---------------------------------------------------------------------
  def apply( ranges, [], _, _ ) do
    ranges
  end
  #---------------------------------------------------------------------
  def apply( [ %{len: r_len} = rng | r_rest ],
             ops,
             excl,
             { r_pos, o_pos } )

  when r_pos + r_len <= o_pos do

    [ rng | apply(r_rest, ops, excl, { r_pos + r_len, o_pos }) ]
  end
  #---------------------------------------------------------------------
  def apply( [ rng | r_rest ],
             ops,
             excl,
             { r_pos, o_pos } )

  when r_pos < o_pos  do

    { remaining, new } = split_range(rng, o_pos - r_pos)

    [ remaining | apply([ new | r_rest ], ops, excl, {r_pos + remaining.len, o_pos}) ]
  end
  #---------------------------------------------------------------------

  # insert operation
  ########################
  def apply( r_rest,
             [ %{opc: "+"} = op | o_rest ],
             excl,
             { r_pos, o_pos } )

  when r_pos == o_pos do

    npos = o_pos + op.len

    [ struct(Textrange, op) |
      apply(r_rest, o_rest, excl, {npos, npos}) ]
  end
  #---------------------------------------------------------------------

  # keep/delete operations
  ##########################
  def apply( [ %{len: r_len} = rng | r_rest ],
             [ %{len: o_len} = op | o_rest ],
             excl,
             { r_pos, o_pos } )

  when r_pos == o_pos and r_len == o_len do

    atts = apply_atts(rng.attribs, op.attribs, excl)

    [ %Textrange{ rng | attribs: atts, opc: op.opc } |
      apply(r_rest, o_rest, excl, {r_pos + r_len, o_pos + o_len}) ]
  end
  #---------------------------------------------------------------------
  def apply( [ %{len: r_len} = rng | r_rest ],
             [ %{len: o_len} = op | o_rest ],
             excl,
             { r_pos, o_pos } )

  when r_pos == o_pos and r_len > o_len do

    { current, next } = split_range(rng, o_len)

    atts = apply_atts(rng.attribs, op.attribs, excl)

    [ %Textrange{ current | attribs: atts, opc: op.opc } |
      apply([ next | r_rest ], o_rest, excl, {r_pos + current.len, o_pos + o_len}) ]
  end
  #---------------------------------------------------------------------
  def apply( [ %{len: r_len} = rng | r_rest ],
             [ %{len: o_len} = op | o_rest ],
             excl,
             { r_pos, o_pos } )

  when r_pos == o_pos and r_len < o_len do

    atts = apply_atts(rng.attribs, op.attribs, excl)

    next_op = %{ op | len: o_len - r_len }

    [ %Textrange{ rng | attribs: atts, opc: op.opc } |
      apply(r_rest, [ next_op | o_rest ], excl, {r_pos + r_len, o_pos + r_len}) ]
  end
  #---------------------------------------------------------------------

  def split_range(item, pos) do
    { rem_text, new_text } = split_lf_aware(item.text, pos)
    { %{ item | text: rem_text, len: String.length(rem_text), lfs: count_lfs(rem_text)},
      %{ item | text: new_text, len: String.length(new_text), lfs: count_lfs(new_text)} }
  end

  defp apply_atts( present, [], _ ) do
    present
  end
  defp apply_atts( present, new, {contradict, remove_atts} ) do
    ct = Enum.map(new, &{contradict[&1]}) |> List.flatten
    Enum.reject(present, &(&1 in ct)) ++ Enum.reject(new, &(&1 in remove_atts))
  end
end
