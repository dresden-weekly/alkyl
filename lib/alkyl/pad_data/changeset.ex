defmodule Alkyl.PadData.Changeset do
  defstruct old_len: 0,
            new_len: 0,
            char_bank: "",
            changeset_str: "",
            change_ops: [],
            contradict: %{},
            remove_atts: []

  alias __MODULE__
  alias Alkyl.PadData.Raw
  alias Alkyl.PadData.RawChangeset
  alias Alkyl.PadData.Pool

  import Alkyl.Utils.Base36
  import Alkyl.Utils.Common

  def build(chset_str, chs_pool, pad_pool) do

    raw = RawChangeset.parse(chset_str)

    { { new_pool, chs_pool }, { chs2exs, rem_atts } } = Pool.unify(pad_pool, chs_pool)

    chset = %Changeset{
                    transcode(raw, chs2exs) |
                    contradict: find_exclusive(new_pool, Dict.values(chs2exs)),
                    remove_atts: rem_atts
                }
    { chset, new_pool }
  end

  def find_exclusive(pool, att_ids) do
    id2att = for id <- att_ids, into: %{}, do: { id, Enum.at(pool.numToAttrib[id], 0)}
    Enum.map( id2att, fn {id, att_name} ->
      { id,
      (Enum.filter( pool.numToAttrib, fn { _, [ patt_name, _ ] } -> att_name == patt_name end )
      |> Enum.map fn {pid, _} -> pid end) }
    end )
    |> Enum.into %{}
  end

  @doc "transliterate the ids in the given changeset according to the given map"
  def transcode(chset, chs2exs) do
    res = Enum.map chset.change_ops, fn %{attribs: attribs} = op ->
      n_atts = Enum.map attribs, fn att ->
        if Dict.has_key?(chs2exs, att)  do
          chs2exs[att]
        else
          att
        end
      end
      %{op | attribs: n_atts}
    end
    %Changeset{struct(Changeset, Map.delete(chset, :__struct__)) | change_ops: res}
  end
end
