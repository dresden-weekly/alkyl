defmodule Alkyl.PollingAgentsSupervisor do
  use Supervisor
  require Logger

  def start_link do
    Supervisor.start_link(__MODULE__, [], name: __MODULE__)
  end

  def init([]) do
    supervise([], strategy: :one_for_one)
  end

  def register(name, pid) do
   unless have_child? name do
      Supervisor.start_child(__MODULE__, worker(Alkyl.PollingAgent, [name], id: name))
    end
    GenServer.cast name, { :add_pid, pid }
  end

  def children() do
    Supervisor.which_children __MODULE__
  end

  def remove(name) do
    Supervisor.terminate_child __MODULE__, name
    Supervisor.delete_child __MODULE__, name
  end

  def have_child?(name) do
    name in (Supervisor.which_children(__MODULE__) |> Enum.map(fn {n, _, _, _} -> n end))
  end
end
