"""Loaded automatically by CPython at startup (site.py imports sitecustomize).

The sandbox sets MPLBACKEND=Agg, so plt.show() is a no-op and agents that forget
to call savefig() would lose their chart. Patch show() to persist every open
figure as figure-<n>.png in the current working directory instead.
"""

import builtins
import sys

_original_import = builtins.__import__


def _patch_pyplot(module):
    if getattr(module, "_code_interpreter_patched", False):
        return

    # pyplot imports many modules while its own module object is still half
    # built; patching then would be undone by its own `def show`. Wait until
    # the module is fully initialised.
    spec = getattr(module, "__spec__", None)
    if spec is not None and getattr(spec, "_initializing", False):
        return

    def show(*_args, **_kwargs):
        for number in module.get_fignums():
            try:
                module.figure(number).savefig(
                    f"figure-{number}.png", dpi=150, bbox_inches="tight"
                )
            except Exception:
                pass
        module.close("all")

    module.show = show
    module._code_interpreter_patched = True


def _patched_import(name, *args, **kwargs):
    module = _original_import(name, *args, **kwargs)
    # `import matplotlib.pyplot` hands back the top-level package unless a
    # fromlist is used, so patch the real submodule from sys.modules instead.
    pyplot = sys.modules.get("matplotlib.pyplot")
    if pyplot is not None:
        try:
            _patch_pyplot(pyplot)
        except Exception:
            pass
    return module


builtins.__import__ = _patched_import
