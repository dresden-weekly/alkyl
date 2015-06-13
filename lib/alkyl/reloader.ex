defmodule Alkyl.Reloader do
  use GenServer

  import Logger

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
      # Logger.debug "I'd compile it!"
      Code.load_file to_string(path)
    end
    { :noreply, state }
  end

  def format_status(_reason, [ _pdict, state ]) do
    [data: [{'State', "My current state is '#{inspect state}'"}]]
  end

  def compilable?(path) do
    Path.extname(path) in [".ex"] and !String.match?(path, ~r"^\.#")
 end
end
