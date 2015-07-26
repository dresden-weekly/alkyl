defmodule Alkyl.Utils.Fumble do

  @moduledoc """
  Fumble in nested lists/mapishs...

  Where is the wheel that we reinvent here?
  """

  @doc """
    iex> data = %{
    ...>   one: 1,
    ...>   two: 2,
    ...>   nested: %{ three: 3,
    ...>              four: 4,
    ...>              rest: [5,6,7,8]
    ...>            },
    ...>   more: [ %{eins: "eins_of_0", zwei: "zwei_of_0"},
    ...>           %{eins: "eins_of_1", zwei: "zwei_of_1"},
    ...>           %{eins: "eins_of_2", zwei: "zwei_of_2"} ]
    ...> }
    ...>
    iex> fmb_get data, [ :one ]
    1
    iex> fmb_get data, [ :nested, :three ]
    3
    iex> fmb_get data, [ :nested, :five ]
    nil
    iex> fmb_get data, [ :nested, :five, :six ]
    nil
    iex> fmb_get data, [ :nested ]
    %{ three: 3, four: 4, rest: [5,6,7,8] }
    iex> fmb_get data, [ :nested, :rest, 2 ]
    7
    iex> fmb_get data, [ :more, 1, :zwei ]
    "zwei_of_1"
  """
  def fmb_get(nil, _) do
    nil
  end
  def fmb_get(%{} = data, [ key | rest ]) do
    fmb_get(Map.get(data, key), rest)
  end
  def fmb_get(data, [ key | rest ]) do
    fmb_get(Enum.at(data, key), rest)
  end
  def fmb_get(data, []) do
    data
  end

  @doc """
    iex> data = %{one: 1, two: 2}
    iex> fmb_put data, [ :three ], 3
    %{one: 1, two: 2, three: 3}
    iex> fmb_put data, [ "three" ], 3
    %{:one => 1, :two => 2, "three" => 3}
    iex> data = fmb_put data, [ :nested ], %{three: 3}
    %{one: 1,two: 2, nested: %{three: 3}}
    iex> data = fmb_put data, [ :nested, :four ], [9,6,7,8]
    %{one: 1,two: 2, nested: %{three: 3, four: [9,6,7,8]}}
    iex> data = fmb_put data, [ :nested, :four, 0 ], 5
    %{one: 1,two: 2, nested: %{three: 3, four: [5,6,7,8]}}
    iex> data = fmb_put data, [ :nested, :four, 1000 ], 9
    %{one: 1,two: 2, nested: %{three: 3, four: [5,6,7,8,9]}}
  """
  def fmb_put(%{} = data, [ key | rest ], value) do
    Map.put data, key, fmb_put(Map.get(data, key),rest, value)
  end
  def fmb_put(data, [ key | rest ], value) do
    List.delete_at(data, key)
    |> List.insert_at key, fmb_put(Enum.at(data, key), rest, value)
  end
  def fmb_put(_, [], value) do
    value
  end

  @doc """
    iex> fmb_delete %{one: 1, two: 2}, [ :two ]
    %{one: 1}
    iex> fmb_delete %{:one => 1, "two" => 2}, [ "two" ]
    %{one: 1}
    iex> fmb_delete %{one: 1, nested: %{two: 2, three: 3}}, [ :nested, :two ]
    %{one: 1, nested: %{three: 3}}
    iex> fmb_delete %{nested: %{three: 3, four: [9,6,7,8]}}, [ :nested, :four, 0 ]
    %{nested: %{three: 3, four: [6,7,8]}}
    iex> data = %{more: [
    ...>          %{i: "i_0", ii: "ii_0"},
    ...>          %{i: "i_1", ii: "ii_1"},
    ...>          %{i: "i_2", ii: "ii_2"}
    ...>         ]}
    iex> fmb_delete data, [ :more, 1, :ii ]
    %{more: [
      %{i: "i_0", ii: "ii_0"},
      %{i: "i_1"},
      %{i: "i_2", ii: "ii_2"}
    ]}
    iex> fmb_delete data, [ :more, 1 ]
    %{more: [
      %{i: "i_0", ii: "ii_0"},
      %{i: "i_2", ii: "ii_2"}
    ]}
  """
  def fmb_delete(%{} = data, [ key ]) do
    Map.delete data, key
  end
  def fmb_delete(data, [ key ]) do
    List.delete_at data, key
  end
  def fmb_delete(%{} = data, [ key | rest ]) do
    Map.put data, key, fmb_delete(Map.get(data, key), rest)
  end
  def fmb_delete(data, [ key | rest ]) do
    List.delete_at(data, key)
    |> List.insert_at key, fmb_delete(Enum.at(data, key), rest)
  end

  @doc """
    iex> data = fmb_append [1,2,3], [], 4
    [1,2,3,4]
    iex> data = fmb_append data, [], [5,6,7,8]
    [1,2,3,4,[5,6,7,8]]
    iex> data = fmb_append data, [ 4 ], 9
    [1,2,3,4,[5,6,7,8,9]]
    iex> fmb_append %{nested: %{three: 3, four: [1,2,3,4]}}, [ :nested, :four ], 5
    %{nested: %{three: 3, four: [1,2,3,4,5]}}
  """
  def fmb_append(%{} = data, [ key | rest ], value) do
    Map.put data, key, fmb_append(Map.get(data, key),rest, value)
  end
  def fmb_append(data, [ key | rest ], value) do
    List.delete_at(data, key)
    |> List.insert_at key, fmb_append(Enum.at(data, key), rest, value)
  end
  def fmb_append(data, [], value) do
    data ++ [ value ]
  end

  @doc """
    iex> fmb_one_up [1,2,3,3,5], [ 3 ]
    [1,2,3,4,5]
    iex> fmb_one_up [1,2,3,4,[5,6,6,8,9]], [ 4, 2 ]
    [1,2,3,4,[5,6,7,8,9]]
    iex> fmb_one_up %{nested: %{three: 3, four: [1,2,3,4,4]}}, [ :nested, :four, 4 ]
    %{nested: %{three: 3, four: [1,2,3,4,5]}}
  """
  def fmb_one_up(%{} = data, [ key | rest ]) do
    Map.put data, key, fmb_one_up(Map.get(data, key),rest)
  end
  def fmb_one_up(data, [ key | rest ]) do
    List.delete_at(data, key)
    |> List.insert_at key, fmb_one_up(Enum.at(data, key), rest)
  end
  def fmb_one_up(data, []) do
    data + 1
  end

  @doc """
    iex> data = fmb_apply [3,2,1], [], &Enum.reverse/1
    [1,2,3]
    iex> data = fmb_apply data, [], &(&1 ++ [[4,5,6,7]])
    [1,2,3,[4,5,6,7]]
    iex> data = fmb_apply data, [ 3, 3 ], &(&1 * 7)
    [1,2,3,[4,5,6,49]]
    iex> fmb_apply %{nested: %{three: 3, four: [1,2,3,4]}}, [ :nested, :four ], fn l -> Enum.map(l, &(&1 * &1)) end
    %{nested: %{three: 3, four: [1,4,9,16]}}
  """
  def fmb_apply(%{} = data, [ key | rest ], fun) do
    Map.put data, key, fmb_apply(Map.get(data, key),rest, fun)
  end
  def fmb_apply(data, [ key | rest ], fun) do
    List.delete_at(data, key)
    |> List.insert_at key, fmb_apply(Enum.at(data, key), rest, fun)
  end
  def fmb_apply(data, [], fun) do
    fun.(data)
  end
end
