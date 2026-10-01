/**
 * The Python tracer behind the step-through debugger. The student's program is wrapped in a small Python harness and run once through
 * the normal code runner (Judge0 in the sandbox, or the local fallback). The harness runs the program under sys.settrace, records a
 * step before every line, every return and every raised exception (only the variables that changed since the last step of that
 * frame), captures what the program prints, and writes one JSON document between two markers on its real stdout.
 *
 * Limits keep the answer small and the run short: at most MAX_TRACE_STEPS steps, about 240 KB of trace and about 4 seconds of tracing.
 * When a limit is hit the trace written so far is sent with `truncated: true` and the program is stopped, so an infinite loop still
 * shows its first iterations instead of timing out with nothing.
 */
import { MAX_TRACE_STEPS, type TraceError, type TraceStep } from '@syncverse/shared';

const HARNESS = String.raw`import base64, json, os, reprlib, sys, time, types

_FILE = "<student>"
_SOURCE = base64.b64decode("__SOURCE__").decode("utf-8")
_MAX_STEPS = __MAX_STEPS__
_MAX_BYTES = 240000
_MAX_SECONDS = 4.0
_MAX_OUTPUT = 20000
_real_out = sys.__stdout__
_started = time.time()


class _Out:
    encoding = "utf-8"
    errors = "strict"

    def __init__(self):
        self.parts = []
        self.n = 0

    def write(self, text):
        text = str(text)
        self.parts.append(text)
        self.n += len(text)
        return len(text)

    def flush(self):
        pass

    def isatty(self):
        return False

    def writable(self):
        return True

    def fileno(self):
        raise OSError("no file descriptor")


_out = _Out()
_parts = []
_size = [0]
_ids = {}
_state = {}
_serial = [0]
_depth = [0]
_truncated = [False]
_raised = set()
_SKIP = (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, types.MethodType, type)


_repr = reprlib.Repr()
_repr.maxlevel = 3
_repr.maxlist = _repr.maxtuple = _repr.maxset = _repr.maxfrozenset = _repr.maxdeque = 12
_repr.maxdict = 8
_repr.maxstring = _repr.maxother = 40


def _short(value):
    # reprlib only looks at the first elements, so a list of a million items costs the same as a list of ten
    try:
        text = _repr.repr(value)
    except BaseException:
        text = "<" + type(value).__name__ + ">"
    return text if len(text) <= 80 else text[:77] + "..."


def _variables(frame):
    result = {}
    for name, value in list(frame.f_locals.items()):
        if name.startswith("__") or isinstance(value, _SKIP):
            continue
        result[name] = _short(value)
    return result


def _finish(error):
    payload = {"steps": "@@STEPS@@", "output": "".join(_out.parts)[:_MAX_OUTPUT], "truncated": _truncated[0]}
    if error is not None:
        payload["error"] = error
    text = json.dumps(payload, separators=(",", ":")).replace('"@@STEPS@@"', "[" + ",".join(_parts) + "]")
    _real_out.write("\n@@SVTRACE@@" + text + "@@END@@\n")
    _real_out.flush()


def _step(frame, kind, arg):
    fid = _ids.get(id(frame), 0)
    current = _variables(frame)
    previous = _state.get(fid)
    first = previous is None
    delta = current if first else {k: v for k, v in current.items() if previous.get(k) != v}
    gone = [] if first else [k for k in previous if k not in current]
    _state[fid] = current
    step = {"l": frame.f_lineno, "f": frame.f_code.co_name, "d": max(_depth[0], 1), "id": fid, "v": delta, "o": _out.n}
    if first:
        step["n"] = 1
    if gone:
        step["x"] = gone
    if kind == "return" and id(frame) not in _raised and not (arg is None and frame.f_code.co_name == "<module>"):
        step["r"] = _short(arg)
    if kind == "exception":
        _raised.add(id(frame))
        step["e"] = (arg[0].__name__ + ": " + str(arg[1]))[:120]
    text = json.dumps(step, separators=(",", ":"))
    _parts.append(text)
    _size[0] += len(text)
    if len(_parts) >= _MAX_STEPS or _size[0] > _MAX_BYTES or time.time() - _started > _MAX_SECONDS:
        _truncated[0] = True
        _finish(None)
        os._exit(0)


def _trace(frame, event, arg):
    if frame.f_code.co_filename != _FILE:
        return None
    if event == "call":
        _serial[0] += 1
        _ids[id(frame)] = _serial[0]
        _depth[0] += 1
    elif event == "line":
        _step(frame, "line", None)
    elif event == "return":
        _step(frame, "return", arg)
        _depth[0] -= 1
        _ids.pop(id(frame), None)
        _raised.discard(id(frame))
    elif event == "exception" and arg[0] is not StopIteration:
        _step(frame, "exception", arg)
    return _trace


def _error_line(exc):
    if isinstance(exc, SyntaxError):
        return exc.lineno
    line = None
    tb = exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == _FILE:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


_error = None
sys.stdout = _out
sys.stderr = _out
try:
    _code = compile(_SOURCE, _FILE, "exec")
    sys.settrace(_trace)
    try:
        exec(_code, {"__name__": "__main__", "__builtins__": __builtins__})
    finally:
        sys.settrace(None)
except SystemExit:
    pass
except BaseException as exc:
    _error = {"type": type(exc).__name__, "message": str(exc)[:300]}
    line = _error_line(exc)
    if line:
        _error["line"] = line
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
_finish(_error)
`;

export function buildHarness(source: string): string {
  return HARNESS.replace('__SOURCE__', Buffer.from(source, 'utf8').toString('base64')).replace('__MAX_STEPS__', String(MAX_TRACE_STEPS));
}

export interface ParsedTrace {
  steps: TraceStep[];
  output: string;
  error?: TraceError;
  truncated: boolean;
}

/** The trace the harness wrote between its markers, or null when the harness itself failed. */
export function parseTraceOutput(stdout: string): ParsedTrace | null {
  const start = stdout.lastIndexOf('@@SVTRACE@@');
  const end = stdout.lastIndexOf('@@END@@');
  if (start < 0 || end < start) return null;
  try {
    const raw = JSON.parse(stdout.slice(start + '@@SVTRACE@@'.length, end)) as ParsedTrace;
    if (!Array.isArray(raw.steps) || typeof raw.output !== 'string') return null;
    return { steps: raw.steps, output: raw.output, error: raw.error, truncated: Boolean(raw.truncated) };
  } catch {
    return null;
  }
}
