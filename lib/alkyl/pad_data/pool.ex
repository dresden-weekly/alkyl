defmodule Alkyl.PadData.Pool do
  defstruct attribs: %{}, nextnum: 0
  alias __MODULE__

  @doc """
    Unifying the attribute identifiers of a changeset's pool (chs_pool) to
    those of the pool of the pad (exs_pool) resp. adding not yet present
    attributes to the existing pool (with new ids for both pools).

    Attributes like ["bold",""] represent only a remove operation and must
    not be kept in the pad's attribute pool so we treat them seperately.

    It returns a tuple of two tuples of which the first contains updated
    versions of the given pools. The second consists of two Maps which keep
    track of the performed transliterations of the attribute ids for the change-
    and the remove-operations respectively.
  """
  def unify(exs_pool, chs_pool) do

    { chs_atts, rem_atts } = seperate_remove_ops(chs_pool.attribs)

    exs_by_val = for { id, attr_list } <- exs_pool.attribs, into: %{}, do: { attr_list, id }

    { chs_atts, { next_num, chs2exs } } = integrate_numbers(chs_atts, exs_by_val, exs_pool.nextnum)
    { rem_atts, { next_rem_num, rem2exs } } = integrate_numbers(rem_atts, %{}, next_num)

    [ chs_atts, rem_atts ] = Enum.map [ chs_atts, rem_atts ], &(Enum.into(&1, %{}))

    exs_n_pool = %Pool{attribs: Dict.merge(exs_pool.attribs, chs_atts), nextnum: next_num}
    chs_n_pool = %Pool{attribs: Dict.merge(chs_atts, rem_atts), nextnum: next_rem_num}

    rem_ops = find_remove_ops(chs_n_pool.attribs)

    { { exs_n_pool, chs_n_pool }, { Dict.merge(chs2exs, rem2exs), rem_ops } }
  end

  defp seperate_remove_ops(np_atts) do
    Enum.partition np_atts, fn { _, [ _, attv ] } -> attv != "" end
  end

  defp find_remove_ops(np_atts) do
    Enum.filter(np_atts, fn { _, [ _, attv ] } -> attv == "" end)
    |> Enum.map fn { att, _ } -> att end
  end

  defp integrate_numbers(atts, exs_by_val, next_num) do
    Enum.map_reduce atts, { next_num, %{} }, fn { id, attr_list }, { acc, n_map } ->
      if Dict.has_key?(exs_by_val, attr_list) do
        exs_id = Dict.get(exs_by_val, attr_list)
        { { exs_id, attr_list }, { acc, Dict.put_new(n_map, id, exs_id) } }
      else
        { { to_string(acc), attr_list }, { acc + 1, Dict.put_new(n_map, id, to_string(acc)) } }
      end
    end
  end
end
