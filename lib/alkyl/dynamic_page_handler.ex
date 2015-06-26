defmodule Alkyl.DynamicPageHandler do

  # We are using the plain HTTP handler.  See the documentation here:
  #     http://ninenines.eu/docs/en/cowboy/HEAD/manual/cowboy_http_handler/
  #
  # All cowboy HTTP handlers require an init() function, identifies which
  # type of handler this is and returns an initial state (if the handler
  # maintains state).  In a plain http handler, you just return a
  # 3-tuple with :ok.  We don't need to track a  state in this handler, so
  # we're returning the atom :no_state.
  def init(_type, req, []) do
    {:ok, req, :no_state}
  end


  # In a cowboy handler, the handle/2 function does the work. It should return
  # a 3-tuple with :ok, a request object (containing the reply), and the current
  # state.
  def handle(request, state) do
    # construct a reply, using the cowboy_req:reply/4 function.
    #
    # reply/4 takes three arguments:
    #   * The HTTP response status (200, 404, etc.)
    #   * A list of 2-tuples representing headers
    #   * The body of the response
    #   * The original request
    { :ok, reply } = :cowboy_req.reply(

      # status code
      200,

      # headers
      [ {"content-type", "text/html"} ],

      # TODO: set session cookie express_sid / to something like s%3APm7Q814C4DOiukwE-N-jyYFWYdeCSui4.h26Md53eQcj4g4Dw79HJIoKJg2hWHB%2BJHDociuogrJ8

      # body of reply.
      build_body(request),

      # original request
      request
    )

    # handle/2 returns a tuple starting containing :ok, the reply, and the
    # current state of the handler.
    {:ok, reply, state}
  end

  # Termination handler.  Usually you don't do much with this.  If things are breaking,
  # try uncommenting the output lines here to get some more info on what's happening.
  def terminate(_reason, _request, _state) do
    #IO.puts("Terminating for reason: #{inspect(_reason)}")
    #IO.puts("Terminating after request: #{inspect(_request)}")
    #IO.puts("Terminating with state: #{inspect(_state)}")
    :ok
  end

  def build_body(_request) do
    File.read! "priv/pad.html"
  end
end
