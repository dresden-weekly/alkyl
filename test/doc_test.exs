defmodule DocTest do
  use ExUnit.Case

  doctest Alkyl.Utils.Common
  doctest Alkyl.Utils.Fumble, import: true
  doctest Alkyl.Utils.Messages, import: true
end
