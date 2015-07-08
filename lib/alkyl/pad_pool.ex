defmodule Alkyl.PadPool do

  use GenServer
  require Logger

  # External API
  def start_link() do
    GenServer.start_link(__MODULE__, nil, name: __MODULE__)
  end

  def register(io_atom, pid) do
    GenServer.cast(__MODULE__, {:register, io_atom, pid})
  end

  def unregister(io_atom) do
    GenServer.cast(__MODULE__, {:unregister, io_atom})
  end

  def join(pad, io_atom) do
    GenServer.cast(__MODULE__, {:join, pad, io_atom})
  end

  def disjoin(pad, io_atom) do
    GenServer.cast(__MODULE__, {:disjoin, pad, io_atom})
  end

  def broadcast(pad, io_atom, message) do
    GenServer.cast(__MODULE__, {:broadcast, pad, io_atom, message})
  end
  def broadcast(pad, message) do
    GenServer.cast(__MODULE__, {:broadcast, pad, nil, message})
  end

  def get(pad \\ "") do
    reply = GenServer.call(__MODULE__, {:get, pad})
    reply
  end

  def get_state() do
    GenServer.call(__MODULE__, {:get_state})
  end

  def num_pad_users(pad) do
    reply = GenServer.call(__MODULE__, {:get, pad})
    length(reply)
  end

  # GenServer implementation
  def init(_) do
    pool = Alkyl.PadPoolDepot.get()
    # Logger.debug "got pool #{inspect pool}"
    { :ok, pool }
  end

  def handle_cast({:register, io_atom, pid}, { pool, io2pid }) do
    if Dict.has_key? io2pid, io_atom do
      io2pid = Dict.put io2pid, io_atom, pid
    else
      io2pid = Dict.put_new io2pid, io_atom, pid
    end
    {:noreply, { pool, io2pid }}
  end

  def handle_cast({:unregister, io_atom}, { pool, io2pid }) do
    if Dict.has_key? io2pid, io_atom do
      io2pid = Dict.delete io2pid, io_atom
    end
    {:noreply, { pool, io2pid }}
  end

  def handle_cast({:broadcast, pad, io_atom, message}, { pool, io2pid } ) do
    case io_atom do
      nil -> pool[pad]
      _ -> List.delete(pool[pad], io_atom)
    end
    |> Enum.each fn p ->
      send io2pid[p], message
    end
    {:noreply, { pool, io2pid }}
  end

  def handle_cast({:join, pad, io_atom}, { pool, io2pid }) do
    unless Dict.has_key? pool, pad do
      pool = Dict.put_new pool, pad, [ io_atom ]
    else
      pool = Dict.put(pool, pad, pool[pad] ++ [ io_atom ])
    end
    {:noreply, { pool, io2pid }}
  end

  def handle_cast({:disjoin, pad, io_atom}, { pool, io2pid }) do
    pool = Dict.put(pool, pad, List.delete(pool[pad], io_atom))
    if length(pool[pad]) == 0 do
      pool = Dict.delete pool, pad
    end
    if Dict.has_key? io2pid, io_atom do
      io2pid = Dict.delete io2pid, io_atom
    end
    {:noreply, { pool, io2pid }}
  end

  def handle_call({:get_state}, _, state) do
     {:reply, state, state}
  end

  def handle_call({:get, pad}, _, { pool, io2pid }) do
    reply = case String.length(pad) do
      0 -> {:reply, pool, { pool, io2pid }}
      _ -> {:reply, pool[pad], { pool, io2pid }}
    end
  end

  def terminate(_reason, pool) do
    # Logger.debug "shoulda savea #{inspect pool}"
    Alkyl.PadPoolDepot.save pool
    :ok
  end
end
