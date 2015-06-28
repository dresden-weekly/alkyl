defmodule Alkyl.PadPoolSub do
  use Supervisor
  # import Supervisor.Spec, warn: false

  def start_link() do
    {:ok, _pid} = Supervisor.start_link(__MODULE__, :nix)
  end

  def init(_) do
    children = [ worker(Alkyl.PadPool, []) ]
    supervise children, strategy: :one_for_one
  end
end
