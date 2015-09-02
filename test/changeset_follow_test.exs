defmodule Alkyl.ChangesetFollowTest do
  use ExUnit.Case

  test "follow AB" do
    chset_a = "Z:8<3=2-5+2=1$si"
    chset_b = "Z:8<3=1-6+1=1+2$eow"

    chset_b_ = Alkyl.PadData.ChangesetFollow.follow(chset_a,chset_b)

    assert chset_b_ == "Z:5>1=1-1+1=2-1+2$eow"
  end

end
