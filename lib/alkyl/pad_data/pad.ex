defmodule Alkyl.PadData.Pad do
  defstruct atext: Alkyl.PadData.Atext.__struct__,
            pool: Alkyl.PadData.Pool.__struct__,
            head: 0, chatHead: -1, publicStatus: false,
            passwordHash: nil, savedRevisions: []

  defimpl Poison.Decoder, for: Alkyl.PadData.Pad do
    def decode(task_list, options) do
      Map.update!( task_list, :atext, fn atext ->
        Poison.Decode.decode(atext, Keyword.merge(options, as: Alkyl.PadData.Atext))
      end)
      |> Map.update!( :pool, fn pool ->
        Poison.Decode.decode(pool, Keyword.merge(options, as: Alkyl.PadData.Pool))
      end)
    end
  end

  # def update(pad, changeset) do
  #   %Alkyl.Pad{ pad | pool: %Alkyl.Pool{ pad.pool | attribs: Map.put_new(pad.pool.attribs, "0", 0) } }
  # end
end
