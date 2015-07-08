defmodule Alkyl.PadPoolDepot do

  use GenServer

  def start_link(pool) do
    Agent.start_link(fn -> pool end, name: __MODULE__)
  end

  def save(new_state), do: Agent.update(__MODULE__, fn _ -> new_state end)

  def get(), do: Agent.get(__MODULE__, fn state -> state end)

end
