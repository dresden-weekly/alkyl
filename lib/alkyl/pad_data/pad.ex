defmodule Alkyl.PadData.Pad do
  defstruct atext: Alkyl.Atext, pool: Alkyl.Pool, head: 0

  # def update(pad, changeset) do
  #   %Alkyl.Pad{ pad | pool: %Alkyl.Pool{ pad.pool | attribs: Map.put_new(pad.pool.attribs, "0", 0) } }
  # end
end
