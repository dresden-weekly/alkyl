defmodule Alkyl.Reloader do
  use GenServer

  # External API
  def start_link() do
    GenServer.start_link(__MODULE__, :nix, name: __MODULE__)
  end


  # GenServer implementation
  def init(state) do
    :fs.subscribe()
    { :ok, state }
  end

  def handle_info({_pid, {:fs, :file_event}, {path, events}}, state) do
    path = to_string(path)
    if :modified in events and compilable?(path) do
      Code.load_file to_string(path)
    end
    { :noreply, state }
  end

  def handle_info({:elixir_code_server, _, :loaded}, state) do
    { :noreply, state }
  end

  def compilable?(path) do
    Path.extname(path) in [".ex"] and !String.match?(path, ~r"^\.#")
 end
end
