defmodule Alkyl.PadData.Atext do
  defstruct text: "", attribs: "", ranges: []

  alias __MODULE__
  alias Alkyl.PadData.Textrange

  @doc "%Atext from a former json object."
  def build(%{text: text, attribs: attribs}) do
    ranges = Textrange.parse(attribs, text)
    %Atext{text: text,
           attribs: attribs,
           ranges: ranges}
  end
end
