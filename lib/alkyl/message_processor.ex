defmodule MessageProcessor do
  import Logger

  def process( %{ "type" => "CLIENT_READY"} = cdata ) do
    Logger.debug "processing CLIENT_READY message..."
    data = %{ MessageDefaults.client_vars |
              "padId" => cdata["padId"]
            }
    %{
            "type" => "CLIENT_VARS",
            "data" => data
        }
  end
end
