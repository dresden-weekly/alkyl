defmodule Alkyl.MessageProcessor do
  import Logger

  def process( %{ "type" => "CLIENT_READY"} = cdata ) do
    Logger.debug "processing CLIENT_READY message..."
    # TODO: identify guest users by "token" cookie resp. by cdata.token
    # and  globalAuthor/token2author records, and everything...
    data = %{ Alkyl.MessageDefaults.client_vars |
              "padId" => cdata["padId"]
            }
    %{
            "type" => "CLIENT_VARS",
            "data" => data
        }
  end
end
