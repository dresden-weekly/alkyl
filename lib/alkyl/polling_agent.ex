defmodule Alkyl.PollingAgent do
  use GenServer
  require Logger
  import Alkyl.Utils.Fumble
  import Alkyl.Utils.Session, only: [to_sid_atom: 1]

  def start_link(name) do
    {:ok, pid} = GenServer.start_link(__MODULE__, %{queue: [], pool: [], name: name}, name: name)
    Alkyl.ClientPool.register name, pid
    {:ok, pid}
  end

  def register(sid, pid) do
    sid
    |> to_sid_atom
    |> Alkyl.PollingAgentsSupervisor.register pid
  end

  def unregister(sid, pid) do
    sid
    |> to_sid_atom
    |> GenServer.cast {:del_pid, pid}
  end

  def fetch_message(sid) do
    sid
    |> to_sid_atom
    |> GenServer.call :fetch
  end

  def push_message(sid, message) do
    sid
    |> to_sid_atom
    |> send message
  end

  def remove(sid) do
    sid
    |> to_sid_atom
    |> Alkyl.PollingAgentsSupervisor.remove
  end

  # Callbacks

  # def init(state) do
  #   { :ok, state }
  # end

  def handle_cast({:add_pid, pid}, state) do
    state = fmb_put(state, [ :pool ], [ pid | state.pool ])
    if length(state.queue) > 0 do
      send pid, :fetch_message
    end
    {:noreply, state }
  end

  def handle_cast({:del_pid, pid}, state) do
    state = %{state | pool: List.delete(state.pool, pid)}
    {:noreply, state }
  end

  def handle_call(:fetch, _, %{queue: [msg | rqueue]} = state) do
    {:reply, msg, %{state | queue: rqueue} }
  end
  def handle_call(:fetch, _, %{queue: []} = state) do
    {:reply, nil, state}
  end

  def handle_info(msg, state) do
    state = fmb_append state, [ :queue ], msg
    Logger.debug inspect {String.slice(msg, 0, 20), state}
    first_pid = fmb_get state, [ :pool, 0 ]
    if first_pid do
      send first_pid, :fetch_message
    end
    {:noreply, state}
  end

  def terminate(_reason, state) do
    Alkyl.ClientPool.unregister state.name
    :ok
  end
end
