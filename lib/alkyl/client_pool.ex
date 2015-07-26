defmodule Alkyl.ClientPool do
  import Alkyl.Utils.Fumble

  use GenServer
  require Logger
  import Alkyl.Utils.Session, only: [to_sid_atom: 1, from_sid_atom: 1]

  # External API
  def start_link() do
    GenServer.start_link(__MODULE__, nil, name: __MODULE__)
  end

  def register(sid, pid) do
    GenServer.cast(__MODULE__, {:register, sid, pid})
  end

  def register(sid_atom, pid, :polling) do
    GenServer.cast(__MODULE__, {:register, sid_atom |> from_sid_atom, pid})
  end

  def unregister(sid) do
    GenServer.cast(__MODULE__, {:unregister, sid})
  end

  def join(sid, sess) do
    GenServer.cast(__MODULE__, {:join, sid, sess})
  end

  def disjoin(sid, sess, rem_sid2sess \\ false) do
    GenServer.cast(__MODULE__, {:disjoin, sid, sess, rem_sid2sess})
  end

  def broadcast(pad, message) do
    GenServer.cast(__MODULE__, {:broadcast, pad, message})
  end
  def broadcast(pad, message, sid) do
    GenServer.cast(__MODULE__, {:broadcast, pad, message, sid})
  end
  # def broadcast(pad, message, sid, :polling) do
  #   GenServer.cast(__MODULE__, {:broadcast, pad, message, sid |> to_sid_atom})
  # end

  def get(pad \\ "") do
    GenServer.call(__MODULE__, {:get, pad})
  end

  def get_state() do
    GenServer.call(__MODULE__, {:get_state})
  end

  def num_pad_users(pad) do
    reply = GenServer.call(__MODULE__, {:get, pad})
    length(reply)
  end

  def sess_by_sid(sid) do
    GenServer.call(__MODULE__, {:sess_by_sid, sid})
  end

  # GenServer implementation
  def init(_) do
    state = Alkyl.ClientPoolDepot.get()
    # Logger.debug "got pool #{inspect pool}"
    { :ok, state }
  end

  def handle_cast({:broadcast, pad, message}, state ) do
    state = cleanup_pad(state, pad)
    Enum.each state.pads[pad], fn sid ->
      send sid, message
    end
    {:noreply, state}
  end

  def handle_cast({:broadcast, pad, message, sid}, state ) do
    state = cleanup_pad(state, pad)
    List.delete(state.pads[pad], state.sid2pid[sid])
    |> Enum.each fn sid ->
      send sid, message
    end
    {:noreply, state}
  end

  def handle_cast({:register, sid, pid}, state) do
    state = fmb_put state, [ :sid2pid, sid ], pid
    {:noreply, state}
  end

  def handle_cast({:unregister, sid}, state) do
    state = fmb_delete state, [ :sid2pid, sid ]
    {:noreply, state}
  end

  def handle_cast({:join, sid, sess}, state) do
    pad_list = Map.get(state.pads, sess.pad, [])
    |> fmb_append([], get_pid_from_sid(sid, state.sid2pid))
    state = fmb_put(state, [ :pads, sess.pad ], pad_list)
    |> fmb_put [ :sid2sess, sid ], sess
    {:noreply, state}
  end

  def handle_cast({:disjoin, sid, sess, rem_sid2sess}, state) do
    state = fmb_put state, [ :pads, sess.pad ], List.delete(state.pads[sess.pad], sid)
    if length(state.pads[sess.pad]) == 0 do
      state = fmb_delete state, [ :pads , sess.pad ]
    end
    if rem_sid2sess do
      state = fmb_delete state, [ :sid2sess , sid ]
    end
    {:noreply, state}
  end

  def handle_call({:get_state}, _, state) do
     {:reply, state, state}
  end

  def handle_call({:get, ""}, _, state) do
    {:reply, state.pads, state}
  end
  def handle_call({:get, pad}, _, state) do
    {:reply, state.pads[pad], state}
  end

  def handle_call({:sess_by_sid, sid}, _, state) do
    # { pad, _ } = Enum.find pads,  fn { _, io_list } -> sid_atom in io_list end
    {:reply, Map.get(state.sid2sess, sid, %{}), state}
  end

  def terminate(_reason, state) do
    Alkyl.ClientPoolDepot.save state
    :ok
  end

  defp get_pid_from_sid sid, sid2pid do
    key = Enum.find([sid, sid |> to_sid_atom], &(Map.has_key? sid2pid, &1))
    Map.get sid2pid, key
  end

  defp cleanup_pad(state, pad) do
    fmb_put( state, [ :pads, pad ], Enum.filter(state.pads[pad],
          fn sid -> Process.alive? sid end
    ))
  end
end
