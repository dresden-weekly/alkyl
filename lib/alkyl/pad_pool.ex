defmodule Alkyl.PadPool do

  use GenServer
  require Logger

  # External API
  def start_link() do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def register(pid, pad) do
    GenServer.cast(__MODULE__, {:register, pid, pad})
  end

  def unregister(pid, pad) do
    GenServer.cast(__MODULE__, {:unregister, pid, pad})
  end

  def broadcast(pid, pad, message) do
    GenServer.cast(__MODULE__, {:broadcast, pid, pad, message})
  end

  def show(pad \\ "") do
    GenServer.call(__MODULE__, {:show, pad})
  end

  # GenServer implementation
  def init(_) do
    pool = Alkyl.PadPoolStore.get()
    # Logger.debug "got pool #{inspect pool}"
    { :ok, pool }
  end

  def handle_cast({:broadcast, pid, pad, message}, pool) do
    List.delete(pool[pad], pid)
    |> Enum.each fn p ->
      send p, message
    end
    {:noreply, pool}
  end

  def handle_cast({:register, pid, pad}, pool) do
    unless Dict.has_key? pool, pad do
      pool = Dict.put_new pool, pad, [ pid ]
    else
      pool = Dict.put(pool, pad, pool[pad] ++ [ pid ])
    end
    {:noreply, pool}
  end

  def handle_cast({:unregister, pid, pad}, pool) do
    pool = Dict.put(pool, pad, List.delete(pool[pad], pid))
    if length(pool[pad]) == 0 do
      pool = Dict.delete pool, pad
    end
    {:noreply, pool}
  end

  def handle_call({:show, pad}, {from, ref}, pool) do
    case String.length(pad) do
      0 -> {:reply, pool, pool}
      _ -> {:reply, pool[pad], pool}
    end
  end

  def terminate(_reason, pool) do
    # Logger.debug "shoulda savea #{inspect pool}"
    Alkyl.PadPoolStore.save pool
    :ok
  end

  # use GenServer

  # def start_link() do
  #   Agent.start_link(fn -> HashDict.new end, name: __MODULE__)
  # end

  # def register(pid, pad) do
  #   Agent.update(__MODULE__,
  #     fn state ->
  #       unless Dict.has_key? state, pad do
  #         Dict.put_new state, pad, [ pid ]
  #       else
  #         Dict.put(state, pad, state[pad] ++ [ pid ])
  #       end
  #     end)
  #   end

  # def unregister(pid, pad) do
  #   Agent.update(__MODULE__,
  #     fn state ->
  #      state =  Dict.put(state, pad, List.delete(state[pad], pid))
  #       if length(state[pad]) == 0 do
  #         state = Dict.delete state, pad
  #       end
  #       state
  #     end)
  # end

  # def broadcast(pid, pad, message) do
  #   Agent.get(__MODULE__,
  #     fn state ->
  #       List.delete(state[pad], pid)
  #       |> Enum.each fn p ->
  #         send p, message
  #       end
  #     end)
  # end

  # def show(pad \\ "") do
  #   Agent.get(__MODULE__,
  #     fn state ->
  #       case String.length(pad) do
  #         0 -> {:reply, state, state}
  #         _ -> {:reply, state[pad], state}
  #       end
  #     end)
  # end
end
