defmodule Alkyl.PadPoolStore do

  use GenServer
  require Logger

  def start_link(pool) do
    Agent.start_link(fn -> pool end, name: __MODULE__)
  end

  def save(new_state), do: Agent.update(__MODULE__, fn _ -> new_state end)

  # def save(new_state) do Agent.update(__MODULE__, fn _state ->
  #       Logger.debug "saving #{inspect new_state}"
  #       new_state
  #     end)
  # end

  def get(), do: Agent.get(__MODULE__, fn state -> state end)

  # def get() do
  #   Agent.get(__MODULE__, fn state ->
  #       Logger.debug "loading #{inspect state}"
  #       state
  #   end)
  # end
end
